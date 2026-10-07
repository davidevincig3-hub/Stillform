# Gym Performance Trend V1

Gym main replaces the short exercise-history list with one **Performance trend**
chart. Muscle groups opens group and canonical-exercise selectors; selecting an
exercise keeps access to full set history and existing conservative comparisons.
Weekly sets/frequency remain separate descriptive analytics. Logger references,
Recovery comparison rules, routines and all persistence/write paths are unchanged.

## Scientific source and product transformation

Nuzzo, Pinto, Nosaka and Steele, _Maximal Number of Repetitions at Percentages of
the One Repetition Maximum_, Sports Medicine **54**, 303–321 (2024), published
online October 4, 2023: <https://doi.org/10.1007/s40279-023-01937-7>.
The study analyzes population repetitions-to-failure relationships. It does not
validate an individual's Stillform trend or submaximal recorded sets.

The following figure points were supplied and verified by the product owner
against the original figures 2–4. Each pair is (mean repetitions, load fraction):

| Model       | Points                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| General     | (3.28,.95), (4.94,.90), (7.15,.85), (9.75,.80), (12.37,.75), (14.80,.70), (17.11,.65) |
| Bench press | (2.59,.95), (4.11,.90), (6.23,.85), (8.82,.80), (11.51,.75), (14.08,.70), (16.59,.65) |
| Leg press   | (7.04,.95), (8.69,.90), (10.69,.85), (13.05,.80), (15.79,.75)                         |

Stillform linearly interpolates fraction between adjacent points by recorded reps,
then uses `seriesValue = recordedLoad / fraction`. Interpolation, inversion and
normalization are **product choices**, not the original spline, a validated
individual prediction, measured maximal strength, hypertrophy or recovery.
Study confidence intervals are not transferred to the user. The UI explains:
“Combines recorded weight and repetitions. Changes can also reflect differences in effort.”

Only integer 5–15 reps and positive finite loads qualify, within the chosen table's
range. Leg press therefore accepts 8–15, excludes 5–7, and never falls back to
general or extrapolates. Bodyweight, dumbbell total load and missing effort are not
inferred. RIR is not added to reps; RPE is not converted; no failure is assumed.

`verifiedTrendModels` is an explicit audited canonical-ID registry, independent of
names/library edits. Currently `builtin-leg-press` is the only verified special
identity. No built-in barbell/Smith bench identity exists in this library, and
imported UUIDs have no verified classification. They retain the general model.
The bench table is implemented/tested and available to deliberately reviewed
canonical classifications; V1 does not add classification editing or infer custom
metadata. A future registry change must be reviewed: it changes model selection.
The chosen model is returned and shown per protocol.

## Selection and protocols

Use existing completed confirmed-user history eligibility. Consider each exercise
block's first completed work set in stored order, skipping warm-ups and dropsets.
An ineligible selected work set excludes the block; a later favorable set never
replaces it. Normal and failure set types are eligible and remain distinct;
unsupported types remain in history but not this index.

Protocol identity retains canonical ID, exact snapshot equipment (unknown separate
from every known equipment), occurrence within repeated canonical-exercise blocks,
exact work-set type, superset membership/partner block identities, snapshot primary
muscle group and chosen model. Unknown superset partners retain the recorded tag
and a limitation; partner identity does not establish matched rest/technique.
Unknown equipment can match unknown equipment only within this descriptive index.
Existing stronger comparisons still require their original equipment/effort rules.

Effort does not enter the formula or split the descriptive protocol. Baseline/final
coverage and recorded RIR/RPE/failure contexts are exposed separately. First-time
effort recording thus cannot cause a formula discontinuity. Missing/different
effort, technique, range of motion and machine settings limit interpretation.

## Calendar, cohort and aggregation

Default assessment is today's Europe/Rome calendar date. Twelve points are seven
calendar days apart, ending on that assessment date; they are not Monday-aligned
weeks. Every point includes its date and previous 27 dates (28 inclusive dates).
The earliest required date is assessment minus 104 days. Local timestamp conversion
uses Europe/Rome, including DST; calendar offsets do not shift dates through UTC.
These periods and two-date minimum are product choices, not scientific thresholds.

Reduce eligible first-set values to a median per exercise/protocol/local date, then
take the median of daily values in each window. At least two distinct dates are
required. Initial point's window is the baseline; index is
`100 * currentMedian / baselineMedian`.

For each displayed scope, freeze protocols qualifying in **both initial and final
windows**. All weekly points use that identical cohort. Any missing cohort member
makes that aggregate point a gap; never zero, held value, interpolation or silent
composition replacement. A newly used exercise lacking initial evidence does not
enter that chart. The scope/day/history change may select a new cohort, disclosed
with contributors and endpoint coverage.

Multiple protocols of one exercise are averaged first within its snapshot group,
so repeated blocks do not increase that exercise's weight. Average exercise indices
equally within each group, then groups equally for the total. Extra work sets are
not inputs/weights. Only historical primary groups count: never library backfill or
secondary-muscle duplication. Unassigned exercises are inspectable individually;
there is no unassigned muscle aggregate. Total is labelled a partial view of its
listed contributing groups, never whole-body performance.

## Architecture and read safety

`analytics/gym-trend.ts` is pure and shared by local and account modes. The account
`trend` query calculates one compact summary over necessary real history **before
pagination**, returns no workout/set/library clone and performs no per-exercise
requests when drilling down. The existing owner-authenticated read RPC currently
reconstructs the account once server-side per trend request, not per exercise;
SQL-side bounded history projection is a future scaling optimization, not part of
this milestone. No schema, RLS, snapshot, CAS, receipt or journal change is needed.

The existing bounded owner/query/history-epoch memory cache coalesces trend reads.
Active draft saves do not reload it. Accepted history changes/external revision
changes do. Assessment date is part of its key. Last valid same-owner/query results
remain labelled during refresh/failure; one transient retry and manual retry are
supported. No fallback to workspace's three workouts, another owner, sample data
or local backup is allowed. Logger's separate `previous` read remains unchanged.

## Verification and limitations

Synthetic tests cover exact points, interpolation, bounds, verified model selection,
first completed work sets, no favorable substitution, DST/calendar windows, daily
medians, endpoint cohort, gaps, equal weights, effort invariance, snapshots,
unassigned history, protocol separation, compact full-history account reads,
coalescing/account isolation and local/account mobile navigation. Existing logger
save/retry and Recovery tests remain enabled. No personal data is used as a fixture.

Sparse history, changed protocols or unknown anatomical metadata may produce an
honest empty aggregate while individual descriptive history remains useful. The
chart makes no training recommendation or confidence/physiology claim. No deployment,
live account writes, provider sync, OAuth or database migration is performed.

Milestone verification: typecheck, lint, formatting and production build passed;
254 unit tests passed (one pre-existing private fixture skipped), 63 built-production
browser tests and two private-access tests passed. New synthetic trend coverage adds
16 unit and five browser cases. Local UI was inspected at 390/430/1143px without
horizontal overflow. Account error recovery, full-history summaries and the existing
logger save/retry suites passed. No live account access was needed for these checks.
