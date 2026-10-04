import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  previewHevyImport,
  buildHevyPlan,
} from '../../src/integrations/hevy-import';
import { initialGymStore } from '../../src/repositories/gym-storage';
// Opt-in developer verification: reads private input, prints only aggregate counts.
// No snapshots, writes, row/title output or canonical browser mutation.
it.skipIf(process.env.VERIFY_LOCAL_HEVY !== '1')(
  'verifies local reference in memory only',
  async () => {
    const p = await previewHevyImport(
      readFileSync('local-imports/hevy-workouts.csv', 'utf8'),
      'Europe/Rome',
    );
    expect(p.errors).toEqual([]);
    const store = initialGymStore();
    const mappings = p.names.map((incomingName, i) => ({
      incomingName,
      exerciseId: `verify-${i}`,
      resolution: 'create-new' as const,
      custom: {
        id: `verify-${i}`,
        name: incomingName,
        primaryMuscleGroup: 'Unassigned',
        secondaryMuscleGroups: [],
        custom: true,
      },
    }));
    const plan = buildHevyPlan(store, p, mappings, {});
    expect(plan.summary.sets).toBe(p.rowCount);
    expect(store.history).toHaveLength(0);
    const repeated = buildHevyPlan(plan.store, p, mappings, {});
    expect(repeated.summary.workouts).toBe(0);
    expect(repeated.summary.duplicates).toBe(p.workouts.length);
    console.log(
      JSON.stringify({
        columns: 14,
        rows: p.rowCount,
        workouts: p.workouts.length,
        exerciseNames: p.names.length,
        localDateStart: p.workouts[0]?.sourceStart.split(',')[0],
        localDateEnd: p.workouts.at(-1)?.sourceStart.split(',')[0],
        errors: p.errors.length,
        warnings: p.warnings,
        canonicalSets: plan.summary.sets,
        repeatedImportWorkouts: repeated.summary.workouts,
      }),
    );
  },
);
