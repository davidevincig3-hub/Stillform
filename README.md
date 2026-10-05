# Stillform — Adaptive Training Coach

Mobile-first training and recovery application. **Gym logs and descriptive analytics
use real local data; Polar v4 can provide real training and Recovery source history after secure setup. Strava remains supported but dormant.** No account, external
service or credentials required for local Gym and sample dashboards.

## Run locally

Recovery provider history has explicit **Exclude from recovery / Restore** controls.
User adjudications (including `sensor_artifact`) live separately from immutable Polar
payloads and survive resync. Real Recovery shows eligible/valid and excluded counts;
excluded records stay inspectable but never enter its charts, baselines or maturity
counts. Recovery Engine V1 and Home use the same shared eligibility boundary and
statistical assessment. State is separate from evidence confidence; no score is generated.

Recovery Engine V1 uses a previous 28-day personal median/MAD baseline, separated
from a three-day recent trend. Distinct valid dates, temporal span and coverage
control maturity. The 7/14/28-day and deviation/convergence rules are **product
heuristics, not scientific physiological thresholds**. A single family cannot
determine an integrated recovery state. Insufficient data is a complete, valid output.
Home and Recovery share the server input and pure engine through one client hook;
confirmed local Gym comparisons require identical first-set exercise/equipment,
reps and recorded effort and remain local (no upload). Logged duration, set count
and exposure are descriptive, not a unified load score. PPI HRV, missing night HR,
running drift, context/AI interpretation and automatic plan changes remain unavailable.

Polar activity detail separates manual/automatic laps and displays persisted interval
sample availability. Existing detail is corrected on read without rehydration or raw
payload changes. Duration/elapsed pace use clock notation; SPEED/DISTANCE sample units
remain unverified under the current v4 contract, so no sample conversion or drift
analytics is performed. Empty Polar names display sport and original local date.

Install Node.js 24 LTS and pnpm 11, then run from this directory:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. No `.env` is required. `.env.example` documents optional secure Polar/Strava/Supabase setup below.

For a phone on the same trusted private LAN, run `pnpm lan:url`, stop the existing
server and run `pnpm dev:lan`. Open the printed `http://<private-ip>:3000/gym`.
`pnpm dev` binds only localhost; LAN exposure is explicit. See
[mobile Gym setup](docs/MOBILE_GYM.md) for Windows firewall steps, JSON bootstrap
into an empty phone browser, per-origin storage and secure-context limitations.
Gym offers a real-history shortlist since 2026-09-01 with pins/dismissals and
exposure/set counts. Incremental Hevy exports skip unchanged fingerprints;
edited existing sessions require review, never silent merging.

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
local data. Home recovery and Recovery use the real engine when configured; Plan and analytical Running cards remain labeled demos. Running history uses real canonical records. Templates contain only
routine structure, never sample performances.

Gym storage uses `adaptive-coach.gym.v2` (version 2). V1 data is read from
`adaptive-coach.workouts.v1` without overwriting it. Old active workouts survive;
old completed sessions remain in a review archive until explicitly confirmed as
real. Sample `previous` text is discarded. The migrated version is saved on the
next successful edit. Unsupported/corrupt storage is preserved, with writes blocked.

JSON backup format `stillform-gym`, formatVersion 1, contains the full validated
version-2 store: exercise library, routines/structure, active workout, real history
and separately marked legacy archive. Reviewed JSON bootstrap is available only
into an empty, unmodified browser store; populated-store restore/merge is unavailable. CSV exports
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

Store v2 schemaRevision=3 includes default-empty exercise preferences and retained mapping rules/import batch summaries
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
skip, no populated-store JSON merge/batch undo/cloud sync. All mappings must resolve; source errors
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
   | `SUPABASE_SECRET_KEY`        | Project secret key, server-only                             |

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
Polar now supplies selected HR ahead of Strava when both have values, with per-field
provenance; all source snapshots remain intact. Matching uses sport + start + elapsed duration + distance, never title alone.
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

