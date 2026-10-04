import type { Assessment } from '@/domain/models';
import { influentialMetrics } from '@/analytics/evidence';
export function AssessmentCard({ assessment }: { assessment: Assessment }) {
  return (
    <section className="card assessment">
      <div className="row">
        <div>
          <p className="eyebrow">Daily perspective · sample interpretation</p>
          <h2>
            <span className="status-dot" />
            {assessment.state}
          </h2>
        </div>
        <span className="tag">{assessment.confidence} confidence</span>
      </div>
      <div className="metric-grid">
        {influentialMetrics(assessment.evidence).map((e) => (
          <div key={e.metric}>
            <p className="muted">{e.metric}</p>
            <strong>{e.displayValue}</strong>
            <p className="caption">
              {e.family} · {e.confidence} confidence
            </p>
          </div>
        ))}
      </div>
      <p className="interpretation">{assessment.explanation}</p>
      <details>
        <summary>Explore the evidence</summary>
        <p className="muted">
          These influential metrics are selected from ranked evidence, rather
          than fixed cards. HRV and night HR share the autonomic family; a
          future engine must account for their dependence.
        </p>
      </details>
    </section>
  );
}
export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">YOUR PERSONAL TRAINING COMPANION</p>
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>
    </div>
  );
}
