# Account-bound Gym persistence

## Authority and schema

After explicit account loading/bootstrap, Supabase is durable authority; browser storage
keeps lightweight owner/revision metadata and an active workout draft. IndexedDB stores
only unsynced operations; clean historical accounts are not persisted in the browser.
Existing `adaptive-coach.gym.v2`
(version 2, schemaRevision 3) remains untouched as a desktop backup. Before account
activation, existing local Gym behavior and V1 review/migration gates remain available.

Apply `supabase/migrations/0006_account_gym.sql` after reviewing it. It creates:

- `gym_accounts`: authenticated owner UUID and monotonically increasing revision;
- `gym_exercises`, `gym_routines`, `gym_routine_exercises`;
- `gym_workouts`, `gym_workout_exercises`, `gym_workout_sets`;
- `gym_preferences`, `gym_mappings`, `gym_batches`;
- `gym_operations`: immutable operation UUID, SHA-256 request digest and accepted revision.

Text domain IDs preserve built-in names, custom UUIDs and `hevy-<fingerprint>` IDs.
The codec/RPC document keeps its logical `sets` key; SQL maps it exclusively to
`gym_workout_sets`. Foundation `gym_sets` remains unchanged and is never read,
altered or deleted by account-Gym RPCs. Migration tests apply 0001–0005 first and
verify that a populated legacy table, its schema, policies and constraints survive 0006.
Children have separate rows, owner/parent keys and order. Entity JSONB holds that entity's
scalar fields, provenance and snapshots, not the whole Gym store or nested set collections.
Routine snapshots intentionally preserve the routine at workout start. Composite storage
keys for embedded exercises/sets retain their original domain IDs inside entity fields.
Historical exercise snapshots remain valid after library/routine edits or deletion.
Unknown muscle metadata remains null. Unverified legacy archive is never real history.

All tables enable RLS. Authenticated users may read only their owner rows. Direct client
writes and anonymous access are revoked. Only the server service role executes the read/
write RPCs; `/api/gym` derives owner from a validated, encrypted HttpOnly Supabase session,
never from the posted owner. Secret keys, provider tokens and auth tokens never enter
client responses. Integration cookies/OAuth origins remain unchanged; Gym sign-in has a
separate session cookie, reusing integration authentication for read/write when available.

## Reviewed desktop bootstrap

1. Keep/export a desktop JSON backup. Open the original desktop localhost origin.
2. Gym > Account Gym > Preview desktop migration. This is entirely local validation;
   counts include library, routines, ordered workout exercises, sets, preferences,
   mappings, batches, completed/legacy/active sessions and fingerprints.
3. Sign in to the same Stillform account used for integrations, or use its existing session.
   Check / reload account checks deployed schema and whether the account is initialized.
   Missing schema or missing authentication is a blocker, never interpreted as empty data.
4. **Obtain explicit migration approval before confirmation.** Verify the displayed account
   is empty and all counts are expected. Check the approval checkbox, then Confirm account
   bootstrap. An initialized account is never overwritten, even if it contains no workouts.
5. The server validates the existing Gym schema, converts it into normalized rows and
   commits all rows, revision 1 and an operation receipt in one database transaction.
   A retry with the same operation UUID/digest returns the receipt without duplicating data.
6. Verify counts/IDs and use a second signed-in device. Leave the original local key intact.

A populated cloud account loads its own history. There is no silent merge of separate
browser datasets, no automatic bootstrap, and no automatic retirement of local backups.
A completely new empty account may use the reviewed initial library bootstrap explicitly.
There is no account-switch draft transfer; sign in to the cached draft's original owner.

## Saves, conflicts and temporary loss of Wi-Fi

Existing pure Gym commands operate on a loaded server view. Unloaded history is never
interpreted as deleted. Hevy explicitly loads full history into temporary memory for review.
`save` validates changes, retains the small active draft in localStorage, and journals
changed entities asynchronously in IndexedDB before sending a cloud save. Journal failure
blocks transmission; do not close the app until pending storage succeeds.
Each request has expected revision and stable operation UUID; additional edits while a
request is in flight become a subsequent revision. The server serializes account writes,
checks the receipt before CAS, and atomically replaces normalized rows with the validated
new revision. IDs and payloads are preserved; deliberate deletions remain ordinary Gym
commands. This conservative whole-account CAS is simple but costs more than entity diffs.