## Polar AccessLink Dynamic API v4 — setup and real verification

Sport context uses Polar's actual top-level `/sports/list` array. A context refresh
also resolves sport classifications of previously saved Polar sources from their raw
session snapshots, preserving permanent IDs, raw revisions, selected field ownership,
and completed training checkpoints. Training discovery already creates canonical
activities/source records; rich detail hydration is optional and on demand. Running
shows canonical `run` / `trail_run` activities; All Activities includes other sports.

Diagnosis on 2026-10-05 found five imported Polar source/activity pairs classified as
`other` because the old context parser discarded the array catalog. A read-only
preview resolves four to running and one to swimming, with no identity reviews.
The live repair was not executed: automatic approval review requires explicit approval
before writing catalog/classification changes to this existing deployment.

Provider failures retain a bounded, sanitized diagnostic (path, HTTP status,
content type, error body, family and refresh outcome). Expand **Provider diagnostic**
in context/sync status; the authenticated API error also contains it. Credentials
and Authorization headers are never included. Older saved state defaults these
optional diagnostics to null. Refresh persists the returned token pair together;
failed authentication retains credentials until explicit disconnect. PostgREST
minimal-write responses may be empty HTTP 200/201 as well as 204.

Live verification on 2026-10-05: normal refresh succeeded and read-only sports/devices
returned 200. Training now serializes UI dates to ISO **local datetimes**:
`2026-09-01T00:00:00` inclusive to `2026-10-05T00:00:00` exclusive. The live
backend rejected date-only, explicit-offset and `Z` forms; the accepted local form
returned 200 with five sessions. `features` stays omitted for discovery. No personal
activity/context data was imported, and credentials were unchanged during range verification.

`POLAR_TIME_ZONE` selects the training calendar (IANA name; default `Europe/Rome`),
shown in Integrations. Default dates and future-range validation use that zone.
The dedicated serializer preserves wall-clock midnight boundaries across DST;
it does not convert selected dates into UTC dates or assume 24 elapsed hours per day.
Polar accepts no offset in this observed training query form; no unsupported timezone
parameter is sent. Calendar dates follow provider-local session timestamps; this is
not a claim of an arbitrary timezone-aware instant-filter API, especially for travel.
The 90-calendar-day discovery / one-day detail limits and contiguous chunks remain.
Sleep, Nightly Recharge, PPI and continuous samples independently returned 200 with
their existing date-only one-day queries, which stay unchanged.

Automated tests use synthetic
responses only. Gym/Hevy browser data, backups and Git history are unchanged. Strava client
credentials are **not required** for Polar. Connection never imports history automatically.

1. Create a Supabase project. In its SQL editor, deliberately apply the repository migrations
   `0001` through `0005` in order (or only unapplied ones). Nothing applies them automatically.
   Create your integration email/password user under Authentication; keep public signup off
   if this remains a personal app. Check service-only table/RPC grants and owner isolation
   before production. SQL/RLS verification against a real database is still pending.
