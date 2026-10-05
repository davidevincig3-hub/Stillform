# Architecture

Daily Gym use: `analytics/gym-shortlist.ts` computes exposure/set counts and recency-weighted
ranking by stable exercise ID. Shared recent-exercise and searchable picker components
serve Gym, routine editor and active workout. `exercisePreferences` are local schema
revision 3; backup and Hevy plans preserve them. `gym-export.ts` validates JSON bootstrap
with empty-store and stale-preview gates before one atomic write. `domain/id.ts` uses
cryptographic UUID creation over LAN HTTP without requiring secure-context randomUUID.
`scripts/dev-lan.mjs` detects actual private IPv4 interfaces and explicitly launches Next
on LAN with one allowed development hostname. Integration origin/auth checks remain localhost.
See [mobile setup](MOBILE_GYM.md); no cloud synchronization is implied by shared LAN access.

Recovery quality uses a shared domain override schema (`observation-quality.ts`) and
filtered query boundary (`recovery-inputs.ts`) for Sleep/Nightly/continuous/PPI. Server
`recovery-quality.ts` owns validated, locked/CAS user adjudication and public projections.
UI history orchestrates requests; it does not persist or calculate eligibility locally.
Analytics defend against excluded inputs even when handed unfiltered observations.
Overrides survive normalizer upserts without mutating provider raw snapshots. Future
Home/Recovery Engine inputs come through this boundary.

Recovery Engine V1: `domain/recovery-engine.ts` defines versioned, AI-readable outputs;
`analytics/recovery-baseline.ts` handles actual-day personal median/MAD and temporal
maturity; `analytics/recovery-engine.ts` is a pure deterministic comparison/convergence
function. `server/recovery-engine-input.ts` adapts eligible Polar measurements and
confirmed canonical activities without provider requests or writes. `/api/polar/recovery`
returns its assessment and compact scalar input (no raw provider payloads).

Home and Recovery share `use-recovery-data.ts` and `RecoveryAssessment`. The hook uses
the same pure function to add confirmed local Gym inputs with `recovery-gym.ts`; sets
never leave the browser. Matching gymWorkoutId identities avoid double counting registry
shells. Backend/auth failures do not silently substitute sample recovery. Missing sleep,
HRV, context and performance remain explicit; timing/native intervals and training dose
are descriptive. Family convergence is a product heuristic, not physiological validation.

## Polar v4 extension (current)

`domain/polar.ts` provides normalized physiological schemas, family scopes/windows, date
chunking and version-1 checkpoint state. `server/polar-client.ts` centralizes v4 endpoints,
authorization-code/refresh Basic exchanges and injectable HTTP/error/backoff behavior.
`polar-normalize.ts` separates pure source parsing from UI/persistence. `polar-service.ts`
serializes owner operations with existing leases, rotates tokens before reads, retries one
401, preserves resumable discovery/detail queues and writes the canonical registry.
`/api/polar/[action]` owns authentication/CSRF/origin checks and curated secret-free responses.
The original Strava routes/client remain. Shared review/login are independent of Strava setup.

Shared repositories accept provider-specific encrypted accounts. Polar physiological blobs
use a separate CAS/versioned `integration_polar` table via unapplied SQL 0005, or encrypted
development files under the same existing contract. Legacy dev records default to an empty
Polar store without changing their Strava or registry state. Supabase REST uses the privileged
`SUPABASE_SECRET_KEY` in apikey only; deprecated JWT service-role fallback is secondary.
All integration credentials remain server-only. App Auth tokens remain encrypted HttpOnly
cookies, provider state cookies are distinct and consumed once, owner checks are mandatory.

Date windows are endpoint-specific: 90/30/28/30/90 days for training/sleep/nightly/continuous/
PPI discovery. Sleep/PPI discover available dates, then hydrate one feature day at a time.
Training enrichment uses its local date plus exact ID selection. At most five sequential
windows per UI click, 1.1-second minimum pacing and persistent Retry-After/backoff; there is
no automatic polling. Missing scopes finish only the relevant module as unavailable.
Cross-owner distributed client-budget allocation remains future work before multi-tenant use.

Registry and recovery CAS writes are separate, not a cross-table transaction. Exact source
identities and deterministic upserts make retry after intermediate persistence safe. Raw
revisions survive edits. Large arrays live in rich-data storage; activity detail gives sample
availability/laps and available zone/pause/route/statistics data. Ordinary list responses omit
raw/revisions. `analytics/polar-recovery.ts` implements descriptive windows/counts/medians/UI
maturity only; `real-recovery.tsx` renders real and separate sample modes without fallback.

