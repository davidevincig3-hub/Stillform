import { NextResponse } from 'next/server';
import { integrationConfig } from '@/server/integration-config';
import { requireOwner, AuthError } from '@/server/integration-auth';
import { integrationRepository } from '@/server/integration-repository';
import { presentActivity } from '@/server/activity-presentation';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const c = integrationConfig(),
      owner = await requireOwner(c),
      s = await integrationRepository(c).read(owner);
    return NextResponse.json(
      {
        activities: s.state.activities.map((a) =>
          presentActivity(a, s.state.sources),
        ),
        sources: s.state.sources.map(({ raw, previous, ...safe }) => {
          void raw;
          void previous;
          return safe;
        }),
        reviews: s.state.reviews,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError ? e.message : 'Activity registry unavailable',
      },
      { status: e instanceof AuthError ? e.status : 503 },
    );
  }
}
