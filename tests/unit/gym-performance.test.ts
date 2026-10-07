import { describe, it, expect } from 'vitest';
import {
  gymPerformance,
  gymPerformanceCoverage,
} from '../../src/analytics/gym-performance';
import { performanceHistory } from '../helpers/gym-performance';
import { selectGymView } from '../../src/repositories/gym-cloud-query';
import { SupabaseGymRepository } from '../../src/server/gym-repository';
import { encodeGym } from '../../src/repositories/gym-cloud-codec';
import { config } from '../helpers/integrations';
import { withLocalGymEvidence } from '../../src/analytics/recovery-gym';
import { engineFixture } from '../helpers/recovery-engine';
import { weeklyGymSummary } from '../../src/analytics/gym';

const asOf = '2026-10-07T12:00:00Z',
  id = 'synthetic-ex-0';
describe('Gym performance V1', () => {
  it('matches canonical identity despite renames, compares current against prior median, and never changes source data', () => {
    const store = performanceHistory();
    store.history[3].exercises[0].name = 'Renamed';
    const before = JSON.stringify(store);
    const result = gymPerformance(store.history, id, asOf);
    expect(result.comparison).toMatchObject({
      eligibleDates: 4,
      referenceMedian: 55,
      deltaKg: 10,
      current: { load: 65 },
    });
    expect(result.confidence).toBe('low');
    expect(
      gymPerformance(store.history, 'different-id', asOf).totals.exposures,
    ).toBe(0);
    expect(JSON.stringify(store)).toBe(before);
  });
  it('keeps repeated blocks separate, excludes warm-up first sets and never replaces them with later normal sets', () => {
    const store = performanceHistory();
    store.history.forEach((w) => {
      const first = w.exercises[0];
      w.exercises.push({ ...structuredClone(first), id: `${first.id}-repeat` });
      first.sets[0].setType = 'warmup';
      first.sets.push({
        ...first.sets[0],
        id: 'later-normal',
        setType: 'normal',
        weight: 999,
      });
    });
    const r = gymPerformance(store.history, id, asOf);
    expect(r.comparison?.protocol.block).toBe(2);
    expect(r.comparison?.current.load).toBe(65);
    expect(r.totals.sets).toBe(12);
    expect(r.trend[0].blocks).toBe(2);
    expect(r.exclusions).toContainEqual({
      reason: 'First set is warmup',
      blocks: 4,
    });
    expect(r.records.some((p) => p.setType === 'warmup')).toBe(true);
  });
  it('classifies dropsets and retains descriptive records with missing effort', () => {
    const store = performanceHistory();
    store.history.forEach((w) => {
      w.exercises[0].sets[0].rir = null;
      w.exercises[0].sets[0].setType = 'dropset';
    });
    const r = gymPerformance(store.history, id, asOf);
    expect(r.comparison).toBeNull();
    expect(r.confidence).toBe('insufficient');
    expect(r.totals).toMatchObject({
      exposures: 4,
      sets: 4,
      effortSets: 0,
      loadRepSets: 4,
    });
    expect(r.bestLoads[0].load).toBe(65);
    expect(r.records[0]).toMatchObject({
      setType: 'dropset',
      load: 65,
      reps: 10,
    });
    expect(r.exclusions).toContainEqual({
      reason: 'First-set effort unknown',
      blocks: 4,
    });
  });
  it('never assumes missing loads are bodyweight, missing reps are known, or unknown equipment is equivalent', () => {
    const s = performanceHistory();
    s.history[0].exercises[0].sets[0].weight = null;
    s.history[1].exercises[0].sets[0].reps = null;
    s.history[2].exercises[0].equipment = null;
    const r = gymPerformance(s.history, id, asOf);
    expect(r.comparison).toBeNull();
    expect(r.totals.loadRepSets).toBe(2);
    expect(r.exclusions.map((e) => e.reason)).toEqual(
      expect.arrayContaining([
        'Positive recorded load unavailable',
        'Positive recorded repetitions unavailable',
        'Historical equipment unspecified',
      ]),
    );
    expect(r.records.some((p) => p.equipment === null)).toBe(true);
  });
  it('supports RPE or explicit failure without RIR while matching their values independently', () => {
    for (const mode of ['rpe', 'failure'] as const) {
      const s = performanceHistory();
      s.history.forEach((w) => {
        const set = w.exercises[0].sets[0];
        set.rir = null;
        if (mode === 'rpe') set.rpe = 9;
        else set.failure = true;
      });
      expect(
        gymPerformance(s.history, id, asOf).comparison?.protocol,
      ).toMatchObject({
        rir: null,
        rpe: mode === 'rpe' ? 9 : null,
        failure: mode === 'failure',
      });
      s.history[3].exercises[0].sets[0].rpe = 10;
      expect(
        gymPerformance(s.history, id, asOf).comparison?.current.workoutId,
      ).toBe(s.history[2].id);
    }
  });
  it('keeps a load-only record when repetitions are missing and zero load records descriptive', () => {
    const s = performanceHistory();
    s.history.forEach((w) => {
      w.exercises[0].sets[0].reps = null;
    });
    const r = gymPerformance(s.history, id, asOf);
    expect(r.bestLoads[0].load).toBe(65);
    expect(r.records).toEqual([]);
    expect(r.comparison).toBeNull();
    s.history[0].exercises[0].sets[0].weight = 0;
    s.history[0].exercises[0].sets[0].reps = 12;
    expect(gymPerformance(s.history, id, asOf).records).toEqual(
      expect.arrayContaining([expect.objectContaining({ load: 0, reps: 12 })]),
    );
  });
  it('withholds comparisons below three distinct dates and handles same-date repeats, future, demo and legacy records', () => {
    const s = performanceHistory(3);
    expect(
      gymPerformance(s.history.slice(0, 2), id, asOf).comparison,
    ).toBeNull();
    s.history[2].startedAt = s.history[1].startedAt;
    expect(gymPerformance(s.history, id, asOf).comparison).toBeNull();
    s.history[2].dataOrigin = 'demo';
    s.history[1].dataOrigin = 'legacy_unverified';
    expect(gymPerformance(s.history, id, asOf).totals.exposures).toBe(1);
    expect(
      gymPerformance(s.history, id, '2026-08-01T00:00:00Z').totals.exposures,
    ).toBe(0);
  });
  it('separates equipment, reps, effort, set type and superset protocols and is deterministic under workout reordering', () => {
    const s = performanceHistory(8);
    s.history[7].exercises[0].equipment = 'Other machine';
    s.history[6].exercises[0].sets[0].reps = 8;
    s.history[5].exercises[0].sets[0].setType = 'failure';
    s.history[4].exercises[0].sets[0].supersetId = 'group';
    const r = gymPerformance(s.history, id, asOf);
    expect(r.comparison?.current.workoutId).toBe(s.history[3].id);
    expect(gymPerformance([...s.history].reverse(), id, asOf)).toEqual(r);
    expect(r.exclusions).toContainEqual({
      reason: 'Different recorded comparison protocol',
      blocks: 4,
    });
  });
  it('calculates full exercise history before cloud pagination with bounded output', () => {
    const s = performanceHistory(30);
    const first = selectGymView(s, {
      scope: 'exercise',
      id,
      limit: 2,
      page: 0,
    });
    const later = selectGymView(s, {
      scope: 'exercise',
      id,
      limit: 2,
      page: 14,
    });
    expect(first.store.history).toHaveLength(2);
    expect(first.summary.performance?.totals.exposures).toBe(30);
    expect(first.summary.performance?.comparison?.eligibleDates).toBe(30);
    expect(later.summary.performance?.comparison).toEqual(
      first.summary.performance?.comparison,
    );
    expect(later.summary.performance?.totals).toEqual(
      first.summary.performance?.totals,
    );
    expect(first.summary.performance?.trend).toHaveLength(8);
    expect(selectGymView(s).summary.performance).toBeUndefined();
  });
  it('retains existing Recovery protocol identity and descriptive unassigned muscle totals', () => {
    const s = performanceHistory();
    const r = withLocalGymEvidence(
      { ...engineFixture(), asOfDate: '2026-09-04' },
      s.history,
      asOf,
    );
    expect(r.metrics[0].id).toBe(
      'gym_load:' + JSON.stringify([id, 'Machine', 10, 1, null, false]),
    );
    expect(r.metrics[0].observations.map((o) => o.value)).toEqual([
      65, 60, 55, 50,
    ]);
    const summary = weeklyGymSummary(
      s.history,
      new Date('2026-09-04T12:00:00Z'),
    );
    expect(summary.unassigned).toEqual({ sets: 4, frequency: 4 });
    expect(summary.muscles).toEqual([]);
    expect(gymPerformanceCoverage(s.history, asOf)).toMatchObject({
      usedExercises: 1,
      descriptive: 1,
      strongerComparison: 1,
      usefulEffortCoverage: 1,
    });
  });
  it('keeps summaries scoped to the authenticated repository owner', async () => {
    const populated = performanceHistory();
    const empty = { ...populated, history: [] };
    const repo = new SupabaseGymRepository(config, async (_url, init) => {
      const owner = JSON.parse(String(init?.body)).p_owner;
      return Response.json({
        initialized: true,
        revision: 1,
        document: encodeGym(owner === 'owner-a' ? populated : empty),
      });
    });
    expect(
      (await repo.read('owner-a', { scope: 'exercise', id })).summary
        ?.performance?.totals.exposures,
    ).toBe(4);
    expect(
      (await repo.read('owner-b', { scope: 'exercise', id })).summary
        ?.performance?.totals.exposures,
    ).toBe(0);
  });
});
