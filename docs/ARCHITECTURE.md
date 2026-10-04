# Architecture

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
