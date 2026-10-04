export const sports = [
  { id: { id: 1 }, name: 'RUNNING' },
  { id: { id: 2 }, name: 'STRENGTH_TRAINING' },
];
export function training(id = 'session-1', strength = false) {
  return {
    identifier: { id },
    name: 'Synthetic Polar session',
    startTime: '2026-10-01T10:00:00',
    timezoneOffsetMinutes: 120,
    durationMillis: 3600000,
    distanceMeters: strength ? 0 : 10000,
    sport: { id: strength ? '2' : '1' },
    exercises: [],
  };
}
export const sleep = {
  sleepDate: '2026-10-01',
  sleepResult: {
    hypnogram: {
      sleepStart: '2026-09-30T23:00:00+02:00',
      sleepEnd: '2026-10-01T07:00:00+02:00',
      deviceReference: { uuid: 'synthetic-device' },
      batteryRanOut: false,
    },
  },
  sleepEvaluation: {
    asleepDuration: '27000s',
    sleepSpan: '28800s',
    analysis: { continuityIndex: 3.5, efficiencyPercent: 93.75 },
    interruptions: { totalDuration: '1800s', totalCount: 2 },
    phaseDurations: { rem: '5000s', deep: '4000s', light: '18000s' },
  },
  sleepScore: { sleepScore: 80 },
};
export const nightly = {
  sleepResultDate: '2026-10-01',
  meanNightlyRecoveryRmssd: 42,
  meanNightlyRecoveryRri: 1000,
  meanNightlyRecoveryRespirationInterval: 4000,
  meanBaselineRmssd: 40,
  ansStatus: 1,
};
export const continuous = {
  date: '2026-10-01',
  deviceRef: { deviceId: 'synthetic-device' },
  samples: [{ offsetMillis: 3600000, heartRate: 70, triggerType: 1 }],
};
export const ppi = {
  date: '2026-10-01',
  ppiSamplesPerDevice: [
    {
      recordingDevice: { uuid: 'synthetic-device' },
      ppiSamples: [
        {
          offsetMillis: 1000,
          ppInterval: 900,
          errorEstimateMillis: 10,
          skinContact: true,
          movement: false,
          offline: false,
        },
      ],
      recordingTriggerTypeChanges: [{ offsetMillis: 0, triggerType: 1 }],
    },
  ],
};
