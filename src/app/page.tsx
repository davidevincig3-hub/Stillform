import Link from 'next/link';
import { AssessmentCard, PageHeading } from '@/components/assessment';
import { recovery } from '@/repositories/seed';
export default function Home() {
  return (
    <>
      <PageHeading
        title="A little perspective for today."
        subtitle="Sunday, October 4 · Demo reference day"
      />
      <AssessmentCard assessment={recovery} />
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
            Space to recover before your next training week.
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
        <span className="caption">Sample trends</span>
      </div>
      <div className="three-grid">
        {[
          {
            title: 'Running',
            value: 'Steadier easy pace',
            note: '3 comparable runs · medium confidence',
            href: '/running',
          },
          {
            title: 'Gym',
            value: 'Consistent exposures',
            note: 'Recent load / reps / effort · sample',
            href: '/gym',
          },
          {
            title: 'Recovery',
            value: 'Small dip, stable trend',
            note: '42 nights · developing baseline',
            href: '/recovery',
          },
        ].map((t) => (
          <Link href={t.href} key={t.title} className="card trend-card">
            <p className="eyebrow">{t.title}</p>
            <h3>{t.value}</h3>
            <p className="caption">{t.note}</p>
            <span className="trend-arrow">Explore →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
