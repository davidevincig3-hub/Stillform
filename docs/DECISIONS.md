# Decision log

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
