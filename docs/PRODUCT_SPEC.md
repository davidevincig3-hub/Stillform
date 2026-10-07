# Product specification

## Gym performance V1

Exercise detail provides recorded load/repetition history and narrowly defined
records, plus first-set load comparisons with exact session references, effort
coverage, exclusions and limited evidence confidence. Account results consider
relevant history before pagination; local mode uses the same pure analytics. No
progression, stall/deterioration labels or AI. See [comparison rules](GYM_PERFORMANCE.md).

## Account Gym milestone

After explicit reviewed bootstrap/account loading, authenticated Gym history, routines,
library, pins, shortlist and active workout use shared server authority. Local desktop
backup remains intact; pending drafts survive transient network failures; stale saves
require explicit reload. No silent merge, upload or last-write-wins. This supersedes
earlier per-browser authority statements once account mode is enabled. Live migration
remains approval-gated. See [account Gym](GYM_CLOUD.md).

## Daily Gym usability

Gym prioritizes Start/Resume, saved routines, recent/frequent exercises, three latest
completed workouts and searchable full library/history. Suggestions use real completed
history since 2026-09-01 in Europe/Rome; counts and recency-weighted exposure ranking
never infer routines or muscle metadata. Users pin, dismiss and restore suggestions.
Routine/active-workout editors reuse the shortlist for immediate additions by canonical ID.
Trusted-LAN development and reviewed empty-browser JSON bootstrap support phone logging;
storage is still per browser/origin. Newer Hevy exports add new sessions, skip unchanged
fingerprints and require review of edited prior sessions. See [mobile setup](MOBILE_GYM.md).

## Current milestone — Polar v4 real source data

Recovery Engine V1 supersedes earlier statements that no engine exists. Home recovery
and Recovery share a deterministic real assessment: insufficient_data, normal (usual
personal range), possibly_suppressed or possibly_elevated statistical pattern, with
separate confidence, maturity, family contributions, influential signals, anomalies
and missing-data explanation. No recovery score, AI, diagnosis or training prescription.
7/28/90-day source views retain real gaps and use descriptive medians.

Personal prior baselines and recent trends remain separate. Explicit exclusions and
incomplete observations never enter engine baselines or maturity. Independent-family
convergence is required for an integrated pattern; one anomalous observation/trend
remains a lower-confidence anomaly. Absence of context never counts negatively. Sleep
timing/regularity and training duration/exposure are descriptive, not physiological scores.
Local Gym comparisons require matching exercise/equipment, first-set reps and recorded
effort; no e1RM or comparison of missing effort. Running drift and PPI HRV remain unavailable.
All maturity/deviation/convergence cutoffs are product heuristics requiring evaluation.

Provider existence is distinct from recovery eligibility. Recovery history supports
explicit Exclude from recovery and Restore actions with optional artifact/detection
reasons. User adjudication is authoritative and survives resync; raw provider records
and provenance are retained. Excluded observations do not enter recovery trends,
averages, descriptive baselines, coverage or baseline maturity. Valid counts describe
eligible observations; completeness and available values are checked independently.
Real Home, confidence and Recovery Engine consumers use the shared filtered
recovery-input query. Automatic quality
checks may eventually request review but cannot silently invalidate user observations.

This section supersedes earlier statements that Polar is a stub. Strava remains dormant,
not removed; credentials for it are unnecessary to use Polar. Local Gym/Hevy remains
authoritative in local mode; account mode uses Supabase. Connecting does not import automatically. Secure Integrations
offers explicit training/Recovery/all sync, date bounds, checkpoints, Continue, scopes,
errors, empty windows and oldest/newest returned. Zero historical nights is success.

Training uses shared canonical identity/matching: Polar strength can attach physiology to
Gym without creating sets or CompletedWorkouts; future Strava copies attach another source.
Weak/multiple matches require review. Missing HR/GPS is normal. Rich feature hydration is
explicit from activity detail, and vendor Running Index/load is secondary. Polar availability
is not complete running history. Unknown catalog IDs remain other, preserving source type.

Recovery after connection displays a distinct real source view, including an honest empty
state. The separate labelled sample view never fills real chart gaps. Real display includes
nightly vendor RMSSD/RRI/respiration intervals, sleep duration/continuity/efficiency/timing,
interruptions/phases, edits/completeness, device context, vendor comparisons and 7/28/90-day
histories with Analyze. Recovery Engine V1 adds the statistical assessment described above;
no training recommendations or readiness percentage.
UI maturity counts complete observations per metric/window; defaults 7/14/28 are configurable,
not validated physiology. Missing/incomplete nights do not become synthesized baselines.
Continuous daytime HR and PPI have separate server measurement contexts and count summaries.
Sensor quality remains unknown; device identity alone proves no sensor type.