2. Sign in with your Polar Flow account at [AccessLink administration](https://admin.polaraccesslink.com).
   Create a client for Stillform with your actual service details. Register the exact redirect
   **`http://localhost:3000/api/polar/callback`**. Configure that redirect URL, not merely the
   admin interface's default URL. For deployment register the corresponding HTTPS URL and
   set `APP_ORIGIN` to its origin. Follow any mandatory Polar account consent requirements.
3. Copy `.env.example` to ignored `.env.local`, filling these names locally:

   | Variable                     | Value                                                                   |
   | ---------------------------- | ----------------------------------------------------------------------- |
   | `APP_ORIGIN`                 | `http://localhost:3000`                                                 |
   | `INTEGRATION_STORAGE`        | `supabase`                                                              |
   | `INTEGRATION_ENCRYPTION_KEY` | Independently generated 32-byte key, 64 hex characters; retain securely |
   | `POLAR_CLIENT_ID`            | Your registered Polar client ID                                         |
   | `POLAR_CLIENT_SECRET`        | Your registered Polar client secret                                     |
   | `SUPABASE_URL`               | Your project HTTPS URL                                                  |
   | `SUPABASE_PUBLISHABLE_KEY`   | Your project publishable key for Auth                                   |
   | `SUPABASE_SECRET_KEY`        | Your project privileged secret key; server only                         |

   Generate the encryption key with the Node command in the Strava setup section. Never
   enter these secrets in chat, public variables or Git. `SUPABASE_SERVICE_ROLE_KEY` remains
   an explicitly **deprecated fallback**, only used when the secret key is absent. Opaque
   Supabase secret keys use `apikey`; they are never sent as Bearer JWTs.

4. Run `pnpm dev`, open `/integrations`, and sign in within **Polar connection**. Confirm that
   you will authorize your own Polar account (the same one on reconnect). Click Connect
   Polar, review scopes, authorize, and return. V4 tokens do not expose a stable athlete ID;
   linkage is owner-bound and account switching is unsupported. The confirmation is a user
   attestation, not provider-verified account identity. Never connect another person's account.
5. Click **Sync device & sport context** first, then set From inclusive / To exclusive and
   **Sync training sessions**, **Sync Recovery data** or **Sync all**. Each click processes at
   most five sequential windows. **Continue Polar sync** resumes saved discovery/detail
   queues after interruption; starting a named sync again restarts that family's requested
   range without duplicating permanent session IDs. Older missing history is normal.
6. Inspect per-family requested range, oldest/newest returned, empty windows, latest success,
   scopes and errors. Zero sessions/nights is a successful result. Use `/activities` to review
   uncertain matches; Running lists real canonical runs separately from sample analytics.
   Open a run and explicitly fetch real detail for samples/laps/zones/route/vendor fields.
7. Open Recovery. Once connected, real mode displays real measurements or Insufficient data,
   never sample-filled gaps. Inspect 7/28/90-day charts and Analyze. Collect new nights
   prospectively. The labelled sample view is available only as a separate explicit view.
8. Disconnect Polar requires confirmation, deletes its local credentials and retains history.
   Also revoke the app grant through Polar account settings. No documented v4 revocation
   endpoint is assumed. Sign out ends the application session, not the saved provider grant.

Production integration storage requires Supabase before authorization. For intentional
single-user local development only, `INTEGRATION_STORAGE=dev-file` plus
`DEV_INTEGRATION_ACCESS_KEY` (random, at least 32 characters), the encryption key and Polar
client/origin variables avoid Supabase. Run `pnpm dev`; `pnpm start` rejects dev-file mode.
Files stay encrypted under ignored `.integration-dev/`; this is not production cloud storage.

### Implemented v4 adapter contract

Official contract checked against [Polar v4 documentation and Swagger](https://www.polar.com/polar-api-v4/).
OAuth uses `https://auth.polar.com/oauth/authorize` and `/oauth/token`; API requests use
`https://www.polaraccesslink.com/v4/data`. Scopes are exactly `training_sessions:read`,
`sleep:read`, `nightly_recharge:read`, `continuous_samples:read`, `ppi_data:read`,
`devices:read`, `sports:read`. No profile, picture, daily activity or write scope is requested.
Partial grants remain useful; unavailable modules report their missing scope.

| Relative endpoint               | Discovery window | Explicit details                                                                                    |
| ------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `/training-sessions/list`       | 90 days          | 1 day; samples, training-load-report, laps, routes, statistics, zones, pause-times                  |
| `/sleeps`                       | 30 days          | Available-date queue; 1 day with sleep-result, original-sleep-result, sleep-evaluation, sleep-score |
| `/nightly-recharge-results`     | 28 days          | Constituent vendor fields returned directly; optional sample enrichment not wired                   |
| `/continuous-samples`           | 30 days          | heart-rate-samples feature in each window                                                           |
| `/ppi-samples`                  | 90 days          | Available-date queue; 1 day with samples                                                            |
| `/user-devices`, `/sports/list` | No date window   | Explicit context sync                                                                               |

Requests use from-inclusive/to-exclusive date windows and repeated `features` parameters.
There is no assumed page-number API or session-by-ID endpoint: enrichment fetches its local
date then selects the exact permanent identifier. Current v4 client limits are 3,000/15 min
and 100,000/24 h. Owner leases bound concurrency, requests are paced at least 1.1 seconds,
and 429 Retry-After pauses persist (15-minute fallback without that header). A shared
distributed client-wide budget across multiple deployed users is future work; this personal
implementation should not be deployed as a high-volume multi-tenant service without it.
No aggressive polling. No v4 notification/webhook mechanism is documented; `/subscriptions`
is a premium user subscription API, not a notification API. Dormant Strava webhooks remain.

### Models, trustworthy UI and remaining limits

`domain/polar.ts` models version-1 server physiological storage, nullable measurements,
quality/context, raw revisions and resumable jobs; `server/polar-*` implement the adapter,
normalizers and services. Tokens use the shared encrypted account repository; refreshed
tokens persist before data requests, one 401 is retried and revoked grants require reconnect.
Canonical registry v1 and Gym storage v2/revision 2 are preserved. SQL 0005 is unapplied.
Polar strength links to existing Gym summaries without creating sets/CompletedWorkouts.
The same matcher supports future Polar+Strava copies and manual ambiguous-match decisions.
Existing selected fields stay selected except recorded Polar HR takes precedence over Strava
HR; Gym title/timing/structure and source snapshots remain authoritative/preserved.

Sleep stores timing, seconds asleep/span/interruptions/phases, continuity, efficiency,
device, edits/incompleteness and secondary vendor score. Nightly Recharge stores vendor
RMSSD/RRI/respiration intervals in **milliseconds** plus vendor baseline/status context.
RRI is not relabelled as mean night HR; respiration interval is not breaths/min. Continuous
HR stores date, offset milliseconds, BPM/device/trigger separately from workouts/night HR.
PPI preserves intervals, error estimates, skin contact, movement/offline and device triggers.
Missing absolute sample timezone remains unknown. No HRV is reconstructed from coarse BPM.
Raw structures retain unsupported/edited timing details. Device sensor quality is unknown;
a watch name alone does not prove which HR sensor was used.

Recovery shows actual nightly values and sleep timing/quality, gaps, counts and descriptive
medians. Product maturity defaults: 7 preliminary / 14 developing / 28 established **complete
observations**, configurable in `analytics/polar-recovery.ts` and not scientifically validated.
Incomplete observations are shown but excluded from reference medians/maturity. Temporal
span and coverage also gate maturity. Analyze exposes selected
real dates/units/coverage/source; there is no real AI analysis. Vendor scores are secondary.
Running detail preserves samples and context server-side and displays availability, laps,
zones/pauses/routes/statistics, vendor Running Index/load and direct elapsed pace. Ambiguous
speed-sample units stay provider-unspecified, with no invented speed conversion.

Still pending: scientific evaluation of Recovery Engine heuristics, automated training decisions, adaptive recommendations, drift,
efficiency/threshold/VO2 analytics, real Coach/Consensus/Calendar, cloud Gym migration,
continuous/PPI exploratory charts, notification/background worker, authenticated export and
deletion for server physiological records, multi-owner client-rate allocation and indexed
large-history storage. Plan/Coach and Running analytical cards remain labelled samples; Home recovery uses the shared real engine.
Sparse Polar history is not complete running history. Device/sport context requires an
explicit sync; unknown sport IDs remain `other` until re-synced with catalog context.
Optional features/permissions/device measurements and historical availability vary. A window
without returned records is not a measured anomaly or proof of an API retention policy.

Recommended next milestone: collect valid overnight observations prospectively, monitor
baseline coverage and evaluate/calibrate the clearly labelled statistical heuristics before
letting recovery evidence influence user-approved training proposals.
