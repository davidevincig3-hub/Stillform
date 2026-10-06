# Roadmap

## Account Gym adoption gate

Implemented: normalized owner persistence, reviewed idempotent desktop bootstrap, local
pending drafts, stale revision conflicts and cross-device polling/resume. Next: review
and deploy migration 0006, approve real desktop bootstrap, verify counts/IDs and trusted
HTTPS phone access with the same account. Then reduce snapshot write cost with entity
diffs if needed before Gym Analytics V1 expansion. No live upload occurs automatically.

Daily Gym blockers addressed: explicit trusted-LAN dev mode, reviewed JSON bootstrap
into an empty phone browser, real-history recent/frequent exercise shortlist with
pin/dismiss controls, and synthetic verification of incremental Hevy export replay.
Full cross-device Gym merge/cloud sync and edited-Hevy-session reconciliation remain
future work. Next Gym analytics should build on the existing canonical IDs and real-only gates.

## Current status — Recovery Engine V1 implemented

Recovery Engine V1 is now implemented: personal robust baselines, actual-day coverage,
separate confidence, tentative independent-family patterns, honest insufficient data,
user exclusions and one shared Home/Recovery output. Heuristics need prospective
evaluation with valid overnight measurements before driving training proposals. Current
live data has no eligible overnight baseline; no physiological judgment is justified.

Secure owner-bound Polar OAuth/rotating refresh, independent dormant Strava configuration,
encrypted shared repositories, endpoint-specific resumable backfill, explicit training
enrichment, canonical linking, sleep/Nightly/continuous-HR/PPI/device/catalog normalization
and real Recovery source display are implemented with synthetic tests. Supabase's current
secret key is primary. The current owner's Polar authorization, refresh, database
persistence and bounded source ingestion have been verified live. Sparse history
and zero-night success remain first-class states.

The earlier Strava setup recommendation is superseded: the user cannot currently register
a Strava app, so leave it dormant. Multi-owner deployment still needs operational
verification of owner isolation, lease/CAS behavior and distributed provider budgets.
Collect nights prospectively and validate source timing/quality before custom physiology.
Do not require a historic sleep baseline to start collection.

Follow-ups: authenticated physiological export/deletion, normalized/indexed larger-history
storage, client-wide distributed budget and operational retry worker before multi-user hosting,
continuous/PPI exploratory charts, explicit account-switch support if a stable identity contract
becomes available, Gym cloud/reconciliation with user-approved migration and populated-store JSON merge.
After real observation quality is understood, evaluate the Recovery V1 heuristics and
comparable-running analytics separately, then Plan decisions and grounded Coach/Consensus.

## Phase 1 — Foundation + gym logger + mock dashboard

Five pages, local workout flow, sample charts, goals, choice demo, PWA, schema and
contracts. Gym V1 Real adds routine/custom-exercise management, identity-based actual
previous exposures, completed/detail histories, descriptive analytics and JSON/CSV
export. Migration isolates unverified legacy data. Next: populated-store JSON merge,
multi-tab protection and offline resilience. Verified Hevy import with
mapping/duplicate preview is complete. Milestone: mobile
reload/edit/leave/return/finish/discard end-to-end tests.

## Phase 2 — Strava

Authenticated server provider, cursors, verified webhooks, idempotent jobs, registry
and duplicate review. Depends on Supabase auth/repository and tested owner RLS.
Milestone: replay without double-counting, unplanned activity support, recoverable sync.

## Phase 3 — Polar / recovery

Sensor provenance, underlying night/sleep data, mature personal baselines and
validated metrics. Depends on real matched samples. Milestone: traceable versioned
calculations, mixed-sensor/missingness tests, gym missing HR never penalized.

## Phase 4 — Decision engine + Plan

Family assessment, candidate comparison, progression gates, interference and
disruption reasoning, approved proposals, outcomes and optional Calendar context.
Depends on validated analytics. Milestone: calibrated uncertainty, coherent anomaly
alerts, no automatic rescheduling and retrospective outcome evaluation.

## Phase 5 — AI Coach + Consensus

Authenticated selective tools, summary-to-raw access, chat history, question-aware
research ranking and transparent fallback. Depends on safe access and deterministic
metrics. Milestone: grounded answers/citations, access isolation, quota handling and
coaching evaluations. Forecasts require separate validation.

Production milestones include privacy/security, data export/deletion, accessibility,
backup/observability, performance and full offline workflow testing.

## Hevy milestone completed

Verified Italian Hevy CSV parser, review/mapping/duplicate/confirmation UI, provenance,
atomic local batches and repeat-import protection are implemented. Real mapped history
feeds Gym exposures and descriptive analytics. Next: validated populated-store JSON merge
with preview/confirmation and conflict handling; then reviewed muscle-metadata backfill,
batch undo and broader export-version/timezone support. Strava requires explicit configured authorization; Hevy remains a local-file import.

## Strava milestone implemented; live deployment pending

OAuth/rotation/revocation, server-only encrypted token repositories, Supabase Auth ownership,
canonical registry/source/field provenance, reusable matching and persisted review decisions,
Gym strength linking, bounded resumable backfill, separate streams/laps, webhook queue/processor,
real Running history and searchable/paginated Gym history are implemented with synthetic tests.
Live account authorization, unapplied SQL migration verification, real rate limits and public
webhook delivery remain pending credentials/deployment. Supabase is required for production
integrations, not for local Gym; isolated encrypted dev-file mode is development-only.

Recommended next milestone: configure Supabase and Strava, verify owner isolation/RPC leases
in the actual database, authorize one real account deliberately, backfill with matching review,
and inspect real HR/GPS/laps missingness without enabling physiological decisions. Then add
operational webhook worker/retry observability, canonical export/deletion and field-precedence
policy, with explicit Gym reconciliation/cloud migration designed separately. Existing JSON
merge/preview, multi-tab coordination and Gym metadata review remain valuable later tasks.

Account Gym follow-up: move bounded history selection and changed-entity writes into SQL to reduce server reconstruction cost; browser history now uses paged reads and no clean full account cache.
