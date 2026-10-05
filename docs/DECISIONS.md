# Decision log

## 2026-10-06 — LAN Gym access, recent exercises and incremental continuity

Expose development only through an explicit LAN launcher; default dev binds loopback.
Detect/validate local RFC1918 IPv4 hosts, refuse ambiguous selection and never wildcard
development origins or relax integration CSRF/authentication. Firewall rules remain manual,
Private profile and local subnet. LAN HTTP uses cryptographic UUID fallback; CSV hashing
still requires localhost/secure context and never sends private input to a hashing server.
Per-origin storage requires an explicit reviewed JSON copy into an empty phone store,
preserving IDs/mappings/history/preferences; do not silently merge divergent browsers.

Rank exercise navigation by summed exponentially decayed exposures (28-day half-life),
not workout titles, weights or anatomical inference. User pins override ordering and
dismissals hide suggestions reversibly. Count one exposure per real workout and recorded
sets across repeated blocks; exclude demos, unverified history, future dates and pre-cutoff
calendar dates. Preferences use additive schema revision 3 with V1/V2 migration retained.
Hevy's existing workout-relative fingerprints survive new export sessions. Report exact
unchanged sessions separately from reviewed skips. Altered prior sessions remain ambiguous;
no automatic historical set merge can be justified without stable source workout IDs.

## 2026-10-05 — Recovery Engine V1, conservative personal statistical patterns

Use a pure versioned engine and one Home/Recovery input/render path. Never persist a
proprietary score or infer missing overnight values. Prior 28-day median/MAD baseline
ends before the current three-day trend. Require 14 valid distinct baseline dates and
adequate temporal span/coverage, two recent observations and freshness for a state vote.
One isolated unusual measurement is visible but cannot decide recovery; conflicting
families also remain insufficient. Two agreeing independent families including overnight
evidence can describe a tentative pattern; correlated autonomic metrics count once.
Elevated HRV does not prove improved recovery. Sensor unknowns cap evidence confidence.

