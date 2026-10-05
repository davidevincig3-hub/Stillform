import { describe, it, expect, vi } from 'vitest';
import {
  hevyColumns,
  parseCsv,
  parseItalianDate,
  previewHevyImport,
  initialMappings,
  buildHevyPlan,
  commitHevyPlan,
  duplicateStatus,
  type ExerciseMapping,
} from '../../src/integrations/hevy-import';
import {
  initialGymStore,
  parseGymStore,
} from '../../src/repositories/gym-storage';
import {
  exerciseExposures,
  effortKnown,
  weeklyGymSummary,
  formatSet,
} from '../../src/analytics/gym';
import { exportGymJson, exportGymCsv } from '../../src/repositories/gym-export';
export function syntheticCsv(overrides: Record<string, string>[] = [{}]) {
  const defaults = {
    title: 'Synthetic session',
    start_time: '12 gen 2025, 18:00',
    end_time: '12 gen 2025, 19:00',
    description: 'Synthetic note, with "quotes"\nsecond line',
    exercise_title: 'Synthetic press',
    superset_id: '1',
    exercise_notes: 'Synthetic notes',
    set_index: '0',
    set_type: 'normal',
    weight_kg: '80',
    reps: '10',
    distance_km: '',
    duration_seconds: '',
    rpe: '9',
  };
  const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [
    hevyColumns.join(','),
    ...overrides.map((o) =>
      hevyColumns.map((k) => cell({ ...defaults, ...o }[k])).join(','),
    ),
  ].join('\r\n');
}
function mappings(names: string[]): ExerciseMapping[] {
  return names.map((incomingName) => ({
    incomingName,
    exerciseId: 'builtin-chest-press',
    resolution: 'existing',
  }));
}
describe('verified Hevy parser', () => {
  it('parses exact schema, BOM, quoted commas, quotes and newlines', async () => {
    const p = await previewHevyImport('\uFEFF' + syntheticCsv());
    expect(p.errors).toEqual([]);
    expect(p.rowCount).toBe(1);
    expect(p.workouts[0].description).toContain('"quotes"\n');
    expect(parseCsv('a,b\r\n"a,b","x""y"')).toEqual([
      ['a', 'b'],
      ['a,b', 'x"y'],
    ]);
  });
  it('rejects malformed quoting, columns, numbers and dates, preserving no silent reinterpretation', async () => {
    expect(() => parseCsv('"unclosed')).toThrow();
    const invalidRows: Record<string, string>[] = [
      { start_time: '12 xyz 2025, 18:00' },
      { end_time: '11 gen 2025, 19:00' },
      { weight_kg: 'bad' },
      { rpe: '11' },
      { set_index: '-1' },
    ];
    for (const o of invalidRows) {
      const p = await previewHevyImport(syntheticCsv([o]));
      expect(p.errors.length).toBe(1);
      expect(() =>
        buildHevyPlan(initialGymStore(), p, mappings(p.names), {}),
      ).toThrow();
    }
    expect((await previewHevyImport('bad,columns')).errors.length).toBe(1);
  });
  it('supports every Italian month and Rome daylight saving without browser timezone dependence', () => {
    const months = [
      'gen',
      'feb',
      'mar',
      'apr',
      'mag',
      'giu',
      'lug',
      'ago',
      'set',
      'ott',
      'nov',
      'dic',
    ];
    months.forEach((m, i) =>
      expect(
        new Date(
          parseItalianDate(`12 ${m} 2025, 18:00`, 'Europe/Rome'),
        ).getUTCMonth(),
      ).toBe(i),
    );
    expect(parseItalianDate('12 gen 2025, 18:00', 'Europe/Rome')).toBe(
      '2025-01-12T17:00:00.000Z',
    );
    expect(parseItalianDate('12 lug 2025, 18:00', 'Europe/Rome')).toBe(
      '2025-07-12T16:00:00.000Z',
    );
    for (const d of [
      '31 feb 2025, 18:00',
      '30 mar 2025, 02:30',
      '26 ott 2025, 02:30',
      '12 gen 2025, 25:00',
    ])
      expect(() => parseItalianDate(d, 'Europe/Rome')).toThrow();
  });
  it('groups whole workouts, orders chronologically, never creates routine identities from titles', async () => {
    const p = await previewHevyImport(
      syntheticCsv([
        { start_time: '15 gen 2025, 18:00', end_time: '15 gen 2025, 19:00' },
        {},
        { set_index: '1' },
      ]),
    );
    expect(p.workouts).toHaveLength(2);
    expect(p.workouts[0].rows).toHaveLength(2);
    const plan = buildHevyPlan(initialGymStore(), p, mappings(p.names), {});
    expect(plan.store.history[0].startedAt).toBe(p.workouts[1].start);
    expect(plan.store.history[0].routineId).toBeNull();
    expect(plan.store.history[0].routineSnapshot).toBeNull();
    expect(plan.store.history[0].notes).toContain('Synthetic');
  });
  it('preserves source set order, RPE, explicit failure and never fabricates RIR or log time', async () => {
    const p = await previewHevyImport(
      syntheticCsv([
        { set_index: '1', set_type: 'failure', rpe: '' },
        { set_index: '0', rpe: '10' },
      ]),
    );
    const w = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}).store
      .history[0];
    const sets = w.exercises[0].sets;
    expect(sets.map((s) => s.sourceSetIndex)).toEqual([0, 1]);
    expect(sets.map((s) => s.rir)).toEqual([null, null]);
    expect(sets[0].rpe).toBe(10);
    expect(sets[0].failure).toBe(false);
    expect(sets[1].failure).toBe(true);
    expect(sets.every((s) => s.completed && s.loggedAt === null)).toBe(true);
    expect(w.provenance.source).toBe('hevy_import');
  });
  it('preserves zero/missing load, zero/missing reps, distance, duration, supersets and notes', async () => {
    const p = await previewHevyImport(
      syntheticCsv([
        { weight_kg: '0', reps: '0' },
        {
          weight_kg: '',
          reps: '',
          duration_seconds: '60',
          distance_km: '0.2',
          set_index: '1',
        },
      ]),
    );
    const w = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}).store
      .history[0];
    const sets = w.exercises[0].sets;
    expect(sets[0].weight).toBe(0);
    expect(sets[0].reps).toBe(0);
    expect(sets[1]).toMatchObject({
      weight: null,
      reps: null,
      durationSeconds: 60,
      distanceKm: 0.2,
      supersetId: '1',
    });
    expect(w.exercises[0].notes).toBe('Synthetic notes');
    expect(formatSet(sets[1])).toContain('Load unrecorded');
  });
});
describe('mapping and safe review', () => {
  it('preview never mutates store; unresolved identities block final plan', async () => {
    const store = initialGymStore(),
      before = JSON.stringify(store),
      p = await previewHevyImport(syntheticCsv());
    expect(initialMappings(p, store)[0].resolution).toBe('unresolved');
    expect(() =>
      buildHevyPlan(store, p, initialMappings(p, store), {}),
    ).toThrow('Resolve every');
    expect(JSON.stringify(store)).toBe(before);
  });
  it('allows deliberate synonyms but preserves original names and ordered blocks', async () => {
    const p = await previewHevyImport(
      syntheticCsv([{}, { exercise_title: 'Synthetic alternative' }]),
    );
    const w = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}).store
      .history[0];
    expect(w.exercises.map((e) => e.exerciseId)).toEqual([
      'builtin-chest-press',
      'builtin-chest-press',
    ]);
    expect(w.exercises.map((e) => e.sourceName)).toEqual([
      'Synthetic press',
      'Synthetic alternative',
    ]);
  });
  it('creates custom metadata only in batch and reuses confirmed rules', async () => {
    const p = await previewHevyImport(syntheticCsv()),
      store = initialGymStore();
    const m: ExerciseMapping = {
      incomingName: p.names[0],
      exerciseId: 'custom',
      resolution: 'create-new',
      custom: {
        id: 'custom',
        name: 'Synthetic custom',
        primaryMuscleGroup: 'Unassigned',
        secondaryMuscleGroups: ['Shoulders'],
        equipment: 'Cable',
        custom: true,
      },
    };
    const plan = buildHevyPlan(store, p, [m], {});
    expect(store.exercises).toHaveLength(12);
    expect(plan.summary.customExercises).toBe(1);
    expect(plan.summary.warnings.join()).toContain('Unassigned');
    expect(initialMappings(p, plan.store)[0].exerciseId).toBe('custom');
    expect(plan.store.importBatches).toHaveLength(1);
  });
  it('requires explicit confirmation, detects stale previews and writes exactly once', async () => {
    const p = await previewHevyImport(syntheticCsv()),
      store = initialGymStore(),
      plan = buildHevyPlan(store, p, mappings(p.names), {}),
      save = vi.fn(() => true);
    expect(() => commitHevyPlan(plan, store, false, save)).toThrow('Explicit');
    expect(save).not.toHaveBeenCalled();
    expect(() =>
      commitHevyPlan(
        plan,
        { ...store, routines: [], hevyMappings: { x: 'a' } },
        true,
        save,
      ),
    ).toThrow('changed');
    expect(commitHevyPlan(plan, store, true, save).sets).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('failed batch writer leaves source store intact and reports failure', async () => {
    const store = initialGymStore(),
      p = await previewHevyImport(syntheticCsv()),
      plan = buildHevyPlan(store, p, mappings(p.names), {}),
      before = JSON.stringify(store);
    expect(() => commitHevyPlan(plan, store, true, () => false)).toThrow(
      'Nothing imported',
    );
    expect(JSON.stringify(store)).toBe(before);
  });
});
describe('duplicates, integration and migrations', () => {
  it('SHA-256 identities are repeatable and repeated import never duplicates sets', async () => {
    const p = await previewHevyImport(syntheticCsv()),
      again = await previewHevyImport(syntheticCsv());
    expect(p.workouts[0].fingerprint).toBe(again.workouts[0].fingerprint);
    const plan = buildHevyPlan(initialGymStore(), p, mappings(p.names), {});
    const second = buildHevyPlan(
      plan.store,
      again,
      initialMappings(again, plan.store),
      {},
    );
    expect(second.summary).toMatchObject({
      workouts: 0,
      sets: 0,
      duplicates: 1,
    });
    expect(second.store.history).toHaveLength(1);
  });
  it('changed source at same start requires duplicate review, skip or separate are explicit', async () => {
    const p = await previewHevyImport(syntheticCsv()),
      store = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}).store,
      changed = await previewHevyImport(syntheticCsv([{ weight_kg: '81' }]));
    expect(duplicateStatus(changed.workouts[0], store)).toBe('ambiguous');
    expect(() =>
      buildHevyPlan(store, changed, mappings(changed.names), {}),
    ).toThrow('Review possible');
    const fp = changed.workouts[0].fingerprint;
    expect(
      buildHevyPlan(store, changed, mappings(changed.names), { [fp]: 'skip' })
        .summary.workouts,
    ).toBe(0);
    expect(
      buildHevyPlan(store, changed, mappings(changed.names), {
        [fp]: 'separate',
      }).store.history,
    ).toHaveLength(2);
  });
  it('imported history powers actual previous performance and effort-aware analytics without demo', async () => {
    const p = await previewHevyImport(syntheticCsv([{ rpe: '' }])),
      store = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}).store,
      w = store.history[0];
    const exposures = exerciseExposures(
      [w, { ...w, id: 'demo', dataOrigin: 'demo' }],
      'builtin-chest-press',
    );
    expect(exposures).toHaveLength(1);
    expect(exposures[0].sets[0].rir).toBeNull();
    expect(effortKnown(exposures[0].sets[0])).toBe(false);
    const s = weeklyGymSummary(store.history, new Date('2025-01-12T20:00:00Z'));
    expect(s.muscles[0].sets).toBe(1);
    expect(s.effort.unknown).toBe(1);
    expect(
      JSON.parse(exportGymJson(store)).data.history[0].provenance.source,
    ).toBe('hevy_import');
    expect(exportGymCsv(store)).toContain('source_set_index');
  });
  it('existing v2 stores default import extensions and imported snapshots survive storage roundtrip', async () => {
    const old = initialGymStore();
    const { hevyMappings, importBatches, ...v2 } = old;
    expect(hevyMappings).toEqual({});
    expect(importBatches).toEqual([]);
    expect(parseGymStore(JSON.stringify(v2)).hevyMappings).toEqual({});
    const p = await previewHevyImport(syntheticCsv()),
      plan = buildHevyPlan(old, p, mappings(p.names), {});
    expect(
      parseGymStore(JSON.stringify(plan.store)).history[0].exercises[0].sets[0]
        .rpe,
    ).toBe(9);
  });
});

