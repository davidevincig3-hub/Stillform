import { describe, it, expect } from 'vitest';
import {
  influentialMetrics,
  weakestConfidence,
  completedVolume,
} from '../../src/analytics/evidence';
import { recovery, routines, sampleChart } from '../../src/repositories/seed';
import {
  startWorkout,
  finishWorkout,
  parseStore,
  emptyStore,
  editWorkoutSet,
  toggleSetCompletion,
} from '../../src/repositories/workout-storage';
import { setSchema } from '../../src/domain/models';
import { decisionEngine } from '../../src/decision/engine';
describe('workout lifecycle', () => {
  it('requires valid set completion and clears completion after editing', () => {
    const session = startWorkout(routines[0]);
    const exercise = session.exercises[0];
    const set = exercise.sets[0];
    expect(() => toggleSetCompletion(session, exercise.id, set.id)).toThrow(
      'Enter valid reps',
    );
    const edited = editWorkoutSet(session, exercise.id, set.id, {
      reps: 12,
      rir: 2,
    });
    const logged = toggleSetCompletion(edited, exercise.id, set.id);
    expect(logged.exercises[0].sets[0].completed).toBe(true);
    expect(logged.exercises[0].sets[0].loggedAt).not.toBeNull();
    const changed = editWorkoutSet(logged, exercise.id, set.id, { reps: 13 });
    expect(changed.exercises[0].sets[0].completed).toBe(false);
    expect(changed.exercises[0].sets[0].loggedAt).toBeNull();
    expect(() =>
      parseStore(JSON.stringify({ ...emptyStore, history: [session] })),
    ).toThrow();
  });
  it('starts with blank loads, survives storage and finishes without losing history', () => {
    const active = startWorkout(routines[0]);
    expect(active.exercises[0].sets[0].weight).toBeNull();
    const set = active.exercises[0].sets[0];
    set.weight = 60;
    set.reps = 10;
    set.rir = 2;
    set.completed = true;
    const restored = parseStore(JSON.stringify({ ...emptyStore, active }));
    expect(restored.active?.id).toBe(active.id);
    const finished = finishWorkout(restored);
    expect(finished.active).toBeNull();
    expect(finished.history[0].status).toBe('completed');
    expect(completedVolume(finished.history[0].exercises[0].sets)).toBe(600);
  });
  it('rejects empty completion and invalid stored sets', () => {
    expect(() =>
      finishWorkout({ ...emptyStore, active: startWorkout(routines[0]) }),
    ).toThrow();
    expect(() => parseStore('{"version":9}')).toThrow();
    expect(
      setSchema.safeParse({
        ...startWorkout(routines[0]).exercises[0].sets[0],
        reps: -2,
      }).success,
    ).toBe(false);
  });
});
describe('sample chart honesty', () => {
  it('projects only a flat plan and marks insufficient confidence', () => {
    const chart = sampleChart('Planned easy duration', 28);
    expect(chart.isMock).toBe(true);
    expect(chart.baseline).toBeNull();
    expect(chart.confidence).toBe('insufficient');
    expect(chart.points[0].date).toBe('2026-10-05');
    expect(chart.points.every((p) => p.value === 55)).toBe(true);
    expect(() => sampleChart('VO2max', 7)).toThrow('Unknown sample metric');
  });
});
describe('evidence handling', () => {
  it('selects influential evidence dynamically without mutating the input', () => {
    const changed = [
      { ...recovery.evidence[2], influence: 9 },
      ...recovery.evidence.slice(0, 2),
    ];
    expect(influentialMetrics(changed)[0].metric).toBe('Sleep duration');
    expect(recovery.evidence[0].metric).toBe('HRV');
  });
  it('propagates weakest confidence and handles absent evidence', () => {
    expect(weakestConfidence(['high', 'low'])).toBe('low');
    expect(weakestConfidence([])).toBe('insufficient');
  });
  it('never fabricates decision candidates', async () => {
    const result = await decisionEngine.evaluate({
      session: {
        id: 'x',
        date: '2026-10-04',
        title: 'Run',
        type: 'running',
        purpose: 'Aerobic',
        status: 'planned',
      },
      recovery,
      trainingLoad: recovery,
      running: recovery,
      resistance: recovery,
      context: [],
      constraints: [],
    });
    expect(result.status).toBe('unavailable');
    expect(result.candidates).toEqual([]);
  });
});
