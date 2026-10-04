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
