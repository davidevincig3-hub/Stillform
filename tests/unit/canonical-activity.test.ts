import { describe, it, expect } from 'vitest';
import { emptyRegistry, registrySchema } from '../../src/domain/activity';
import {
  ingestActivity,
  registerGymLinks,
  resolveActivityMatch,
  matchCandidates,
  activitiesInWindow,
} from '../../src/integrations/activity-matching';
import {
  normalizeStrava,
  normalizeSport,
  normalizeStreams,
  normalizeLaps,
} from '../../src/server/strava-client';
import { activityRaw } from '../helpers/integrations';
const now = '2026-10-04T10:00:00Z';
const gym = {
  id: 'hevy-synthetic',
  title: 'Strength content stays in Gym',
  startedAt: '2026-10-01T08:00:00Z',
  endedAt: '2026-10-01T09:00:00Z',
  durationMinutes: 60,
  source: 'hevy_import' as const,
};
function ingest(state: ReturnType<typeof emptyRegistry>, raw = activityRaw()) {
  const n = normalizeStrava(raw, '7', now);
  return ingestActivity(state, n.activity, n.source);
}
describe('canonical activities and cross-source matching', () => {
  it('creates canonical/source records with exact identities and field provenance', () => {
    const state = emptyRegistry();
    expect(ingest(state)).toBe('new');
    expect(ingest(state)).toBe('existing');
    expect(state.activities).toHaveLength(1);
    expect(state.sources).toHaveLength(1);
    expect(state.activities[0].fieldSources.distanceM).toBe('strava:7:1');
    expect(state.sources[0].raw).toEqual(activityRaw());
    expect(registrySchema.parse(state)).toEqual(state);
  });
  it('preserves source revisions and updates only values owned by that provider', () => {
    const state = emptyRegistry();
    ingest(state);
    ingest(state, { ...activityRaw(), name: 'Changed title' });
    expect(state.sources[0].previous[0]).toEqual(activityRaw());
    expect(state.activities[0].title).toBe('Changed title');
  });
  it('links Hevy strength to one canonical session without creating Gym workouts', () => {
    const state = emptyRegistry();
    registerGymLinks(state, [gym], now);
    expect(ingest(state, activityRaw(1, 'WeightTraining'))).toBe('linked');
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].gymWorkoutId).toBe(gym.id);
    expect(state.activities[0].title).toBe(gym.title);
    expect(state.activities[0].fieldSources.title).toBe(`hevy:${gym.id}`);
    expect(state.activities[0].sourceKeys).toHaveLength(2);
    expect(activitiesInWindow(state, '2026-01-01', '2027-01-01')).toHaveLength(
      1,
    );
    expect(state.sources[0].raw).toEqual(gym);
    expect(JSON.stringify(state)).not.toContain('reps');
  });
  it('preserves unmatched strength as a shell without sets', () => {
    const state = emptyRegistry();
    ingest(state, activityRaw(1, 'WeightTraining'));
    expect(state.activities[0].sport).toBe('strength');
    expect(state.activities[0].gymWorkoutId).toBeNull();
    expect(state.activities[0]).not.toHaveProperty('sets');
  });
  it('never silently merges multiple plausible matches and persists keep separate', () => {
    const state = emptyRegistry();
    registerGymLinks(state, [gym, { ...gym, id: 'gym-two' }], now);
    expect(ingest(state, activityRaw(1, 'WeightTraining'))).toBe('review');
    expect(state.reviews[0].candidates).toHaveLength(2);
    resolveActivityMatch(state, 'strava:7:1', null, now);
    expect(state.decisions['strava:7:1'].action).toBe('separate');
    expect(ingest(state, activityRaw(1, 'WeightTraining'))).toBe('existing');
    expect(state.reviews).toHaveLength(0);
    expect(state.activities).toHaveLength(3);
  });
  it('manual linking retains source raw and redirects the prior canonical identity', () => {
    const state = emptyRegistry();
    registerGymLinks(state, [gym, { ...gym, id: 'gym-two' }], now);
    ingest(state, activityRaw(1, 'WeightTraining'));
    const old = state.reviews[0].incomingId;
    resolveActivityMatch(state, 'strava:7:1', `gym-${gym.id}`, now);
    expect(state.activities).toHaveLength(2);
    expect(state.aliases[old]).toBe(`gym-${gym.id}`);
    expect(state.sources.find((s) => s.key === 'strava:7:1')?.raw).toEqual(
      activityRaw(1, 'WeightTraining'),
    );
  });
  it('supports future provider records without implementing a Polar adapter', () => {
    const state = emptyRegistry();
    const n = normalizeStrava(activityRaw(), '7', now);
    ingestActivity(state, n.activity, n.source);
    const future = structuredClone(n);
    future.activity.id = 'synthetic-future-source';
    future.source.key = 'polar:synthetic';
    future.source.provider = 'polar';
    future.activity.sourceKeys = [future.source.key];
    future.activity.fieldSources = Object.fromEntries(
      Object.keys(future.activity.fieldSources).map((k) => [
        k,
        future.source.key,
      ]),
    );
    expect(ingestActivity(state, future.activity, future.source)).toBe(
      'linked',
    );
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].fieldSources.distanceM).toBe(n.source.key);
    expect(state.sources).toHaveLength(2);
  });
  it('titles alone never constitute a match and missing distance yields review', () => {
    const n = normalizeStrava(activityRaw(), '7', now);
    const other = {
      ...n.activity,
      id: 'other',
      startedAt: '2026-10-02T08:00:00Z',
    };
    expect(matchCandidates(n.activity, [other])).toEqual([]);
    other.startedAt = n.activity.startedAt;
    other.distanceM = null;
    expect(matchCandidates(n.activity, [other])[0].confidence).toBe('possible');
  });
  it('late Gym arrival triggers review without duplicating CompletedWorkouts', () => {
    const state = emptyRegistry();
    ingest(state, activityRaw(1, 'WeightTraining'));
    registerGymLinks(state, [gym], now);
    expect(state.reviews).toHaveLength(1);
    registerGymLinks(state, [gym], now);
    expect(state.activities).toHaveLength(2);
    expect(state.reviews).toHaveLength(1);
  });
});
describe('sport and rich-data normalization', () => {
  it.each([
    ['Run', 'run'],
    ['TrailRun', 'trail_run'],
    ['VirtualRun', 'run'],
    ['EBikeRide', 'cycling'],
    ['Swim', 'swimming'],
    ['Walk', 'walking'],
    ['Hike', 'hiking'],
    ['WeightTraining', 'strength'],
    ['UnknownFutureSport', 'other'],
  ])('maps %s to %s preserving original metadata', (provider, sport) => {
    expect(normalizeSport(provider)).toBe(sport);
    expect(
      normalizeStrava(activityRaw(1, provider), '7').source.providerType,
    ).toBe(provider);
  });
  it('accepts missing HR/GPS and preserves honest nulls', () => {
    const n = normalizeStrava(activityRaw(), '7');
    expect(n.activity.averageHr).toBeNull();
    expect(n.activity.device).toBeNull();
    expect(normalizeStreams({}).streams).toEqual([]);
    expect(normalizeLaps([], 'key')).toEqual([]);
  });
  it('normalizes numeric, GPS and moving streams from keyed and array payloads', () => {
    const keyed = {
      time: { data: [0, 10], series_type: 'time', original_size: 2 },
      latlng: {
        data: [
          [45, 9],
          [45.1, 9.1],
        ],
      },
      moving: { data: [true, false] },
      heartrate: { data: [130, 140] },
    };
    const n = normalizeStreams(keyed);
    expect(n.streams.map((s) => s.kind)).toEqual([
      'time',
      'latlng',
      'moving',
      'heartrate',
    ]);
    expect(n.streams[0].originalSize).toBe(2);
    expect(
      normalizeStreams([{ type: 'distance', data: [0, 100] }]).streams[0].kind,
    ).toBe('distance');
  });
  it('omits invalid samples with warnings rather than inventing replacements', () => {
    const n = normalizeStreams({
      time: { data: [0, 1] },
      heartrate: { data: ['bad'] },
      future: { data: [1] },
    });
    expect(n.streams).toHaveLength(1);
    expect(n.warnings).toHaveLength(2);
  });
  it('preserves lap source values and nullable missing effort metadata', () => {
    const raw = {
      elapsed_time: 240,
      moving_time: 230,
      distance: 1000,
      average_speed: 4,
      average_heartrate: 170,
    };
    const l = normalizeLaps([raw], 'strava:7:1')[0];
    expect(l.elapsedSeconds).toBe(240);
    expect(l.maxHr).toBeNull();
    expect(l.sourceKey).toBe('strava:7:1');
    expect(l.raw).toEqual(raw);
  });
});