describe('source edge cases and domain boundaries', () => {
  it('preserves repeated indices as separate blocks with original row order', async () => {
    const p = await previewHevyImport(
      syntheticCsv([
        { set_index: '0' },
        { set_index: '1' },
        { set_index: '0', weight_kg: '85' },
      ]),
    );
    const plan = buildHevyPlan(initialGymStore(), p, mappings(p.names), {});
    expect(p.warnings.join()).toContain('repeated set indices');
    expect(plan.store.history[0].exercises).toHaveLength(2);
    expect(
      plan.store.history[0].exercises.flatMap((e) =>
        e.sets.map((s) => s.sourceRowOrder),
      ),
    ).toEqual([0, 1, 2]);
    expect(plan.summary.sets).toBe(3);
  });
  it('requires review for two incoming groups at the same source start', async () => {
    const p = await previewHevyImport(
      syntheticCsv([{ title: 'Synthetic A' }, { title: 'Synthetic B' }]),
    );
    expect(() =>
      buildHevyPlan(initialGymStore(), p, mappings(p.names), {}),
    ).toThrow('Review possible');
    const decisions = Object.fromEntries(
      p.workouts.map((w) => [w.fingerprint, 'separate' as const]),
    );
    expect(
      buildHevyPlan(initialGymStore(), p, mappings(p.names), decisions).summary
        .workouts,
    ).toBe(2);
  });
  it('rejects duplicate fingerprints and does not weaken direct logger validation', async () => {
    const p = await previewHevyImport(
        syntheticCsv([{ reps: '', duration_seconds: '60' }]),
      ),
      plan = buildHevyPlan(initialGymStore(), p, mappings(p.names), {}),
      w = plan.store.history[0];
    expect(() =>
      parseGymStore(
        JSON.stringify({ ...plan.store, history: [w, { ...w, id: 'other' }] }),
      ),
    ).toThrow('Duplicate source');
    expect(() =>
      parseGymStore(
        JSON.stringify({
          ...plan.store,
          history: [
            {
              ...w,
              provenance: { source: 'local_logger', recordedAt: w.startedAt },
            },
          ],
        }),
      ),
    ).toThrow('Completed sets require reps');
  });
  it('supports header reordering while rejecting undocumented extra columns', async () => {
    const rows = parseCsv(syntheticCsv()),
      reversed = rows
        .map((r) =>
          r
            .reverse()
            .map((v) => `"${v.replaceAll('"', '""')}"`)
            .join(','),
        )
        .join('\n');
    expect((await previewHevyImport(reversed)).errors).toEqual([]);
    expect(
      (
        await previewHevyImport(
          syntheticCsv().replace('title,', 'unexpected,title,'),
        )
      ).errors.length,
    ).toBe(1);
  });
});

