import { it, expect } from 'vitest';
import { assessRecovery } from '../../src/analytics/recovery-engine';
import {
  personalBaseline,
  baselineForDay,
} from '../../src/analytics/recovery-baseline';
import {
  engineFixture,
  metricFixture,
  engineDay,
} from '../helpers/recovery-engine';
import { withLocalGymEvidence } from '../../src/analytics/recovery-gym';
import { syntheticGymHistory } from '../helpers/gym-history';
import { emptyPolarStore } from '../../src/domain/polar';
import { emptyRegistry } from '../../src/domain/activity';
import {
  polarRecoveryAssessment,
  polarRecoveryEngineInput,
} from '../../src/server/recovery-engine-input';
import { storePolarRows } from '../../src/server/polar-normalize';
import { sleep, nightly } from '../helpers/polar';

it('zero observations and training alone yield insufficient physiology, with confidence separate', () => {
  const result = assessRecovery({
    ...engineFixture(),
    training: [
      {
        date: engineDay,
        sport: 'run',
        durationMinutes: 30,
        source: 'confirmed_activity',
      },
    ],
  });
  expect(result).toMatchObject({
    state: 'insufficient_data',
    confidence: 'insufficient',
    baselineMaturity: 'insufficient',
    training: { runningMinutes7d: 30 },
  });
  expect(
    result.families.find((f) => f.family === 'training_stress')?.status,
  ).toBe('context_only');
  expect(result.explanation.families).toEqual([]);
});
it('excluded observations never contribute to baseline, trends, maturity or confidence', () => {
  const metric = metricFixture('hrv', 'autonomic', 40, 10);
  metric.observations = metric.observations.map((o) => ({
    ...o,
    quality: 'limited',
    validityOverride: {
      status: 'excluded',
      reason: 'sensor_artifact',
      adjudicatedAt: '2026-10-05T00:00:00Z',
      adjudicatedBy: 'user',
    },
  }));
  const result = assessRecovery(engineFixture([metric]));
  expect(result).toMatchObject({
    state: 'insufficient_data',
    confidence: 'insufficient',
    baselineMaturity: 'insufficient',
    anomalies: [],
  });
  expect(result.signals[0].baseline.count).toBe(0);
  expect(result.signals[0].recentDates).toEqual([]);
});
it('one anomalous family or one isolated measurement cannot classify recovery, even with several correlated autonomic metrics', () => {
  const hrv = metricFixture('hrv', 'autonomic', 40, 20),
    rhr = metricFixture('rhr', 'autonomic', 50, 80);
  rhr.orientation = 'higher_suppressed';
  expect(assessRecovery(engineFixture([hrv, rhr]))).toMatchObject({
    state: 'insufficient_data',
    confidence: 'low',
    explanation: { code: 'single_family_anomaly' },
  });
  hrv.observations = hrv.observations.filter(
    (o) => o.date <= '2026-10-02' || o.date === engineDay,
  );
  const isolated = assessRecovery(engineFixture([hrv]));
  expect(isolated.state).toBe('insufficient_data');
  expect(isolated.anomalies).toEqual(['hrv']);
  expect(isolated.signals[0].usableForState).toBe(false);
});
it('converging independent developed families classify tentative suppressed/elevated patterns and usual ranges without scores', () => {
  const suppressed = assessRecovery(
    engineFixture([
      metricFixture('hrv', 'autonomic', 40, 20),
      metricFixture('sleep', 'sleep', 8, 4),
    ]),
  );
  expect(suppressed).toMatchObject({
    state: 'possibly_suppressed',
    confidence: 'moderate',
    baselineMaturity: 'established',
    explanation: { families: ['autonomic', 'sleep'] },
  });
  expect(suppressed).not.toHaveProperty('score');
  expect(
    assessRecovery(
      engineFixture([
        metricFixture('hrv', 'autonomic', 40, 60),
        metricFixture('sleep', 'sleep', 8, 10),
      ]),
    ).state,
  ).toBe('possibly_elevated');
  expect(
    assessRecovery(
      engineFixture([
        metricFixture('hrv', 'autonomic', 40, 40),
        metricFixture('sleep', 'sleep', 8, 8),
      ]),
    ).state,
  ).toBe('normal');
});
it('conflicting independent evidence prevents classification, and absent context is not negative evidence', () => {
  const result = assessRecovery(
    engineFixture([
      metricFixture('hrv', 'autonomic', 40, 20),
      metricFixture('sleep', 'sleep', 8, 10),
    ]),
  );
  expect(result).toMatchObject({
    state: 'insufficient_data',
    explanation: { code: 'conflicting_evidence' },
  });
  const usual = assessRecovery(
    engineFixture([
      metricFixture('hrv', 'autonomic', 40, 40),
      metricFixture('sleep', 'sleep', 8, 8),
    ]),
  );
  expect(usual.state).toBe('normal');
  expect(usual.families.find((f) => f.family === 'context')?.contributes).toBe(
    false,
  );
});
it('keeps actual dates/gaps, separates baseline from recent data, and resists a single extreme outlier', () => {
  const metric = metricFixture('hrv', 'autonomic', 40, 20);
  metric.observations[0].value = 999999;
  const baseline = baselineForDay(metric.observations, engineDay);
  expect(baseline.median).toBeCloseTo(40);
  expect(baseline.count).toBe(28);
  expect(baseline.end).toBe('2026-10-02');
  const sparse = metric.observations.slice(0, 3);
  const summary = personalBaseline(sparse, '2026-09-05', '2026-10-02');
  expect(summary.count).toBe(3);
  expect(summary.dates).toEqual(sparse.map((o) => o.date));
  expect(summary.coverage).toBe(3 / 28);
  expect(summary.maturity).toBe('insufficient');
});
it('maturity depends on valid distinct dates, span and temporal coverage, not raw sample count', () => {
  const metric = metricFixture('hrv', 'autonomic', 40, 40);
  expect(
    personalBaseline(
      metric.observations.slice(0, 7),
      '2026-09-05',
      '2026-10-02',
    ).maturity,
  ).toBe('preliminary');
  expect(
    personalBaseline(
      metric.observations.slice(0, 14),
      '2026-09-05',
      '2026-10-02',
    ).maturity,
  ).toBe('developing');
  expect(
    personalBaseline(
      metric.observations.slice(0, 28),
      '2026-09-05',
      '2026-10-02',
    ).maturity,
  ).toBe('established');
  expect(
    personalBaseline(
      metric.observations.slice(0, 14),
      '2026-07-05',
      '2026-10-02',
    ).maturity,
  ).toBe('insufficient');
  expect(
    personalBaseline(
      Array.from({ length: 50 }, () => metric.observations[0]),
      '2026-09-05',
      '2026-10-02',
    ).count,
  ).toBe(1);
});
it('unknown sensor quality limits confidence and descriptive secondary signals do not vote', () => {
  const hrv = metricFixture('hrv', 'autonomic', 40, 20),
    duration = metricFixture('sleep', 'sleep', 8, 4);
  hrv.observations.forEach((o) => {
    o.quality = 'limited';
  });
  expect(assessRecovery(engineFixture([hrv, duration])).confidence).toBe('low');
  duration.orientation = 'descriptive';
  expect(assessRecovery(engineFixture([hrv, duration])).state).toBe(
    'insufficient_data',
  );
});
it('an isolated recent outlier is surfaced while the robust recent trend stays stable and cannot classify recovery', () => {
  const hrv = metricFixture('hrv', 'autonomic', 40, 40);
  hrv.observations.at(-1)!.value = 400;
  const result = assessRecovery(
    engineFixture([hrv, metricFixture('sleep', 'sleep', 8, 8)]),
  );
  expect(result.signals[0].recentMedian).toBe(40);
  expect(result.signals[0].direction).toBe('stable');
  expect(result.signals[0].anomalyDates).toEqual([engineDay]);
  expect(result).toMatchObject({
    state: 'insufficient_data',
    confidence: 'low',
    anomalies: ['hrv'],
  });
});
it('Polar adapter preserves exclusions, native intervals and local calendar; no PPI or daytime-HR reconstruction', () => {
  const store = emptyPolarStore();
  storePolarRows(store, 'sleep', [sleep]);
  storePolarRows(store, 'nightly', [nightly]);
  store.sleep[0].validityOverride = {
    status: 'excluded',
    reason: 'sensor_artifact',
    adjudicatedBy: 'user',
    adjudicatedAt: '2026-10-05T00:00:00Z',
  };
  const input = polarRecoveryEngineInput(
    store,
    emptyRegistry(),
    '2026-10-04T23:30:00Z',
    'Europe/Rome',
  );
  expect(input.asOfDate).toBe(engineDay);
  expect(input.metrics.some((m) => m.family === 'sleep')).toBe(false);
  expect(
    input.metrics.find((m) => m.name.startsWith('Nightly RRI'))?.orientation,
  ).toBe('descriptive');
  expect(
    polarRecoveryAssessment(
      store,
      emptyRegistry(),
      '2026-10-04T23:30:00Z',
      'Europe/Rome',
    ).state,
  ).toBe('insufficient_data');
});
it('local Gym evidence rejects sample/unconfirmed sessions and missing effort, fixes comparison protocol and avoids registry duplicates', () => {
  const history = syntheticGymHistory(2).history;
  history[0].dataOrigin = 'demo';
  let input = withLocalGymEvidence(
    engineFixture(),
    history,
    '2026-10-05T00:00:00Z',
  );
  expect(input.training.length).toBe(1);
  expect(input.metrics).toHaveLength(0);
  history[1].exercises[0].sets[0].rir = 1;
  expect(
    withLocalGymEvidence(engineFixture(), history, '2026-10-05T00:00:00Z')
      .metrics,
  ).toHaveLength(0);
  history[1].startedAt = '2026-09-06T10:00:00Z';
  input = withLocalGymEvidence(
    {
      ...engineFixture(),
      training: [
        {
          date: '2026-09-02',
          sport: 'strength',
          durationMinutes: 60,
          source: 'confirmed_activity',
          localWorkoutId: history[1].id,
        },
      ],
    },
    history,
    '2026-10-05T00:00:00Z',
  );
  expect(input.training.length).toBe(1);
  expect(input.metrics).toHaveLength(1);
  expect(input.metrics[0].context).toContain('same exercise/equipment/reps');
  expect(input.metrics[0].observations[0].value).toBe(50);
  expect(assessRecovery(input).state).toBe('insufficient_data');
});