Owner-bound Polar account identity is an explicit limitation: current minimal scopes/token
response expose no stable athlete ID. Connection requires own/same-account user attestation,
source athleteId is null and permanent IDs are namespaced by authenticated owner. This does
not verify account switching. No profile scope or invented jti-as-athlete identity is used.
Canonical fields preserve selection except Polar recorded HR supersedes Strava HR; Gym
structure stays authoritative. See DECISIONS for the narrow precedence policy.

No suitable notification or revocation endpoint is documented in v4. Manual sync and local
credential removal plus Polar-account grant revocation are supported. No legacy v3 endpoint
or premium `/subscriptions` behavior is substituted. Existing Strava webhooks stay dormant.

| Module                      | Boundary                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `src/app`, `src/components` | Routes, presentation, form orchestration                            |
| `src/domain`                | Canonical entities, confidence and validation                       |
| `src/repositories`          | Data access contracts, seeds, versioned local workout storage       |
| `src/integrations`          | Replaceable Polar/Strava/Calendar/Hevy contracts; provenance/dedup  |
| `src/analytics`             | Pure helpers and calculation/recovery/running/resistance interfaces |
| `src/decision`              | Candidate comparison, progression gates, intra-workout interfaces   |
| `src/ai`                    | Context-aware coach and selective repository tool dependencies      |
| `src/research`              | Question-aware evidence provider; unavailable Consensus stub        |
| `src/auth`, `src/config`    | Demo identity and explicit configuration                            |
| `supabase/migrations`       | Intended PostgreSQL model and owner RLS                             |

App Router provides real URLs. A React external-store subscription restores
versioned, Zod-validated localStorage after hydration; writes finish before navigation. Lifecycle
logic and validation live outside components. UI never computes physiology.
Reusable assessment/chart components suffice; shadcn is not necessary yet.

Future flow: provider → immutable raw record → normalize/deduplicate → canonical
data plus field provenance → versioned deterministic metrics → evidence-family
assessment → candidate comparison → user choice → outcome.

Gym flow: library/routine → immutable session snapshots → validated set editing →
completed history → real-only exposure/weekly queries. Other pages use labeled fixtures.
Goals and demo proposal choices also persist locally.
SQL does not power V1. A Supabase repository will implement the same interfaces,
with an explicit local-data migration path and server-only service credentials.

ChartContext exposes points, timeframe, unit, baseline/maturity, confidence,
calculation version and mock flag. The future coach receives this directly, plus
deterministic trend calculations, rather than screenshots. Repository tools retrieve
summaries first, progressively accessing deeper history/streams/raw data. Do not
dump the complete database into the model or ask it to recalculate known metrics.

Browser storage is per device and not backed up. Load/write failures are visible.
Unreadable original data is preserved and writes are blocked. Multi-tab arbitration and
offline editing remain TODOs. Service worker caches only a static offline page,
never private API responses. Deployment requires HTTPS for PWA installation.

Before real users: authentication, SQL/RLS tests, secure credentials, consent,
export/deletion, backups, observability and accessibility review.

## Gym V1 Real extension

`domain/gym.ts` defines library Exercise, RoutineExercise, GymRoutine and workout
schemas; `domain/gym-workout.ts` owns effort/completion transitions. Legacy domain
types and `workout-storage.ts` are retained solely for V1 decoding/tests. Current
UI uses `repositories/gym-storage.ts`, version 2, through the existing provider.
`analytics/gym.ts` supplies real-history filtering, identity-based exposure queries,
formatting and descriptive weekly aggregation; it imports no seeds. UI components
handle forms, navigation and disclosure, not persistence or analytical calculations.

`gym-export.ts` validates the full backup envelope and produces escaped CSV.
`integrations/hevy-import.ts` separates verified parsing, mapping, duplicate review
and explicit confirmation. The verified local parser and atomic batch committer
are implemented; preview cannot silently create workouts.

Migration is deterministic and read-only until the first user save; the old key is
preserved. Unknown origin is isolated from real queries until review. Routine edits
do not mutate active/history snapshots. Custom exercise renames keep their IDs;
historical names/muscle groups stay as logged. The future SQL adapter will map
library IDs via library_key and soft-delete routines to preserve relational links.
All SQL migrations remain unapplied and require database testing.

Browser tests use port 3100 with no server reuse, preventing stale previews from
passing tests. The development indicator stays visible in the top-right with mobile
header space reserved so it does not cover bottom navigation. No errors are suppressed.

## Hevy parser and import transaction

integrations/hevy-import.ts implements the parser abstraction, Italian wall-time
conversion, SHA-256 source identities, exact-name confirmed mapping rules, duplicate
classification and pure canonical batch planning. hevy-import-controls.tsx orchestrates
in-memory preview with ten names per page; no row-by-row mapping or thousands of raw
row elements. History is paginated at 20 sessions with sets rendered on expansion;
exercise exposures progressively disclose 20 at a time. No new dependencies.

