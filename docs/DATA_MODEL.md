# Data model

## Polar source storage version 1 (current extension)

Canonical registry version 1 and Gym v2/revision 2 are unchanged. `PolarStore` is a separate
server-only owner-keyed version-1 blob with realMode, jobs, sleep/nightly/continuous/PPI arrays,
device/catalog context, request timestamps and persistent backoff. Old encrypted dev records
without this state decode an empty store; missing Polar credentials decode null. SQL 0005 adds
integration_polar and a service-only CAS RPC. No browser-local Gym migration is triggered.

Jobs retain requested from/to (inclusive/exclusive), next discovery date, phase, available-date
detail queue, done/unavailable flags, request count, empty windows, oldest/newest returned,
last successful timestamp and curated errors. Zero records remains valid completed discovery.

All physiological records preserve real Polar provenance, date/device, sync timestamp, raw
snapshot, previous revisions and unknown sensor quality. Sleep normalizes source start/end,
seconds asleep/span/awake/phases, interruptions, continuity, efficiency, vendor Sleep Score,
user-modified marker and completeness. Detailed offset/trim/original structures stay raw;
UI timing is source timing, not a new sleep-regularity calculation. Missing values are null.
Nightly stores vendor RMSSD/RRI/respiration intervals in milliseconds and vendor baseline/status
fields. No conversion to mean night HR, invented respiration rate or proprietary Recovery state.
Continuous HR retains local date + offsetMillis, nullable absolute timestamp, BPM, device and
trigger. PPI stores interval/errorEstimate milliseconds, offset, skin contact/movement/offline,
device and trigger changes. Unknown sample timezone is explicit; no HRV is derived from BPM.

Polar permanent training identifier becomes an ExternalActivitySource under the authenticated
owner namespace. athleteId is null because no provider stable identity is documented in the
minimal token response. The encrypted account's shared athleteId field holds an owner binding,
never a claimed Polar athlete ID. Naive training start uses provider timezoneOffsetMinutes;
already-offset timestamps are interpreted once. Missing naive timezone blocks ingestion.
Sports resolve through the real catalog, unknown types stay other. There are no fabricated
device sensor assumptions. Normalized fingerprints/previous raw structures preserve changes.

RichActivityData optionally contains PolarFeatures: per-exercise vendor Running Index/load,
sample types/values/intervals/units, zones, pauses, routes and statistics, plus raw session.
HR units are bpm; unsupported speed sample units stay provider_unspecified. Provider laps
normalize milliseconds to seconds, distance and HR, preserving manual/automatic/exercise
context in raw records. Strength-training vendor results remain raw; never become Gym sets.

Field provenance is retained. Recorded Polar HR can supersede selected Strava HR; other
nonnull canonical values remain selected. Source updates change only their selected fields.
Gym/Hevy exercises/load/reps/effort/routines are authoritative and not mutated by Polar sync.
UI maturity uses only real complete metric observations, not vendor baseline maturity or
sample counts. Defaults/limitations are documented in README and analytics/polar-recovery.ts.

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
provenance source is local_logger, legacy_v1 or hevy_import; dataOrigin is
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

## Hevy CSV v1 / store v2 schemaRevision 2

Verified columns: title, start_time, end_time, description, exercise_title,
superset_id, exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
duration_seconds, rpe. Quoted commas/newlines/doubled quotes and UTF-8 BOM are
supported. Exactly these 14 columns are required, in any order; unknown schemas
are rejected. Numeric values use source decimal points; invalid/negative values,
unknown dates, missing title/exercise/index/type and reversed timestamps block import.
Italian gen/feb/mar/apr/mag/giu/lug/ago/set/ott/nov/dic dates are interpreted in an
explicit IANA timezone, not the machine timezone. DST gaps/ambiguity are errors.
Original local strings and zone are preserved alongside canonical UTC timestamps.

Grouping key is the exact source start/end/title/description tuple. Historical title
is held in routineName for existing presentation compatibility and originalTitle in
provenance; routineId and routineSnapshot are null. Exercise source names, row notes,
zero-based set index, relative source row order, type, superset, distance and duration
are retained. Contiguous source exercise runs become ordered blocks, splitting on
repeated indices; each block sorts stably by source set_index. No rows are discarded.
Completed imported sets may lack reps and load. Set loggedAt remains null because
CSV has no individual logging timestamp. RIR always remains null, RPE is independent,
and failure is true only for explicit failure type. Missing effort reduces comparison
context, never excludes historical sets. No score or physiological estimate is added.