it('newer full exports add only new sessions/sets; reordered workout groups remain unchanged and edited sessions require review', async () => {
  const oldRow = {
    start_time: '01 set 2026, 18:00',
    end_time: '01 set 2026, 19:00',
  };
  const newRow = {
    start_time: '06 ott 2026, 18:00',
    end_time: '06 ott 2026, 19:00',
  };
  const oldParsed = await previewHevyImport(
    syntheticCsv([oldRow, { ...oldRow, set_index: '1' }]),
  );
  const base = buildHevyPlan(
    initialGymStore(),
    oldParsed,
    mappings(oldParsed.names),
    {},
  ).store;
  const oldSnapshot = structuredClone(base.history);
  const newer = await previewHevyImport(
    syntheticCsv([
      newRow,
      { ...newRow, set_index: '1' },
      oldRow,
      { ...oldRow, set_index: '1' },
    ]),
  );
  expect(newer.workouts[0].fingerprint).toBe(oldParsed.workouts[0].fingerprint);
  const plan = buildHevyPlan(base, newer, initialMappings(newer, base), {});
  expect(plan.summary).toMatchObject({
    workouts: 1,
    sets: 2,
    duplicates: 1,
    unchanged: 1,
    skippedSets: 2,
    customExercises: 0,
  });
  expect(plan.store.history.find((w) => w.id === oldSnapshot[0].id)).toEqual(
    oldSnapshot[0],
  );
  expect(plan.store.exercises).toEqual(base.exercises);
  const replay = buildHevyPlan(
    plan.store,
    newer,
    initialMappings(newer, plan.store),
    {},
  );
  expect(replay.summary).toMatchObject({
    workouts: 0,
    sets: 0,
    duplicates: 2,
    unchanged: 2,
  });
  expect(replay.store.history).toEqual(plan.store.history);
  const edited = await previewHevyImport(
    syntheticCsv([oldRow, { ...oldRow, set_index: '1', reps: '12' }]),
  );
  expect(duplicateStatus(edited.workouts[0], base, edited)).toBe('ambiguous');
  expect(() =>
    buildHevyPlan(base, edited, initialMappings(edited, base), {}),
  ).toThrow('Review possible duplicates');
  const skipped = buildHevyPlan(base, edited, initialMappings(edited, base), {
    [edited.workouts[0].fingerprint]: 'skip',
  });
  expect(skipped.summary).toMatchObject({ workouts: 0, sets: 0, unchanged: 0 });
  expect(skipped.store.history).toEqual(oldSnapshot);
});

it('deliberate aliases may share a new custom identity even before it is created', async () => {
  const p = await previewHevyImport(
    syntheticCsv([
      { exercise_title: 'A alias' },
      { exercise_title: 'Z custom' },
    ]),
  );
  const custom = {
    id: 'new-shared',
    name: 'Synthetic shared',
    primaryMuscleGroup: 'Chest',
    secondaryMuscleGroups: [],
    custom: true,
  };
  const plan = buildHevyPlan(
    initialGymStore(),
    p,
    [
      { incomingName: 'A alias', exerciseId: custom.id, resolution: 'synonym' },
      {
        incomingName: 'Z custom',
        exerciseId: custom.id,
        resolution: 'create-new',
        custom,
      },
    ],
    {},
  );
  expect(plan.summary.customExercises).toBe(1);
  expect(plan.summary.existingMappings).toBe(0);
  expect(
    plan.store.history[0].exercises.every((e) => e.exerciseId === custom.id),
  ).toBe(true);
});
