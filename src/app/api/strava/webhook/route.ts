import { NextResponse } from 'next/server';
import { integrationConfig } from '@/server/integration-config';
import { integrationRepository } from '@/server/integration-repository';
import { queueWebhook, webhookChallenge } from '@/server/strava-service';
import { StravaError } from '@/server/strava-client';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return NextResponse.json(
      webhookChallenge(new URL(request.url), integrationConfig().webhookToken),
    );
  } catch {
    return NextResponse.json(
      { error: 'Verification rejected' },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const c = integrationConfig();
    if (!c.subscriptionId)
      return NextResponse.json(
        { error: 'Webhooks not configured' },
        { status: 503 },
      );
    await queueWebhook(
      await request.json(),
      c.subscriptionId,
      integrationRepository(c),
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Webhook rejected or queue unavailable' },
      {
        status:
          error instanceof StravaError
            ? error.status
            : error instanceof ZodError
              ? 400
              : 503,
      },
    );
  }
}
