import { it, expect } from 'vitest';
import { emptyPolarStore, polarStoreSchema } from '../../src/domain/polar';
import {
  recoveryInputs,
  recoveryRecordCounts,
  recoveryFamilies,
} from '../../src/domain/recovery-inputs';
import {
  recoverySeries,
  windowSummary,
} from '../../src/analytics/polar-recovery';
import { storePolarRows } from '../../src/server/polar-normalize';
import {
  setPolarValidity,
  publicRecovery,
} from '../../src/server/recovery-quality';
import { fingerprint } from '../../src/server/integration-security';
import { MemoryRepository } from '../helpers/integrations';
import { sleep, nightly, continuous, ppi } from '../helpers/polar';
function repository() {
  const repo = new MemoryRepository();
  storePolarRows(repo.polarState, 'sleep', [
    sleep,
    { ...sleep, sleepDate: '2026-10-02' },
  ]);
  return repo;
}
const identity = (repo: MemoryRepository) =>
  repo.polarState.sleep.map((r) => ({
    family: 'sleep',
    date: r.date,
    device: r.device,
  }));
it('atomically excludes two user-adjudicated artifacts without changing raw payloads, provenance, jobs or unrelated state', async () => {
  const repo = repository(),
    before = structuredClone(repo.polarState);
  await setPolarValidity('owner', repo, {
    records: identity(repo),
    status: 'excluded',
    reason: 'sensor_artifact',
  });
  expect(recoveryRecordCounts(repo.polarState).sleep).toEqual({
    provider: 2,
    valid: 0,
    excluded: 2,
  });
  expect(recoveryInputs(repo.polarState).sleep).toHaveLength(0);
  expect(
    repo.polarState.sleep.map(({ validityOverride, ...r }) => {
      void validityOverride;
      return r;
    }),
  ).toEqual(before.sleep);
  expect(repo.polarState.jobs).toEqual(before.jobs);
  expect(
    repo.polarState.sleep.every(
      (r) => r.validityOverride?.adjudicatedBy === 'user',
    ),
  ).toBe(true);
  const publicData = publicRecovery(
    repo.polarState,
    true,
    '2026-10-04T12:00:00Z',
  );
  expect(publicData.sleep).toHaveLength(0);
  expect(publicData.history).toHaveLength(2);
  expect(JSON.stringify(publicData)).not.toContain('hypnogram');
  for (const s of recoverySeries(publicData)) {
    const w = windowSummary(s.points, 28, publicData.asOf, {
      preliminary: 1,
      developing: 2,
      established: 3,
    });
    expect(w).toMatchObject({
      count: 0,
      completeCount: 0,
      coverage: 0,
      maturity: 'insufficient',
      referenceMean: null,
    });
  }
  // Defense in depth when a caller supplies unfiltered provider observations.
  expect(
    recoverySeries({ ...publicData, sleep: repo.polarState.sleep }).every(
      (s) => s.points.length === 0,
    ),
  ).toBe(true);
});
it('excluded points cannot enter window means, coverage or maturity even when passed directly', () => {
  const override = {
    status: 'excluded' as const,
    reason: 'sensor_artifact' as const,
    adjudicatedAt: '2026-10-04T00:00:00Z',
    adjudicatedBy: 'user' as const,
  };
  const result = windowSummary(
    [
      {
        date: '2026-10-01',
        source: 'polar',
        value: 999,
        complete: true,
        validityOverride: override,
      },
      { date: '2026-10-02', source: 'polar', value: 8, complete: true },
    ],
    7,
    '2026-10-04T00:00:00Z',
    { preliminary: 1, developing: 2, established: 3 },
  );
  expect(result).toMatchObject({
    count: 1,
    completeCount: 1,
    referenceMean: 8,
    maturity: 'preliminary',
    coverage: 1 / 7,
  });
});
it('restore is explicit, survives resync/raw revisions, and leaves completeness independent', async () => {
  const repo = repository();
  const records = identity(repo).slice(0, 1);
  await setPolarValidity('owner', repo, {
    records,
    status: 'excluded',
    reason: 'sensor_artifact',
  });
  const excluded = structuredClone(repo.polarState.sleep[0].validityOverride);
  storePolarRows(repo.polarState, 'sleep', [
    { ...sleep, sleepScore: { sleepScore: 1 } },
  ]);
  expect(repo.polarState.sleep[0].validityOverride).toEqual(excluded);
  expect(repo.polarState.sleep[0].previous).toHaveLength(1);
  await setPolarValidity('owner', repo, {
    records,
    status: 'valid',
    reason: 'other',
  });
  expect(repo.polarState.sleep[0].validityOverride).toMatchObject({
    status: 'valid',
    reason: null,
  });
  storePolarRows(repo.polarState, 'sleep', [{ sleepDate: sleep.sleepDate }]);
  expect(repo.polarState.sleep[0]).toMatchObject({
    complete: false,
    validityOverride: { status: 'valid' },
  });
});
it('missing or ambiguous batch identities fail before any write', async () => {
  const repo = repository(),
    before = fingerprint(repo.polarState);
  await expect(
    setPolarValidity('owner', repo, {
      records: [
        ...identity(repo),
        { family: 'sleep', date: '2026-10-03', device: null },
      ],
      status: 'excluded',
    }),
  ).rejects.toThrow('not found');
  expect(fingerprint(repo.polarState)).toBe(before);
  expect(repo.polarVersion).toBe(0);
  await expect(
    setPolarValidity('owner', repo, {
      records: identity(repo),
      status: 'fabricated',
    }),
  ).rejects.toThrow();
});
it('all recovery families share eligibility and provenance; legacy version-one records remain readable', async () => {
  const repo = repository();
  storePolarRows(repo.polarState, 'nightly', [nightly]);
  storePolarRows(repo.polarState, 'continuous', [continuous]);
  storePolarRows(repo.polarState, 'ppi', [ppi]);
  const legacy = polarStoreSchema.parse(repo.polarState);
  expect(recoveryInputs(legacy).sleep).toHaveLength(2);
  for (const family of recoveryFamilies) {
    const r = repo.polarState[family][0];
    await setPolarValidity('owner', repo, {
      records: [{ family, date: r.date, device: r.device }],
      status: 'excluded',
      reason: 'sensor_artifact',
    });
    expect(recoveryInputs(repo.polarState)[family]).toHaveLength(
      family === 'sleep' ? 1 : 0,
    );
  }
  expect(publicRecovery(repo.polarState, true)).toMatchObject({
    nightly: [],
    continuousDays: 0,
    ppiDays: 0,
  });
  expect(emptyPolarStore().version).toBe(1);
});
