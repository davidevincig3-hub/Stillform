import { training } from './polar';
export function syntheticPolarDetail() {
  return {
    ...training('synthetic-detail'),
    name: '',
    durationMillis: 2100000,
    distanceMeters: 5000,
    exercises: [
      {
        identifier: { id: 'synthetic-exercise' },
        ascentMeters: 26.7,
        runningIndex: 38,
        laps: {
          laps: [
            { durationMillis: 900000, distanceMeters: 2100 },
            { durationMillis: 1200000, distanceMeters: 2900 },
          ],
          autoLaps: Array.from({ length: 5 }, () => ({
            durationMillis: 420000,
            distanceMeters: 1000,
          })),
        },
        samples: {
          samples: ['HEART_RATE', 'ALTITUDE', 'DISTANCE', 'SPEED', 'CADENCE']
            .map((type) => ({
              type,
              intervalMillis: 1000,
              values: Array.from({ length: 2100 }, (_, i) =>
                type === 'HEART_RATE' ? 150 + (i % 10) : i % 20,
              ),
            }))
            .concat([
              { type: 'TEMPERATURE', intervalMillis: 1000, values: [] },
            ]),
        },
      },
    ],
  };
}