Synced/pending/error/conflict is visible, including inside active workout mode. Pending
writes survive reload and are retried on account check, focus, online and every 15 seconds.
Read-only refresh pulls the recent server view when there is no pending draft. There is no realtime
collaboration. Conflicts freeze edits rather than overwrite newer data. Explicit reload
first retains the rejected pending operation/changes in an IndexedDB recovery entry, then loads
cloud state. Export the visible draft before resolving if a portable copy is needed.

Lightweight metadata/active draft: `stillform.gym.account.<owner UUID>`; selected account pointer:
`stillform.gym.account`. Metadata envelope version is 2; version-1 caches are decoded
compatibly, with unsynced legacy bytes preserved in IndexedDB before replacement. Unknown versions block
editing and preserve original bytes. Pending writes are never flushed to a different authenticated
owner. Authentication/network failure retains the draft. Clearing browser data while
unsynced can still lose pending edits; storage quota failure blocks acceptance of a save.
Offline resilience concerns an already opened/cached app, not a complete offline framework.

## Hevy and analytics

The importer receives reconstructed account history, so verified fingerprints, mappings
and import batches remain authoritative across devices. Exact replays are unchanged;
new sessions add once; altered prior sessions still require review. Native and Hevy
sessions coexist with preserved canonical IDs. CSV hashing uses the secure-context Web
Crypto API; use localhost or trusted HTTPS. Shortlists, previous performance and descriptive
analytics query this same account store and continue excluding sample/unverified data.

JSON formatVersion 1 and CSV exports remain portable backups. Separate normalized cloud
codec V1 currently reconstructs local schemaRevision 3. Future SQL/codec changes need
explicit migrations. No new integration/provider sync is triggered by Gym persistence.

## Validation and current limits

Synthetic unit tests cover normalization/no historical loss, first/idempotent bootstrap,
phone/desktop changes, resume, sets, stale conflicts, retry after lost response, queued
edits, owner isolation and incremental Hevy continuity. Browser tests use mocked account
transport in independent browser contexts at 390/430/1143 px, plus the existing real local
Gym tests. PGlite executes the actual migration against synthetic PostgreSQL accounts,
checking initialization, receipts, stale revisions, rollback and RLS/privilege isolation.
No personal fixtures are committed. SQL migration and live migration are
separate approval-gated deployment steps; mocks do not prove deployed RLS or database
behavior. Perform live two-device verification after migration approval and schema install.

Account revision is deliberately coarse; two devices editing unrelated entities can
conflict. Saves currently submit/rewrite the normalized account snapshot atomically;
entity-level patches/coalescing can reduce write cost later. No automatic conflict merge,
realtime subscriptions, user registration UI, cloud schema installer or automatic historical
union. HTTPS certificate trust requires explicit setup on each phone.

The isolated Playwright server explicitly blanks account/provider credentials rather than
inheriting `.env.local`; synthetic routed responses cover configured UI flows. PostgreSQL
migration tests use PGlite only as a dev dependency. They do not contact live Supabase.

## Bounded reads and quota behavior

The workspace returns library/routines/preferences, three latest workouts and compact server-derived shortlist, exercise-usage and weekly summaries. History returns 20 workouts per page (maximum 100), with title/search/date filters. Exercise exposure pages and workout details load separately; previous performance fetches four real exposures by ID. Responses live only in memory. Phones do not need a full historical clone.

Exports and Hevy preview explicitly request full history into temporary memory, never a clean cache. Recovery evidence loads a separate 90-day window. Integration matching also requests history explicitly. IndexedDB database stillform-gym-pending (version 1), journal object store, retains immutable unsynced operation IDs/revisions plus subsequent changed entities. Bootstrap is the sole full-dataset pending operation, written asynchronously once and removed after acknowledgement. No quota increase, storage deletion or offline framework is introduced. The independent desktop adaptive-coach.gym.v2 backup stays untouched.

Scaling limitation: the server still reconstructs normalized account data through 0006 RPCs before selecting bounded responses or merging changed entities. Browser transport/storage is bounded; SQL-side pagination and incremental writes remain future optimizations. Full exports/Hevy review remain memory-intensive. IndexedDB or active-draft storage can still fail on a full device; failures block transmission and surface a retryable error.
