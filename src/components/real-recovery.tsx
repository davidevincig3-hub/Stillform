'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  recoverySeries,
  windowSummary,
  maturityPolicy,
  type RecoveryData,
  type RecoveryPoint,
} from '@/analytics/polar-recovery';
import { PageHeading } from './assessment';
import { RecoveryHistory } from './recovery-history';
import { isRecoveryEligible } from '@/domain/observation-quality';
import { RecoveryAssessment } from './recovery-assessment';
import { useRecoveryData } from './use-recovery-data';
function RealMetric({
  name,
  unit,
  context,
  points,
  asOf,
}: {
  name: string;
  unit: string;
  context: string;
  points: RecoveryPoint[];
  asOf: string;
}) {
  const [days, setDays] = useState(28),
    [analyze, setAnalyze] = useState(false);
  const s = windowSummary(points, days, asOf);
  const latest = s.points.filter((p) => p.value !== null).at(-1);
  return (
    <section className="card">
      <div className="section-heading">
        <h3>{name}</h3>
        <span className="tag">Real Polar data</span>
      </div>
      <p className="caption">{context}</p>
      <strong>
        {latest
          ? `${latest.value!.toFixed(1)} ${unit} · ${latest.date}`
          : 'Insufficient data'}
      </strong>
      <p className="caption">
        {s.count} observations / {days} days · {s.completeCount} complete ·
        baseline {s.maturity}
      </p>
      <div className="row start">
        {[7, 28, 90].map((d) => (
          <button
            className="secondary"
            aria-pressed={days === d}
            key={d}
            onClick={() => setDays(d)}
          >
            {d}d
          </button>
        ))}
        <button className="secondary" onClick={() => setAnalyze((a) => !a)}>
          Analyze {name}
        </button>
      </div>
      {s.count > 0 && (
        <div style={{ height: 220, width: '100%', minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={s.points}>
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                minTickGap={30}
              />
              <YAxis width={48} />
              <Tooltip formatter={(v) => [`${v} ${unit}`, name]} />
              <Line
                dataKey="value"
                type="linear"
                stroke="var(--accent)"
                dot={{ r: 3 }}
                connectNulls={false}
              />
              {s.referenceMedian !== null && (
                <ReferenceLine
                  y={s.referenceMedian}
                  strokeDasharray="4 4"
                  label="Observed median"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="caption">
        {s.referenceMedian === null
          ? 'Insufficient complete observations for a descriptive baseline.'
          : 'Dashed line: median of complete observations in this window; not a physiological threshold. Engine baseline excludes the current trend window.'}
      </p>
      {analyze && (
        <div className="notice">
          <p>
            {s.start} – {s.end} · {unit} · {Math.round(s.coverage * 100)}% day
            coverage
          </p>
          <p>
            {s.points
              .filter((p) => p.value !== null)
              .map(
                (p) =>
                  `${p.date}: ${p.value!.toFixed(1)} ${unit}${p.complete ? '' : ' (incomplete)'}`,
              )
              .join(' · ') || 'No real observations in this window.'}
          </p>
          <p>
            Source: Polar · UI maturity defaults {maturityPolicy.preliminary}/
            {maturityPolicy.developing}/{maturityPolicy.established} complete
            observations. These defaults are configurable and not scientifically
            validated. No AI or training prescription.
          </p>
        </div>
      )}
    </section>
  );
}
export function RealRecovery({
  data,
  onRefresh,
}: {
  data: RecoveryData;
  onRefresh: () => Promise<void>;
}) {
  const validSleep = data.sleep.filter(isRecoveryEligible),
    validNightly = data.nightly.filter(isRecoveryEligible);
  const latest = [...validSleep]
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return (
    <>
      <PageHeading
        title="Recovery source data."
        subtitle="Real Polar observations and deterministic personal-baseline evidence."
      />
      <RecoveryAssessment engine={data.engine} />
      <section className="card">
        <h2>{validSleep.length} valid sleep nights</h2>
        {data.recordCounts && (
          <p>
            {data.recordCounts.sleep.provider} Polar sleep records ·{' '}
            {data.recordCounts.sleep.excluded} Polar records excluded
          </p>
        )}
        <p>
          {validNightly.length} valid Nightly Recharge dates ·{' '}
          {data.connected
            ? 'Polar connected'
            : 'Disconnected · saved history retained'}
        </p>
        <p className="muted">
          Missing nights are valid. Begin collecting a baseline prospectively by
          wearing your device overnight. No sample values fill gaps.
        </p>
        <Link href="/integrations">Manage Polar sync →</Link>
      </section>
      <div className="section-heading">
        <h2>Underlying nightly signals</h2>
      </div>
      <div className="two-grid">
        {recoverySeries(data).map((s) => (
          <RealMetric key={s.name} {...s} asOf={data.asOf} />
        ))}
      </div>
      <section className="card">
        <h2>Sleep timing & source quality</h2>
        {latest ? (
          <>
            <p>
              {latest.date} · {latest.start ?? 'Start unavailable'} →{' '}
              {latest.end ?? 'End unavailable'}
            </p>
            <p>
              {latest.interruptions ?? 'Unavailable'} interruptions ·{' '}
              {latest.awakeSeconds ?? 'Unavailable'} s awake ·{' '}
              {latest.userModified
                ? 'User-modified sleep'
                : 'No edit indicated'}{' '}
              ·{' '}
              {latest.complete
                ? 'Complete normalized observation'
                : 'Incomplete normalized observation'}
            </p>
            <p>Device: {latest.device ?? 'Unknown'} · sensor quality unknown</p>
            <p>
              Available phases:{' '}
              {Object.entries(latest.phaseSeconds)
                .map(([k, v]) => `${k}: ${v ?? 'unavailable'} s`)
                .join(' · ') || 'Unavailable'}
            </p>
            {latest.vendorSleepScore !== null && (
              <p className="caption">
                Secondary vendor Sleep Score: {latest.vendorSleepScore}. Not the
                application Recovery state.
              </p>
            )}
          </>
        ) : (
          <p>Insufficient data · no real sleep nights available.</p>
        )}
      </section>
      <details className="card">
        <summary>Vendor Nightly Recharge context</summary>
        {validNightly.length ? (
          validNightly.slice(-28).map((n) => (
            <p className="caption" key={n.date}>
              {n.date}: {JSON.stringify(n.vendor)} · Polar vendor comparisons
              only; not our Recovery verdict.
            </p>
          ))
        ) : (
          <p>No Nightly Recharge records available.</p>
        )}
      </details>
      <section className="card">
        <h3>Separate measurement contexts</h3>
        <p>
          {data.continuousDays} continuous-HR device-days · {data.ppiDays} PPI
          days stored securely on the server. Day offsets retain unknown
          timezone where absent. Continuous BPM is not nightly/resting HR or
          HRV. PPI quality and recording context remain available for future
          analytics.
        </p>
      </section>
      <RecoveryHistory history={data.history} onRefresh={onRefresh} />
    </>
  );
}
export function RecoveryMode({ sample }: { sample: React.ReactNode }) {
  const { data, mode, checking, error, refresh } = useRecoveryData();
  const [sampleView, setSampleView] = useState(false);
  if (checking)
    return (
      <PageHeading
        title="Recovery source data."
        subtitle="Checking real-data availability…"
      />
    );
  return (
    <>
      {data?.realMode ? (
        <>
          <div className="row start">
            <span className="tag">
              {sampleView ? 'Explicit sample view' : 'REAL POLAR SOURCE DATA'}
            </span>
            <button
              className="secondary"
              onClick={() => setSampleView((v) => !v)}
            >
              {sampleView ? 'Show real data' : 'Show labelled sample view'}
            </button>
          </div>
          {sampleView ? (
            sample
          ) : (
            <RealRecovery data={data} onRefresh={refresh} />
          )}
        </>
      ) : mode === 'unavailable' ? (
        <section className="card">
          <h2>Recovery assessment unavailable</h2>
          <p role="status">{error}</p>
        </section>
      ) : (
        <>
          {sample}
          <p className="notice">
            This is the sample view.{' '}
            <Link href="/integrations">Connect Polar</Link> for separate real
            Recovery source data and a separate personal-baseline assessment.
          </p>
        </>
      )}
    </>
  );
}
