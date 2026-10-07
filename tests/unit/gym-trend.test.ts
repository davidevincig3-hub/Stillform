import { describe, it, expect, vi } from 'vitest';
import {
  gymTrend,
  gymTrendView,
  trendFraction,
  trendSeriesValue,
  trendModel,
  trendTables,
  trendDateOffset,
} from '../../src/analytics/gym-trend';
import { trendHistory, trendAsOf } from '../helpers/gym-trend';
import { selectGymView } from '../../src/repositories/gym-cloud-query';
import { SupabaseGymRepository } from '../../src/server/gym-repository';
import { encodeGym } from '../../src/repositories/gym-cloud-codec';
import { config } from '../helpers/integrations';
import { gymPerformance } from '../../src/analytics/gym-performance';
import { GymCloudClient } from '../../src/repositories/gym-cloud-client';

describe('Gym Performance Trend V1', () => {
  it('includes both calendar window boundaries and excludes adjacent dates', () => {
    const template = trendHistory().history[0];
    const dates = [
      '2026-06-24',
      '2026-06-25',
      '2026-07-22',
      '2026-09-10',
      '2026-10-07',
      '2026-10-08',
    ];
    const history = dates.map((date, i) => ({
      ...structuredClone(template),
      id: `boundary-${i}`,
      startedAt: `${date}T10:00:00.000Z`,
    }));
    const result = gymTrend(history, trendAsOf);
    expect(result.counts.blocks).toBe(4);
    expect(result.protocols[0].baseline.dates).toBe(2);
    expect(result.protocols[0].points.at(-1)!.dates).toBe(2);
    expect(gymTrendView(result).points[0].index).toBe(100);
  });
  it('keeps finite large values finite through median and normalization without changing Recovery math', () => {
    const s = trendHistory();
    s.history.forEach((w) => {
      w.exercises[0].sets[0].weight = 1e307;
    });
    const view = gymTrendView(gymTrend(s.history, trendAsOf));
    expect(view.points.every((p) => p.index === 100)).toBe(true);
    s.history.slice(-4).forEach((w) => {
      w.exercises[0].sets[0].weight = Number.MIN_VALUE;
    });
    expect(
      gymTrendView(gymTrend(s.history, trendAsOf)).points.every(
        (p) => p.index === null,
      ),
    ).toBe(true);
  });
  it('retains the agreed figure points and interpolates each model without extrapolation', () => {
    expect(trendTables.general).toEqual([
      [3.28, 0.95],
      [4.94, 0.9],
      [7.15, 0.85],
      [9.75, 0.8],
      [12.37, 0.75],
      [14.8, 0.7],
      [17.11, 0.65],
    ]);
    expect(trendTables.bench).toEqual([
      [2.59, 0.95],
      [4.11, 0.9],
      [6.23, 0.85],
      [8.82, 0.8],
      [11.51, 0.75],
      [14.08, 0.7],
      [16.59, 0.65],
    ]);
    expect(trendTables.leg).toEqual([
      [7.04, 0.95],
      [8.69, 0.9],
      [10.69, 0.85],
      [13.05, 0.8],
      [15.79, 0.75],
    ]);
    expect(trendFraction(10, 'general')).toBeCloseTo(
      0.8 + ((0.75 - 0.8) * 0.25) / (12.37 - 9.75),
    );
    expect(trendFraction(10, 'bench')).toBeCloseTo(
      0.8 + ((0.75 - 0.8) * (10 - 8.82)) / (11.51 - 8.82),
    );
    expect(trendFraction(8, 'leg')).toBeCloseTo(
      0.95 + ((0.9 - 0.95) * (8 - 7.04)) / (8.69 - 7.04),
    );
    for (const reps of [null, 4, 16, 5.5, NaN, Infinity])
      expect(trendSeriesValue(50, reps, 'general')).toBeNull();
    for (const reps of [5, 6, 7]) expect(trendFraction(reps, 'leg')).toBeNull();
    for (const reps of [5, 15])
      expect(trendFraction(reps, 'general')).not.toBeNull();
    for (const load of [null, 0, -1, NaN, Infinity, Number.MAX_VALUE])
      expect(trendSeriesValue(load, 10, 'general')).toBeNull();
    expect(trendSeriesValue(80, 10, 'general')).toBeCloseTo(
      80 / trendFraction(10, 'general')!,
    );
  });
  it('chooses special models only by verified canonical classification, never by names or similar IDs', () => {
    expect(trendModel('builtin-leg-press')).toBe('leg');
    expect(trendModel('Chest press')).toBe('general');
    expect(trendModel('Bench Press (Dumbbell)')).toBe('general');
    expect(trendModel('custom-leg-press')).toBe('general');
    expect(trendModel('verified-bench', { 'verified-bench': 'bench' })).toBe(
      'bench',
    );
    expect(trendModel('toString')).toBe('general');
    const store = trendHistory();
    store.history.forEach((w) => {
      w.exercises[0].name = 'Bench Press (Smith Machine)';
    });
    expect(gymTrend(store.history, trendAsOf).protocols[0].model).toBe(
      'general',
    );
    expect(
      gymTrend(store.history, trendAsOf, { 'synthetic-ex-0': 'bench' })
        .protocols[0].model,
    ).toBe('bench');
  });
  it('uses full real history, calendar windows, initial baseline and a 100 reference without mutation', () => {
    const s = trendHistory(),
      before = JSON.stringify(s);
    const result = gymTrend(s.history, trendAsOf),
      view = gymTrendView(result);
    expect(result.protocols[0].baseline).toMatchObject({
      date: '2026-07-22',
      from: '2026-06-25',
      dates: 4,
    });
    expect(view.points).toHaveLength(12);
    expect(view.points[0].index).toBeCloseTo(100);
    expect(view.points.at(-1)!.index).toBeCloseTo(140);
    expect(JSON.stringify(s)).toBe(before);
    const invalid = s.history.map((w) => ({
      ...w,
      dataOrigin: 'demo' as const,
    }));
    expect(gymTrend(invalid, trendAsOf).protocols).toHaveLength(0);
    expect(
      gymTrend([{ ...s.history[1], status: 'active' }], trendAsOf).protocols,
    ).toHaveLength(0);
    expect(
      gymTrend(
        s.history.map((w) => ({ ...w, dataOrigin: 'legacy_unverified' })),
        trendAsOf,
      ).protocols,
    ).toHaveLength(0);
  });
  it('uses Europe/Rome dates at midnight and DST transitions, not UTC dates', () => {
    const s = trendHistory();
    s.history = s.history.slice(-2);
    s.history[0].startedAt = '2026-10-24T22:30:00Z'; // Oct 25 local, before transition
    s.history[1].startedAt = '2026-10-25T23:30:00Z'; // Oct 26 local, after transition
    const result = gymTrend(s.history, '2026-10-26');
    expect(result.protocols[0].points.at(-1)!.dates).toBe(2);
    expect(
      gymTrend(s.history, '2026-10-25').protocols[0].points.at(-1)!.dates,
    ).toBe(1);
    expect(trendDateOffset('2026-10-26', -27)).toBe('2026-09-29');
    expect(trendDateOffset('2026-03-30', -27)).toBe('2026-03-03');
  });
  it('takes first completed work set in stored order, skips warm-up/drop and never picks a later favorable set', () => {
    const s = trendHistory();
    const original = gymTrendView(gymTrend(s.history, trendAsOf));
    s.history.forEach((w) => {
      const e = w.exercises[0],
        set = e.sets[0];
      e.sets = [
        { ...set, id: 'warm', setType: 'warmup', weight: 10 },
        { ...set, id: 'drop', setType: 'dropset', weight: 500 },
        set,
        { ...set, id: 'later', weight: 1000 },
      ];
    });
    expect(gymTrendView(gymTrend(s.history, trendAsOf)).points).toEqual(
      original.points,
    );
    s.history.forEach((w) => {
      w.exercises[0].sets[2].reps = 3;
    });
    expect(gymTrend(s.history, trendAsOf).protocols).toHaveLength(0);
    s.history.forEach((w) => {
      w.exercises[0].sets[2].completed = false;
    });
    expect(
      gymTrend(s.history, trendAsOf).protocols[0].points.at(-1)!.median,
    ).toBeGreaterThan(1000);
  });
  it('does not weight additional work sets or effort and does not change conservative comparison rules', () => {
    const s = trendHistory(),
      original = gymTrend(s.history, trendAsOf);
    const originalIndex = gymTrendView(original).points.map((p) => p.index);
    const conservative = gymPerformance(s.history, 'synthetic-ex-0');
    s.history.forEach((w, i) => {
      const e = w.exercises[0],
        set = e.sets[0];
      set.rir = i >= 8 ? 2 : null;
      e.sets.push({ ...set, id: 'more', weight: 500 });
    });
    const changed = gymTrend(s.history, trendAsOf);
    expect(gymTrendView(changed).points.map((p) => p.index)).toEqual(
      originalIndex,
    );
    expect(changed.counts.effortBlocks).toBe(8);
    expect(changed.protocols[0].points.at(-1)!.effortExposures).toBe(4);
    expect(conservative.comparison).toBeNull();
    expect(
      gymPerformance(s.history, 'synthetic-ex-0').comparison?.protocol.rir,
    ).toBe(2);
  });
  it('reduces multiple exposures per local day before taking window medians', () => {
    const s = trendHistory(),
      result = gymTrend(s.history, trendAsOf);
    const duplicate = structuredClone(s.history.at(-1)!);
    duplicate.id = 'duplicate-day';
    duplicate.exercises[0].sets[0].weight = 200;
    s.history.push(duplicate);
    const p = gymTrend(s.history, trendAsOf).protocols[0].points.at(-1)!;
    expect(p.dates).toBe(4);
    expect(p.exposures).toBe(5);
    // Daily values [74,76,78, median(80,200)=140], then median = 77, unchanged.
    expect(p.median).toBeCloseTo(result.protocols[0].points.at(-1)!.median!);
  });
  it('requires two distinct dates, keeps a fixed endpoint cohort and leaves intermediate gaps', () => {
    const s = trendHistory();
    const full = gymTrend(s.history, trendAsOf);
    s.history = s.history.filter((_, i) => i <= 4 || i >= 12);
    const r = gymTrend(s.history, trendAsOf),
      view = gymTrendView(r);
    expect(view.cohort.map((p) => p.key)).toEqual(
      gymTrendView(full).cohort.map((p) => p.key),
    );
    expect(view.points[6].index).toBeNull();
    expect(view.points[0].index).toBe(100);
    expect(view.points.at(-1)!.index).toBeCloseTo(140);
    s.history = s.history.slice(-1);
    const duplicate = structuredClone(s.history[0]);
    duplicate.id = 'same-day';
    s.history.push(duplicate);
    expect(gymTrendView(gymTrend(s.history, trendAsOf)).cohort).toHaveLength(0);
    expect(
      gymTrendView(gymTrend(s.history, trendAsOf)).points.every(
        (p) => p.index === null,
      ),
    ).toBe(true);
  });
  it('separates equipment, canonical IDs, repeated blocks, exact set types and superset partner contexts', () => {
    const s = trendHistory();
    s.history.forEach((w) => {
      const e = w.exercises[0];
      w.exercises.push(
        { ...structuredClone(e), id: 'repeat', equipment: null },
        { ...structuredClone(e), id: 'known-repeat', equipment: 'Cable' },
        {
          ...structuredClone(e),
          id: 'failure',
          sets: [{ ...e.sets[0], setType: 'failure' }],
        },
        {
          ...structuredClone(e),
          id: 'superset',
          sets: [{ ...e.sets[0], supersetId: 's1' }],
        },
        {
          ...structuredClone(e),
          id: 'partner',
          exerciseId: 'partner-exercise',
          sets: [{ ...e.sets[0], supersetId: 's1' }],
        },
      );
    });
    const r = gymTrend(s.history, trendAsOf);
    expect(r.protocols).toHaveLength(6);
    expect(new Set(r.protocols.map((p) => p.key)).size).toBe(6);
    expect(r.protocols.filter((p) => p.equipment === null)).toHaveLength(1);
    s.history.at(-1)!.exercises.at(-1)!.exerciseId = 'different-partner';
    expect(gymTrend(s.history, trendAsOf).protocols).toHaveLength(8);
  });
  it('uses snapshot muscle only and keeps unassigned exercises individually inspectable', () => {
    const s = trendHistory();
    s.history.forEach((w) => {
      w.exercises[0].primaryMuscleGroup = null;
    });
    s.exercises[0].primaryMuscleGroup = 'Chest';
    const r = gymTrend(s.history, trendAsOf);
    expect(gymTrendView(r).cohort).toHaveLength(0);
    expect(
      gymTrendView(r, null, 'synthetic-ex-0').points.at(-1)!.index,
    ).toBeCloseTo(140);
    expect(r.counts.unassignedBlocks).toBe(15);
    expect(r.exercises[0].muscles).toEqual([null]);
  });
  it('weights exercises equally within groups and groups equally; repeated protocols do not overweight exercises', () => {
    const s = trendHistory();
    s.history.forEach((w, i) => {
      const e = w.exercises[0];
      e.sets[0].weight = i >= 12 ? 100 : 50;
      w.exercises.push(
        {
          ...structuredClone(e),
          id: 'second',
          exerciseId: 'same-group-second',
          sets: [{ ...e.sets[0], weight: 50 }],
        },
        {
          ...structuredClone(e),
          id: 'other',
          exerciseId: 'other-group',
          primaryMuscleGroup: 'Chest',
          sets: [{ ...e.sets[0], weight: 50 }],
        },
        { ...structuredClone(e), id: 'repeat' },
      );
    });
    const r = gymTrend(s.history, trendAsOf);
    // Back exercise indices 200 & 100 => 150. Chest => 100. Total => 125.
    expect(gymTrendView(r).points.at(-1)!.index).toBeCloseTo(125);
    expect(gymTrendView(r, 'Back').points.at(-1)!.index).toBeCloseTo(150);
    expect(
      gymTrendView(r, undefined, 'synthetic-ex-0').points.at(-1)!.index,
    ).toBeCloseTo(200);
  });
  it('does not silently add a late exercise or return a partial aggregate when a cohort member has a gap', () => {
    const s = trendHistory();
    s.history.forEach((w, i) => {
      const e = w.exercises[0];
      if (i >= 12)
        w.exercises.push({
          ...structuredClone(e),
          id: 'late',
          exerciseId: 'late-exercise',
          primaryMuscleGroup: 'Chest',
        });
      if (i <= 4 || i >= 12)
        w.exercises.push({
          ...structuredClone(e),
          id: 'gap',
          exerciseId: 'gap-exercise',
          primaryMuscleGroup: 'Chest',
        });
    });
    const view = gymTrendView(gymTrend(s.history, trendAsOf));
    expect(view.exercises).not.toContain('late-exercise');
    expect(view.points[6]).toMatchObject({
      index: null,
      availableProtocols: 1,
      requiredProtocols: 2,
    });
  });
  it('computes one compact account summary before pagination, omits raw sets and leaves workspace intact', async () => {
    const s = trendHistory(),
      before = JSON.stringify(s),
      owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ p_owner: owner });
      return Response.json({
        revision: 7,
        initialized: true,
        document: encodeGym(s),
      });
    });
    const q = { scope: 'trend' as const, page: 50, limit: 1, asOf: trendAsOf };
    const snapshot = await new SupabaseGymRepository(config, fetcher).read(
      owner,
      q,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(snapshot.summary!.trend).toEqual(gymTrend(s.history, trendAsOf));
    expect(snapshot.store!.history).toEqual([]);
    expect(snapshot.store!.exercises).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('routineSnapshot');
    expect(selectGymView(s).store.history).toHaveLength(3);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('coalesces trend requests, retains owner isolation and invalidates on history epoch', async () => {
    const s = trendHistory(),
      owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
    };
    const read = vi.fn(async () => ({
      owner,
      revision: 1,
      initialized: true,
      ...selectGymView(s, { scope: 'trend', asOf: trendAsOf }),
    }));
    const client = new GymCloudClient({ read, write: vi.fn() }, storage, {
      get: async () => null,
      put: async () => {},
      remove: async () => {},
    });
    client.state.snapshot = { owner, revision: 1, initialized: true, store: s };
    const q = { scope: 'trend' as const, asOf: trendAsOf };
    await Promise.all([client.read(q), client.read(q)]);
    expect(read).toHaveBeenCalledTimes(1);
    client.state.historyEpoch++;
    await client.read(q);
    expect(read).toHaveBeenCalledTimes(2);
    client.state.snapshot.owner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await expect(client.read(q)).rejects.toMatchObject({ status: 403 });
  });
});
