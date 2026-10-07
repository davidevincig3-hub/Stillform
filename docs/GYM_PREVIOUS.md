# Resilient previous workout references

The logger requests `GET /api/gym?scope=previous&id=<canonical ID>&limit=4`.
Recorded load/reps remain available without effort, equipment or muscle metadata.
Exercise performance/comparison rules are unchanged.

## Read path

After existing authentication/origin checks, the repository reads only owner-filtered
normalized matching exercise blocks, completed confirmed-user workouts and completed
sets. It pages matching metadata beyond browser windows and returns at most four
chronological exposures, preserving repeated blocks, IDs and snapshots. No library,
active draft, mappings, archive, full-account RPC or performance summary is needed.
Existing RLS/privileges remain unchanged; no migration is required.

Account CAS revision brackets the multi-request read. An intervening atomic write
causes one retry; another change returns `revision_changed`, never a mixed view.
The provider timeout remains 20 seconds. Large exercise histories still require
paged matching metadata; SQL-side joined pagination is a future optimization.

## Client behavior

Owner/ID/query/history-epoch results live in bounded memory (maximum 100 entries),
coalescing simultaneous requests/remounts. No historical localStorage clone is added.
Accepted completion, import, correction/deletion invalidate references. Own active
draft saves do not. Observed external revisions invalidate conservatively: this
schema does not distinguish another device's active edits from history changes.
CAS, operation receipts, pending/rejected journals and write retry behavior are retained.

`useGymHistory` retains successful data only for the same account and query. An
update/error cannot substitute a partial workspace page, local backup or another
exercise/account. Last valid references stay visible, labelled not refreshed. A
transient error gets one retry after 1.5 seconds; authentication/permission and 400
errors do not. **Retry previous history** starts a new bounded attempt. No periodic
failed-history retry loop is added; real later history invalidation can refresh again.

History failure does not change save status. Its message directs users to Account Gym
without asserting whether pending writes reached the server. GET diagnostics contain
only operation `gym_read`, HTTP status and an allowlisted code: authentication,
timeout, network, provider, validation, processing or revision_changed. No exception
messages, provider bodies, IDs, set values or credentials are included.

## Incident evidence — 2026-10-07

Production still resolved to `dpl_9DgkuHvE46raTcxGoJvs6ZGReP1d`, created October 6.
CLI metadata records a dirty upload based on `df01101`, finalized as the earlier
`16bbd3a` milestone. Local milestone `118b70e` was not deployed; its performance
computations are not established as the incident cause.

Available production logs show 15 GET 503s and one POST 503 for `/api/gym`, without
inner error diagnostics. They cannot distinguish timeout from validation/processing
or establish data loss. Synthetic tests reproduce the client defects: active saves
change account revision, reissue history, hide previously successful references,
and leave them hidden after failure. These defects are fixed independently of the
uncertain original backend cause. No timeout was increased.

A read-only audit of normalized REST filters returned HTTP 200 for account, blocks,
completed workouts and sets, including four prior exposures. Account history contained
288 workouts; revision and original desktop backup checksum were unchanged during
the audit. This verifies the deployed filter contract, not deployment of this patch
or proof of the earlier exception. No live history write, migration, OAuth, sync or
deployment was performed.

Synthetic tests cover frequent saves, error after success and recovery, bounded retry,
nonredundant reads, history invalidation, owner/canonical ID isolation, no partial-page
fallback, missing effort/equipment, history beyond workspace/REST pages, revision races,
diagnostics and write continuity. Browser logger checks cover 390/430/1143px.

Validation: typecheck, lint, formatting and production build passed; 238 unit tests
passed (one pre-existing private-fixture test skipped), 58 regular browser tests and
two private-access browser tests passed. The retry control has a 44px minimum tap
height in workout mode; reference/error layouts have no horizontal overflow.
An initial parallel browser run collided on shared trace files; isolated sequential
suite runs passed without relaxing checks.
