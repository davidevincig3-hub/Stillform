# Product specification

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

Gym header and sections say real local data; Recovery/Running/Plan/Home remain demo.
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
No external service integrations have been added.

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
remains an explicit Unassigned group. Full superset programming is not implemented.
