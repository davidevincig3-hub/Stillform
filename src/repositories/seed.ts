import type {
  Assessment,
  ChartContext,
  PlannedSession,
  Routine,
} from '../domain/models';
export const recovery: Assessment = {
  state: 'Slightly below baseline',
  confidence: 'medium',
  explanation:
    'Sample assessment: HRV and night heart rate suggest a modest recovery dip; evidence is not strong enough to justify a major training change.',
  isMock: true,
  evidence: [
    {
      family: 'autonomic',
      metric: 'HRV',
      displayValue: '−12% vs baseline',
      influence: 3,
      confidence: 'medium',
      references: ['sample-hrv'],
    },
    {
      family: 'autonomic',
      metric: 'Night HR',
      displayValue: '+4 bpm',
      influence: 2,
      confidence: 'high',
      references: ['sample-hr'],
    },
    {
      family: 'sleep',
      metric: 'Sleep duration',
      displayValue: '−52 min',
      influence: 1,
      confidence: 'medium',
      references: ['sample-sleep'],
    },
  ],
};
export const running: Assessment = {
  state: 'Aerobic trend improving',
  confidence: 'medium',
  explanation:
    'Sample interpretation: comparable easy runs show a steadier pace at similar heart rate. Terrain and weather still limit the comparison.',
  isMock: true,
  evidence: [
    {
      family: 'performance',
      metric: 'Comparable pace',
      displayValue: '5:48 /km · 142 bpm',
      influence: 3,
      confidence: 'medium',
      references: ['sample-run'],
    },
    {
      family: 'performance',
      metric: 'Cardiac drift',
      displayValue: '3.2% · sample',
      influence: 2,
      confidence: 'medium',
      references: ['sample-drift'],
    },
    {
      family: 'training-stress',
      metric: 'Weekly distance',
      displayValue: '24.6 km',
      influence: 1,
      confidence: 'high',
      references: ['sample-load'],
    },
  ],
};
export const routines: Routine[] = [
  {
    id: 'push',
    name: 'Push',
    focus: 'Chest · shoulders · triceps',
    exercises: [
      {
        name: 'Chest press',
        muscleGroup: 'Chest',
        previous: '60 kg × 10 · 2 RIR',
        setCount: 3,
      },
      {
        name: 'Shoulder press',
        muscleGroup: 'Shoulders',
        previous: '24 kg × 10 · 2 RIR',
        setCount: 3,
      },
      {
        name: 'Triceps extension',
        muscleGroup: 'Triceps',
        previous: '20 kg × 12 · 1 RIR',
        setCount: 2,
      },
    ],
  },
  {
    id: 'pull',
    name: 'Pull',
    focus: 'Back · rear delts · biceps',
    exercises: [
      {
        name: 'Lat pulldown',
        muscleGroup: 'Back',
        previous: '55 kg × 10 · 2 RIR',
        setCount: 3,
      },
      {
        name: 'Cable row',
        muscleGroup: 'Back',
        previous: '50 kg × 12 · 2 RIR',
        setCount: 3,
      },
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    focus: 'Quads · hamstrings · calves',
    exercises: [
      {
        name: 'Leg press',
        muscleGroup: 'Quads',
        previous: '120 kg × 10 · 2 RIR',
        setCount: 3,
      },
      {
        name: 'Leg curl',
        muscleGroup: 'Hamstrings',
        previous: '35 kg × 12 · 1 RIR',
        setCount: 3,
      },
    ],
  },
];
export const plan: PlannedSession[] = [
  {
    id: 'mon',
    date: '2026-10-05',
    title: 'Push',
    type: 'strength',
    purpose: 'Hypertrophy',
    status: 'planned',
  },
  {
    id: 'tue',
    date: '2026-10-06',
    title: 'Easy run · 55 min',
    type: 'running',
    purpose: 'Aerobic efficiency',
    status: 'planned',
  },
  {
    id: 'wed',
    date: '2026-10-07',
    title: 'Pull',
    type: 'strength',
    purpose: 'Hypertrophy',
    status: 'planned',
  },
  {
    id: 'thu',
    date: '2026-10-08',
    title: '4 × 4 intervals',
    type: 'running',
    purpose: 'High-intensity performance',
    status: 'adjusted',
  },
  {
    id: 'fri',
    date: '2026-10-09',
    title: 'Legs',
    type: 'strength',
    purpose: 'Hypertrophy',
    status: 'planned',
  },
  {
    id: 'sat',
    date: '2026-10-10',
    title: 'Easy run · 45 min',
    type: 'running',
    purpose: 'Easy volume',
    status: 'planned',
  },
  {
    id: 'sun',
    date: '2026-10-11',
    title: 'Rest / optional walk',
    type: 'other',
    purpose: 'Recovery',
    status: 'planned',
  },
];
export const runHistory = [
  {
    id: 'run-1',
    date: 'Oct 3',
    title: 'Easy aerobic run',
    distance: '8.4 km',
    duration: '49 min',
    pace: '5:50 /km',
    hr: '142 bpm',
  },
  {
    id: 'run-2',
    date: 'Oct 1',
    title: 'Norwegian 4 × 4',
    distance: '7.8 km',
    duration: '46 min',
    pace: 'Intervals: 4:42 /km',
    hr: '172 bpm interval avg',
  },
  {
    id: 'run-3',
    date: 'Sep 29',
    title: 'Easy aerobic run',
    distance: '8.4 km',
    duration: '51 min',
    pace: '6:04 /km',
    hr: '141 bpm',
  },
];
export const initialGoal =
  'Improve aerobic efficiency and run faster at the same heart rate without compromising hypertrophy training.';
const metricSettings: Record<
  string,
  { unit: string; base: number; swing: number }
> = {
  HRV: { unit: 'ms', base: 62, swing: 8 },
  'Night HR': { unit: 'bpm', base: 49, swing: 4 },
  'Sleep duration': { unit: 'hours', base: 7.7, swing: 0.8 },
  'Respiratory rate': { unit: '/min', base: 14.4, swing: 0.5 },
  'Comparable easy pace': { unit: 'min/km', base: 6.05, swing: 0.15 },
  'Running minutes': { unit: 'min/week', base: 145, swing: 18 },
  'Planned easy duration': { unit: 'min', base: 55, swing: 0 },
};
export function sampleChart(metric: string, days: number): ChartContext {
  const setting = metricSettings[metric];
  if (!setting) throw new Error(`Unknown sample metric: ${metric}`);
  const projected = metric === 'Planned easy duration';
  return {
    metric,
    unit: setting.unit,
    timeframeDays: days,
    points: Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, projected ? 5 + i : 4 - days + 1 + i))
        .toISOString()
        .slice(0, 10),
      value: Number(
        (
          setting.base +
          Math.sin(i * 0.72) * setting.swing +
          Math.cos(i * 0.3) * setting.swing * 0.3
        ).toFixed(2),
      ),
    })),
    baseline: projected
      ? null
      : {
          metric,
          value: setting.base,
          unit: setting.unit,
          observations: 42,
          start: '2026-08-24',
          end: '2026-10-04',
          maturity: 'developing',
          confidence: 'medium',
        },
    confidence: projected ? 'insufficient' : 'medium',
    calculationVersion: 'sample-v1',
    isMock: true,
  };
}