Count/span/coverage maturity, MAD scaling/deviation floor and convergence rules are
explicitly product heuristics, not validated physiological thresholds. Research supports
personal longitudinal context and highlights measurement/protocol heterogeneity; it does
not validate our rules: [HRV methodological review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8507742/)
and [monitoring framework](https://pmc.ncbi.nlm.nih.gov/articles/PMC5990631/).

Sleep duration/continuity and vendor RMSSD are eligible primary observations. Native RRI
and respiratory intervals are secondary; no inversion to mean night HR/rate. Bedtime is
local clock minutes from noon to preserve midnight continuity; seven-day timing MAD is
descriptive, not a sleep score. Continuous HR/PPI context does not establish nightly HRV.
Canonical running/gym exposure is logged history, not proof of rest or intensity. Local
Gym comparisons use identical first-set exercise/equipment/reps/effort, remain limited
by unrecorded technique/rest, and never upload sets. Missing effort means no comparison.
No running drift, AI or automated training change. Current excluded sleep records remain
excluded; all provider state and credentials are read-only for engine calculation.

## 2026-10-05 — Generic observation validity and user authority

All Polar Sleep, Nightly Recharge, continuous-HR and PPI observations support the
same optional `validityOverride`: valid/excluded, optional reason, adjudication time
and user authority. Missing overrides retain legacy provider eligibility. Completeness,
sensor-quality evidence and metric availability remain separate; a valid override
does not invent missing measurements or prove sensor accuracy. No value-based automatic
exclusion is implemented. Future automatic flags must not overrule user adjudication.

Keep overrides beside normalized observations, outside the raw payload and revisions.
The existing date/device identity retains decisions across resync and raw revisions.
Owner-authenticated, origin-checked `/api/polar/quality` accepts exact family/date/device
identities, validates all requested records before saving and uses the repository's
owner lock and version CAS. It supports disconnected retained history and never needs
a provider request or token refresh. Restore records an explicit valid decision.

`recoveryInputs` is the shared eligibility boundary for Home/Recovery Engine
consumers. API recovery sleep/nightly arrays are filtered; separate safe provider
history and provider/valid/excluded counts retain transparency. Series/window queries
also reject excluded inputs defensively, including descriptive medians, coverage and
maturity. UI valid counts describe eligibility; metric completeness still controls
baseline counts. Recovery Engine and confidence calculation now consume this boundary
as described in the subsequent V1 decision above.

## 2026-10-05 — Polar detail presentation without source mutation

Project existing persisted rich Polar raw data on read through the same normalizer
used for new hydration. Separate manual and automatic lap families, retaining
exercise identity. Interval samples are real series, exposed as availability summaries
without sending value arrays to the browser. Preserve null sample slots rather than
compressing their timeline. Legacy records need no rewrite or repeat provider fetch.

The v4 IntervalValues contract states sample type and interval but does not establish
SPEED or DISTANCE sample units. Preserve provider values; do not infer conversions
from plausible ranges. Elapsed pace uses explicitly named distanceMeters and duration,
includes pauses, and is not moving pace or physiological analysis. Format duration
as clock time and pace as seconds per kilometre; round displayed elevation only.
Empty provider names use sport plus original local date. Preserve genuine names,
including numeric names. Read projections update old fallback titles without changing
canonical IDs, provider raw payloads or persisted activities.

## 2026-10-05 — Polar sport-catalog shape and existing-record classification

The real sports endpoint returns a top-level array. Parse/validate that shape rather
than silently treating an unexpected envelope as an empty catalog. Discovery already
persists full provider source snapshots and canonical activities. Rich hydration is
optional; training has no queued hydration dates and must not require it for visibility.

After context refresh, normalize saved non-deleted Polar source snapshots against the
catalog and use the existing idempotent ingestion/field-ownership policy to update
resolved types. Preserve IDs, source raw/fingerprint/revisions, match decisions and
training jobs; unresolved IDs remain explicit and never become guessed running sessions.
Read-only diagnosis found five existing Polar source/activity pairs, four running and
one pool swim in the public catalog. The live update requires explicit approval after
automatic approval review rejected the metadata/registry write under the user's state
preservation instruction; no live repair was executed during this task.

## 2026-10-05 — Verified Polar training local datetime boundaries

Live read-only probes established that training list accepts `YYYY-MM-DDT00:00:00`,
but rejects date-only, `Z`, and explicit `+02:00` forms. Use a dedicated training
range serializer for discovery and rich detail requests. It validates calendar
dates and an explicit IANA timezone, then preserves those dates as local midnight,
inclusive start / exclusive end, without UTC conversion. `POLAR_TIME_ZONE` defaults
to Europe/Rome; show it in the UI and use it for default dates and future-date checks.
DST does not change calendar chunk boundaries; preserve 90-day discovery and one-day
detail limits. The query has no timezone parameter: do not claim arbitrary instant
filtering or verified travel-zone behavior from these local datetime probes.

Review families independently: one-day date-only sleeps, nightly, PPI and continuous
queries each returned 200. They retain their distinct existing serializers. Final
adapter verification returned sports/devices 200 and training 200 with five sessions.
No OAuth/refresh, imported history, metadata or checkpoint writes occurred.

## 2026-10-05 — Polar diagnostics and refresh persistence

Retain bounded sanitized provider diagnostics in sync checkpoints/context status
and authenticated API errors, with exact path/status/content type/body/family and
successful-refresh flag. Redact sensitive JSON fields, known credentials and
authorization values before truncation; render error text without HTML execution.
Existing state defaults diagnostic fields to null without a storage-version change.
Keep credentials after failed authentication; only explicit disconnect removes them.
Token-pair persistence remains one encrypted atomic upsert. Accept empty successful
PostgREST minimal-write responses for HTTP 200/201/204; CAS RPCs still require true.

Live refresh succeeded, but its persisted upsert initially caused a JSON parse error
because the repository assumed every non-204 success had a JSON body. After fixing
that wrapper, read-only context calls returned 200 and training returned 400 with
`Value for key 'from' could not be parsed as datetime`. Stop after that diagnosis:
date serialization and sport-catalog shape handling are separate follow-up work.
No live activity/context/checkpoint data was changed by verification.

## 2026-10-04 — Polar Dynamic API v4 / real source boundaries

Preserve de1091c and dormant Strava architecture. Polar uses current official v4 contract,
centralized endpoints, seven justified read scopes and distinct owner-bound OAuth state.
No profile/daily-activity/write scopes. Partial grants remain useful. No v3 user registration,
invented session-ID endpoint, v3 webhooks or premium-subscription-as-notification shortcut.
No current v4 notification/revocation endpoint is documented; manual sync and local token
removal/manual Polar grant revocation are honest limitations.

Use SUPABASE_SECRET_KEY as primary privileged key, apikey only; SERVICE_ROLE_KEY is deprecated
fallback. Keep shared encrypted credential repository/auth/owner leases and CAS. Add separate
versioned physiological state rather than touching local Gym keys/schema/history/exports.
SQL is a draft, not remotely applied. Credentials/personal exports never become fixtures.

V4 token response/minimal scopes provide no stable Polar athlete identity. Do not misuse jti,
request profile PII or silently imply account verification. Bind encrypted credentials and
source namespaces to app owner; source athleteId null; require an explicit own/same-account
attestation at connection. Account switching cannot be detected/handled reliably and remains
unsupported. This is documented prominently rather than claimed as provider identity security.

Apply family-specific date windows; discover available sleep/PPI days before one-day detail
hydration, store checkpoints after each window, cap UI batches at five and pace calls. 429
backoff survives server restarts. Owner lease bounds token refresh/sync concurrency. This
personal deployment has no distributed multi-owner client budget; add it before scaling.
Do not infer global retention from empty responses. Unknown sport IDs remain other until
catalog context and a re-sync resolve them. Matching policy stays the existing documented
heuristic; one unique strong cross-provider candidate links, ambiguity requires review.

Gym retains sets/exercises/effort and descriptive timing authority. Polar strength supplies
physiological context only, never duplicate CompletedWorkouts. For future Strava copies,
recorded Polar HR has narrow selection precedence over Strava HR, with field provenance;
all other selected values remain stable. Sensor quality unknown means unknown, not watch
or chest-strap certainty. Raw source revisions preserve disagreements/edits.

Show underlying vendor RMSSD/RRI/respiration intervals with correct units, sleep components
and quality; vendor scores/status/baselines remain secondary. Continuous HR, training HR,
nightly metrics and PPI are separate contexts. No BPM-derived HRV or proprietary score.
Real Recovery has no sample-filled gaps or sample recommendation; optional sample view is
explicit. Descriptive means/maturity use real complete observations per metric/window with
configurable 7/14/28 defaults that are not scientific validation. Analyze exposes real
source/context, not AI inference. Home/Plan/Coach/Running analytical cards remain samples.

## 2026-10-04 — Stable dependencies and compatibility

Next.js App Router, React, strict TypeScript, Tailwind v4, Recharts and Zod. Versions
resolved from stable registry tags with a reproducible lockfile. Latest ESLint 10
and TypeScript 7 exceed Next lint plugin peer ranges. Use ESLint 9.39.5 and TS
6.0.3 for compatibility. ESLint 9 is upstream unsupported: upgrade when Next's
plugins support 10; do not suppress peer warnings.

## 2026-10-04 — Local demo; intended Supabase

No credentials/accounts. Real local logged sets are distinct from sample analytics.
Versioned storage and repository interfaces allow a future backend migration.
Supabase SQL is designed but unapplied, not claimed production ready.

## 2026-10-04 — Honest unavailable services

Pure lifecycle/validation and analytics interfaces outside React. No fabricated
physiological formulas, AI analysis, research retrieval or decision algorithm.
External services use replaceable adapters; mocks disclose their limitations.

## 2026-10-04 — Field-level provenance

Source-independent activities, Strava registry, richer Polar HR, authoritative
internal gym sets. Preserve lineage; matching Strava gym entries must never double
count. Fuzzy matching waits for representative data and calibrated thresholds.

## 2026-10-04 — UX and PWA

Restrained custom components, mobile bottom/desktop side nav, dark mode, global
coach/return pill. Installable PWA caches only offline fallback. Full offline app
shell and concurrent-tab arbitration are separate future work.

## 2026-10-04 — Plan and AI boundaries

Stability rather than loyalty. User approval for rescheduling; original goals
retained; projection is planned/adaptive, not a fabricated forecast. Complete AI
capability via selective tools, with personal/scientific/model evidence separated.

## 2026-10-04 — Gym V1 Real and migration

Keep existing architecture/history; add version-2 Gym store and version-1 full
backup envelope. Use a small stable-ID exercise library, custom exercises, routine
entry structure and immutable workout snapshots. No target weights or muscle
contribution percentages. Previous performance and analytics use only confirmed
completed user records. Missing effort limits comparisons; missing HR is normal.

V1 lacks origin markers, so completed sessions are preserved in a review archive
and active sessions are retained, both unverified. Discard sample previous text.
Confirmation is an explicit user statement that sets represent actual training;
never infer authenticity from a sample routine name. Preserve the old key and block
writes on malformed data. Unknown historical timing is kept unknown. Routine
deletion is local removal; the future SQL adapter soft-deletes relational routines.

## 2026-10-04 — Exports and Hevy import

JSON is canonical full backup; CSV is safe tabular history, not a relational backup.
Include active and separate legacy records for reconstruction. Restore is deferred.
No verified Hevy CSV schema exists in the repo, so parser/mapping/duplicate/approval
contracts are provided and UI discloses unsupported parsing. Do not guess mappings.

## 2026-10-04 — Small UX changes and future analytics shapes

Preserve approved layouts. Improve mobile logger tap targets to at least 44px for
set Done/delete, numeric keyboards and logged-set state. Keep optional effort
expandable. Explain replaces technical evidence wording; remove the persistent
internal slogan. Nullable interval metrics and discriminated progression series
prepare future analytics without adding fake values or forecasts.

## 2026-10-04 — Fresh browser verification

Use isolated port 3100 with no server reuse; verify built production separately.
Move the visible Next developer indicator to top-right and reserve mobile header
space, because its default bottom-left position blocks Home navigation. Errors and
warnings remain visible; checks are not bypassed.

## 2026-10-04 — Verified Hevy CSV import

Use the supplied ignored local reference only for schema/aggregate verification.
Synthetic tests reproduce its column format without copying personal data. No source
file, filename, raw preview or personal rows are checked in or logged. No new library
is needed for this small strictly validated CSV grammar. Parser contracts remain
replaceable; source errors block the whole batch, rather than silently skipping rows.

Italian wall times require user-reviewed IANA timezone (default Europe/Rome), with
DST ambiguity/gaps rejected. Group exact source timestamps/title/description, preserve
historical title separately from null routine identity, retain source set ordering
and source context. Repeated indices split blocks with a warning. Zero/missing load
and timed/distance rows remain valid. Imported RIR is unknown; neither RPE 10 nor
load/reps implies failure. Imported sets have unknown loggedAt, not invented times.

Persist exact confirmed name mappings and SHA-256 fingerprints independent of
canonical exercise selection. Exact duplicates skip automatically; timestamp matches
or conflicting incoming groups require review. Changed exports are never auto-updated.
All identities must resolve before confirmation. Unassigned muscle metadata is honest
and allowed with warnings. Source snapshots remain immutable after library edits.

One validated localStorage replacement commits workouts/library/mappings/batch summary.
Require explicit approval and unchanged preview state; stale raw storage also blocks
writes. Additive v2 schemaRevision 1 defaults preserve previous v2/V1 compatibility
and full JSON export format 1. No backend, real AI or physiological calculations.

## 2026-10-04 — Canonical unassigned exercise metadata

Use null for primary muscle metadata, not a fake muscle label. Empty inputs and the
older Unassigned marker normalize to null in shared library/workout schemas. Preserve
valid assigned names; absent secondary groups become [], absent equipment/category
are allowed. Store v2 revision 2 accepts revision 1/missing revisions and normalizes
on read; the same storage key, legacy isolation and backup format remain intact.
Normalize library metadata before import snapshots/warnings and validate again at
atomic confirmation. Keep unassigned sets/sessions separate from named muscle totals
without excluding their history, actual performance or effort information. UI labels
and optional fields expose this state. SQL 0003 is an unapplied alignment draft.

## 2026-10-04 — Server-only Strava and canonical activity registry

Strava is the cross-sport safety net, not authority for resistance-training structure.
Add a new version-1 canonical registry with provider records/raw revisions and field-level
provenance; leave browser Gym v2/revision 2 and the real Hevy dataset untouched. Explicit
sync may publish timing/identity summaries for matching only. No sets/routines migrate.
Activity registry access lives in Gym/Running links to preserve five primary navigation items.
Running history is real; its physiology/dashboard cards remain visibly sample data.

Use Supabase Auth identity and service-only integration tables/RPCs, encrypted OAuth tokens,
HttpOnly encrypted app session/state cookies, exact POST origin validation and owner checks.
No browser token persistence or public secrets. Opt-in encrypted single-user file storage is
allowed only in development, requires a random access key, is ignored and excluded from
production traces. Key rotation requires re-encryption/reconnection; no fake credentials or
remote migrations run. Actual DB/Auth/API validation remains a separate configured step.

Verify current official API rather than old tutorials. October 2026 API base is centralized
as www.strava.com/api/v3, with api-v3.strava.com selectable for Jan 4 2027. Read-only scopes
activity:read_all plus webhook-documented activity:read; no writes. Token scope accepts space
or comma formats, refreshed tokens persist before use, and newest revoke endpoint authenticates
the client with the refresh token. API errors omit raw response bodies/secrets.

Versioned match heuristics use permanent IDs, sport/time/duration/distance, not title alone.
One unique high cross-provider candidate links; weak/multiple or distinct same-provider IDs
require review. Keep-separate/link decisions persist, source values survive, merged IDs redirect.
Gym/Hevy remains authoritative, Strava strength shells do not create CompletedWorkouts, and
confirmed canonical queries exclude pending reviews to avoid counting uncertain duplicates.
Future Polar can attach another source; no Polar implementation or physiological score now.

Registry backfill is summary-only, frozen before/after bounds, 50/page and user-driven bounded
batches with checkpoints/idempotency. Explicit enrichment stores streams/laps separately and
returns only stream availability/lap summaries to UI. Read and general rate headers both
control persistent pauses; no frequent polling. Webhooks validate/queue rapidly and verify
provider truth before destructive source/account state changes; canonical history stays.
A public subscription and deployed queue worker are not silently created for localhost.

Keep main Gym concise: three completed workouts, three recent exercise histories/search;
full browsers paginate 20 with filters/sorts. Preserve all detail/lifecycle routes and tests.

Later summary responses can omit earlier detailed fields. Preserve last recorded non-null
canonical/device values rather than erasing enrichment; raw revisions preserve their source
snapshot. Current source syncedAt still updates on identical sync. Explicit null optional
measurements remain missing, not fabricated zero values. More granular per-field observation
timestamps and provider removal semantics belong in the future precedence policy.
