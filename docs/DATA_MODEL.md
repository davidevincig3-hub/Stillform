# Data model

## Four layers

1. Raw: source/external identifier, recording/reception timestamps, quality and
   unmodified JSON payload. `(user, source, external ID)` is the idempotency key.
2. Canonical: internal activities of all types, timestamps, optional plan linkage,
   source references, streams and field provenance including competing values.
3. Derived: value/unit/name, calculation version/time, input references, quality,
   confidence and mock flag. Recalculation must retain historical versions.
4. Interpretation: assessments, evidence-family contributions, recommendations,
   alternatives, approval, choices and subsequent activity links.

Entities include profiles, recovery nights, activities/sources/streams, exercises
and aliases, ordered routines, gym sessions/sets, metrics, baselines, original goals
plus nullable interpretations, plans, context, schedule constraints, assessments,
recommendations, outcomes and coach conversations/messages.

Owner RLS and composite owner foreign keys prevent cross-user relational linkage.
JSON/array references need application validation. The migration is unapplied and
must be verified in Supabase. One active session per user is enforced by an index.
Set schema supports bodyweight (null load), positive reps, optional effort/failure.
Editing invalidates set completion until logged again. No target weights or HR
requirements. Duration is descriptive.

## Provenance and deduplication

Strava is the broad registry/safety net. Polar/chest strap can be authoritative for
running HR; Strava can supply route or other-device streams. Internal gym logger
wins sets/reps/load/effort; imported Hevy can seed history. Matching Strava Weight
Training adds a reference, never a second workout. Quality still matters when
selecting fields; preserve alternatives and all raw/source links.

V1 has precedence/dedup interfaces, not an automatic fuzzy matcher. Future matching
uses known links first, then timestamp/type/duration/distance candidates. Ambiguous
matches require review. Merging must be idempotent and preserve references.
Unplanned activities remain valid and inform later load assessment.

## Quality and baselines

Levels: high/medium/low/insufficient. Quality describes inputs; confidence describes
inferences. Chest strap vs wrist HR, poor GPS, subjective RIR and contextual Calendar
have different reliability. Missing gym HR must not affect set-quality assessments.
`weakestConfidence` is only a conservative helper, not a validated aggregation engine.

Families: autonomic, sleep, training stress, performance, context. Correlated
within-family signals are not independent votes. Influential-card ranking is
presentation only. Baselines retain metric/value/unit, count, window, confidence
and maturity: insufficient/preliminary/developing/established. No day thresholds
are invented. Sample baseline: 42 observations, developing; chart range selection
does not redefine it. Recommendation outcomes link choices to later performance.

## Real Gym schema (storage version 2)

Exercise: stable ID, name, primary/secondary groups, optional equipment/category,
custom flag. RoutineExercise: entry ID, exercise ID, default sets, optional rep
range and notes; array order is exercise order. GymRoutine adds ID/name/notes and
creation/update timestamps. Built-ins are metadata only; templates never include
sets, performance history or target loads.

Workout snapshots store routine ID/name/structure, start/end, descriptive duration,
exercise ID/name/group/equipment/order/notes/rep range, all set fields and completion
timestamps. Effort keeps optional RIR/RPE/failure without converting one into the
other. Completed workouts are never rewritten by routine/library edits. Explicit
provenance source is local_logger, legacy_v1 or future hevy_import; dataOrigin is
user, legacy_unverified or demo. Real history rejects demo/unverified entries.

Local store key `adaptive-coach.gym.v2`: version=2, exercises, routines, active,
history, legacyArchive. V1 decoding reads `adaptive-coach.workouts.v1`; it preserves
sessions/sets, associates exact case-insensitive names with library identities or
creates a legacy custom identity, removes every old `previous` sample string, and
places completed records in legacyArchive. Active records remain active. Explicit
review changes origin, never invents sets. Unknown V1 finish time/duration remains
null. V2 is written on the first successful edit; V1 is never removed/overwritten.
Malformed/unsupported versions show errors and block writes. No silent fallback
from invalid V2 to older records. Export buttons are disabled for unreadable state.

Previous exposure queries filter completed, confirmed-user workouts by exercise ID
and chronology, take up to four recent exposures, and include only completed sets.
Missing effort is disclosed; no performance score is computed. Weekly grouping is
Monday–Sunday in the browser timezone, by workout start, counting primary groups
once; frequency means distinct sessions, not secondary-group contribution. Future
baselines must use this same real-only gate.

Backup JSON envelope: format=stillform-gym, formatVersion=1, exportedAt,
storageVersion=2, data=full validated store. Active and legacy sections are kept
separate from history. CSV is one row per set (including uncompleted sets flagged
false) from confirmed completed workouts; names/notes are quoted, formulas escaped,
units kg, timestamps ISO. CSV cannot reconstruct the full routine/library graph.
Restore requires a future validated preview/migration/confirmation workflow.
