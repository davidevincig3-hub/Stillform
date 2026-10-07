import { syntheticGymHistory } from './gym-history';
import { gymStoreSchema } from '../../src/repositories/gym-storage';
export function performanceHistory(count = 4) {
  const store = syntheticGymHistory(count);
  const template = store.history[0].exercises[0];
  store.exercises = [{ ...store.exercises[0], equipment: 'Machine' }];
  store.history.forEach((workout, i) => {
    workout.exercises = [
      {
        ...structuredClone(template),
        id: `block-${i}`,
        equipment: 'Machine',
        sets: [
          { ...template.sets[0], id: `set-${i}`, weight: 50 + 5 * i, rir: 1 },
        ],
      },
    ];
  });
  return gymStoreSchema.parse(store);
}
