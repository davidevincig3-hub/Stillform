import { it, expect } from 'vitest';
import { syntheticGymHistory } from '../helpers/gym-history';
import {
  findExerciseHistory,
  findWorkoutHistory,
} from '../../src/analytics/gym-history';
it('searches/sorts actual exercise exposures without returning unused/demo references', () => {
  const s = syntheticGymHistory();
  expect(findExerciseHistory(s.exercises, s.history)).toHaveLength(127);
  expect(
    findExerciseHistory(s.exercises, s.history, 'exercise 126'),
  ).toHaveLength(1);
  expect(findExerciseHistory(s.exercises, s.history, '', 'name')[0].name).toBe(
    'Synthetic exercise 000',
  );
  const demo = { ...s.history[0], id: 'demo', dataOrigin: 'demo' as const };
  expect(findExerciseHistory(s.exercises, [demo])).toHaveLength(0);
});
it('filters completed history by title and inclusive browser-local dates', () => {
  const s = syntheticGymHistory();
  expect(findWorkoutHistory(s.history)[0].routineName).toBe(
    'Synthetic workout 029',
  );
  expect(findWorkoutHistory(s.history, 'workout 00')).toHaveLength(10);
  expect(
    findWorkoutHistory(s.history, '', 'Synthetic workout 005'),
  ).toHaveLength(1);
  expect(
    findWorkoutHistory(s.history, '', '', '2026-09-05', '2026-09-07'),
  ).toHaveLength(3);
});
