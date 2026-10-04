'use client';
import { useState } from 'react';
import { PageHeading } from '@/components/assessment';
import { MetricChart } from '@/components/chart';
import { initialGoal, plan } from '@/repositories/seed';
import {
  useBrowserReady,
  useBrowserValue,
  writeBrowserValue,
} from '@/components/browser-storage';
export default function Plan() {
  const ready = useBrowserReady();
  const goal = useBrowserValue('adaptive-coach.goal.v1') ?? initialGoal;
  const savedProposal = useBrowserValue('adaptive-coach.proposal.v1');
  const proposal =
    savedProposal === 'accepted' || savedProposal === 'rejected'
      ? savedProposal
      : 'pending';
  const [message, setMessage] = useState('');

  function choice(value: 'accepted' | 'rejected') {
    try {
      writeBrowserValue('adaptive-coach.proposal.v1', value);
    } catch {
      setMessage('Choice was not saved.');
    }
  }
  return (
    <>
      <PageHeading
        title="A stable plan. Room to adapt."
        subtitle="October 5–11 · Sample week · Changes require your choice."
      />
      <section className="card week-grid">
        {plan.map((s, i) => (
          <div key={s.id} className="week-day">
            <p className="eyebrow">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}{' '}
              <span className="muted">{5 + i}</span>
            </p>
            <h3>
              {s.id === 'thu' && proposal === 'accepted'
                ? 'Easy run · adjusted'
                : s.title}
            </h3>
            <span className="tag">
              {s.id === 'thu' && proposal === 'accepted'
                ? 'adjusted'
                : s.id === 'thu'
                  ? 'planned'
                  : s.status}
            </span>
            <p className="caption">
              {s.id === 'thu' && proposal === 'accepted'
                ? 'Easy aerobic volume · demo choice'
                : s.purpose}
            </p>
          </div>
        ))}
      </section>
      <section className="card">
        <p className="eyebrow">Your running goal · original wording</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const text = String(
                new FormData(e.currentTarget).get('goal') ?? '',
              );
              if (!text.trim()) {
                setMessage('Write a goal before saving.');
                return;
              }
              writeBrowserValue('adaptive-coach.goal.v1', text);
              setMessage(
                'Goal saved locally. Machine interpretation remains pending.',
              );
            } catch {
              setMessage('Goal could not be saved.');
            }
          }}
        >
          <label htmlFor="goal">What would you like to work toward?</label>
          <textarea
            id="goal"
            required
            maxLength={4000}
            name="goal"
            key={`${ready}-${goal}`}
            defaultValue={goal}
            disabled={!ready}
          />
          <button className="primary">Save goal</button>
        </form>
        <p role="status" className="caption">
          {message || 'Natural language goal · AI interpretation not connected'}
        </p>
      </section>
      <div className="three-grid">
        <section className="card">
          <p className="eyebrow">Current phase · sample</p>
          <h3>Aerobic consistency</h3>
          <p className="muted">
            Main focus: efficiency while protecting gym performance.
          </p>
        </section>
        <section className="card">
          <p className="eyebrow">Recent progression</p>
          <h3>50 → 55 minutes</h3>
          <p className="muted">
            Illustrative prior change; not a computed recommendation.
          </p>
        </section>
        <section className="card">
          <p className="eyebrow">Possible next step</p>
          <h3>Hold, then reassess</h3>
          <p className="muted">
            Personal-data gate: insufficient. Scientific-rationale gate:
            unverified.
          </p>
        </section>
      </div>
      <MetricChart metric="Planned easy duration" projected />
      <section className="card">
        <h3>Why maintain this sample plan?</h3>
        <p className="muted">
          The demo holds planned duration flat; it does not forecast fitness.
          Future progression must consider recovery, response, interference and
          scientific rationale. Completing a workout alone is not enough.
        </p>
      </section>
      <section className="card">
        <p className="eyebrow">Sample change proposal · not advice</p>
        <h3>Make Thursday’s intervals an easy run?</h3>
        <p className="muted">
          Illustrates preserving the session’s time slot with a different
          stimulus. The engine has not evaluated this proposal. No calendar
          changes occur.
        </p>
        {proposal === 'pending' ? (
          <div className="row start">
            <button className="primary" onClick={() => choice('accepted')}>
              Accept demo adjustment
            </button>
            <button className="secondary" onClick={() => choice('rejected')}>
              Keep planned session
            </button>
          </div>
        ) : (
          <p role="status">Your choice: {proposal}. Saved locally.</p>
        )}
        <details>
          <summary>Future candidate comparison</summary>
          <p className="muted">
            Stimulus preservation, recovery suitability, training interference,
            disruption, scientific rationale and uncertainty. Rescheduling
            always requires approval.
          </p>
        </details>
      </section>
    </>
  );
}
