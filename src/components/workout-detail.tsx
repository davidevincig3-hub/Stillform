'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { realHistory, formatSet } from '@/analytics/gym';
import { PageHeading } from './assessment';
export function WorkoutDetail({ id }: { id: string }) {
  const { store, ready, save } = useWorkout();
  const [remove, setRemove] = useState(false);
  const router = useRouter();
  if (!ready) return <p>Loading workout…</p>;
  const w = realHistory(store.history).find((w) => w.id === id);
  if (!w)
    return (
      <section className="card">
        <h1>Workout not found</h1>
        <Link href="/gym">Back to Gym</Link>
      </section>
    );
  return (
    <>
      <Link href="/gym" className="text-button">
        ← Gym history
      </Link>
      <PageHeading
        title={w.routineName}
        subtitle={`${new Date(w.startedAt).toLocaleString()} · Real local workout`}
      />
      <section className="card">
        <h3>
          {w.durationMinutes === null
            ? 'Duration unavailable'
            : `${Math.round(w.durationMinutes)} min`}{' '}
          · descriptive duration
        </h3>
        <p className="caption">
          Start: {new Date(w.startedAt).toLocaleString()} · Finish:{' '}
          {w.endedAt
            ? new Date(w.endedAt).toLocaleString()
            : 'Unknown in V1 record'}
        </p>
        <p className="caption">
          Source: {w.provenance.source} · No heart rate required
        </p>
        {w.notes && <p>{w.notes}</p>}
      </section>
      {w.exercises.map((e, index) => (
        <section key={e.id} className="card">
          <Link href={`/gym/exercises/${encodeURIComponent(e.exerciseId)}`}>
            <h2>
              {index + 1}. {e.name} →
            </h2>
          </Link>
          <p className="caption">
            {e.primaryMuscleGroup} · {e.notes}
          </p>
          {e.sets.map((s, i) => (
            <p className="detail-set" key={s.id}>
              <span>
                {i + 1}. {formatSet(s)}
              </span>
              <span className="tag">
                {s.completed ? 'Completed' : 'Not completed'}
              </span>
            </p>
          ))}
        </section>
      ))}
      <button className="secondary danger" onClick={() => setRemove(true)}>
        Delete workout
      </button>
      {remove && (
        <section className="notice">
          <p>
            Delete this completed workout? Its sets will also be removed from
            personal analytics. Export a backup first if needed.
          </p>
          <div className="row start">
            <button className="secondary" onClick={() => setRemove(false)}>
              Keep workout
            </button>
            <button
              className="secondary danger"
              onClick={() => {
                if (
                  save({
                    ...store,
                    history: store.history.filter((s) => s.id !== id),
                  })
                )
                  router.push('/gym');
              }}
            >
              Confirm delete workout
            </button>
          </div>
        </section>
      )}
    </>
  );
}
