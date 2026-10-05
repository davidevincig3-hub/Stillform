import { it, expect, vi, afterEach } from 'vitest';
import {
  parsePolarSports,
  normalizePolarTraining,
} from '../../src/server/polar-normalize';
import { PolarClient } from '../../src/server/polar-client';
import { polarMetadata, polarSyncStep } from '../../src/server/polar-service';
import { ingestActivity } from '../../src/integrations/activity-matching';
import { newPolarJob } from '../../src/domain/polar';
import { MemoryRepository } from '../helpers/integrations';
import { polarConfig, polarConnection } from '../helpers/polar-server';
import { training } from '../helpers/polar';

const catalog = [
  { id: { id: 1 }, name: 'RUNNING' },
  { id: { id: 103 }, name: 'POOL_SWIMMING' },
];
const sessions = Array.from({ length: 5 }, (_, i) => ({
  ...training(`synthetic-session-${i}`),
  startTime: `2026-10-01T${String(8 + i).padStart(2, '0')}:00:00`,
  sport: { id: i === 4 ? '103' : '1' },
}));
afterEach(() => vi.useRealTimers());
function repository() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  const repo = new MemoryRepository();
  repo.polarCredential = {
    ...structuredClone(polarConnection),
    scopes: ['sports:read', 'training_sessions:read'],
  };
  return repo;
}

it('parses the actual top-level catalog array and fails an unexpected envelope instead of silently dropping it', () => {
  expect(parsePolarSports(catalog)).toEqual(catalog);
  expect(() => parsePolarSports({ sports: catalog })).toThrow();
  expect(() => parsePolarSports([{ id: { id: 1 } }])).toThrow();
});

it('successful catalog sync followed by training sync persists five canonical/source records, with four running and one swimming', async () => {
  const repo = repository();
  const client = new PolarClient(polarConfig, async (url) =>
    Response.json(
      String(url).endsWith('/sports/list')
        ? catalog
        : { trainingSessions: sessions },
    ),
  );
  await polarMetadata('owner', repo, client);
  expect(repo.polarState.sports).toEqual(catalog);
  vi.advanceTimersByTime(1200);
  await polarSyncStep('owner', repo, client, {
    families: ['training'],
    from: '2026-10-01',
    to: '2026-10-02',
  });
  const saved = await repo.read();
  expect(saved.state.activities).toHaveLength(5);
  expect(saved.state.sources).toHaveLength(5);
  expect(
    saved.state.activities.filter((a) =>
      ['run', 'trail_run'].includes(a.sport),
    ),
  ).toHaveLength(4);
  expect(
    saved.state.activities.filter((a) => a.sport === 'swimming'),
  ).toHaveLength(1);
  expect(
    saved.state.sources.every((s) =>
      saved.state.activities.some(
        (a) => a.id === s.activityId && a.sourceKeys.includes(s.key),
      ),
    ),
  ).toBe(true);
  expect(saved.state.reviews).toHaveLength(0);
  expect(repo.polarState.jobs.training).toMatchObject({
    done: true,
    pending: [],
    requests: 1,
  });
});

it('repairs existing classifications from persisted raw sessions without restarting the completed job, duplicating identity or manufacturing raw revisions', async () => {
  const repo = repository();
  for (const row of sessions) {
    const normalized = normalizePolarTraining(row, 'owner', []);
    ingestActivity(repo.state, normalized.activity, normalized.source);
  }
  const unknown = normalizePolarTraining(
    { ...training('unknown'), sport: { id: '999999' } },
    'owner',
    [],
  );
  ingestActivity(repo.state, unknown.activity, unknown.source);
  repo.polarState.jobs.training = {
    ...newPolarJob('2026-10-01', '2026-10-02'),
    done: true,
    next: '2026-10-02',
    requests: 1,
  };
  const jobBefore = structuredClone(repo.polarState.jobs.training);
  const ids = repo.state.activities.map((a) => a.id);
  const sourcesBefore = structuredClone(repo.state.sources);
  const client = new PolarClient(polarConfig, async (url) => {
    expect(String(url)).toContain('/sports/list');
    return Response.json(catalog);
  });
  await polarMetadata('owner', repo, client);
  expect(repo.state.activities.map((a) => a.id)).toEqual(ids);
  expect(repo.state.activities.filter((a) => a.sport === 'run')).toHaveLength(
    4,
  );
  expect(
    repo.state.activities.filter((a) => a.sport === 'swimming'),
  ).toHaveLength(1);
  expect(repo.state.activities.filter((a) => a.sport === 'other')).toHaveLength(
    1,
  );
  expect(repo.polarState.jobs.training).toEqual(jobBefore);
  expect(
    repo.state.sources.map((s) => ({
      key: s.key,
      activityId: s.activityId,
      raw: s.raw,
      fingerprint: s.fingerprint,
      previous: s.previous,
    })),
  ).toEqual(
    sourcesBefore.map((s) => ({
      key: s.key,
      activityId: s.activityId,
      raw: s.raw,
      fingerprint: s.fingerprint,
      previous: s.previous,
    })),
  );
  const after = structuredClone(repo.state);
  const version = repo.version;
  vi.advanceTimersByTime(1200);
  await polarMetadata('owner', repo, client);
  expect(repo.state).toEqual(after);
  expect(repo.version).toBe(version);
});