it('different permanent IDs from the same provider require review, never automatic merging', () => {
  const state = emptyRegistry();
  const a = normalizeStrava(activityRaw(1), '7'),
    b = normalizeStrava(activityRaw(2), '7');
  ingestActivity(state, a.activity, a.source);
  expect(ingestActivity(state, b.activity, b.source)).toBe('review');
  expect(state.activities).toHaveLength(2);
});
it('provider athlete identity must match the authorized account', () => {
  expect(() =>
    normalizeStrava({ ...activityRaw(), athlete: { id: 8 } }, '7'),
  ).toThrow('different athlete');
});

it('later summary sync does not erase detailed fields that the summary omits', () => {
  const state = emptyRegistry();
  const detail = normalizeStrava(
    {
      ...activityRaw(),
      device_name: 'Synthetic sensor',
      average_heartrate: 140,
    },
    '7',
  );
  const originalSnapshot = structuredClone(detail.source.raw);
  ingestActivity(state, detail.activity, detail.source);
  const summary = normalizeStrava(activityRaw(), '7');
  ingestActivity(state, summary.activity, summary.source);
  expect(state.activities[0].device).toBe('Synthetic sensor');
  expect(state.activities[0].averageHr).toBe(140);
  expect(state.sources[0].device).toBe('Synthetic sensor');
  expect(state.sources[0].previous[0]).toEqual(originalSnapshot);
});

