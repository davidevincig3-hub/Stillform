import type { RecoveryEngineResult } from '@/domain/recovery-engine';
const labels = {
  insufficient_data: 'Insufficient data',
  normal: 'Within usual personal range',
  possibly_suppressed: 'Possibly suppressed pattern',
  possibly_elevated: 'Possibly elevated pattern',
};
export function RecoveryAssessment({
  engine,
}: {
  engine?: RecoveryEngineResult;
}) {
  if (!engine)
    return (
      <section className="card">
        <h2>Assessment unavailable</h2>
        <p>No engine result returned. No sample recovery is substituted.</p>
      </section>
    );
  const influential = engine.signals.filter((s) =>
    engine.influentialSignals.includes(s.id),
  );
  return (
    <section
      className="card assessment"
      data-testid="recovery-engine"
      data-state={engine.state}
      data-explanation={engine.explanation.code}
    >
      <div className="row">
        <div>
          <p className="eyebrow">Recovery Engine V1 · real evidence</p>
          <h2>{labels[engine.state]}</h2>
        </div>
        <span className="tag">Confidence: {engine.confidence}</span>
      </div>
      <p className="interpretation">{engine.explanation.text}</p>
      <p>
        Personal baseline: {engine.baselineMaturity} · assessed{' '}
        {engine.asOfDate}
      </p>
      <div className="metric-grid">
        {influential.map((s) => (
          <div key={s.id}>
            <p className="caption">
              {s.name} · {s.family}
            </p>
            <strong>
              {s.recentMedian?.toFixed(1)} {s.unit}
            </strong>
            <p>
              {s.direction}{' '}
              {s.delta === null || s.direction === 'unavailable'
                ? ''
                : `· ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(1)} ${s.unit} vs personal median`}
            </p>
            <p className="caption">
              {s.baseline.count} baseline days ·{' '}
              {Math.round(s.baseline.coverage * 100)}% coverage ·{' '}
              {s.baseline.maturity}
            </p>
          </div>
        ))}
      </div>
      {!influential.length && (
        <p>No eligible recent overnight metrics. Missing days remain gaps.</p>
      )}
      <p className="caption">
        Contributing families:{' '}
        {engine.explanation.families.join(', ') ||
          'None for an integrated state'}
        . HRV and other autonomic measurements count as one family.
      </p>
      <details>
        <summary>Explain recovery evidence</summary>
        {engine.families.map((f) => (
          <p key={f.family}>
            {f.family}: {f.status.replaceAll('_', ' ')} · {f.direction}
            {f.contributes ? ' · contributes' : ''}
          </p>
        ))}
        <p>
          Logged training in last 7 days: {engine.training.loggedSessions7d}{' '}
          sessions · {engine.training.gymExposures7d} gym exposures ·{' '}
          {engine.training.completedGymSets7d ?? 'Unavailable'} completed local
          Gym sets ·{' '}
          {engine.training.runningMinutes7d === null
            ? 'running duration unavailable'
            : `${Math.round(engine.training.runningMinutes7d)} running minutes`}
          .
        </p>
        <p>
          Days since last logged session:{' '}
          {engine.training.daysSinceLastLoggedSession ?? 'Unavailable'}. Missing
          activity records do not prove rest. High-intensity sessions:
          unavailable.
        </p>
        {engine.signals.map((s) => (
          <p className="caption" key={s.id}>
            {s.name}: {s.context} · {s.quality} evidence · baseline{' '}
            {s.baseline.start}–{s.baseline.end} · {s.baseline.count} valid dates
            · {s.baseline.spanDays} day span. {s.missing.join(' ')}
          </p>
        ))}
        {engine.anomalies.length > 0 && (
          <p>
            Anomalous signals:{' '}
            {engine.signals
              .filter((s) => engine.anomalies.includes(s.id))
              .map((s) => s.name)
              .join(', ')}
            . A single family does not establish recovery state.
          </p>
        )}
        {engine.signals
          .filter((s) => s.anomalyDates.length)
          .map((s) => (
            <p key={`anomaly-${s.id}`} className="caption">
              {s.name} unusual dates: {s.anomalyDates.join(', ')}.
            </p>
          ))}
        {engine.missing.map((reason, i) => (
          <p className="caption" key={i}>
            {reason}
          </p>
        ))}
        <p>
          {engine.policy.label}. Prior {engine.policy.baselineDays} days and
          recent {engine.policy.recentDays}-day trend are separate. No recovery
          score, medical certainty or AI interpretation.
        </p>
      </details>
    </section>
  );
}
