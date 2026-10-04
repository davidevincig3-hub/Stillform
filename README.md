# Stillform — Adaptive Training Coach

Mobile-first training and recovery application foundation. **Demo analytics, not
physiological advice.** No account, external service or credentials required.

## Run locally

Install Node.js 24 LTS and pnpm 11, then run from this directory:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. No `.env` is required. `.env.example` documents future
Supabase configuration; adding keys does not enable the backend yet.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm start
```

Browser checks automatically start a development server:

```sh
pnpm exec playwright install chromium
pnpm test:smoke
```

## Try it

- Browse five pages; toggle dark mode in the header.
- Change chart ranges; Analyze exposes structured chart context.
- Select a gym routine, log weight/reps and optional effort, mark sets done.
- Leave/reload and return with the global pill; add/remove sets or exercises.
- Finish to save local history, or explicitly discard.
- Write a running goal and accept/reject the sample proposal on Plan.
- Open Coach on any page, including workouts. Replies are explicit placeholders.

## Storage and limitations

Workouts, goal and sample proposal choice persist in this browser's localStorage.
They are not synced or backed up. Clearing site storage removes them. Concurrent
tabs are not supported; use one active tab. Coach messages are memory-only.
Sample previous performances do not yet update from real logged history.

The PWA has a manifest, icons and static offline fallback; install through your
browser's install menu on localhost or HTTPS. Full offline editing is deferred.
Saved workout data survives offline, but reopening the app requires the server.
Supabase SQL is an unapplied foundation draft and needs database/RLS testing.

## Read first

- [Product spec](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
- `src/repositories/workout-storage.ts`
- `supabase/migrations/0001_foundation.sql`

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation)
and [Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
Versions are locked in `pnpm-lock.yaml`.

## Foundation verification (2026-10-04)

TypeScript, lint, formatting, production build and dependency peer checks pass.
Seven unit tests cover workout lifecycle/validation, confidence/evidence helpers
and honest sample trajectories. Five browser tests cover all pages, persistence,
set editing, navigation/back, completion/discard, goals, dark mode, coach, chart
context, mobile overflow and PWA assets. Screenshots are written under ignored
`test-results/`; the test suite runs in Chromium.

SQL/RLS and real physiological calculations are not validated or enabled. ESLint
9 is required by the current Next lint plugin peer ranges and is upstream
unsupported; the tooling upgrade is recorded in `docs/DECISIONS.md`.
