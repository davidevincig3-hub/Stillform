'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { gymTrend, gymTrendView, trendPolicy } from '@/analytics/gym-trend';
import { polarCalendarDate } from '@/domain/polar-training-range';
import { useGymHistory } from './use-gym-history';

export function GymPerformanceTrend() {
  const asOf = polarCalendarDate(new Date(), trendPolicy.timeZone);
  const context = useGymHistory({ scope: 'trend', asOf });
  const [group, setGroup] = useState('total');
  const [exercise, setExercise] = useState('');
  const local = useMemo(
    () => gymTrend(context.store.history, asOf),
    [context.store.history, asOf],
  );
  const account = !!(context.cloud.cache || context.cloud.snapshot?.owner);
  const result = account ? context.trend : local;
  const muscle =
    group === 'total'
      ? undefined
      : group === 'unassigned'
        ? null
        : group.slice(2);
  const view = result
    ? gymTrendView(result, muscle, exercise || undefined)
    : null;
  const groups = result
    ? [
        ...new Set(
          result.exercises
            .flatMap((e) => e.muscles)
            .filter((v): v is string => v !== null),
        ),
      ].sort()
    : [];
  const exercises =
    result?.exercises.filter(
      (e) => muscle === undefined || e.muscles.includes(muscle),
    ) ?? [];
  const eligible = !!view?.cohort.length;
  const latest = view?.points.at(-1)?.index;
  return (
    <section
      className="card chart-card gym-trend"
      data-testid="gym-performance-trend"
    >
      <div className="row">
        <div>
          <p className="eyebrow">Recorded performance · descriptive index</p>
          <h2>Performance trend</h2>
        </div>
        {latest != null && (
          <strong className="trend-value">
            {latest.toFixed(1)}
            <span className="caption"> · reference 100</span>
          </strong>
        )}
      </div>
      <p className="caption">{trendPolicy.explanation}</p>
      <p className="caption">
        Last 12 weeks · trailing 28-day windows · Europe/Rome
      </p>
      <details className="trend-navigation">
        <summary>Muscle groups</summary>
        <label htmlFor="trend-muscle">View muscle group</label>
        <select
          id="trend-muscle"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setExercise('');
          }}
        >
          <option value="total">Contributing groups · aggregate</option>
          {groups.map((g) => (
            <option key={g} value={`g:${g}`}>
              {g}
            </option>
          ))}
          <option value="unassigned">
            Unassigned · individual exercises only
          </option>
        </select>
        <label htmlFor="trend-exercise">View exercise</label>
        <select
          id="trend-exercise"
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
        >
          <option value="">
            {muscle === null
              ? 'Choose an unassigned exercise'
              : 'All contributing exercises'}
          </option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </details>
      {context.historyUpdating && account && (
        <p role="status" className="caption">
          {result
            ? 'Updating trend… Last available result shown.'
            : 'Loading performance trend…'}
        </p>
      )}
      {context.historyError && (
        <div className="notice" role="alert">
          <p>
            {context.historyError}{' '}
            {result
              ? 'Last available result is not refreshed.'
              : 'No account trend is available.'}
          </p>
          <button className="secondary" onClick={context.retryHistory}>
            Retry performance trend
          </button>
        </div>
      )}
      {!eligible && context.ready && result && (
        <p className="notice">
          Insufficient data for this trend. Each fixed exercise/protocol needs
          at least two training dates in both the initial and final 28-day
          windows. Recorded history remains available.{' '}
          {muscle === undefined &&
            !exercise &&
            'Unassigned exercises are excluded from the muscle aggregate; inspect them individually under Muscle groups.'}
        </p>
      )}
      {eligible && view && (
        <>
          <p className="caption">
            {view.groups.filter((g) => g !== null).join(', ') ||
              'Unassigned exercise'}{' '}
            · {view.exercises.length} exercises · {view.cohort.length} fixed
            protocols. This is a partial view of contributing groups, not
            whole-body performance.
          </p>
          <div
            className="chart"
            role="img"
            aria-label="Recorded performance index, weekly points; missing windows are gaps"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={view.points}
                margin={{ left: 0, right: 12, top: 14, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(5)}
                  minTickGap={40}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  width={42}
                  tickLine={false}
                />
                <ReferenceLine
                  y={100}
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as
                      (typeof view.points)[number] | undefined;
                    return active && p ? (
                      <div className="card trend-tooltip">
                        <strong>
                          {p.date} ·{' '}
                          {p.index === null ? 'Gap' : p.index.toFixed(1)}
                        </strong>
                        <p>
                          {p.from} → {p.date} · inclusive calendar dates
                        </p>
                        <p>
                          {p.availableProtocols}/{p.requiredProtocols} fixed
                          protocols · {p.dates} protocol training dates
                        </p>
                        <p>
                          Effort recorded: {p.effortExposures}/{p.exposures}{' '}
                          first work sets
                        </p>
                        <p>
                          Reference: {view.points[0].from} →{' '}
                          {view.points[0].date} = 100
                        </p>
                      </div>
                    ) : null;
                  }}
                />
                <Line
                  type="linear"
                  dataKey="index"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details>
            <summary>Weekly values & coverage</summary>
            {view.points.map((p) => (
              <p key={p.date}>
                {p.date}:{' '}
                {p.index === null
                  ? 'Gap · insufficient fixed-cohort data'
                  : p.index.toFixed(1)}{' '}
                · {p.availableProtocols}/{p.requiredProtocols} protocols ·
                effort {p.effortExposures}/{p.exposures}
              </p>
            ))}
          </details>
        </>
      )}
      {result && (
        <details>
          <summary>Contributors, exclusions & method</summary>
          <p className="caption">
            {result.counts.eligibleBlocks}/{result.counts.blocks} eligible
            exercise blocks in the assessment span ·{' '}
            {result.counts.effortBlocks} with recorded effort ·{' '}
            {result.counts.unassignedBlocks} unassigned blocks. Counts are
            descriptive, not training volume weights.
          </p>
          <p className="caption">
            {view?.cohort.length ?? 0}/{view?.relevant.length ?? 0} protocols
            qualify in both endpoint windows. The same cohort is used at every
            point; an incomplete window is a gap.
          </p>
          {result.exclusions.map((e) => (
            <p key={e.reason}>
              {e.reason}: {e.blocks} blocks
            </p>
          ))}
          {view?.relevant.map((p) => (
            <details key={p.key}>
              <summary>
                {p.name} · block {p.block} ·{' '}
                {p.equipment ?? 'Equipment unknown'} · {p.model} ·{' '}
                {p.eligible ? 'contributes' : 'insufficient endpoint dates'}
              </summary>
              <p>
                Historical primary group: {p.muscle ?? 'Unassigned'} ·{' '}
                {p.setType} ·{' '}
                {p.superset
                  ? 'Superset context kept separate'
                  : 'No recorded superset'}
              </p>
              <p>
                Model: {p.model}. Baseline: {p.baseline.dates} training dates,{' '}
                {p.baseline.exposures} first work sets. Final:{' '}
                {p.points.at(-1)!.dates} dates, {p.points.at(-1)!.exposures}{' '}
                first work sets.
              </p>
              <p>
                Effort coverage: baseline {p.baseline.effortExposures}/
                {p.baseline.exposures}; final {p.points.at(-1)!.effortExposures}
                /{p.points.at(-1)!.exposures}. Effort never changes the formula;
                different or missing effort limits interpretation.
              </p>
              <p>
                Baseline effort contexts:{' '}
                {p.baseline.effortContexts.join('; ') || 'Unrecorded'}. Final:{' '}
                {p.points.at(-1)!.effortContexts.join('; ') || 'Unrecorded'}.
              </p>
              {!p.equipment && (
                <p>
                  Unknown equipment is compared only with unknown equipment for
                  this canonical exercise. Machine/settings equivalence is
                  unverified.
                </p>
              )}
              <Link
                className="text-button"
                href={`/gym/exercises/${encodeURIComponent(p.exerciseId)}`}
              >
                Inspect recorded sets & conservative comparisons →
              </Link>
            </details>
          ))}
          <p>
            First completed work set per block; warm-ups and dropsets skipped.
            Integer 5–15 reps, positive recorded load, interpolation within
            table bounds only. Daily medians precede 28-day medians. Baseline is
            the first point’s window. Protocols are averaged within each
            exercise; exercises equally within each group; groups equally in the
            aggregate.
          </p>
          <p>
            <a
              className="text-button"
              href="https://doi.org/10.1007/s40279-023-01937-7"
              target="_blank"
              rel="noreferrer"
            >
              Nuzzo et al., Sports Medicine (online 2023)
            </a>
            : population repetitions-to-failure relationship. Linear
            interpolation and inversion are Stillform product choices, not the
            original spline or an individually validated estimate. No user
            confidence intervals or measured maximal strength are inferred.
          </p>
          <p>
            Special models require audited canonical classifications. Currently
            only builtin leg press is classified; other identities use general
            unless deliberately verified. Historical names never select a model.
            Muscle metadata is never backfilled from the library.
          </p>
        </details>
      )}
      {exercise && (
        <p>
          <Link
            className="text-button"
            href={`/gym/exercises/${encodeURIComponent(exercise)}`}
          >
            Open full exercise history →
          </Link>
        </p>
      )}
      <p>
        <Link className="text-button" href="/gym/exercise-history">
          Browse all exercise histories →
        </Link>
      </p>
    </section>
  );
}