The canonical plan validates the entire next store before confirmation. commitHevyPlan
requires explicit approval and an unchanged base store, then invokes the repository
writer once. Browser localStorage.setItem replaces the entire serialized value
atomically, including quota-failure semantics. The provider checks current raw storage
before writing to reject a stale tab/view. This is not general concurrent-tab locking.
No raw CSV, filename or preview is persisted; normalized source values required for
history/provenance are persisted only after confirmation. An opt-in local reference
verification builds plans in memory and prints aggregate metadata, never source rows.

v2/schemaRevision 2 is a compatible metadata extension with defaults for older stores. No old
key is deleted or rewritten. JSON formatVersion 1 retains the full validated extended
store. Future SQL adapters must preserve nullable reps/timing, source order/context,
fingerprints, mappings and batches; existing SQL migrations are still unapplied.

## Secure integration server boundary

`domain/activity.ts` defines canonical activities, external sources, nullable recorded
metadata, quality/field provenance, Gym matching summaries, reviews/decisions, registry
version 1, streams and provider-independent laps. `integrations/activity-matching.ts`
is pure provider-independent identity/matching/linking logic; `analytics/gym-history.ts`
contains real-only history queries. UI components orchestrate forms/API calls only.

`server/integration-config.ts` centralizes API hosts and private environment configuration.
`integration-security.ts` implements AES-256-GCM envelopes, stable source fingerprints,
constant-time comparison and expiring owner-bound OAuth state. `integration-auth.ts`
handles Supabase Auth sessions in encrypted HttpOnly cookies and validates ownership on
requests. POST routes enforce origin; cookies use SameSite=Lax and Secure outside localhost.
OAuth state is consumed once. Strava credentials never enter browser storage, API responses,
React props or client imports. Next's server-only guard plus production bundle tests enforce
that boundary. Safe UI configuration responses expose missing variable names only.

`StravaClient` injects fetch for tests, exchanges/refreshes/revokes tokens, parses response
rate headers and normalizes provider records/streams/laps. `authorizedCall` persists rotating
refresh tokens before subsequent API calls and retries one 401, then requires reconnect.
`strava-service.ts` owns page checkpoints, bounded enrichment and queued-event processing.
All records in a page normalize before mutation. Exact permanent source identities make
retries idempotent; fingerprints preserve prior raw revisions. No provider response bodies,
secrets or personal records are logged on errors. Routes expose curated errors/status only.

`IntegrationRepository` separates versioned registry CAS, encrypted accounts, rich-data
storage, deduplicated webhook jobs and per-owner leases. Supabase uses REST/RPC with a
server service role; migration 0004 denies public/anon/authenticated table and RPC access.
Ownership is checked in app routes because service role bypasses RLS; user IDs are never
accepted from request bodies. A 180-second lease serializes token rotation and sync; CAS
protects registry replacement. Rich-data writes are independent idempotent upserts, not a
single database transaction with registry writes. Retrying incomplete enrichment is safe.

Explicit development storage implements the same contract in AES-encrypted ignored server
files, atomic replacement and file leases. It is refused outside NODE_ENV=development,
requires a random development access key, and supports one fixed development owner only.
Next deployment traces exclude personal imports, environment files and this folder.
Production uses Supabase. SQL is still unapplied and needs real DB/RLS verification.

Browser Gym v2/revision 2 remains unchanged, including Hevy provenance/mappings, active
workouts and backups. Explicit sync uploads only matching summaries for confirmed history,
not routines, exercises or sets. Gym persistence is not authenticated/cloud-migrated yet.
Registry Gym links depend on that browser/origin; stale references after local deletion or
edits are a documented limitation. No destructive migration runs on load or connection.

Backfill fetches 50 summaries/page, at most five pages per user click with 2.1-second gaps;
server throttles page requests, persists both general/read API budget pauses and frozen
before/after bounds. Initial backfill spans all history; later incremental discovery has a
two-day overlap. Older edits/deletions need webhook processing/full backfill (a full listing
does not itself tombstone records absent from the listing). Rich detail uses at most three
API requests plus auth refresh; stream arrays stay in server storage. UI gets summaries.

Webhooks validate challenge/subscription/event/athlete and queue without a provider call.
No signed payload is available; create/update/delete/deauth processors verify provider truth,
retain canonical history, acknowledge processed jobs, and retain failures for retry. Only
manual queued-job processing is wired currently; a deployed durable worker is future work.
Registry JSON and raw revisions are per-owner blobs initially; larger-history indexing,
field-precedence configuration, deletion/export controls and key rotation remain extensions.
