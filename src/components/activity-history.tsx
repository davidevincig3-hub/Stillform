'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  CanonicalActivity,
  ExternalActivitySource,
  ActivityRegistry,
  ActivityLap,
} from '@/domain/activity';
interface PublicRegistry {
  activities: CanonicalActivity[];
  sources: Omit<ExternalActivitySource, 'raw' | 'previous'>[];
  reviews: ActivityRegistry['reviews'];
}
async function registryGet(path = '/api/activities') {
  const r = await fetch(path, { cache: 'no-store' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Registry unavailable');
  return data;
}
export function ActivityHistory({ running = false }: { running?: boolean }) {
  const [data, setData] = useState<PublicRegistry | null>(null),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [sport, setSport] = useState(''),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    registryGet()
      .then((s) => {
        if (active) setData(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered =
      data?.activities
        .filter(
          (a) =>
            (!running || ['run', 'trail_run'].includes(a.sport)) &&
            (!sport || a.sport === sport) &&
            a.title.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)) ?? [],
    size = running ? 5 : 20;
  async function review(sourceKey: string, targetId: string | null) {
    setBusy(true);
    try {
      const r = await fetch('/api/integrations/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKey, targetId }),
      });
      if (!r.ok) throw new Error('Match decision could not be saved');
      setData(await registryGet());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="section-heading">
        <h2>
          {running ? 'Real running workout history' : 'Activity registry'}
        </h2>
        <span className="tag">Real data</span>
      </div>
      <p>
        <Link href="/integrations">Connect / manage Polar or Strava →</Link>
        {running && (
          <>
            {' '}
            · <Link href="/activities">All activities →</Link>
          </>
        )}
      </p>
      {error && (
        <p className="caption">
          {error}. No sample workouts are substituted here.
        </p>
      )}
      <label>
        Search activities
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {!running && (
        <label>
          Sport
          <select
            value={sport}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All sports</option>
            {[
              'run',
              'trail_run',
              'cycling',
              'swimming',
              'walking',
              'hiking',
              'strength',
              'other',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {!filtered.length && (
        <p className="muted">
          No real activities available. Connect and sync Polar or Strava to
          build your registry.
        </p>
      )}
      {filtered.slice(page * size, page * size + size).map((a) => (
        <div className="history-row" key={a.id}>
          <Link
            className="text-button"
            href={`/activities/${encodeURIComponent(a.id)}`}
          >
            <strong>{a.title}</strong>
            <p className="caption">
              {new Date(a.startedAt).toLocaleString()} · {a.sport} ·{' '}
              {a.elapsedSeconds === null
                ? 'Duration unavailable'
                : `${Math.round(a.elapsedSeconds / 60)} min`}
              {a.distanceM === null
                ? ''
                : ` · ${(a.distanceM / 1000).toFixed(2)} km`}
            </p>
            <span className="caption">
              {a.sourceKeys
                .map(
                  (k) =>
                    data?.sources.find((s) => s.key === k)?.provider ??
                    'source',
                )
                .join(' + ')}{' '}
              · {a.sourceKeys.length > 1 ? 'Linked sources' : a.status}
            </span>
          </Link>
        </div>
      ))}
      {filtered.length > size && (
        <div className="row start">
          <button
            className="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous activities
          </button>
          <span>Page {page + 1}</span>
          <button
            className="secondary"
            disabled={(page + 1) * size >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next activities
          </button>
        </div>
      )}
      {!running &&
        data?.reviews.map((r) => {
          const incoming = data.activities.find((a) => a.id === r.incomingId);
          return (
            <details className="notice" key={r.sourceKey}>
              <summary>Review possible match: {incoming?.title}</summary>
              <p>
                {incoming?.sport} ·{' '}
                {incoming && new Date(incoming.startedAt).toLocaleString()} ·{' '}
                {incoming?.elapsedSeconds ?? 'Unknown'} s ·{' '}
                {incoming?.distanceM ?? 'Unknown'} m · {r.sourceKey}
              </p>
              {r.candidates.map((c) => {
                const a = data.activities.find((a) => a.id === c.activityId);
                return (
                  <div key={c.activityId}>
                    <p>
                      Candidate: {a?.title} · {a?.sport} · {a?.startedAt} ·{' '}
                      {a?.elapsedSeconds ?? 'Unknown'} s ·{' '}
                      {a?.distanceM ?? 'Unknown'} m
                    </p>
                    <p className="caption">
                      {c.confidence}: {c.reasons.join(' · ')}
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => review(r.sourceKey, c.activityId)}
                    >
                      Link as same activity: {a?.title}
                    </button>
                  </div>
                );
              })}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => review(r.sourceKey, null)}
              >
                Keep separate
              </button>
            </details>
          );
        })}
    </section>
  );
}
interface DetailData {
  activity: CanonicalActivity;
  sources: PublicRegistry['sources'];
  rich: {
    sourceKey: string;
    fetchedAt: string;
    streamStatus: { kind: string; samples: number; seriesType: string }[];
    laps: ActivityLap[];
    warnings: string[];
    polar?: {
      sensorQuality: string;
      exercises: {
        id: string | null;
        runningIndex: number | null;
        trainingLoad: Record<string, unknown>;
        samples: {
          type: string;
          unit: string;
          count: number;
          intervalMillis: number | null;
        }[];
        zones: Record<string, unknown>[];
        pauses: Record<string, unknown>[];
        routes: Record<string, unknown>;
        statistics: Record<string, unknown>;
      }[];
    };
  }[];
}
export function ActivityDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailData | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    registryGet(`/api/activities/${encodeURIComponent(id)}`)
      .then((s) => {
        if (active) setData(s);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function enrich(sourceKey: string, provider = 'strava') {
    setBusy(true);
    try {
      const r = await fetch(
        provider === 'polar' ? '/api/polar/enrich' : '/api/integrations/enrich',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceKey }),
        },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Enrichment failed');
      setData(await registryGet(`/api/activities/${encodeURIComponent(id)}`));
      setMessage('Real detail/streams/laps saved on the server.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setBusy(false);
    }
  }
  const a = data?.activity;
  return (
    <>
      <Link href="/activities" className="text-button">
        ← Activity registry
      </Link>
      {!a ? (
        <p>{message || 'Loading real activity…'}</p>
      ) : (
        <>
          <h1>{a.title}</h1>
          <p className="caption">
            {new Date(a.startedAt).toLocaleString()} · {a.sport} · Real activity
            · {a.status}
          </p>
          <section className="card">
            <div className="metric-grid">
              {[
                [
                  'Distance',
                  a.distanceM === null
                    ? 'Unavailable'
                    : `${(a.distanceM / 1000).toFixed(2)} km`,
                ],
                [
                  'Elapsed / moving',
                  `${a.elapsedSeconds ?? '—'} / ${a.movingSeconds ?? '—'} s`,
                ],
                [
                  'HR average / max',
                  `${a.averageHr ?? '—'} / ${a.maxHr ?? '—'} bpm`,
                ],
                [
                  'Speed',
                  a.averageSpeed === null
                    ? 'Unavailable'
                    : `${a.averageSpeed.toFixed(2)} m/s`,
                ],
                [
                  'Elevation gain',
                  a.elevationM === null ? 'Unavailable' : `${a.elevationM} m`,
                ],
                ['Device', a.device ?? 'Unavailable'],
                [
                  'Elapsed pace',
                  a.distanceM && a.elapsedSeconds
                    ? `${(a.elapsedSeconds / (a.distanceM / 1000) / 60).toFixed(2)} min/km (includes pauses)`
                    : 'Unavailable',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="caption">{label}</p>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="caption">
              Original local start: {a.localStart ?? 'Unavailable'} ·{' '}
              {a.timeZone ?? 'Timezone unavailable'}
            </p>
            <p className="caption">
              Missing HR/GPS is valid. Physiological analytics are not computed.
            </p>
            {a.gymWorkoutId && (
              <Link
                className="text-button"
                href={`/gym/history/${encodeURIComponent(a.gymWorkoutId)}`}
              >
                Linked local Gym workout →
              </Link>
            )}
            <details>
              <summary>Field provenance</summary>
              {Object.entries(a.fieldSources).map(([field, source]) => (
                <p className="caption" key={field}>
                  {field}: {source}
                </p>
              ))}
            </details>
          </section>
          {data.sources.map((s) => (
            <section className="card" key={s.key}>
              <h3>
                {s.provider} · {s.providerType}
              </h3>
              <p className="caption">
                Source ID: {s.externalId} · Device: {s.device ?? 'Unavailable'}{' '}
                · Last sync: {s.syncedAt}
                {s.deleted ? ' · Deleted at provider' : ''}
              </p>
              {['strava', 'polar'].includes(s.provider) && !s.deleted && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => enrich(s.key, s.provider)}
                >
                  Fetch real detail, streams & laps
                </button>
              )}
            </section>
          ))}
          {data.rich.map((r) => (
            <section className="card" key={r.sourceKey}>
              <h3>Available streams & laps</h3>
              <p className="caption">
                Fetched {r.fetchedAt}. Provider streams; no inferred physiology.
                Stream arrays stay in server persistence.
              </p>
              {r.streamStatus.length ? (
                r.streamStatus.map((s) => (
                  <p key={s.kind}>
                    {s.kind}: {s.samples} samples · {s.seriesType}
                  </p>
                ))
              ) : (
                <p>No available streams.</p>
              )}
              <details>
                <summary>Laps ({r.laps.length})</summary>
                {r.laps.map((l) => (
                  <p className="caption" key={l.index}>
                    Lap {l.index + 1}: {l.distanceM ?? '—'} m ·{' '}
                    {l.elapsedSeconds ?? '—'} s · {l.averageSpeed ?? '—'} m/s ·
                    HR {l.averageHr ?? '—'} / {l.maxHr ?? '—'}
                  </p>
                ))}
              </details>
              {r.warnings.map((w, i) => (
                <p className="caption" key={i}>
                  {w}
                </p>
              ))}
              {r.polar?.exercises.map((e, i) => (
                <div key={e.id ?? i}>
                  <h3>Polar exercise {i + 1} · sensor quality unknown</h3>
                  <p className="caption">
                    Secondary vendor Running Index:{' '}
                    {e.runningIndex ?? 'Unavailable'}
                  </p>
                  <details>
                    <summary>Vendor training load</summary>
                    <pre className="polar-json">
                      {JSON.stringify(e.trainingLoad, null, 2)}
                    </pre>
                  </details>
                  <p>
                    Samples:{' '}
                    {e.samples
                      .map(
                        (s) =>
                          `${s.type}: ${s.count} · ${s.unit} · interval ${s.intervalMillis ?? 'unknown'} ms`,
                      )
                      .join(' · ') || 'Unavailable'}
                  </p>
                  <details>
                    <summary>
                      Zones ({e.zones.length}) · pauses ({e.pauses.length})
                    </summary>
                    <pre className="polar-json">
                      {JSON.stringify(
                        { zones: e.zones, pauses: e.pauses },
                        null,
                        2,
                      )}
                    </pre>
                    <p className="caption">
                      Zone inZone values are milliseconds. These are provider
                      values, not custom intensity conclusions.
                    </p>
                  </details>
                  <details>
                    <summary>Route & statistics</summary>
                    <pre className="polar-json">
                      {JSON.stringify(
                        { routes: e.routes, statistics: e.statistics },
                        null,
                        2,
                      )}
                    </pre>
                    <p className="caption">
                      Coordinates and elapsed milliseconds are source data.
                      Speed units remain provider-unspecified.
                    </p>
                  </details>
                </div>
              ))}
            </section>
          ))}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
        </>
      )}
    </>
  );
}
