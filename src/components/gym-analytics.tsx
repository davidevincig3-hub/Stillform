'use client';
import { ExerciseHistorySearch } from './exercise-history-search';
import { useWorkout } from './workout-provider';
import { weeklyGymSummary } from '@/analytics/gym';
export function GymAnalytics() {
  const { store } = useWorkout();
  const summary = weeklyGymSummary(store.history);
  return (
    <>
      <div className="section-heading">
        <h2>This week, from your logs</h2>
        <span className="tag">Real local data</span>
      </div>
      <div className="two-grid">
        <section className="card">
          <h3>Primary muscle-group sets & frequency</h3>
          <p className="caption">
            Monday–Sunday, browser local timezone. Secondary groups are not
            double-counted.
          </p>
          {!summary.muscles.length ? (
            <p className="muted">
              Insufficient data: no completed sets with assigned muscle metadata
              this week.
            </p>
          ) : (
            summary.muscles.map((m) => (
              <div className="history-row" key={m.name}>
                <span>{m.name}</span>
                <strong>
                  {m.sets} sets · {m.frequency} sessions
                </strong>
              </div>
            ))
          )}
          {summary.unassigned.sets > 0 && (
            <p className="caption">
              Unassigned: {summary.unassigned.sets} sets ·{' '}
              {summary.unassigned.frequency} sessions. Excluded from
              muscle-group totals.
            </p>
          )}
        </section>
        <section className="card">
          <h3>Proximity to failure</h3>
          <p className="caption">
            RIR, RPE and explicit failure are reported separately; no conversion
            is inferred.
          </p>
          {!summary.effort.total ? (
            <p className="muted">
              Insufficient data: log completed sets with optional effort.
            </p>
          ) : (
            <>
              <p>
                {summary.effort.total} sets · {summary.effort.unknown} with no
                effort information
              </p>
              {summary.effort.rir.length ? (
                <p>
                  Reported RIR:{' '}
                  {Array.from(new Set(summary.effort.rir))
                    .sort((a, b) => a - b)
                    .map(
                      (r) =>
                        `${r} RIR: ${summary.effort.rir.filter((x) => x === r).length} sets`,
                    )
                    .join(' · ')}
                </p>
              ) : (
                <p className="muted">No RIR distribution available.</p>
              )}
              <p>
                RPE recorded: {summary.effort.rpe.length} sets · Explicit
                failure: {summary.effort.failure} sets
              </p>
            </>
          )}
        </section>
      </div>
      <ExerciseHistorySearch />
    </>
  );
}
