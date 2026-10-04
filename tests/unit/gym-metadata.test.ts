import { describe, it, expect, vi } from 'vitest';
import { libraryExerciseSchema, type Exercise } from '../../src/domain/gym';
import {
  initialGymStore,
  parseGymStore,
  saveCustomExercise,
  saveRoutine,
  startGymWorkout,
} from '../../src/repositories/gym-storage';
import {
  previewHevyImport,
  buildHevyPlan,
  commitHevyPlan,
  initialMappings,
} from '../../src/integrations/hevy-import';
import { exerciseExposures, weeklyGymSummary } from '../../src/analytics/gym';
import { exportGymJson } from '../../src/repositories/gym-export';
const csv =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe\nSynthetic unassigned,"12 gen 2025, 18:00","12 gen 2025, 19:00",,Synthetic exercise,,,0,normal,40,12,,,9';
const rawCustom = {
  id: 'unassigned-custom',
  name: 'Synthetic exercise',
  custom: true,
  primaryMuscleGroup: null,
  secondaryMuscleGroups: null,
  equipment: null,
  category: null,
};
describe('canonical nullable muscle metadata', () => {
  it.each([null, undefined, '', '   ', 'Unassigned', ' unassigned '])(
    'normalizes absent or legacy primary %s to null across storage',
    (value) => {
      const raw = { ...rawCustom, primaryMuscleGroup: value };
      const exercise = libraryExerciseSchema.parse(raw);
      expect(exercise.primaryMuscleGroup).toBeNull();
      expect(exercise.secondaryMuscleGroups).toEqual([]);
      expect(exercise.equipment).toBeNull();
      const old = {
        ...initialGymStore(),
        schemaRevision: 1,
        exercises: [...initialGymStore().exercises, raw],
      };
      const store = parseGymStore(JSON.stringify(old));
      expect(store.schemaRevision).toBe(2);
      expect(store.exercises.at(-1)?.primaryMuscleGroup).toBeNull();
      expect(store.exercises[0].primaryMuscleGroup).toBe('Chest');
    },
  );
  it('retains real metadata and legitimate validation', () => {
    expect(
      libraryExerciseSchema.parse({
        ...rawCustom,
        primaryMuscleGroup: ' Chest ',
        secondaryMuscleGroups: ['Shoulders'],
        equipment: ' Cable ',
        category: 'Resistance',
      }),
    ).toMatchObject({
      primaryMuscleGroup: 'Chest',
      secondaryMuscleGroups: ['Shoulders'],
      equipment: 'Cable',
      category: 'Resistance',
    });
    expect(() =>
      libraryExerciseSchema.parse({ ...rawCustom, name: '' }),
    ).toThrow();
    expect(() =>
      libraryExerciseSchema.parse({
        ...rawCustom,
        primaryMuscleGroup: 'X'.repeat(61),
      }),
    ).toThrow();
    expect(() =>
      parseGymStore(
        JSON.stringify({ ...initialGymStore(), schemaRevision: 3 }),
      ),
    ).toThrow();
  });
  it('normalizes blank import metadata before snapshots, warnings, summary and atomic confirmation', async () => {
    const p = await previewHevyImport(csv),
      store = initialGymStore();
    const custom: Exercise = {
      ...rawCustom,
      primaryMuscleGroup: '  ',
      secondaryMuscleGroups: [],
      equipment: '',
      category: '',
    };
    const plan = buildHevyPlan(
      store,
      p,
      [
        {
          incomingName: p.names[0],
          exerciseId: custom.id,
          resolution: 'create-new',
          custom,
        },
      ],
      {},
    );
    expect(store.history).toHaveLength(0);
    expect(plan.summary.workouts).toBe(1);
    expect(plan.summary.warnings.join()).toContain('Unassigned');
    expect(plan.store.exercises.at(-1)).toMatchObject({
      primaryMuscleGroup: null,
      equipment: null,
      category: null,
    });
    expect(plan.store.history[0].exercises[0].primaryMuscleGroup).toBeNull();
    const writer = vi.fn<(next: typeof store) => boolean>(() => true);
    expect(commitHevyPlan(plan, store, true, writer).sets).toBe(1);
    expect(writer).toHaveBeenCalledTimes(1);
    const loaded = parseGymStore(JSON.stringify(writer.mock.calls[0][0]));
    expect(loaded.history[0].exercises[0].primaryMuscleGroup).toBeNull();
    expect(initialMappings(p, loaded)[0].exerciseId).toBe(custom.id);
    expect(
      JSON.parse(exportGymJson(loaded)).data.exercises.at(-1)
        .primaryMuscleGroup,
    ).toBeNull();
    const exposure = exerciseExposures(loaded.history, custom.id);
    expect(exposure).toHaveLength(1);
    expect(exposure[0].sets[0]).toMatchObject({ weight: 40, reps: 12, rpe: 9 });
    const summary = weeklyGymSummary(
      loaded.history,
      new Date('2025-01-12T20:00:00Z'),
    );
    expect(summary.muscles).toEqual([]);
    expect(summary.unassigned).toEqual({ sets: 1, frequency: 1 });
    expect(summary.effort.total).toBe(1);
  });
  it('keeps assigned totals separate while null custom exercises can start a routine', async () => {
    const p = await previewHevyImport(csv),
      exercise = libraryExerciseSchema.parse(rawCustom);
    const imported = buildHevyPlan(
      initialGymStore(),
      p,
      [
        {
          incomingName: p.names[0],
          exerciseId: exercise.id,
          resolution: 'create-new',
          custom: exercise,
        },
      ],
      {},
    ).store;
    const assigned = structuredClone(imported.history[0]);
    assigned.id = 'assigned-workout';
    assigned.exercises[0].primaryMuscleGroup = 'Chest';
    assigned.exercises[0].exerciseId = 'builtin-chest-press';
    const summary = weeklyGymSummary(
      [...imported.history, assigned],
      new Date('2025-01-12T20:00:00Z'),
    );
    expect(summary.muscles).toEqual([{ name: 'Chest', sets: 1, frequency: 1 }]);
    expect(summary.unassigned).toEqual({ sets: 1, frequency: 1 });
    expect(summary.effort.total).toBe(2);
    let store = saveCustomExercise(initialGymStore(), exercise);
    const now = new Date().toISOString();
    const routine = {
      id: 'null-routine',
      name: 'Synthetic routine',
      notes: '',
      createdAt: now,
      updatedAt: now,
      exercises: [
        {
          id: 'entry',
          exerciseId: exercise.id,
          defaultSets: 1,
          repRange: null,
          notes: '',
        },
      ],
    };
    store = saveRoutine(store, routine);
    store = startGymWorkout(store, routine);
    expect(
      parseGymStore(JSON.stringify(store)).active?.exercises[0]
        .primaryMuscleGroup,
    ).toBeNull();
  });
  it('migrates old Unassigned workout snapshots as null without losing history', async () => {
    const p = await previewHevyImport(csv),
      exercise = libraryExerciseSchema.parse(rawCustom);
    const store = buildHevyPlan(
      initialGymStore(),
      p,
      [
        {
          incomingName: p.names[0],
          exerciseId: exercise.id,
          resolution: 'create-new',
          custom: exercise,
        },
      ],
      {},
    ).store;
    const old = {
      ...store,
      schemaRevision: 1,
      history: store.history.map((w) => ({
        ...w,
        exercises: w.exercises.map((e) => ({
          ...e,
          primaryMuscleGroup: 'Unassigned',
          secondaryMuscleGroups: null,
          equipment: null,
        })),
      })),
    };
    const restored = parseGymStore(JSON.stringify(old));
    expect(restored.history[0].exercises[0].primaryMuscleGroup).toBeNull();
    expect(restored.history[0].exercises[0].sets[0].weight).toBe(40);
  });
});
