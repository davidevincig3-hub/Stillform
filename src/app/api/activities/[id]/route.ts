import { NextResponse } from 'next/server';
import { integrationConfig } from '@/server/integration-config';
import { requireOwner, AuthError } from '@/server/integration-auth';
import { integrationRepository } from '@/server/integration-repository';
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
        activity: a,
        sources: sources.map(({ raw, previous, ...safe }) => {
          void raw;
          void previous;
          return safe;
        }),
        rich: rich.filter(Boolean).map((r) => ({
          sourceKey: r!.sourceKey,
          fetchedAt: r!.fetchedAt,
          streamStatus: r!.streams.map((s) => ({
            kind: s.kind,
            samples: s.data.length,
            seriesType: s.seriesType,
          })),
          laps: r!.laps.map(({ raw, ...lap }) => {
            void raw;
            return lap;
          }),
          warnings: r!.warnings,
          polar: r!.polar
            ? {
                sensorQuality: r!.polar.sensorQuality,
                exercises: r!.polar.exercises.map((e) => ({
                  ...e,
                  samples: e.samples.map(({ values, ...s }) => ({
                    ...s,
                    count: values.length,
                  })),
                  routes: Object.keys(e.routes).length ? e.routes : {},
                })),
              }
            : undefined,
        })),
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
