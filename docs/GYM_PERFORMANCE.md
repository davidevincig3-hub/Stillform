# Gym Analytics & Performance Engine V1

Exercise detail answers what was recorded, which sessions can be compared and why
confidence is limited. No progression advice, physiological improvement claim,
stall/deterioration classification, e1RM, hypertrophy score or AI is implemented.

## Descriptive history

Completed confirmed-user workouts only, through the assessment instant. Canonical
exercise IDs group history even after renames. All completed set types contribute
to exposure/set counts and effort coverage; warm-ups, dropsets, repeated blocks,
unknown loads/reps and provenance remain visible in the existing paged set history.
Recent load/repetition ranges are separate ranges, not paired performances.

Recorded PRs separate historical equipment and exact set type. Highest recorded
load can exist without reps; highest load at fixed reps and highest reps at fixed
load require a recorded load/reps pair. Zero load is preserved; missing load is
never substituted with zero/bodyweight. Records include unknown effort and are
explicitly descriptive, not evidence of physiological improvement. Unknown equipment
forms an explicitly unknown historical group, not verified machine equivalence.

Eight recent exposure summaries and up to twelve groups per record list are returned;
record groups are ordered by their most recent encounter. Each record links to its
source workout/block/date. Full paged set history remains available.

## Comparable recorded load

Shared `comparableFirstSet` preserves the existing Recovery protocol and identity.
Exercise performance adds stricter grouping without changing Recovery behavior:

- First stored set of each block must be completed, have positive load/reps and
  recorded RIR, RPE or explicit failure. A later working/best set never substitutes
  for an ineligible first set. Warm-up/drop/unknown types are descriptive only.
- Match canonical exercise, exact historical equipment (must be specified), block
  occurrence within that exercise, exact normal/failure set type, reps, RIR, RPE,
  failure flag and superset presence. No guessed equipment equivalence or effort
  conversion. Unknown RIR may match unknown RIR when RPE/failure is recorded.
- Require three distinct Europe/Rome session dates within one protocol. Take the
  latest observation per date, with stable workout-ID ties. This is a conservative
  product evidence gate, not a validated physiological threshold.
- Choose the qualifying protocol with the newest exposure, then most distinct
  dates, then stable protocol key. Compare the latest load with the median of up
  to three prior dates. Display exact references, range, eligible date count,
  recent matched sessions, excluded blocks and overlapping reasons.

Evidence confidence is **insufficient** without a qualifying protocol and **low**
otherwise. Technique, range of motion, rest, machine settings and superset partner
context are unrecorded. More history cannot remove that limitation. The chosen
protocol may be older than the latest workout; the actual compared dates are shown.
Failure false means no explicit failure recorded, not proven absence of failure.

## Cloud and local authority

The same pure function consumes local history or account history. The existing
owner-authenticated exercise query computes its summary before pagination, returning
only compact results alongside that history page. No full account clone or extra
all-history request is introduced in the browser. Missing cloud summaries do not
fall back to a partial page. Account revision changes reload summary/history together.

The current 0006 repository still reconstructs the account server-side before bounded
selection, as it did previously. SQL-side filtering/pagination remains a scaling
optimization; this milestone adds no migration, RLS policy or write endpoint.

Existing weekly primary-muscle sets/frequency retain separate unassigned sets and
session counts. Historical snapshots are authoritative; no muscle backfill is inferred.

## Coverage audit

`gymPerformanceCoverage` reports aggregate proportions over actually used exercises:
at least one completed confirmed set. Useful descriptive history requires recorded
load, reps, duration or distance; paired load/reps history is reported separately.
Comparison requires the protocol above. Any effort and useful effort
coverage are separate. Useful coverage means at least 50% of completed sets have RIR,
RPE or explicit failure, a descriptive product cutoff. It does not by itself imply
comparable first sets or adequate dates. Live audit results are aggregate only;
private workouts, names and IDs must not be saved into committed fixtures.

Read-only current-owner audit on 2026-10-07 confirmed 287 workouts, 1,557 workout
exercise blocks and 3,658 sets. Of 127 actually used canonical exercises, 127 (100%)
have useful descriptive history, 103 (81.1%) have load/repetition pairs, 35 (27.6%)
have any recorded effort, and 1 (0.8%) has effort on at least half its sets. None
qualifies for the stricter comparison: all 1,557 historical equipment snapshots are
unspecified and 1,429 blocks lack first-set effort. No metadata or effort was filled
in. Account revision and document checksum were unchanged across the audit.

The exercise-detail UI was checked locally with a read-only real account snapshot
at 390/430/1143px, including record disclosure, exclusion explanations and history
pagination. This was isolated UI replay, not a deployment or authenticated production
acceptance test. Temporary audit/replay code is removed; committed tests use only
synthetic history.

## Milestone verification

Typecheck, lint, formatting and production build passed. Unit suite: 232 passed,
one private Hevy reference fixture intentionally skipped. Built-production browser
suite: 54 passed; private-access suite: two passed. Synthetic performance tests cover
canonical grouping, repeated blocks, set classification, missing loads/reps/effort,
independent RPE/failure, records without effort, insufficient evidence, deterministic
selection, complete cloud history beyond pagination, owner-scoped reads and preserved
Recovery/weekly analytics. No dependencies or schema migrations were added.
