import Link from 'next/link';
import type {
  GymPerformance,
  GymComparisonPoint,
} from '@/analytics/gym-performance';

const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { timeZone: 'Europe/Rome' });
function Reference({ point }: { point: GymComparisonPoint }) {
  return (
    <Link href={`/gym/history/${point.workoutId}`}>
      {date(point.date)} · block {point.block} ·{' '}
      {point.source === 'hevy_import'
        ? 'Hevy'
        : point.source === 'local_logger'
          ? 'Logger'
          : 'Legacy'}
    </Link>
  );
}
const span = (min: number | null, max: number | null) =>
  min === null ? 'Unrecorded' : min === max ? String(min) : `${min}–${max}`;
export function ExercisePerformance({ data }: { data: GymPerformance }) {
  const { comparison, totals } = data;
  return (
    <>
      <section className="card">
        <div className="row">
          <h2>Recorded history & comparison</h2>
          <span className="tag">Evidence: {data.confidence}</span>
        </div>
        <p>
          {totals.exposures} workout exposures · {totals.sets} completed sets ·{' '}
          {totals.effortSets} sets with recorded effort (
          {totals.sets
            ? Math.round((100 * totals.effortSets) / totals.sets)
            : 0}
          %)
        </p>
        {comparison ? (
          <>
            <h3>Recorded load change at matched reps and effort</h3>
            <p>
              {comparison.deltaKg > 0 ? '+' : ''}
              {comparison.deltaKg.toFixed(1)} kg: {comparison.current.load} kg
              versus {comparison.referenceMedian} kg median across{' '}
              {comparison.reference.length} prior matched dates.
            </p>
            <p className="caption">
              {comparison.protocol.equipment} · block{' '}
              {comparison.protocol.block} · {comparison.protocol.setType} ·{' '}
              {comparison.protocol.reps} reps · RIR{' '}
              {comparison.protocol.rir ?? 'unknown'} · RPE{' '}
              {comparison.protocol.rpe ?? 'unknown'} · explicit failure{' '}
              {comparison.protocol.failure ? 'recorded' : 'not recorded'} ·
              superset{' '}
              {comparison.protocol.superset ? 'recorded' : 'not recorded'}.
            </p>
            <p className="caption">
              {comparison.eligibleDates} eligible dates, {date(comparison.from)}
              –{date(comparison.to)}. This is a recorded comparison; unrecorded
              technique, rest and machine settings limit confidence.
            </p>
            <details>
              <summary>Recent comparable exposures</summary>
              {comparison.recent.map((p) => (
                <p key={p.workoutId}>
                  <Reference point={p} /> · {p.load} kg
                  {p.workoutId === comparison.current.workoutId
                    ? ' · current'
                    : comparison.reference.some(
                          (r) => r.workoutId === p.workoutId,
                        )
                      ? ' · median reference'
                      : ''}
                </p>
              ))}
            </details>
          </>
        ) : (
          <p className="muted">
            Insufficient comparable evidence: three distinct dates with matching
            first-set exercise, equipment, block, set type, reps and recorded
            effort are required. Recorded history remains available.
          </p>
        )}
        <details>
          <summary>Why these sessions? / Excluded data</summary>
          <p className="caption">
            We select the most recent qualifying protocol; ties use more
            distinct dates, then a stable protocol key. The current set is
            compared with the median of up to three prior dates.{' '}
            {data.eligibleBlocks} blocks meet the individual eligibility rules.
            Exclusion reasons may overlap.
          </p>
          {data.exclusions.length ? (
            data.exclusions.map((e) => (
              <p key={e.reason}>
                {e.reason}: {e.blocks} blocks
              </p>
            ))
          ) : (
            <p>No blocks excluded by the recorded-data rules.</p>
          )}
          {data.excludedRecent.map((e) => (
            <p className="caption" key={`${e.workoutId}-${e.block}`}>
              <Link href={`/gym/history/${e.workoutId}`}>
                {date(e.date)} · block {e.block}
              </Link>
              : {e.reasons.join('; ')}
            </p>
          ))}
          {data.limitations.map((l) => (
            <p className="caption" key={l}>
              {l}
            </p>
          ))}
          <p className="caption">
            Calculation {data.version} · through {date(data.asOf)} ·{' '}
            {data.timeZone}. Account calculations use relevant history before
            pagination.
          </p>
        </details>
      </section>
      <section className="card">
        <h3>Recent load / repetition history</h3>
        <p className="caption">
          Ranges across completed sets, including warm-ups and dropsets; load
          and rep ranges are separate, not paired performances. Up to eight
          recent workout exposures. Equipment and set types remain visible in
          the set history below.
        </p>
        {!data.trend.length ? (
          <p className="muted">No completed history.</p>
        ) : (
          data.trend.map((p) => (
            <div className="history-row" key={p.workoutId}>
              <Link href={`/gym/history/${p.workoutId}`}>{date(p.date)}</Link>
              <span>
                {span(p.minLoad, p.maxLoad)} kg · {span(p.minReps, p.maxReps)}{' '}
                reps · {p.sets} sets · {p.blocks} blocks
              </span>
            </div>
          ))
        )}
      </section>
      <section className="card">
        <h3>Recorded PRs</h3>
        <p className="caption">
          Historical records, not proof of physiological improvement. All
          completed set types are kept separate by equipment; effort may be
          unknown.
        </p>
        {!data.bestLoads.length ? (
          <p className="muted">
            No recorded load/repetition pairs. Missing load is never assumed to
            be bodyweight.
          </p>
        ) : (
          <>
            <details>
              <summary>Best recorded load</summary>
              {data.bestLoads.map((r, i) => (
                <p key={i}>
                  {r.equipment ?? 'Equipment unknown'} · {r.setType}: {r.load}{' '}
                  kg · <Reference point={r.reference} />
                </p>
              ))}
            </details>
            <details>
              <summary>Highest load at a specified repetition count</summary>
              {!data.records.length && (
                <p className="muted">No recorded load/repetition pairs.</p>
              )}
              {data.records.map((r, i) => (
                <p key={i}>
                  {r.equipment ?? 'Equipment unknown'} · {r.setType}: {r.load}{' '}
                  kg × {r.reps} · <Reference point={r.reference} />
                </p>
              ))}
              <p className="caption">
                Showing {data.records.length} of {data.recordGroups}{' '}
                equipment/type/rep groups, most recently encountered first.
              </p>
            </details>
            <details>
              <summary>Best repetitions at a given load</summary>
              {!data.bestReps.length && (
                <p className="muted">No recorded load/repetition pairs.</p>
              )}
              {data.bestReps.map((r, i) => (
                <p key={i}>
                  {r.equipment ?? 'Equipment unknown'} · {r.setType}: {r.reps}{' '}
                  reps at {r.load} kg · <Reference point={r.reference} />
                </p>
              ))}
            </details>
          </>
        )}
      </section>
    </>
  );
}
