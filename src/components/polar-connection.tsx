'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWorkout } from './workout-provider';
import { realHistory } from '@/analytics/gym';
import { addDays, polarFamilies, type PolarFamily } from '@/domain/polar';
import type { publicPolarState } from '@/server/polar-service';
import { PolarDiagnosticDetails } from './polar-diagnostic';
import {
  DEFAULT_POLAR_TIME_ZONE,
  polarCalendarDate,
} from '@/domain/polar-training-range';
interface Status {
  configured: boolean;
  authenticated: boolean;
  connected: boolean;
  missing?: string[];
  mode?: string;
  scopes?: string[];
  state?: ReturnType<typeof publicPolarState>;
  trainingCount?: number;
  trainingTimeZone?: string;
}
async function api(action: string, input?: unknown) {
  const r = await fetch(
    `/api/polar/${action}`,
    input === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
  );
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? 'Polar request failed');
  return b;
}
export function PolarConnection() {
  const { store, cloud, cloudClient } = useWorkout();
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [ownAccount, setOwnAccount] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [accessKey, setAccessKey] = useState('');
  useEffect(() => {
    let alive = true;
    api('status')
      .then((s) => {
        if (alive) {
          setStatus(s);
          const today = polarCalendarDate(
            new Date(),
            s.trainingTimeZone || DEFAULT_POLAR_TIME_ZONE,
          );
          setFrom(addDays(today, -90));
          setTo(addDays(today, 1));
        }
      })
      .catch(() => {
        if (alive) setMessage('Polar status unavailable.');
      });
    const result = new URLSearchParams(window.location.search).get('polar');
    if (result)
      queueMicrotask(() => {
        if (alive)
          setMessage(
            (
              {
                connected:
                  'Polar connected. Select an explicit date range and sync below.',
                denied:
                  'Polar authorization denied; existing history retained.',
                state_error: 'OAuth state invalid or expired; reconnect.',
                missing_scope:
                  'No useful Polar data scope granted. Reconnect to authorize relevant modules.',
                service_error:
                  'Polar connection failed; verify server setup and reconnect.',
              } as Record<string, string>
            )[result] ?? '',
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  async function action(name: string, input: unknown = {}) {
    setBusy(true);
    try {
      const result = await api(name, input);
      setStatus(await api('status'));
      setMessage(result.revokeInstructions ?? 'Operation complete.');
      setPassword('');
      setAccessKey('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Polar operation failed');
    } finally {
      setBusy(false);
    }
  }
  async function sync(families: PolarFamily[], restart: boolean) {
    setBusy(true);
    setMessage('Syncing bounded windows…');
    try {
      const source = cloud.cache
        ? (await cloudClient.read({ scope: 'all' })).store!
        : store;
      const gym = realHistory(source.history).map((w) => ({
        id: w.id,
        title: w.routineName,
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        durationMinutes: w.durationMinutes,
        source: w.provenance.source,
      }));
      for (let i = 0; i < 5; i++) {
        const state = await api('sync', {
          families,
          from,
          to,
          restart: restart && i === 0,
          gym: i === 0 ? gym : [],
        });
        setStatus((s) => (s ? { ...s, state } : s));
        if (families.every((f) => state.jobs[f]?.done)) break;
        if (i < 4) await new Promise((r) => setTimeout(r, 1150));
      }
      setMessage(
        'Checkpoints saved. Zero available records is a successful result. Continue sync for remaining windows.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      try {
        setStatus(await api('status'));
      } catch {}
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h1>Polar connection</h1>
      <p>
        Real training and Recovery source data · AccessLink Dynamic API v4.
        Strava may stay unconfigured. Gym sets remain local and authoritative.
      </p>
      <Link href="/activities">Activity registry →</Link> ·{' '}
      <Link href="/recovery">Recovery →</Link>
      {!status && <p>Loading Polar status…</p>}
      {status && !status.configured && (
        <>
          <h3>Polar setup required</h3>
          <p>
            No account connected. Follow the Polar setup section in README; put
            these server-only names in ignored .env.local:
          </p>
          <ul>
            {status.missing?.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
      {status?.configured && !status.authenticated && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action('login', { email, password, accessKey });
          }}
        >
          <h3>Sign in to secure integrations</h3>
          {status.mode === 'dev-file' ? (
            <label>
              Development access key
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                autoComplete="off"
              />
            </label>
          ) : (
            <>
              <label>
                Integration email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Integration password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          )}
          <button className="primary" disabled={busy}>
            Sign in to Polar integrations
          </button>
        </form>
      )}
      {status?.authenticated && (
        <>
          <p>
            <strong>
              {status.connected
                ? 'Polar account connected'
                : 'Polar disconnected'}
            </strong>
          </p>
          <p className="caption">
            Granted scopes: {status.scopes?.join(' · ') || 'None'}
          </p>
          <label className="row start">
            <input
              type="checkbox"
              checked={ownAccount}
              onChange={(e) => setOwnAccount(e.target.checked)}
            />
            I will authorize my own Polar account; when reconnecting, I will use
            the same account.
          </label>
          <p className="caption">
            V4 tokens provide no stable athlete ID. This explicit account
            confirmation protects owner-bound history; switching accounts is not
            supported.
          </p>
          {ownAccount && (
            <form action="/api/polar/connect" method="get">
              <input type="hidden" name="account" value="confirmed" />
              <button className="primary" type="submit">
                {status.connected ? 'Reconnect Polar' : 'Connect Polar'}
              </button>
            </form>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void action('logout')}
          >
            Sign out
          </button>
          {status.connected && (
            <>
              <div className="two-grid">
                <label>
                  From (inclusive)
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To (exclusive)
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
              <p className="caption">
                Requested range does not guarantee historical availability. This
                is Polar history available, not your complete activity history.
              </p>
              <p className="caption">
                Training calendar dates:{' '}
                {status.trainingTimeZone || DEFAULT_POLAR_TIME_ZONE}. Start is
                inclusive; end is exclusive, at local midnight.
              </p>
              <div className="row start">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void action('metadata')}
                >
                  Sync device & sport context
                </button>
                <button
                  className="primary"
                  disabled={busy || !from || !to || from >= to}
                  onClick={() => void sync(['training'], true)}
                >
                  Sync training sessions
                </button>
                <button
                  className="secondary"
                  disabled={busy || !from || !to || from >= to}
                  onClick={() =>
                    void sync(['sleep', 'nightly', 'continuous', 'ppi'], true)
                  }
                >
                  Sync Recovery data
                </button>
                <button
                  className="secondary"
                  disabled={busy || !from || !to || from >= to}
                  onClick={() => void sync([...polarFamilies], true)}
                >
                  Sync all
                </button>
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    !status.state ||
                    !Object.values(status.state.jobs).some((j) => !j.done)
                  }
                  onClick={() =>
                    void sync(
                      [...polarFamilies].filter((f) => !!status.state?.jobs[f]),
                      false,
                    )
                  }
                >
                  Continue Polar sync
                </button>
              </div>
              <p className="caption">
                Sync sport context before sessions to resolve provider sport
                IDs. Rich running samples, routes and laps are fetched
                explicitly from activity detail.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDisconnect(true)}
              >
                Disconnect Polar
              </button>
              {disconnect && (
                <div className="notice">
                  <p>
                    Remove local Polar tokens and retain saved history? Also
                    revoke the app grant in Polar account settings.
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDisconnect(false);
                      void action('disconnect');
                    }}
                  >
                    Confirm disconnect Polar
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setDisconnect(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {status?.state && (
        <>
          <PolarDiagnosticDetails diagnostic={status.state.contextDiagnostic} />
          <p>
            {status.trainingCount ?? 0} Polar training sessions ·{' '}
            {status.state.recordCounts?.sleep.valid ??
              status.state.counts.sleep}{' '}
            valid sleep nights ·{' '}
            {status.state.recordCounts?.sleep.excluded ?? 0} excluded Polar
            sleep records · {status.state.counts.nightly} Nightly Recharge dates
            · Recovery engine pending.
          </p>
          {status.state.blockedUntil > 0 && (
            <p>
              Retry not before{' '}
              {new Date(status.state.blockedUntil).toLocaleString()}
            </p>
          )}
          {Object.entries(status.state.jobs).map(([family, j]) => (
            <details key={family}>
              <summary>
                {family}:{' '}
                {j.unavailable
                  ? 'Scope/data family unavailable'
                  : j.done
                    ? 'Completed'
                    : 'Backfill pending'}{' '}
                · {j.requests} windows
              </summary>
              <p className="caption">
                Requested {j.from} – {j.to} (exclusive) · oldest/newest returned{' '}
                {j.oldest ?? 'None'} / {j.newest ?? 'None'} · last success{' '}
                {j.lastSuccess ?? 'Not yet'} · next {j.next} ·{' '}
                {family === 'training'
                  ? 'Rich training details are fetched on demand from activity detail.'
                  : `${j.pending.length} dates awaiting detail`}
              </p>
              <p className="caption">
                Empty availability windows:{' '}
                {j.emptyWindows.map((w) => `${w.from} – ${w.to}`).join(' · ') ||
                  'None'}
                . Missing records do not mean a physiological anomaly.
              </p>
              {j.errors.map((e, i) => (
                <p role="alert" key={i}>
                  {e}
                </p>
              ))}
              <PolarDiagnosticDetails diagnostic={j.diagnostic} />
            </details>
          ))}
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