Home recovery uses the real shared engine. Plan/Coach and Running custom analytical
cards remain labelled samples. Calendar, Consensus, drift/threshold/VO2 analytics and
real AI are out of scope. Production and the existing account migration were verified
on 2026-10-06; see DEPLOYMENT.md. New accounts/deployments still require explicit setup
and reviewed bootstrap; no personal fixtures are used.

## Principles

Personal baselines, trends, independent evidence families, calibrated uncertainty
and explanations. No opaque recovery/hypertrophy score or simplistic VO₂max.
**Plan stability, not plan loyalty:** benefit must justify disruption. Unplanned
swimming/cycling/hiking is normal canonical activity data. Recommendations remain
suggestions, and rescheduling always requires approval.

## Implemented foundation

- Home: recovery state/confidence, three dynamically ranked sample influential
  metrics, one integrated explanation, today's plan and compact three-domain
  trends. No recent activity feed or large recovery percentage.
- Recovery: HRV, night HR, respiratory rate and sleep duration charts with
  7/28/90-day views and baseline references; timing/regularity/continuity context.
  Stages are secondary. No proprietary sleep score is central. Analyze exposes
  structured data. Optional anomaly exploration is a placeholder, not a questionnaire.
- Running: state/confidence/dynamic metrics, comparable easy pace, drift,
  threshold, 4×4 performance, load and full sample history. Detail routes prepare
  maps, streams, splits, zones, conditions and AI interpretation. Running Index is
  a future secondary vendor signal. No precise physiological estimates are invented.
- Gym: persistent create/edit/rename/delete/duplicate routines with ordered library
  exercises, default sets, optional rep ranges and notes; dedicated workout mode; editable
  weight/reps/optional RIR, optional RPE/failure; add/remove sets/exercises;
  leave without ending; global return pill; reload persistence; completed history;
  explicit discard. Empty completion is rejected. Target weights are blank.
  Previous performances come exclusively from confirmed real completed workouts.
  Real weekly sets/frequency use primary muscle-group snapshots; effort distributions
  remain descriptive. Unknown effort limits comparisons. No sample analytics fill gaps.
  Workout details reconstruct all sets, timestamps, duration, notes and provenance;
  exercise details list dated exposures. Historical deletion requires confirmation.
  Templates copy structure only. Built-in exercise metadata is editable only through
  custom alternatives; custom exercises have stable IDs and can be renamed/edited.
- Plan: clean sample week, original natural-language goal, phase/focus, recent and
  possible progression, flat planned trajectory, rationale, accept/reject sample
  proposal. No auto-rescheduling or precise forecasts; goal interpretation pending.
- Coach: global compact question/larger chat demo, current-page context, usable
  during workouts, explicit placeholder replies and in-memory conversation history.

## Gym data and storage

Gym uses real local or account data. Recovery/Home assessment and Running history
use real configured sources; Plan/Coach and Running analytical cards retain sample labels.
All personal queries require completed + confirmed user origin. V1 sessions without
origin are preserved separately as legacy_unverified until reviewed; old sample
previous text is removed. New workouts have local_logger provenance. Missing HR
does not affect the logger or analytics. History snapshots survive routine deletion
and exercise metadata edits. Weights are kg; blank weight means bodyweight.

Version-2 local store preserves active sessions across navigation/reload, validates
writes and surfaces errors. Full JSON formatVersion 1 includes library, routines,
active/history and separate legacy archive. CSV covers real completed set rows.
JSON restore and automatic backups are future work. Hevy CSV import uses a verified
local parser and explicit review; uncertain identity prevents confirmation.
Strava server integration is now implemented; live connection requires the setup below.

## Targeted refinements

Home retains its structure with Explain and stronger today's-training prominence;
the internal plan-stability slogan is removed from persistent UI. Recovery has a
compact sample sleep interpretation without a score. Running has a secondary Polar
Running Index placeholder; interval types support per-repeat pace/HR, target time,
HR recovery, decay and consistency with nullable unavailable values. Plan data types
distinguish historical actual, planned, candidate and statistical forecast series.
Only the existing sample planned series is drawn; forecasts require supporting
observations/model/validation/uncertainty metadata. No missing metrics are invented.

## Future behavior

