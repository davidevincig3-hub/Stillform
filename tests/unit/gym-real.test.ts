import { describe, it, expect } from 'vitest';
import {
  builtInExercises,
  type GymRoutine,
  type GymWorkout,
} from '../../src/domain/gym';
import {
  initialGymStore,
  saveRoutine,
  deleteRoutine,
  duplicateRoutine,
  reorderRoutine,
  saveCustomExercise,
  startGymWorkout,
  finishGymWorkout,
  parseGymStore,
  loadGymStore,
  confirmLegacyWorkout,
} from '../../src/repositories/gym-storage';
import { editGymSet, toggleGymSet } from '../../src/domain/gym-workout';
import {
  realHistory,
  exerciseExposures,
  weeklyGymSummary,
} from '../../src/analytics/gym';
import {
  gymBackupSchema,
  exportGymJson,
  exportGymCsv,
} from '../../src/repositories/gym-export';
import {
  startWorkout,
  emptyStore,
} from '../../src/repositories/workout-storage';
import { routines } from '../../src/repositories/seed';
import {
  previewHevyImport,
  canConfirmHevyImport,
} from '../../src/integrations/hevy-import';
function routine(): GymRoutine {
  const now = new Date().toISOString();
  return {
    id: 'r1',
    name: 'My Push',
    notes: 'Personal routine',
    createdAt: now,
    updatedAt: now,
    exercises: [
      {
        id: 're1',
        exerciseId: builtInExercises[0].id,
        defaultSets: 2,
        repRange: { min: 8, max: 12 },
        notes: 'Controlled reps',
      },
      {
        id: 're2',
        exerciseId: builtInExercises[1].id,
        defaultSets: 1,
        repRange: null,
        notes: '',
      },
    ],
  };
}
function completed() {
  let store = saveRoutine(initialGymStore(), routine());
  store = startGymWorkout(store, store.routines[0]);
  const exercise = store.active!.exercises[0];
  let session = editGymSet(store.active!, exercise.id, exercise.sets[0].id, {
    weight: 80,
    reps: 10,
    rir: 1,
  });
  session = toggleGymSet(session, exercise.id, exercise.sets[0].id);
  store = { ...store, active: session };
  return finishGymWorkout(store);
}
describe('real routines and identities', () => {
  it('creates edits reorders duplicates deletes and persists routines', () => {
    let store = saveRoutine(initialGymStore(), routine());
    const changed = reorderRoutine(
      { ...store.routines[0], name: 'Renamed' },
      0,
      1,
    );
    store = saveRoutine(store, changed);
    expect(store.routines[0].exercises[0].id).toBe('re2');
    store = duplicateRoutine(store, 'r1');
    expect(store.routines[1].id).not.toBe('r1');
    expect(store.routines[1].exercises[0].id).not.toBe('re2');
    store = deleteRoutine(store, 'r1');
    const restored = parseGymStore(JSON.stringify(store));
    expect(restored.routines).toHaveLength(1);
    expect(restored.routines[0].name).toBe('Renamed copy');
  });
  it('validates structure and immutable builtins while custom identity survives editing', () => {
    let store = initialGymStore();
    const exercise = {
      ...builtInExercises[0],
      id: 'custom',
      custom: true,
      name: 'Custom press',
    };
    store = saveCustomExercise(store, exercise);
    store = saveCustomExercise(store, { ...exercise, name: 'Custom renamed' });
    expect(store.exercises.filter((e) => e.id === 'custom')).toHaveLength(1);
    expect(() => saveCustomExercise(store, builtInExercises[0])).toThrow();
    expect(() =>
      saveRoutine(store, {
        ...routine(),
        exercises: [{ ...routine().exercises[0], defaultSets: 0 }],
      }),
    ).toThrow();
  });
});
describe('logging snapshots', () => {
  it('starts from saved structure with blank loads and persists actual sets/optional effort', () => {
    const store = completed();
    const workout = store.history[0];
    expect(workout.dataOrigin).toBe('user');
    expect(workout.provenance.source).toBe('local_logger');
    expect(workout.routineSnapshot?.exercises[0].repRange?.max).toBe(12);
    expect(workout.exercises[0].sets[1].weight).toBeNull();
    expect(workout.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(
      parseGymStore(JSON.stringify(store)).history[0].exercises[0].sets[0]
        .weight,
    ).toBe(80);
  });
  it('keeps history independent of deleted/renamed routine and exercise metadata', () => {
    let store = completed();
    store = saveRoutine(store, { ...store.routines[0], name: 'New name' });
    store = deleteRoutine(store, 'r1');
    expect(store.history[0].routineName).toBe('My Push');
    expect(store.history[0].routineSnapshot?.name).toBe('My Push');
  });
  it('supports RPE/failure without RIR and resets done state after edits', () => {
    const store = completed();
    const exercise = store.history[0].exercises[0];
    const session = { ...store.history[0], status: 'active' as const };
    const edited = editGymSet(session, exercise.id, exercise.sets[0].id, {
      rir: null,
      rpe: 9,
      failure: true,
    });
    expect(edited.exercises[0].sets[0].completed).toBe(false);
    const logged = toggleGymSet(edited, exercise.id, exercise.sets[0].id);
    expect(logged.exercises[0].sets[0].rir).toBeNull();
    expect(logged.exercises[0].sets[0].rpe).toBe(9);
    expect(logged.exercises[0].sets[0].failure).toBe(true);
  });
  it('does not start over an active session or complete an empty session', () => {
    const store = startGymWorkout(
      saveRoutine(initialGymStore(), routine()),
      routine(),
    );
    expect(() => startGymWorkout(store, routine())).toThrow('already active');
    expect(() => finishGymWorkout(store)).toThrow('Log at least');
  });
});
describe('real-only queries and descriptive analytics', () => {
  it('never uses sample or unreviewed records as previous performance', () => {
    const real = completed().history[0];
    const demo = { ...real, id: 'demo', dataOrigin: 'demo' as const };
    const unverified = {
      ...real,
      id: 'legacy',
      dataOrigin: 'legacy_unverified' as const,
    };
    expect(realHistory([demo, unverified])).toEqual([]);
    const history = exerciseExposures(
      [demo, unverified, real],
      real.exercises[0].exerciseId,
    );
    expect(history).toHaveLength(1);
    expect(history[0].sets[0].weight).toBe(80);
  });
  it('uses exercise identity not name and only completed sets; respects chronology', () => {
    const real = completed().history[0];
    const older = {
      ...real,
      id: 'older',
      startedAt: '2025-01-01T00:00:00.000Z',
    };
    const other = {
      ...real,
      id: 'different',
      exercises: real.exercises.map((e) => ({ ...e, exerciseId: 'different' })),
    };
    const exposures = exerciseExposures(
      [older, other, real],
      real.exercises[0].exerciseId,
    );
    expect(exposures.map((e) => e.workoutId)).toEqual([real.id, 'older']);
    expect(exposures[0].sets).toHaveLength(1);
  });
  it('counts primary muscle sets/frequency, reports missing effort and does not penalize HR absence', () => {
    const store = completed();
    const summary = weeklyGymSummary(store.history, new Date());
    expect(summary.muscles[0]).toEqual({
      name: 'Chest',
      sets: 1,
      frequency: 1,
    });
    expect(summary.effort.rir).toEqual([1]);
    expect(summary.effort.unknown).toBe(0);
    const noEffort = structuredClone(store.history);
    noEffort[0].exercises[0].sets[0].rir = null;
    expect(weeklyGymSummary(noEffort).effort.unknown).toBe(1);
    expect(weeklyGymSummary([]).muscles).toEqual([]);
  });
});
describe('storage migration and export', () => {
  it('preserves missing legacy finish time as unknown rather than inventing duration', () => {
    const old = startWorkout(routines[0]);
    const unknown = { ...old, status: 'completed' as const };
    const migrated = loadGymStore(
      null,
      JSON.stringify({ ...emptyStore, history: [unknown] }),
    );
    expect(migrated.legacyArchive[0].endedAt).toBeNull();
    expect(migrated.legacyArchive[0].durationMinutes).toBeNull();
    expect(
      confirmLegacyWorkout(migrated, unknown.id).history[0].durationMinutes,
    ).toBeNull();
  });
  it('preserves V1 active/history, removes mock previous text, requires explicit legacy review', () => {
    const old = startWorkout(routines[0]);
    old.exercises[0].sets[0] = {
      ...old.exercises[0].sets[0],
      weight: 75,
      reps: 8,
      completed: true,
    };
    const finished = {
      ...old,
      id: 'old-history',
      status: 'completed' as const,
      endedAt: new Date().toISOString(),
    };
    let store = loadGymStore(
      null,
      JSON.stringify({ ...emptyStore, active: old, history: [finished] }),
    );
    expect(store.active?.id).toBe(old.id);
    expect(store.history).toHaveLength(0);
    expect(store.legacyArchive).toHaveLength(1);
    expect(JSON.stringify(store)).not.toContain('60 kg');
    expect(
      exerciseExposures(store.legacyArchive, 'builtin-chest-press'),
    ).toEqual([]);
    store = confirmLegacyWorkout(store, 'old-history');
    expect(store.history[0].exercises[0].sets[0].weight).toBe(75);
    expect(
      exerciseExposures(store.history, 'builtin-chest-press'),
    ).toHaveLength(1);
    expect(parseGymStore(JSON.stringify(store)).version).toBe(2);
  });
  it('does not silently fall back from corrupt or unsupported new storage', () => {
    expect(() =>
      loadGymStore('{"version":99}', JSON.stringify(emptyStore)),
    ).toThrow();
    expect(() => loadGymStore(null, 'bad-json')).toThrow();
    expect(loadGymStore(null, null).routines).toEqual([]);
  });
  it('exports complete versioned JSON and safe tabular CSV', () => {
    const store = completed();
    const backup = gymBackupSchema.parse(JSON.parse(exportGymJson(store)));
    expect(backup.formatVersion).toBe(1);
    expect(backup.data.history[0].exercises[0].sets[0].weight).toBe(80);
    expect(backup.data.routines[0].exercises).toHaveLength(2);
    expect(backup.data.exercises.length).toBeGreaterThan(5);
    const csv = exportGymCsv({
      ...store,
      history: [
        {
          ...store.history[0],
          routineName: '=EVIL',
          notes: 'comma, quote" newline\n',
        },
      ],
    });
    expect(csv).toContain('"\'=EVIL"');
    expect(csv).toContain('comma, quote"" newline\n');
    expect(exportGymCsv(initialGymStore()).split('\r\n')).toHaveLength(1);
  });
  it('blocks demo history from the validated backup store', () => {
    const store = completed();
    const demo: GymWorkout = { ...store.history[0], dataOrigin: 'demo' };
    expect(() =>
      parseGymStore(JSON.stringify({ ...store, history: [demo] })),
    ).toThrow('Real history');
  });
});
describe('Hevy import preparation', () => {
  it('does not guess a CSV schema or allow unresolved identities', () => {
    const preview = previewHevyImport('anything');
    expect(preview.stage).toBe('unsupported');
    expect(preview.workouts).toEqual([]);
    expect(canConfirmHevyImport(preview)).toBe(false);
    const parsed = previewHevyImport('fixture', {
      schemaVersion: 'test-only',
      parse: () => ({
        workouts: [
          { externalId: 'x', raw: {}, exercises: [{ sourceName: 'Press' }] },
        ],
        warnings: [],
      }),
    });
    expect(parsed.mappings[0].resolution).toBe('unresolved');
    expect(canConfirmHevyImport({ ...parsed, stage: 'confirmation' })).toBe(
      false,
    );
  });
});