it('accepts explicitly null optional provider measurements as missing, not zero', () => {
  const n = normalizeStrava(
    {
      ...activityRaw(),
      average_heartrate: null,
      max_heartrate: null,
      total_elevation_gain: null,
      timezone: null,
    },
    '7',
  );
  expect(n.activity.averageHr).toBeNull();
  expect(n.activity.elevationM).toBeNull();
  expect(n.activity.timeZone).toBeNull();
});

it('manual merge preserves field provenance from every attached provider', () => {
  const state = emptyRegistry();
  registerGymLinks(
    state,
    [
      {
        id: 'gym-target',
        title: 'Gym',
        startedAt: '2026-10-01T08:00:00Z',
        endedAt: null,
        durationMinutes: 60,
        source: 'hevy_import',
      },
    ],
    '2026-10-04T00:00:00Z',
  );
  const n = normalizeStrava(
    { ...activityRaw(1, 'WeightTraining'), average_heartrate: 150 },
    '7',
  );
  n.activity.id = 'incoming';
  n.activity.status = 'review';
  const polarKey = 'polar:synthetic:1';
  n.activity.fieldSources.averageHr = polarKey;
  n.activity.sourceKeys.push(polarKey);
  state.activities.push(n.activity);
  state.sources.push(n.source, {
    ...structuredClone(n.source),
    key: polarKey,
    provider: 'polar',
    externalId: 'synthetic:1',
    activityId: 'incoming',
  });
  n.source.activityId = 'incoming';
  state.reviews.push({
    sourceKey: n.source.key,
    incomingId: 'incoming',
    candidates: [
      {
        activityId: 'gym-gym-target',
        confidence: 'high',
        reasons: ['Synthetic review fixture'],
      },
    ],
  });
  resolveActivityMatch(
    state,
    n.source.key,
    'gym-gym-target',
    '2026-10-04T00:00:00Z',
  );
  expect(state.activities).toHaveLength(1);
  expect(state.activities[0].fieldSources.averageHr).toBe(polarKey);
  expect(state.activities[0].sourceKeys).toHaveLength(3);
  expect(state.sources.every((s) => s.activityId === 'gym-gym-target')).toBe(
    true,
  );
});
