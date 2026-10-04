import { AssessmentCard, PageHeading } from '@/components/assessment';
import { MetricChart } from '@/components/chart';
import { running } from '@/repositories/seed';
import { ActivityHistory } from '@/components/activity-history';
export default function Running() {
  return (
    <>
      <PageHeading
        title="Progress you can examine."
        subtitle="Comparable efforts, honest uncertainty, and the full running picture."
      />
      <p className="notice">
        Sample running analytics below. Real synced workout history is listed
        separately; these metrics are not calculated from your activities.
      </p>
      <AssessmentCard assessment={running} />
      <div className="section-heading">
        <h2>Aerobic efficiency</h2>
        <span className="caption">Sample standardized easy sessions</span>
      </div>
      <MetricChart metric="Comparable easy pace" />
      <div className="two-grid">
        <section className="card">
          <p className="eyebrow">Cardiac drift / decoupling</p>
          <h3>
            3.2% <span className="tag">Mock derived value</span>
          </h3>
          <p className="muted">
            Compare steady conditions and exclude stops before interpreting
            drift. No physiological calculation is implemented.
          </p>
        </section>
        <section className="card">
          <p className="eyebrow">Threshold performance</p>
          <h3>Insufficient comparable evidence</h3>
          <p className="muted">
            A future module will compare suitable efforts, environment and
            confidence. No estimated VO₂max is inferred.
          </p>
        </section>
      </div>
      <section className="card">
        <p className="eyebrow">High-intensity performance · 4 × 4</p>
        <h3>Repeat consistency before progression</h3>
        <div className="metric-grid">
          <div>
            <p className="muted">Interval pace</p>
            <strong>4:42 /km</strong>
          </div>
          <div>
            <p className="muted">HR avg / max</p>
            <strong>172 / 181 bpm</strong>
          </div>
          <div>
            <p className="muted">Pace decay · sample</p>
            <strong>2.1%</strong>
          </div>
        </div>
        <details>
          <summary>Future analysis dimensions</summary>
          <p className="muted">
            Time near target intensity, HR recovery between repeats, repeat
            consistency, conditions, and longitudinal response. Polar Running
            Index will be a secondary vendor signal.
          </p>
        </details>
      </section>
      <div className="section-heading">
        <h2>Running load</h2>
      </div>
      <details className="card">
        <summary>Secondary vendor signals · Polar Running Index</summary>
        <p className="muted">
          Real Polar Running Index and training-load fields, when returned, are
          available in each enriched activity detail below. They remain
          secondary vendor signals; these sample analytical cards do not use
          them.
        </p>
      </details>
      <MetricChart metric="Running minutes" />
      <section className="card">
        <div className="row">
          <div>
            <h3>24.6 km · 146 minutes</h3>
            <p className="muted">
              Sample week · 78% easy / 22% higher intensity
            </p>
          </div>
          <span className="tag">HR-based load: not calculated</span>
        </div>
      </section>
      <ActivityHistory running />
    </>
  );
}
