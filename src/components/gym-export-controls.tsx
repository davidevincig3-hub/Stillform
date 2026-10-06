'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { exportGymCsv, exportGymJson } from '@/repositories/gym-export';
import { HevyImportControls } from './hevy-import-controls';
import { GymBootstrap } from './gym-bootstrap';
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function GymExportControls() {
  const { store, ready, error, cloud, cloudClient } = useWorkout();
  const [message, setMessage] = useState('');
  return (
    <details className="card">
      <summary>Backup, export & Hevy import</summary>
      <p className="muted">
        JSON is the full versioned backup, including routines, library, active
        session and preserved legacy records. CSV is tabular confirmed workout
        history.
      </p>
      <div className="row start">
        <button
          className="secondary"
          disabled={!ready || Boolean(error)}
          onClick={async () => {
            try {
              const full = cloud.cache
                ? (await cloudClient.read({ scope: 'all' })).store!
                : store;
              download(
                exportGymJson(full),
                'stillform-gym-backup-v1.json',
                'application/json',
              );
              setMessage(
                'JSON backup exported. Keep a copy outside this browser.',
              );
            } catch {
              setMessage('Backup validation failed. Nothing exported.');
            }
          }}
        >
          Export JSON backup
        </button>
        <button
          className="secondary"
          disabled={!ready || Boolean(error)}
          onClick={async () => {
            try {
              const full = cloud.cache
                ? (await cloudClient.read({ scope: 'all' })).store!
                : store;
              download(
                exportGymCsv(full),
                'stillform-gym-history.csv',
                'text/csv;charset=utf-8',
              );
            } catch {
              setMessage('History export failed. Nothing exported.');
            }
          }}
        >
          Export CSV history
        </button>
      </div>
      <HevyImportControls />
      <GymBootstrap />
      <p role="status" className="caption">
        {message}
      </p>
    </details>
  );
}
