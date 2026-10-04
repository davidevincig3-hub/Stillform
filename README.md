# Stillform — Adaptive Training Coach

Mobile-first training and recovery application. **Gym logs and descriptive analytics
use real local data; other sections use labeled sample data.** No account, external
service or credentials required.

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
- Gym: create a routine or copy a structure-only template. Add exercises from the
  library, reorder them, choose default sets/optional reps and save.
- Create/edit custom exercises from the Exercise library.
- Start a saved routine, log weight/reps and optional effort, mark sets done.
- Leave/reload and return with the global pill; add/remove sets or exercises.
- Finish to save local history, or explicitly discard.
- Open workout details or exercise history. Start the same exercise again to see
  your actual previous completed sets. Without history, the logger says so.
- Export a full JSON backup or tabular CSV from the Gym backup section.
- Write a running goal and accept/reject the sample proposal on Plan.
- Open Coach on any page, including workouts. Replies are explicit placeholders.

## Storage and limitations

Workouts, goal and sample proposal choice persist in this browser's localStorage.
They are not synced or automatically backed up. Export JSON regularly; clearing
site storage removes local data. Concurrent edits in multiple tabs are unsupported;
use one active tab. Coach messages are memory-only.
Gym routines, workouts, previous performances and descriptive analytics are real
local data. Other main pages remain clearly labeled demos. Templates contain only
routine structure, never sample performances.

Gym storage uses `adaptive-coach.gym.v2` (version 2). V1 data is read from
`adaptive-coach.workouts.v1` without overwriting it. Old active workouts survive;
old completed sessions remain in a review archive until explicitly confirmed as
real. Sample `previous` text is discarded. The migrated version is saved on the
next successful edit. Unsupported/corrupt storage is preserved, with writes blocked.

JSON backup format `stillform-gym`, formatVersion 1, contains the full validated
version-2 store: exercise library, routines/structure, active workout, real history
and separately marked legacy archive. JSON restore is not enabled yet. CSV exports
all set rows from confirmed completed workouts, with completion flags, timestamps,
effort, notes and source. CSV is not a complete relational backup; names/notes are
quoted and spreadsheet formula prefixes escaped. Weights use kg.

Hevy CSV import uses a verified local parser, exercise mapping, duplicate review
and explicit batch confirmation. See the Hevy workflow below. No external APIs run.

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
- `src/domain/gym.ts` and `src/repositories/gym-storage.ts`
- `src/analytics/gym.ts` and `src/repositories/gym-export.ts`
- `supabase/migrations/0001_foundation.sql` and `0002_real_gym.sql`

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation)
and [Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
Versions are locked in `pnpm-lock.yaml`.

## Foundation verification (2026-10-04)

TypeScript, lint, formatting, production build and dependency peer checks pass.
Gym V1 Real verification: 22 unit tests and 12 Chromium browser tests pass; browser
scenarios were checked against both development and production builds, including
390px and 430px workout screens.
The original foundation tests are retained. Additional tests cover editable
routines, stable custom exercise identities, real-only queries, legacy migration,
snapshots, exports and rejection of invalid Hevy schemas. Browser scenarios cover the complete Gym
lifecycle, history/detail, previous performances, backups and 390px/430px mobile
workout screens alongside the five-page smoke checks. Screenshots are written
under ignored `test-results/`; tests use Chromium on an isolated server at port 3100.
To test a built production app in PowerShell: run `pnpm build`, then
`$env:PLAYWRIGHT_PRODUCTION='1'; pnpm test:smoke`. Clear that environment variable
to return to development-server tests.

SQL/RLS and real physiological calculations are not validated or enabled. ESLint
9 is required by the current Next lint plugin peer ranges and is upstream
unsupported; the tooling upgrade is recorded in `docs/DECISIONS.md`.

## Hevy CSV import

Gym → Backup, export & Hevy import → Select Hevy CSV. Verify the source timezone
(default Europe/Rome), review the summary and all warnings, then map every distinct
exercise name to an existing exercise or create a custom exercise. Suggestions are
never automatic merges. Multiple names may deliberately share an exercise identity.
The bulk custom action prepares separate identities; review their muscle metadata
before confirmation. Unassigned metadata is allowed and clearly reported.

Review possible duplicates, select Review import summary, check the review box,
and explicitly Confirm and import. Preview does not change browser storage. The
single validated batch write preserves active workouts, routines and existing history.
Quota/write failure leaves the previous store intact. Exact repeats skip existing
workouts; changed exports at an existing start time require a skip/separate decision.
Imported history powers Gym history/details, exercise exposures, previous performance
and descriptive sets/frequency. Other pages remain sample data.

The verified schema contains title, start_time, end_time, description, exercise_title,
superset_id, exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
duration_seconds and rpe. Italian month abbreviations gen–dic are supported.
CSV has no timezone offset: use the timezone where its local times were recorded.
Unknown/ambiguous/nonexistent timestamps and invalid fields block the entire import.
No RIR is inferred. RPE 10 is not failure unless set_type explicitly says failure.
Missing load stays unrecorded; zero load is valid. Timed/distance sets are preserved.

Store v2 schemaRevision=1 adds default-empty mapping rules/import batch summaries
and optional imported fields; older v2 and V1 data remain compatible. JSON and CSV
exports retain import provenance and source set context. Export a JSON backup first.
Source files belong only in ignored local-imports/; do not commit personal exports.
Tests use synthetic data. Optional local verification prints aggregate information
and builds an import plan only in memory:

```powershell
$env:VERIFY_LOCAL_HEVY='1'
pnpm exec vitest run tests/unit/hevy-reference.test.ts
Remove-Item Env:VERIFY_LOCAL_HEVY
```

Limits: 10 MB CSV files, one source timezone per file, no fuzzy auto-merge or source
workout IDs, no automatic replacement of changed historical exports, no row-level
skip, no JSON restore/batch undo/cloud sync. All mappings must resolve; source errors
must be corrected before reselecting. Identical timestamps/title/description group
one source workout. Repeated set indices split exercise blocks with a warning;
original source order and indices are retained. All completed set types contribute
to descriptive set totals, including warmups/timed sets; this is not a hypertrophy
estimate. Muscle metadata is snapshotted at import; later library edits do not
retroactively rewrite history. SQL remains unapplied.

Hevy milestone verification: 42 synthetic unit tests, 17 production Chromium browser
tests, TypeScript, lint, formatting and production build pass. The optional ignored
reference-file verification also passes independently. Browser coverage includes
390px/430px, a 4,000-row synthetic batch, explicit confirmation, duplicate reuse and
quota failure without partial mutation. Earlier foundation tests remain intact.
