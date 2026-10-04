# Stillform — Adaptive Training Coach

Mobile-first training and recovery application. **Gym logs and descriptive analytics
use real local data; Strava can provide real activity/run history after secure setup.** No account, external
service or credentials required for local Gym and sample dashboards.

## Run locally

Install Node.js 24 LTS and pnpm 11, then run from this directory:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. No `.env` is required. `.env.example` documents optional secure Strava/Supabase setup below.

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
local data. Recovery/Home/Plan and analytical Running cards remain labeled demos; Running history uses real canonical records. Templates contain only
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
and explicit batch confirmation. See the Hevy workflow below. Strava API calls require configuration and explicit connection/sync.

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

Store v2 schemaRevision=2 includes default-empty mapping rules/import batch summaries
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

## Real Strava integration setup

Gym works without configuration. Strava requires authenticated **server** persistence;
Supabase is the intended production backend. The SQL below has been prepared, not
applied or verified against your database. This milestone does not move browser-local
Gym data to Supabase. Export a Gym JSON backup regularly and keep the existing browser
and origin for your imported history.

1. Create/select a Supabase project. Review and apply `supabase/migrations/0001_foundation.sql`
   through `0004_secure_integrations.sql` in numerical order through your normal migration
   workflow (only pending migrations). Do not rerun already-applied foundation files.
   Migration 0004 creates separate integration tables; it does not alter existing Gym data.
2. Create a Supabase Auth user for yourself in its dashboard. The Integrations page
   signs in that account by email/password; it does not create accounts automatically.
3. Register an application in Strava API settings. Configure its authorization callback
   domain for your chosen host (localhost for local use). The exact redirect is
   `http://localhost:3000/api/integrations/callback`; use the equivalent HTTPS URL when deployed.
4. Copy `.env.example` to ignored `.env.local` and fill these **locally**, never in chat:

   | Name                         | Value to supply locally                                     |
   | ---------------------------- | ----------------------------------------------------------- |
   | `APP_ORIGIN`                 | `http://localhost:3000`, or the exact deployed HTTPS origin |
   | `INTEGRATION_STORAGE`        | `supabase`                                                  |
   | `INTEGRATION_ENCRYPTION_KEY` | Random 32-byte key encoded as exactly 64 hex characters     |
   | `STRAVA_CLIENT_ID`           | Your Strava application ID                                  |
   | `STRAVA_CLIENT_SECRET`       | Your Strava application secret                              |
   | `SUPABASE_URL`               | Project HTTPS URL                                           |
   | `SUPABASE_PUBLISHABLE_KEY`   | Project publishable key, used server-side for Auth          |
   | `SUPABASE_SERVICE_ROLE_KEY`  | Project service-role key, server-only                       |

   Generate the encryption key on your own machine with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Save it in your local secret manager/environment and keep a protected backup.
   Changing it without re-encrypting stored envelopes prevents their decryption.
   No variable above uses `NEXT_PUBLIC_`. Restart the server after changes.

5. Run `pnpm dev` (or `pnpm build` then `pnpm start`). From Gym choose **All activities
   & Strava**, then **Connect / manage Strava**. Sign in to secure integrations, click
   **Connect with Strava**, grant the read scopes, and return to the app.
6. Click **Start / Continue sync**. This is an explicit action: no history is imported
   at connection time. Each click processes at most five pages of 50, with pauses.
   Continue until caught up; a saved cursor resumes an interrupted backfill. Rate pauses
   show the earliest retry time. **Full backfill again** deliberately rechecks all pages
   without duplicating source identities.
7. Inspect Activity registry and possible-match reviews. Link only the correct candidate
   or keep separate. Running shows real run history; its analytical cards remain samples.
   Open a real activity and optionally **Fetch real detail, streams & laps**.
8. **Disconnect Strava** requires confirmation, revokes access and removes stored Strava
   credentials while retaining canonical/source history and all local Gym data. Reconnect
   through the same flow. **Sign out of integrations** ends the app session only.

The requested read scopes are `activity:read_all` (including Only Me history) and
`activity:read` (documented webhook scope); no write scopes are requested. OAuth state
is random, owner-bound, expires in ten minutes and is consumed from an HttpOnly cookie.
Supabase Auth session envelopes are encrypted HttpOnly/SameSite cookies; Strava tokens
stay in the server repository as AES-256-GCM envelopes. POSTs verify the exact origin.
API routes validate owner identity server-side; integration tables/RPCs have no browser
or authenticated-table grants. Service-role credentials never enter client bundles.

