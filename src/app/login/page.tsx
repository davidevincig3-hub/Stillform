'use client';
import { useState, type FormEvent } from 'react';
import { safeReturnPath } from '@/domain/return-path';
export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      if (!result.ok) {
        const body = await result.json();
        throw new Error(body.error || 'Sign-in failed');
      }
      const next = new URLSearchParams(location.search).get('next');
      location.assign(safeReturnPath(next));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in failed');
      setBusy(false);
    }
  }
  return (
    <section className="card mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Sign in to Stillform</h1>
      <p className="mt-2 muted">
        Use your existing account for shared Gym, Running and Recovery data.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-lg border border-line p-3"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-lg border border-line p-3"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className="button primary">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