Provenance includes hevy_import, import time, batch ID, original title, timezone,
original start/end and SHA-256 fingerprint. The fingerprint hashes a versioned source
representation: timezone, original timestamps, title/description and every ordered
normalized source row. It excludes current mapping/library metadata and filename.
An exact fingerprint already present is a confident duplicate and skipped. Any
existing completed workout at the same canonical start, or multiple new groups at
that start, is ambiguous and needs an explicit skip/import-separately choice. This
conservative rule handles changed exports without silently merging them. Source
workout IDs do not exist in this verified CSV. Physically distinct sessions with
identical grouping metadata cannot be distinguished; correct such source data first.

hevyMappings stores exact source name → confirmed canonical ID. No case/fuzzy/synonym
merge is implicit. Several names can share one ID by user choice. importBatches records
ID, timestamp, source, zone, workout/set/custom counts, duplicate skips and warnings.
Both fields default empty when old v2 stores are decoded; schemaRevision defaults to 2 (revision 1 is migrated on read).
Old V1 isolation remains unchanged. Full JSON backups retain all fields; CSV adds
source-name/type/index/order/notes, distance/duration/superset, fingerprint/batch fields.
Muscle metadata is snapshotted; future metadata backfill needs a separate reviewed
operation. Null load is not automatically bodyweight for imported sets.

Nullable Gym metadata fix: primary muscle group is canonically null when unassigned;
the UI displays Unassigned and fields may remain blank. Secondary groups may be
absent (canonical []); equipment/category accept absence/null. Decoder revision 2
normalizes older Unassigned/blank markers and revision-1 stores without losing
history. Assigned values retain their identity. Import planning normalizes metadata
before building snapshots/warnings, and atomic confirmation revalidates it.
Unassigned sets/sessions are reported separately from named muscle totals; their
history, load/reps, previous performances and effort remain available. The new SQL
alignment migration is unapplied, as are the existing migrations.

## Canonical integration registry version 1

The newer `CanonicalActivity` in `domain/activity.ts` is the integration entity; older
foundation `Activity` contracts/seeds remain for labeled sample modules. Real sync does
not use their stub Strava adapter. The canonical record includes stable provider-independent
ID, normalized sport, title, UTC start, optional original local start/timezone, nullable
elapsed/moving seconds, distance/elevation meters, recorded average/max HR and speed,
device, status, available/missing fields, recorded/limited quality (not physiology),
created/updated timestamps, source keys, optional Gym workout ID and future planned-session ID.

`ExternalActivitySource` stores provider (Strava/Hevy/internal/future Polar/manual), permanent
ID, athlete identity, exact original sport type, canonical reference, sync time/device,
SHA-256 fingerprint, deletion flag, raw source values and previous raw revisions. Field
provenance maps canonical fields to source keys. Existing selected values remain selected;
new sources fill only absent values. Provider changes update only values owned by that
provider. Raw records are retained; no global source/physiology precedence is fabricated.
GPS/HR stream provenance is attached when actual nonempty streams arrive, with missingness
explicitly recorded when unavailable. Missing HR is valid, especially for strength sessions.

Registry has arrays of activities/sources/reviews, persisted link/separate decisions keyed
by permanent source ID, canonical ID aliases after merges and paginated sync checkpoints.
The matching v1 policy compares same sport, start within ten minutes and elapsed difference
within max(15 minutes,25%). High requires start within one minute, elapsed difference within
max(60 seconds,2%), plus distance within 2% for non-strength. Missing distance means possible
match; title alone does not match. Unique high cross-provider candidates auto-link; multiple,
weak or same-provider/different-ID candidates require review. These are documented heuristics,
not calibrated probabilities. Pending review records are excluded by confirmed-window queries.

Gym references contain only confirmed workout IDs, titles, timing, descriptive duration and
provenance. A matching canonical strength session has one Gym reference and multiple sources;
CompletedWorkout/exercise/set repositories are never mutated by sync. Unmatched strength is
an honest shell. A future Polar source can attach to the same activity without a vendor adapter
or physiological calculations in this milestone.

`NormalizedStream` holds type, samples, original size, resolution and time/distance series
metadata. Numeric, boolean moving and coordinate samples validate by kind; invalid samples
are omitted with warnings, unsupported kinds are reported. Laps preserve recorded duration,
distance, speed, average/max HR, start and original source values, with missing fields null.
`RichActivityData` is separate server storage keyed by source ID; ordinary registry responses
exclude raw snapshots, revision arrays and large streams. Detail includes stream status and
sanitized lap summaries. Missing streams/laps are valid, never fabricated.

SQL 0004 adds owner-keyed integration_registry (versioned JSON state), integration_accounts
(encrypted token envelopes, unique provider/athlete), integration_rich_data, webhook_jobs
(content-hash identity and processed timestamps), and leases. Service-only CAS and lease RPCs
serialize mutations. Tables use RLS with no browser-access policies/grants. Application routes
resolve authenticated owners; the SQL draft requires actual deployment verification. No Gym
key/version/schema or JSON backup format is changed, and no existing data is moved/deleted.
