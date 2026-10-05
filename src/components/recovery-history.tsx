'use client';
import { useState } from 'react';
import type { RecoveryData } from '@/analytics/polar-recovery';
import {
  isRecoveryEligible,
  type ValidityOverride,
} from '@/domain/observation-quality';

export function RecoveryHistory({
  history = [],
  onRefresh,
}: {
  history: RecoveryData['history'];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [reason, setReason] =
      useState<ValidityOverride['reason']>('sensor_artifact'),
    [page, setPage] = useState(0);
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  async function adjudicate(
    record: NonNullable<RecoveryData['history']>[number],
    status: ValidityOverride['status'],
  ) {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/polar/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [
            { family: record.family, date: record.date, device: record.device },
          ],
          status,
          reason: status === 'excluded' ? reason : null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Validity update failed');
      await onRefresh();
      setMessage(
        status === 'excluded'
          ? 'Excluded from recovery. Provider record retained.'
          : 'Restored for recovery. Completeness checks still apply.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Validity update failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card">
      <summary>Provider history & validity ({history.length} records)</summary>
      <p>
        Exclusions affect Stillform recovery inputs, trends and baselines. Polar
        payloads and provenance are preserved. No unusual record is
        automatically excluded.
      </p>
      <label>
        Exclusion reason
        <select
          value={reason ?? ''}
          onChange={(e) =>
            setReason((e.target.value || null) as ValidityOverride['reason'])
          }
        >
          <option value="sensor_artifact">Sensor artifact</option>
          <option value="incorrect_detection">Incorrect detection</option>
          <option value="other">Other</option>
          <option value="">No reason specified</option>
        </select>
      </label>
      {sorted.slice(page * 20, (page + 1) * 20).map((r) => (
        <div
          className="card"
          key={JSON.stringify([r.family, r.date, r.device])}
        >
          <h3>
            {r.date} · {r.family}
          </h3>
          <p>
            Polar · {r.device ?? 'Device unknown'} · sensor quality{' '}
            {r.sensorQuality}
          </p>
          <p>
            {!isRecoveryEligible(r)
              ? 'Excluded from recovery'
              : r.validityOverride?.status === 'valid'
                ? 'Valid · user confirmed'
                : 'Eligible · no user override'}
          </p>
          {r.validityOverride && (
            <p className="caption">
              User adjudication: {r.validityOverride.reason ?? 'No reason'} ·{' '}
              {r.validityOverride.adjudicatedAt}
            </p>
          )}
          <p className="caption">
            Provider synced {r.syncedAt}. Original record remains stored.
          </p>
          {r.summary && (
            <pre className="polar-json">
              {JSON.stringify(r.summary, null, 2)}
            </pre>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void adjudicate(r, isRecoveryEligible(r) ? 'excluded' : 'valid')
            }
          >
            {isRecoveryEligible(r) ? 'Exclude from recovery' : 'Restore'}
          </button>
        </div>
      ))}
      {sorted.length > 20 && (
        <div className="row">
          <button
            disabled={page === 0 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={(page + 1) * 20 >= sorted.length || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
