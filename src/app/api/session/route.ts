import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  integrationConfig,
  missingConfiguration,
} from '@/server/integration-config';
import {
  AuthError,
  checkOrigin,
  loginSession,
  logoutSession,
  requireOwner,
} from '@/server/integration-auth';
export const dynamic = 'force-dynamic';
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    const c = integrationConfig(undefined, request);
    return response({ authenticated: true, owner: await requireOwner(c) });
  } catch (error) {
    return response(
      {
        authenticated: false,
        error:
          error instanceof AuthError ? error.message : 'Sign-in unavailable',
      },
      error instanceof AuthError ? error.status : 503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const c = integrationConfig(undefined, request);
    checkOrigin(request, c);
    if (c.mode !== 'supabase' || missingConfiguration(c, 'shared').length)
      throw new AuthError('Account sign-in is not configured', 503);
    const body = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('login'),
          email: z.email(),
          password: z.string().min(1),
        }),
        z.object({ action: z.literal('logout') }),
      ])
      .parse(await request.json());
    if (body.action === 'logout') {
      await logoutSession();
      return response({ authenticated: false });
    }
    await loginSession(body, c);
    // Main account login governs all sections, avoiding an older separate Gym owner.
    (await cookies()).delete('stillform-gym-session');
    return response({ authenticated: true });
  } catch (error) {
    return response(
      {
        error:
          error instanceof AuthError ? error.message : 'Account sign-in failed',
      },
      error instanceof AuthError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503,
    );
  }
}
