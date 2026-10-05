import { it, expect } from 'vitest';
import {
  formatActivityDuration,
  formatActivityPace,
  groupActivityLaps,
} from '../../src/domain/activity-presentation';
import {
  presentActivity,
  presentRichActivity,
} from '../../src/server/activity-presentation';
import {
  normalizePolarFeatures,
  normalizePolarTraining,
} from '../../src/server/polar-normalize';
import { syntheticPolarDetail } from '../helpers/polar-detail';
import { fingerprint } from '../../src/server/integration-security';

it('formats clock durations and elapsed pace with rounding/carry and honest missing values', () => {
  expect(formatActivityDuration(2096.753)).toBe('34:57');
  expect(formatActivityDuration(3601)).toBe('1:00:01');
  expect(formatActivityDuration(59.6)).toBe('1:00');
  expect(formatActivityDuration(null)).toBe('Unavailable');
  expect(formatActivityPace(2096.753, 5000)).toBe('6:59 /km');
  expect(formatActivityPace(300, 0)).toBe('Unavailable');
});
it('reprojects legacy detail into separate lap types and interval series without writes, units guesses or array disclosure', () => {
  const raw = syntheticPolarDetail(),
    n = normalizePolarFeatures(raw, 'synthetic-key');
  const saved = {
    ...n,
    sourceKey: 'synthetic-key',
    fetchedAt: '2026-10-01T00:00:00Z',
    streams: [],
    warnings: [],
  };
  const before = fingerprint(saved);
  // Mimic legacy persistence: lap kind and stream statuses were absent.
  saved.laps.forEach((l) => {
    delete l.kind;
  });
  const legacyHash = fingerprint(saved),
    result = presentRichActivity(saved);
  expect(
    groupActivityLaps(result.laps).map((g) => [g.label, g.laps.length]),
  ).toEqual([
    ['Manual laps', 2],
    ['Automatic laps', 5],
  ]);
  expect(result.streamStatus).toHaveLength(5);
  expect(
    result.streamStatus.find((s) => s.kind.endsWith('SPEED')),
  ).toMatchObject({
    samples: 2100,
    seriesType: 'interval 1000 ms · unit unverified',
  });
  expect(result.polar!.exercises[0].samples[0]).not.toHaveProperty('values');
  expect(result.laps[0]).not.toHaveProperty('raw');
  expect(fingerprint(saved)).toBe(legacyHash);
  expect(before).not.toBe(legacyHash);
});
it('preserves missing sample slots and exercise identity rather than shifting later values in time', () => {
  const raw = {
    exercises: [
      {
        identifier: { id: 'synthetic' },
        samples: {
          samples: [
            {
              type: 'SPEED',
              intervalMillis: 1000,
              values: [1, 'NaN', null, 2],
            },
          ],
        },
      },
    ],
  };
  expect(
    normalizePolarFeatures(raw, 'key').polar.exercises[0].samples[0],
  ).toMatchObject({ values: [1, null, null, 2], unit: 'provider_unspecified' });
});
it('replaces only Polar fallbacks, preserving provider names including genuine numeric names and permanent IDs', () => {
  const raw = syntheticPolarDetail();
  const n = normalizePolarTraining(raw, 'synthetic-owner', [
    { id: { id: 1 }, name: 'RUNNING' },
  ]);
  expect(n.activity.title).toBe('Running · 2026-10-01');
  const a = { ...n.activity, title: '1' };
  expect(presentActivity(a, [n.source])).toMatchObject({
    id: a.id,
    title: 'Running · 2026-10-01',
  });
  expect(
    presentActivity(a, [{ ...n.source, raw: { ...raw, name: '1' } }]).title,
  ).toBe('1');
  expect(
    normalizePolarTraining({ ...raw, name: 'My park run' }, 'owner', [])
      .activity.title,
  ).toBe('My park run');
});
