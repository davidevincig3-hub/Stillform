'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { exportGymCsv, exportGymJson } from '@/repositories/gym-export';
import { previewHevyImport } from '@/integrations/hevy-import';
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function GymExportControls() {
  const { store, ready, error } = useWorkout();
  const [message, setMessage] = useState('');
  return (
    <details className="card">
      <summary>Backup, export & Hevy import preparation</summary>
      <p className="muted">
        JSON is the full versioned backup, including routines, library, active
        session and preserved legacy records. CSV is tabular confirmed workout
        history.
      </p>
      <div className="row start">
        <button
          className="secondary"
          disabled={!ready || Boolean(error)}
          onClick={() => {
            try {
              download(
                exportGymJson(store),
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
          onClick={() =>
            download(
              exportGymCsv(store),
              'stillform-gym-history.csv',
              'text/csv;charset=utf-8',
            )
          }
        >
          Export CSV history
        </button>
      </div>
      <p className="caption">
        Hevy: Select → Parse → Preview → Map names / resolve duplicates →
        Confirm → Import.
      </p>
      <label htmlFor="hevy-file">
        Inspect a Hevy CSV file · parser not yet available
      </label>
      <input
        id="hevy-file"
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5_000_000) {
            setMessage('File exceeds the 5 MB preview limit.');
            return;
          }
          try {
            const preview = previewHevyImport(await file.text());
            setMessage(`${file.name}: ${preview.warnings.join(' ')}`);
          } catch {
            setMessage('File could not be read. Nothing imported.');
          }
        }}
      />
      <p role="status" className="caption">
        {message ||
          'Import confirmation and JSON restore are not enabled in this version.'}
      </p>
    </details>
  );
}
