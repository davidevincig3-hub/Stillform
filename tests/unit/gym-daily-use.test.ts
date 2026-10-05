import { it, expect, vi } from 'vitest';
import { recentExercises } from '../../src/analytics/gym-shortlist';
import {
  initialGymStore,
  parseGymStore,
  setExercisePreference,
} from '../../src/repositories/gym-storage';
import {
  previewGymBootstrap,
  commitGymBootstrap,
  exportGymJson,
} from '../../src/repositories/gym-export';
import { syntheticGymHistory } from '../helpers/gym-history';
import { newId } from '../../src/domain/id';
import { isPrivateIPv4, selectLanAddress } from '../../scripts/dev-lan.mjs';

it('shortlist respects local-date cutoff, canonical identity, one exposure per workout, logged sets and real-data gates', () => {
  const store = syntheticGymHistory(3);
  store.history[0].startedAt = '2026-08-31T22:30:00Z'; // September 1 in Rome
  store.history[1].startedAt = '2026-08-31T20:30:00Z'; // August 31 in Rome
  store.history[2].dataOrigin = 'demo';
  const exercise = store.history[0].exercises[0];
  store.history[0].exercises.push({
    ...structuredClone(exercise),
    id: 'second-block',
  });
  const before = JSON.stringify(store);
  const result = recentExercises(store, '2026-10-06T10:00:00Z');
  const row = result.rows.find((r) => r.exercise.id === exercise.exerciseId)!;
  expect(row).toMatchObject({
    exposures: 1,
    sets: 2,
    latest: '2026-08-31T22:30:00Z',
  });
  expect(result.detected).toBe(store.history[0].exercises.length - 1);
  expect(JSON.stringify(store)).toBe(before);
  expect(row.exercise.primaryMuscleGroup).toBeNull();
  expect(recentExercises(store, '2026-08-31T21:00:00Z').detected).toBe(0);
});
it('frequency plus recency ranks deterministically, pins/dismissals persist, and new logs update suggestions', () => {
  let store = syntheticGymHistory(3);
  const old = store.history[0].exercises[0].exerciseId,
    recent = store.history[2].exercises[0].exerciseId;
  let ranked = recentExercises(store, '2026-09-04T00:00:00Z');
  expect(ranked.rows.findIndex((r) => r.exercise.id === recent)).toBeLessThan(
    ranked.rows.findIndex((r) => r.exercise.id === old),
  );
  store = setExercisePreference(store, old, { pinned: true });
  expect(
    recentExercises(store, '2026-09-04T00:00:00Z').rows[0].exercise.id,
  ).toBe(old);
  store = setExercisePreference(store, old, { dismissed: true });
  store = parseGymStore(JSON.stringify(store));
  expect(recentExercises(store).rows.some((r) => r.exercise.id === old)).toBe(
    false,
  );
  expect(recentExercises(store).dismissed[0].exercise.id).toBe(old);
  store = setExercisePreference(store, old, {
    pinned: false,
    dismissed: false,
  });
  const added = structuredClone(store.history[0]);
  added.id = 'new-workout';
  added.startedAt = '2026-09-03T12:00:00Z';
  store.history.push(added);
  ranked = recentExercises(store, '2026-09-04T00:00:00Z');
  expect(ranked.rows[0].exercise.id).toBe(old);
  expect(ranked.rows[0].exposures).toBe(2);
  expect(() =>
    setExercisePreference(store, 'fictional', { pinned: true }),
  ).toThrow();
});
it('revision 2 migrates safely with empty preferences, keeps IDs and rejects future schemas', () => {
  const old = { ...syntheticGymHistory(2), schemaRevision: 2 };
  const raw = { ...old } as Partial<typeof old>;
  delete raw.exercisePreferences;
  const restored = parseGymStore(JSON.stringify(raw));
  expect(restored.schemaRevision).toBe(3);
  expect(restored.exercisePreferences).toEqual({});
  expect(restored.history).toEqual(old.history);
  expect(() =>
    parseGymStore(JSON.stringify({ ...old, schemaRevision: 4 })),
  ).toThrow();
});
it('reviewed JSON bootstrap preserves identity and active workout, blocks overwrite/stale/unapproved/quota failure', () => {
  const source = syntheticGymHistory(2);
  source.active = {
    ...structuredClone(source.history[0]),
    id: 'active',
    status: 'active',
    endedAt: null,
    durationMinutes: null,
    provenance: { source: 'local_logger', recordedAt: '2026-10-06T10:00:00Z' },
  };
  const empty = initialGymStore(),
    plan = previewGymBootstrap(exportGymJson(source), empty),
    save = vi.fn(() => true);
  expect(() => commitGymBootstrap(plan, empty, false, save)).toThrow();
  expect(save).not.toHaveBeenCalled();
  commitGymBootstrap(plan, empty, true, save);
  expect(save).toHaveBeenCalledWith(source);
  expect(() => previewGymBootstrap(exportGymJson(source), source)).toThrow();
  expect(() =>
    commitGymBootstrap(
      plan,
      setExercisePreference(empty, empty.exercises[0].id, { pinned: true }),
      true,
      save,
    ),
  ).toThrow();
  expect(() => commitGymBootstrap(plan, empty, true, () => false)).toThrow();
  expect(() => previewGymBootstrap('{"formatVersion":999}', empty)).toThrow();
});
it('LAN HTTP IDs retain cryptographic UUID format without secure-context randomUUID', () => {
  const original = crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: original.getRandomValues.bind(original),
  });
  try {
    const a = newId(),
      b = newId();
    expect(a).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(a).not.toBe(b);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('LAN launcher refuses public/foreign/ambiguous addresses and chooses a single actual private interface', () => {
  for (const ip of ['8.8.8.8', '127.0.0.1', '169.254.1.1', '172.32.0.1', '::1'])
    expect(isPrivateIPv4(ip)).toBe(false);
  for (const ip of ['192.168.1.8', '10.0.0.2', '172.16.0.8'])
    expect(isPrivateIPv4(ip)).toBe(true);
  const addresses = [{ name: 'Wi-Fi', address: '192.168.1.8' }];
  expect(selectLanAddress(addresses)).toBe('192.168.1.8');
  expect(() => selectLanAddress(addresses, '10.0.0.2')).toThrow();
  expect(() =>
    selectLanAddress([...addresses, { name: 'VPN', address: '10.0.0.2' }]),
  ).toThrow();
});
