import { AssessmentCard, PageHeading } from '@/components/assessment';
import { MetricChart } from '@/components/chart';
import { recovery } from '@/repositories/seed';
export default function Recovery() {
  return (
    <>
      <PageHeading
        title="Recovery, in context."
        subtitle="Your own patterns come first. All values below are illustrative samples."
      />
      <AssessmentCard assessment={recovery} />
      <div className="section-heading">
        <h2>Autonomic recovery</h2>
        <span className="tag">Baseline developing · 42 nights</span>
      </div>
      <div className="two-grid">
        <MetricChart metric="HRV" />
        <MetricChart metric="Night HR" />
      </div>
      <MetricChart metric="Respiratory rate" />
      <div className="section-heading">
        <h2>Sleep</h2>
        <span className="caption">
          Underlying signals, not a proprietary score
        </span>
      </div>
      <p className="sleep-interpretation muted">
        Sample sleep perspective: timing is fairly regular, with brief
        awakenings. Duration is below the illustrative personal baseline.
      </p>
      <div className="three-grid">
        {[
          {
            name: 'Timing & regularity',
            value: '23:18 – 06:54',
            note: 'Typical bedtime ± 26 min',
          },
          {
            name: 'Continuity',
            value: '2 brief awakenings',
            note: '18 min awake · sample',
          },
          {
            name: 'Stages · secondary',
            value: 'Available later',
            note: 'Device estimates provide context',
          },
        ].map((m) => (
          <section className="card" key={m.name}>
            <p className="eyebrow">{m.name}</p>
            <h3>{m.value}</h3>
            <p className="muted">{m.note}</p>
          </section>
        ))}
      </div>
      <MetricChart metric="Sleep duration" />
      <details className="card">
        <summary>Explore an unusual day</summary>
        <p className="muted">
          Future anomaly exploration can ask about illness, alcohol, travel,
          stress, late meals or unusual training. No mandatory daily
          questionnaire.
        </p>
      </details>
    </>
  );
}
