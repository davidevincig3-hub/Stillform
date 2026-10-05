'use client';
import Link from 'next/link';
import { PageHeading } from './assessment';
import { RecoveryAssessment } from './recovery-assessment';
import { useRecoveryData } from './use-recovery-data';
export function HomeDashboard({
  sampleAssessment,
}: {
  sampleAssessment: React.ReactNode;
}) {
  const { data, mode, checking, error } = useRecoveryData(),
    real = mode === 'real';
  return (
    <>
      <PageHeading
        title="A little perspective for today."
        subtitle={
          data?.engine
            ? `${data.engine.asOfDate} · personal recovery evidence`
            : checking
              ? 'Checking recovery evidence…'
              : 'Training and recovery perspective'
        }
      />
      {checking ? (
        <section className="card">Loading recovery assessment…</section>
      ) : real ? (
        <RecoveryAssessment engine={data?.engine} />
      ) : mode === 'sample' ? (
        <>
          <span className="tag">DEMO · SAMPLE DATA</span>
          {sampleAssessment}
        </>
      ) : (
        <section className="card">
          <h2>Recovery assessment unavailable</h2>
          <p>{error}</p>
        </section>
      )}
      <div className="section-heading">
        <h2>Today’s training</h2>
        <Link className="text-button" href="/plan">
          See your week →
        </Link>
      </div>
      <section className="card row todays-training">
        <div>
          <span className="tag">Planned · sample</span>
          <h3>Rest / optional walk</h3>
          <p className="muted">
            Sample plan; no training change is inferred from recovery.
          </p>
        </div>
        <div className="decision-label">
          Decision engine
          <br />
          <strong>Not evaluated</strong>
        </div>
      </section>
      <div className="section-heading">
        <h2>The longer view</h2>
        <span className="caption">
          Running/Gym trend cards remain labelled samples
        </span>
      </div>
      <div className="three-grid">
        <Link href="/running" className="card trend-card">
          <p className="eyebrow">Running · sample trend</p>
          <h3>Steadier easy pace</h3>
          <p className="caption">3 comparable runs · sample confidence</p>
          <span className="trend-arrow">Explore →</span>
        </Link>
        <Link href="/gym" className="card trend-card">
          <p className="eyebrow">Gym · sample trend</p>
          <h3>Consistent exposures</h3>
          <p className="caption">Recent load / reps / effort · sample</p>
          <span className="trend-arrow">Explore →</span>
        </Link>
        <Link href="/recovery" className="card trend-card">
          <p className="eyebrow">
            Recovery ·{' '}
            {real
              ? 'real evidence'
              : mode === 'sample'
                ? 'sample'
                : 'unavailable'}
          </p>
          <h3>
            {real
              ? data?.engine?.baselineMaturity === 'insufficient'
                ? 'Waiting for valid overnight data'
                : 'Inspect your personal baseline'
              : mode === 'sample'
                ? 'Small dip, stable trend'
                : 'Assessment unavailable'}
          </h3>
          <p className="caption">
            {real
              ? `${data?.recordCounts?.sleep.valid ?? data?.sleep.length ?? 0} valid sleep nights · ${data?.engine?.baselineMaturity ?? 'assessment unavailable'} baseline`
              : mode === 'sample'
                ? '42 nights · sample baseline'
                : 'No sample recovery is substituted'}
          </p>
          <span className="trend-arrow">Explore →</span>
        </Link>
      </div>
    </>
  );
}