Optional `STRAVA_API_BASE_URL` defaults to `https://www.strava.com/api/v3`, the October
2026 host. The announced `https://api-v3.strava.com` is selectable for the January 4,
2027 migration. Endpoints live in one config file. The current revoke endpoint is
`https://www.strava.com/oauth/revoke`, with client authentication and refresh token.
Official references: [OAuth](https://developers.strava.com/docs/authentication/),
[changelog](https://developers.strava.com/docs/changelog/),
[rate limits](https://developers.strava.com/docs/rate-limits/),
[webhooks](https://developers.strava.com/docs/webhooks/).

### Optional local-only persistence

For deliberate single-user development **only**, set `INTEGRATION_STORAGE=dev-file`,
`DEV_INTEGRATION_ACCESS_KEY` to an independently generated random key of at least
32 characters, and the same encryption/Strava/origin variables. Supabase variables
are unnecessary in this mode. Run **pnpm dev**; production refuses this mode.
Sign in with the development key. Server files under ignored `.integration-dev/`
are encrypted and atomically replaced; a file lease serializes operations. Keep the
workspace on a private drive with appropriate OS permissions (Windows inherits folder
ACLs). Never deploy or sync this folder. It is not a production authentication/storage
system. Both backends implement the same repository contract; no browser-token fallback.

### Webhooks after intentional deployment

No localhost subscription is created automatically. With a publicly reachable HTTPS
callback, configure a random `STRAVA_WEBHOOK_VERIFY_TOKEN`, intentionally create a Strava
subscription targeting `/api/strava/webhook`, then save its ID as
`STRAVA_WEBHOOK_SUBSCRIPTION_ID`. GET responds to the documented challenge. POST validates
shape, configured subscription and known athlete, then persists a deduplicated queue job
without calling Strava. Strava does not provide a signed payload in this protocol;
processing verifies current activity/authorization against the API before deletion.
The UI processes one queued job per explicit click. A deployed scheduler/worker with
proper operational access is a next step; this milestone does not install one or poll
frequently. Rate/backoff state persists. Queue failures return 503 so delivery can retry.

### Registry and current limits

Canonical activities have provider-independent IDs, sport, UTC/local timing, nullable
recorded values, quality/missingness, field provenance, source keys and optional Gym
links. Source records preserve provider type/ID, fingerprint, raw values and revisions.
Selected fields retain their existing provider; additional sources fill absent values.
Future Polar precedence can be added without overwriting source records; Polar is not
implemented. Matching uses sport + start + elapsed duration + distance, never title alone.
A unique high heuristic match can auto-link across providers. Same-provider distinct
IDs, weak/multiple matches require review. Decisions persist; canonical ID aliases
preserve links after merging. Pending reviews are excluded from confirmed-session queries.

Gym/Hevy remains authoritative for exercises/sets/load/reps/effort. An explicit sync
sends only confirmed Gym matching summaries (IDs, title, timestamps, duration, provenance),
not sets or routines. Matched strength becomes one canonical session with a Gym reference;
unmatched Strava strength stays a shell. Local Gym totals are not changed by sync.
Later-arriving Gym summaries trigger review. Deleting/changing a local Gym session does
not currently reconcile an already published registry reference; use the original browser
for those links. Account identity is enforced in the server registry; local Gym storage
is still browser-scoped and must only be linked to your own integration account.

Rich detail is fetched only on request, at most detail + streams + running laps (three
API calls, plus possible token refresh). Full stream arrays stay server-side; browser
views receive stream status and lap summaries. Missing HR/GPS/laps are valid. No drift,
efficiency, threshold, VO2, load score, Recovery or Coach calculation is inferred.
History lists paginate in the UI; registry JSON and source revision arrays currently
load per owner and will need normalized/indexed storage for very large histories.
Supabase migrations, live OAuth, live rate budgets and webhook delivery require real
configuration and deployment testing. This milestone's tests are synthetic; no personal
history or credentials were used. The opt-in personal Hevy reference test stays skipped.

Production browser verification: `pnpm build`, then
`PLAYWRIGHT_PRODUCTION=1 pnpm test:smoke` (PowerShell:
`$env:PLAYWRIGHT_PRODUCTION='1'; pnpm test:smoke`). It starts an isolated server on 3100;
your normal browser storage is untouched. Browser bundle checks reject server secret
configuration names. Deployment tracing excludes personal imports, environment files and
development credential files.
