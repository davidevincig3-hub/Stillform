import { NextResponse } from 'next/server';
import { integrationConfig } from '@/server/integration-config';
import { requireOwner, AuthError } from '@/server/integration-auth';
import { integrationRepository } from '@/server/integration-repository';
import {
  presentActivity,
  presentRichActivity,
} from '@/server/activity-presentation';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const c = integrationConfig(),
      owner = await requireOwner(c),
      repo = integrationRepository(c),
      s = await repo.read(owner),
      { id } = await params;
    const a = s.state.activities.find(
      (a) => a.id === (s.state.aliases[id] ?? id),
    );
    if (!a)
      return NextResponse.json(
        { error: 'Activity not found' },
        { status: 404 },
      );
    const sources = s.state.sources.filter(
        (source) => source.activityId === a.id,
      ),
      rich = await Promise.all(
        sources
          .filter((s) => ['strava', 'polar'].includes(s.provider))
          .map((s) => repo.rich(owner, s.key)),
      );
    return NextResponse.json(
      {
        activity: presentActivity(a, sources),
        sources: sources.map(({ raw, previous, ...safe }) => {
          void raw;
          void previous;
          return safe;
        }),
        rich: rich.filter((r) => r !== null).map(presentRichActivity),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError ? e.message : 'Activity detail unavailable',
      },
      { status: e instanceof AuthError ? e.status : 503 },
    );
  }
}
