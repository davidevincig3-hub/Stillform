'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeading } from '@/components/assessment';
import { useWorkout } from '@/components/workout-provider';
import { routines } from '@/repositories/seed';
import { startWorkout } from '@/repositories/workout-storage';
export default function Gym() {
  const { store, save, ready } = useWorkout();
  const router = useRouter();
  const [selected, setSelected] = useState(routines[0].id);
  return (
    <>
      <PageHeading
        title="Train. Log. Learn."
        subtitle="Comparable performance matters. Heart rate is optional; duration is descriptive."
      />
      <div className="section-heading">
        <h2>Your routines</h2>
        <span className="caption">Seed routines · editable in future</span>
      </div>
      <div className="three-grid">
        {routines.map((r) => (
          <button
            key={r.id}
            className={`card routine ${selected === r.id ? 'selected' : ''}`}
            aria-pressed={selected === r.id}
            onClick={() => setSelected(r.id)}
          >
            <p className="eyebrow">{r.exercises.length} exercises</p>
            <h2>{r.name}</h2>
            <p className="muted">{r.focus}</p>
            <p className="caption">
              {r.exercises.map((e) => e.name).join(' · ')}
            </p>
          </button>
        ))}
      </div>
      <div className="start-workout">
        {store.active ? (
          <Link className="primary" href="/gym/workout">
            Return to {store.active.routineName} workout →
          </Link>
        ) : (
          <button
            className="primary"
            disabled={!ready}
            onClick={() => {
              const routine = routines.find((r) => r.id === selected)!;
              if (save({ ...store, active: startWorkout(routine) }))
                router.push('/gym/workout');
            }}
          >
            Start Workout →
          </button>
        )}
        <span className="caption">No prescribed weights · RIR by default</span>
      </div>
      <div className="section-heading">
        <h2>Performance perspective</h2>
        <span className="tag">Mock analytics</span>
      </div>
      <div className="two-grid">
        <section className="card">
          <p className="eyebrow">Chest press · last 4 comparable exposures</p>
          <h3>60 kg × 10 · 2 RIR</h3>
          <div className="exposure-bars">
            {[70, 80, 83, 90].map((v, i) => (
              <div key={i}>
                <span style={{ height: v }} />
                <small>#{i + 1}</small>
              </div>
            ))}
          </div>
          <p className="caption">
            Illustrative load / reps performance trend. Compare effort and
            execution before judging progress.
          </p>
          <details>
            <summary>Exercise analytics to follow</summary>
            <p className="muted">
              Load/reps trends, comparable sets, proximity to failure and
              optional estimated strength metrics.
            </p>
          </details>
        </section>
        <section className="card">
          <p className="eyebrow">Muscle-group perspective · sample week</p>
          <h3>Weekly exposure</h3>
          {[
            { name: 'Chest', sets: 10 },
            { name: 'Back', sets: 12 },
            { name: 'Quads', sets: 8 },
          ].map((m) => (
            <div className="muscle-row" key={m.name}>
              <span>{m.name}</span>
              <div style={{ width: `${m.sets * 5}%` }} />
              <strong>{m.sets} sets</strong>
            </div>
          ))}
          <p className="caption">
            Sample frequency: 2× / week. Near-failure distributions and local
            fatigue remain future analytics. No hypertrophy score.
          </p>
        </section>
      </div>
      <div className="section-heading">
        <h2>Your completed workouts</h2>
      </div>
      <section className="card">
        {store.history.length === 0 ? (
          <p className="muted">
            Finish a workout to see your locally saved session here.
          </p>
        ) : (
          store.history.map((s) => (
            <details key={s.id}>
              <summary>
                {s.routineName} · {new Date(s.startedAt).toLocaleDateString()} ·{' '}
                {s.exercises.reduce(
                  (n, e) => n + e.sets.filter((x) => x.completed).length,
                  0,
                )}{' '}
                completed sets
              </summary>
              {s.exercises.map((e) => (
                <div key={e.id}>
                  <h3>{e.name}</h3>
                  {e.sets
                    .filter((s) => s.completed)
                    .map((s) => (
                      <p className="caption" key={s.id}>
                        {s.weight === null ? 'Bodyweight' : `${s.weight} kg`} ×{' '}
                        {s.reps}
                        {s.rir !== null ? ` · ${s.rir} RIR` : ''}
                        {s.rpe !== null ? ` · ${s.rpe} RPE` : ''}
                        {s.failure ? ' · failure' : ''}
                      </p>
                    ))}
                </div>
              ))}
            </details>
          ))
        )}
      </section>
      <details className="card">
        <summary>Import historical Hevy data · future wizard</summary>
        <p className="muted">
          Preview CSV → map exercise names → merge synonyms → review duplicates
          → import → establish baselines. No external sync or import runs yet.
        </p>
      </details>
    </>
  );
}
