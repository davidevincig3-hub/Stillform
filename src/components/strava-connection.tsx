'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWorkout } from './workout-provider';
import { realHistory } from '@/analytics/gym';
interface ConnectionStatus {
  configured: boolean;
  authenticated: boolean;
  connected: boolean;
  mode?: string;
  missing?: string[];
  athleteId?: string;
  scopes?: string[];
  sync?: {
    discovered: number;
    created: number;
    linked: number;
    review: number;
    done: boolean;
    page: number;
    blockedUntil: number;
    errors: string[];
  };
  reviews?: number;
}
async function api(action: string, input?: unknown) {
  const r = await fetch(
    `/api/integrations/${action}`,
    input === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Integration unavailable');
  return body;
}
export function StravaConnection() {
  const { store, cloud, cloudClient } = useWorkout();
  const [status, setStatus] = useState<ConnectionStatus | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useEffect(() => {
    let active = true;
    api('status')
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active) setMessage('Integration status unavailable.');
      });
    const code = new URLSearchParams(window.location.search).get('strava');
    if (code)
      queueMicrotask(() => {
        if (active)
          setMessage(
            (
              {
                connected: 'Strava connected. Start a reviewed sync below.',
                denied: 'Strava authorization was denied.',
                missing_scope:
                  'Private activity access was not granted. Reconnect and accept the required scope.',
                state_error:
                  'OAuth state expired or was invalid. Try connecting again.',
                service_error:
                  'Authorization could not be completed. Check server setup and reconnect.',
              } as Record<string, string>
            )[code] || '',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(name: string, input: unknown = {}) {
    setBusy(true);
    try {
      await api(name, input);
      setStatus(await api('status'));
      setMessage(
        name === 'disconnect'
          ? 'Disconnected. Canonical history retained.'
          : 'Operation complete.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }
  async function sync(full = false) {
    setBusy(true);
    setMessage('Synchronizing one page at a time…');
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
      for (let page = 0; page < 5; page++) {
        const progress = await api('sync', {
          gym: page === 0 ? gym : [],
          full: full && page === 0,
        });
        setStatus((s) => (s ? { ...s, sync: progress } : s));
        if (progress.done || progress.blockedUntil > Date.now()) break;
        if (page < 4) await new Promise((resolve) => setTimeout(resolve, 2100));
      }
      setStatus(await api('status'));
      setMessage(
        'Sync saved. If more pages remain, Continue sync resumes from the checkpoint.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sync failed');
      try {
        setStatus(await api('status'));
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Strava connection</h1>
      <p className="muted">
        Real activity registry. Gym sets remain local and authoritative. No
        physiological or AI analysis is performed.
      </p>
      <p>
        <Link href="/activities">Activity registry →</Link> ·{' '}
        <Link href="/gym">Gym →</Link>
      </p>
      <section className="card">
        {!status && <p>Loading integration status…</p>}
        {status && !status.configured && (
          <>
            <h3>Secure setup required</h3>
            <p>
              No external account is connected. Follow README setup and fill
              these names locally in .env.local:
            </p>
            <ul>
              {status.missing?.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <p className="caption">
              Never paste Strava secrets here or into chat. Without
              configuration, your local Gym history continues to work.
            </p>
          </>
        )}
        {status?.configured && !status.authenticated && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form);
              await action('login', Object.fromEntries(data));
              form.reset();
            }}
          >
            <h3>Sign in to secure integrations</h3>
            {status.mode === 'dev-file' ? (
              <label>
                Development integration access key
                <input
                  name="accessKey"
                  type="password"
                  required
                  autoComplete="off"
                />
              </label>
            ) : (
              <>
                <label>
                  Supabase account email
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
              </>
            )}
            <button disabled={busy}>Sign in</button>
          </form>
        )}
        {status?.authenticated && (
          <>
            <p>
              {status.connected
                ? `Connected to Strava athlete ${status.athleteId}`
                : 'Strava not connected'}
            </p>
            <p className="caption">
              Granted scopes: {status.scopes?.join(', ') || 'None'}
            </p>
            {!status.connected ? (
              <button
                className="primary"
                onClick={() =>
                  window.location.assign(
                    new URL('/api/integrations/connect', window.location.origin)
                      .href,
                  )
                }
              >
                Connect with Strava
              </button>
            ) : (
              <>
                <p className="caption">
                  Sync sends only confirmed local Gym workout IDs, titles,
                  timing and provenance for matching. It never migrates or edits
                  exercises/sets.
                </p>
                <div className="row start">
                  <button disabled={busy} onClick={() => sync()}>
                    Start / Continue sync
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => sync(true)}
                  >
                    Full backfill again
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => action('webhooks')}
                  >
                    Process next queued webhook
                  </button>
                </div>
                <button
                  className="secondary danger"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect Strava
                </button>
                {confirmDisconnect && (
                  <div className="notice">
                    <p>
                      Revoke Strava access and stop sync? Your canonical and Gym
                      history will stay.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep connected
                    </button>
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirmDisconnect(false);
                        action('disconnect');
                      }}
                    >
                      Confirm disconnect
                    </button>
                  </div>
                )}
              </>
            )}
            {status.sync && (
              <p>
                {status.sync.discovered} activities discovered ·{' '}
                {status.sync.created} new canonical · {status.sync.linked}{' '}
                linked · {status.sync.review} requiring review ·{' '}
                {status.sync.errors.length} sync errors ·{' '}
                {status.sync.done
                  ? 'Caught up'
                  : `Next page ${status.sync.page}`}
              </p>
            )}
            {status.sync?.blockedUntil && status.sync.blockedUntil > 0 ? (
              <p className="notice">
                Rate budget paused until{' '}
                {new Date(status.sync.blockedUntil).toLocaleString()}. Continue
                later.
              </p>
            ) : null}
            {status.sync?.errors.map((e, i) => (
              <p key={i} className="notice">
                {e}
              </p>
            ))}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => action('logout')}
            >
              Sign out of integrations
            </button>
          </>
        )}
      </section>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </>
  );
}
