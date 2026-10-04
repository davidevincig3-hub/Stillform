import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeading } from '@/components/assessment';
import { runHistory } from '@/repositories/seed';
export default async function RunDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = runHistory.find((r) => r.id === id);
  if (!run) notFound();
  return (
    <>
      <Link className="text-button" href="/running">
        ← Running history
      </Link>
      <PageHeading
        title={run.title}
        subtitle={`${run.date} · Sample workout detail`}
      />
      <section className="card">
        <div className="metric-grid">
          <div>
            <p className="muted">Distance</p>
            <strong>{run.distance}</strong>
          </div>
          <div>
            <p className="muted">Duration</p>
            <strong>{run.duration}</strong>
          </div>
          <div>
            <p className="muted">Heart rate</p>
            <strong>{run.hr}</strong>
          </div>
        </div>
        <p className="muted">
          Provenance concept: Polar chest strap for HR, matching Strava activity
          for registry / route. This example is sample data.
        </p>
      </section>
      <div className="two-grid">
        {[
          'Route / GPS map',
          'Pace & HR streams',
          'Splits & zones',
          'Drift & efficiency',
          'Conditions & context',
          'AI interpretation',
        ].map((x) => (
          <section className="card" key={x}>
            <h3>{x}</h3>
            <p className="muted">
              Future detail module. No stream, map or calculated analysis is
              available in this sample.
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
