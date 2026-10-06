'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { gymMigrationCounts, encodeGym } from '@/repositories/gym-cloud-codec';
import type { GymStore } from '@/repositories/gym-storage';
export function GymCloudControls() {
  const { cloud, cloudClient, localStore, localError } = useWorkout();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState('');
  const [approvedOwner, setApprovedOwner] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    store: GymStore;
    base: string;
  } | null>(null);
  async function login() {
    setError('');
    try {
      const response = await fetch('/api/gym', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const result = await response.json();
      setPassword('');
      if (!response.ok) throw new Error(result.error || 'Sign-in failed');
      await cloudClient.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    }
  }
  function showPreview() {
    try {
      if (localError) throw new Error(localError);
      encodeGym(localStore);
      setPreview({
        store: structuredClone(localStore),
        base: JSON.stringify(localStore),
      });
      setApprovedOwner(null);
      setError('');
    } catch {
      setError(
        'Local dataset failed validation. Bootstrap blocked; original data retained.',
      );
    }
  }
  const counts = preview ? gymMigrationCounts(preview.store) : null;
  return (
    <section className="card" aria-label="Account Gym persistence">
      <details>
        <summary>
          Account Gym · {cloud.cache ? cloud.status : 'browser-local'}
          {cloud.cache ? ` · revision ${cloud.cache.revision}` : ''}
        </summary>
        <p>
          {cloud.cache
            ? 'Account history is authoritative. Pending edits are retained in this browser until accepted by the server.'
            : 'Your desktop local store is preserved. Preview before uploading it to your account. Other devices load the same account after sign-in.'}
        </p>
        {cloud.error && <p role="alert">{cloud.error}</p>}
        {error && <p role="alert">{error}</p>}
        {cloud.snapshot && (
          <p>
            Account owner: {cloud.snapshot.owner} · revision{' '}
            {cloud.snapshot.revision}
          </p>
        )}
        {(!cloud.cache || cloud.status === 'error') && (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button onClick={() => void login()}>Sign in to account Gym</button>
          </>
        )}
        <button onClick={() => void cloudClient.connect()}>
          Check / reload account
        </button>
        {!cloud.cache && (
          <button onClick={showPreview}>Preview desktop migration</button>
        )}
        {counts && (
          <div aria-label="Gym migration preview">
            <p>
              Desktop backup{' '}
              {preview?.base === JSON.stringify(localStore)
                ? 'unchanged since preview'
                : 'changed; review required'}
              .
            </p>
            <p>
              Local validation passed. No duplicate IDs or source fingerprints.
              No data will be uploaded by this preview.
            </p>
            <ul>
              {Object.entries(counts).map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
            </ul>
            <p>
              Cloud:{' '}
              {cloud.snapshot
                ? cloud.snapshot.initialized
                  ? `already initialized at revision ${cloud.snapshot.revision}; bootstrap blocked`
                  : 'verified empty account; no existing rows will be overwritten'
                : 'not verified; bootstrap blocked until account/schema check succeeds'}
              .
            </p>
            <p>
              Writes: the listed entity rows, an account revision and one
              idempotency receipt. IDs, snapshots, Hevy fingerprints and
              provenance are preserved. Local data remains unchanged.
            </p>
            {cloud.snapshot && !cloud.snapshot.initialized && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={approvedOwner === cloud.snapshot.owner}
                    onChange={(e) =>
                      setApprovedOwner(
                        e.target.checked ? cloud.snapshot!.owner : null,
                      )
                    }
                  />
                  I approve uploading this desktop dataset to this empty
                  account.
                </label>
                <button
                  disabled={
                    approvedOwner !== cloud.snapshot.owner ||
                    !preview ||
                    preview.base !== JSON.stringify(localStore)
                  }
                  onClick={() => {
                    try {
                      if (
                        !preview ||
                        preview.base !== JSON.stringify(localStore)
                      )
                        throw new Error(
                          'Desktop data changed after preview. Review the migration again.',
                        );
                      cloudClient.bootstrap(preview.store);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Bootstrap blocked',
                      );
                    }
                  }}
                >
                  Confirm account bootstrap
                </button>
              </>
            )}
          </div>
        )}
        {cloud.cache && cloud.status === 'error' && (
          <button onClick={() => void cloudClient.connect()}>
            Retry pending save
          </button>
        )}
        {cloud.status === 'conflict' && (
          <>
            <p>
              Edits are blocked. The newer cloud revision will load; this
              rejected draft stays in a local recovery backup.
            </p>
            <button
              onClick={() =>
                void cloudClient
                  .useCloudAfterConflict()
                  .catch((e) => setError(e.message))
              }
            >
              Keep draft backup and reload cloud
            </button>
          </>
        )}
      </details>
      {cloud.cache && (
        <p role="status">
          Account Gym: {cloud.status}
          {cloud.status === 'pending' || cloud.status === 'error'
            ? ' · unsynced draft retained on this device'
            : ''}
        </p>
      )}
    </section>
  );
}