Gym quality must not be penalized for absent HR. Duration is descriptive and has
little/no weight in fatigue estimation. Analyze actual load/reps/effort across
several comparable exposures, not rigid short windows. CSV import previews
workouts, maps names and resolves duplicates; personal baselines remain future work.

Intra-workout coaching observes one poor set and requires coherent anomalies
before alerting. Recovery/load convergence can strengthen confidence. Store
recommendation → user choice → subsequent performance; alerts are not commands.

Running progression passes personal-data and scientific-rationale gates. Completed
workouts alone do not justify progression. Projection is adaptive and confidence
aware, initially a planned trajectory. Evidence families reduce double counting.
Baseline maturity and supporting observations must remain visible.

AI uses complete capability with selective retrieval. Deterministic analytics
calculate metrics; models interpret them. Separate personal evidence, retrieved
scientific evidence and model reasoning. Research is question aware: intervention
questions favor meta-analyses/reviews/RCTs, relevant trained populations, recency,
peer review and quality; other questions need appropriate designs. Reliable Q1/Q2
rankings are preferences, not exclusion rules. Disclose unavailable live verification.

## Design

Restrained cards/typography, space, dark mode, confidence pills, responsive charts
and progressive disclosure. Mobile bottom nav becomes desktop side nav. Installable
PWA with static offline fallback; full offline editing/auth/integrations are deferred.

## Verified local Hevy import

The Gym import milestone now supports the verified 14-column Italian Hevy export:
select → parse/validate → preview → map unique exercise names → review duplicates →
summary → explicit confirmation → atomic local batch. Preview remains in memory;
errors block all mutation. Custom exercise metadata can remain Unassigned with
explicit warnings. Suggestions require selection; no guessed anatomy or synonyms.
Confirmed name mappings persist for repeat imports. No routine is inferred from a
historical title. Imported source history is confirmed-user data, powers Gym queries,
and never populates the sample Recovery/Home/Running/Plan pages.

Preserve RPE and explicit failure independently; imported RIR and individual set
logging times remain unknown. Preserve zero/null load, nullable reps, distance,
duration, set type, superset, notes and source ordering. Unknown effort limits
comparisons, not history inclusion. All completed types count in descriptive set
totals; avoid interpreting these totals as equivalent hypertrophy stimulus.
CSV source timezone is explicitly reviewed; default Europe/Rome. Repeated source
indices are warned and preserved in separate blocks. Missing anatomical metadata
is represented as null and reported separately as Unassigned. Full superset programming is not implemented.

## Strava/canonical activity milestone

- Secure Integrations is optional; local Gym works without server credentials. Supabase
  Auth/account ownership gates server data. Connect, denied/scope handling, reconnect and
  confirmed disconnect are implemented. Connection alone never syncs history.
- General `/activities` is the broad cross-sport registry. Access from Gym and real Running
  history keeps the five primary navigation destinations intact. Unknown/unplanned sports
  are valid `other` records with exact source types, not discarded activities.
- Running workout history uses canonical run/trail-run records exclusively. Sample analytical
  cards remain explicitly separated; real run details expose recorded values, source/device,
  nullable HR, speed, elevation, field provenance, lap summaries and stream availability.
- Gym main shows only the three most recent completed workouts. Full `/gym/history` offers
  chronological pages of 20, search/title/date-range filters and unchanged detail routes.
  Exercise history is search-first: three recent entries (eight search matches), full searchable
  and sortable browser at `/gym/exercise-history` with pages of 20. No personal data changed.
- Strava strength matches existing confirmed Gym/Hevy summaries. A unique high heuristic match
  attaches the source to one canonical session; ambiguous/weak matches require an explicit
  persisted link/separate decision. It never creates a CompletedWorkout or invents sets.
- Explicit bounded sync/backfill with checkpoint, rate-budget pauses and counters. Rich data
  hydration is user-requested, not wholesale historical stream fetching. No automatic workout
  import, rescheduling, physiological score, Polar, Calendar, Consensus or real Coach.
- Public webhooks acknowledge persisted events quickly; processing checks API truth. Localhost
  uses manual sync; live subscription and background worker setup remain deliberate later steps.

Account Gym uses bounded server views and lightweight metadata/active drafts in localStorage. IndexedDB retains only unsynced operations, with revision CAS and immutable receipt retries. Historical pages, previous exposures, exports and Hevy previews load on demand; unloaded history is preserved by entity deltas. See [quota-safe account persistence](GYM_CLOUD.md#bounded-reads-and-quota-behavior).
