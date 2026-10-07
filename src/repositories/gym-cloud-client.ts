import { z } from 'zod';
import { newId } from '@/domain/id';
import { gymStoreSchema, initialGymStore, type GymStore } from './gym-storage';
import {
  applyGymChanges,
  gymChanges,
  gymChangesSchema,
} from './gym-cloud-changes';
import type { GymJournal } from './gym-cloud-journal';
import type { GymReadQuery, GymReadSummary } from './gym-cloud-query';
const snapshotSchema = z.object({
  owner: z.uuid(),
  revision: z.number().int().nonnegative(),
  initialized: z.boolean(),
  store: gymStoreSchema.nullable(),
  summary: z.custom<GymReadSummary>().optional(),
});
export type AccountGymSnapshot = z.infer<typeof snapshotSchema>;
export const pendingSchema = z
  .object({
    owner: z.uuid(),
    expected: z.number().int().nonnegative(),
    operation: z.uuid(),
    bootstrap: z.boolean(),
    store: gymStoreSchema.optional(),
    changes: gymChangesSchema.optional(),
  })
  .refine(
    (p) => (p.bootstrap ? !!p.store && !p.changes : !!p.changes || !!p.store),
    'Missing operation data',
  );
export type Pending = z.infer<typeof pendingSchema>;
interface Cache {
  cacheVersion: 2;
  owner: string;
  revision: number;
  draft: GymStore;
  pending: Pending | null;
  conflict: boolean;
}
const metadataSchema = z.object({
  cacheVersion: z.literal(2),
  owner: z.uuid(),
  revision: z.number().int().nonnegative(),
  active: gymStoreSchema.shape.active,
  stamp: z.string(),
});
const journalSchema = z.object({
  pending: pendingSchema.nullable(),
  working: gymChangesSchema,
  conflict: z.boolean(),
});
export interface CloudState {
  historyEpoch: number;
  snapshot: AccountGymSnapshot | null;
  cache: Cache | null;
  status:
    'local' | 'loading' | 'synced' | 'pending' | 'error' | 'conflict' | 'empty';
  error: string;
}
export const gymAccountKey = 'stillform.gym.account';
export const gymCacheKey = (owner: string) => 'stillform.gym.account.' + owner;
export class CloudRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly diagnostic?: { code: string },
  ) {
    super(message);
  }
}
export interface GymCloudTransport {
  read(query?: GymReadQuery): Promise<AccountGymSnapshot>;
  write(input: Pending): Promise<{ revision: number }>;
}
export const gymCloudTransport: GymCloudTransport = {
  async read(query) {
    return snapshotSchema.parse(await request(undefined, query));
  },
  async write(input) {
    return z
      .object({ revision: z.number().int().positive() })
      .parse(await request(input));
  },
};
async function request(body?: unknown, query?: GymReadQuery) {
  const params = new URLSearchParams(
    Object.entries(query ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const response = await fetch('/api/gym' + (params.size ? '?' + params : ''), {
    method: body ? 'POST' : 'GET',
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    cache: 'no-store',
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new CloudRequestError(
      body
        ? 'Account Gym save response could not be read. Draft retained.'
        : 'Gym history response could not be read.',
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok)
    throw new CloudRequestError(
      typeof value?.error === 'string'
        ? value.error
        : 'Account Gym request failed',
      response.status,
      z
        .object({
          code: z.enum([
            'authentication',
            'timeout',
            'network',
            'provider',
            'validation',
            'processing',
            'revision_changed',
          ]),
        })
        .safeParse(value?.diagnostic).data,
    );
  return value;
}
export class GymCloudClient {
  state: CloudState = {
    historyEpoch: 0,
    snapshot: null,
    cache: null,
    status: 'local',
    error: '',
  };
  private listeners = new Set<() => void>();
  private busy = false;
  private verified = false;
  private invalidCache = false;
  private accountMismatch = false;
  private base: GymStore = initialGymStore();
  private restored: Promise<void> = Promise.resolve();
  private durable = Promise.resolve();
  private stamp: string | null = null;
  private working = gymChanges(this.base, this.base);
  private journal: GymJournal;
  private previousReads = new Map<string, Promise<AccountGymSnapshot>>();
  constructor(
    private transport: GymCloudTransport,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    journal?: GymJournal,
  ) {
    // Injected fallback is for non-browser unit transports. Production uses IndexedDB.
    this.journal = journal ?? {
      get: async (k) => storage.getItem(k),
      put: async (k, v) => storage.setItem(k, v),
      remove: async (k) => storage.setItem(k, 'null'),
    };
  }
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.state;
  private publish(patch: Partial<CloudState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private metadata(cache: Cache) {
    const value = JSON.stringify({
      cacheVersion: 2,
      owner: cache.owner,
      revision: cache.revision,
      active: cache.draft.active,
      stamp: newId(),
    });
    this.storage.setItem(gymCacheKey(cache.owner), value);
    this.storage.setItem(gymAccountKey, cache.owner);
    this.stamp = value;
  }
  private persist(cache: Cache) {
    this.metadata(cache);
    const key = gymCacheKey(cache.owner) + '.pending';
    const value =
      cache.pending || cache.conflict
        ? JSON.stringify({
            pending: cache.pending,
            working: gymChanges(this.base, cache.draft),
            conflict: cache.conflict,
          })
        : null;
    this.durable = this.durable
      .catch(() => undefined)
      .then(() =>
        value ? this.journal.put(key, value) : this.journal.remove(key),
      );
    return this.durable;
  }
  restore() {
    const owner = this.storage.getItem(gymAccountKey);
    if (!owner) return;
    this.publish({ status: 'loading' });
    this.restored = this.restoreOwner(owner);
  }
  private async restoreOwner(owner: string) {
    try {
      const raw = this.storage.getItem(gymCacheKey(owner));
      const value = JSON.parse(raw || 'null');
      if (value?.cacheVersion === 1) {
        // Preserve legacy bytes. Only unsynced data is moved into the journal.
        const draft = gymStoreSchema.parse(value.draft);
        const pending = value.pending
          ? pendingSchema.parse(value.pending)
          : null;
        this.base = draft;
        const cache: Cache = {
          cacheVersion: 2,
          owner,
          revision: value.revision,
          draft,
          pending,
          conflict: !!value.conflict,
        };
        if (value.owner !== owner || (pending && pending.owner !== owner))
          throw Error('Owner mismatch');
        if (pending || cache.conflict)
          await this.journal.put(gymCacheKey(owner) + '.legacy', raw!);
        this.working = gymChanges(initialGymStore(), draft);
        this.publish({ cache });
        await this.persist(cache);
        return;
      }
      const meta = metadataSchema.parse(value);
      if (meta.owner !== owner) throw Error('Owner mismatch');
      this.stamp = raw;
      const entry = await this.journal.get(gymCacheKey(owner) + '.pending');
      const saved =
        entry && entry !== 'null'
          ? journalSchema.parse(JSON.parse(entry))
          : null;
      if (saved?.pending && saved.pending.owner !== owner)
        throw Error('Pending owner mismatch');
      this.working = saved?.working ?? gymChanges(this.base, this.base);
      const draft = saved?.pending?.bootstrap
        ? saved.pending.store!
        : { ...initialGymStore(), active: meta.active };
      this.publish({
        cache: {
          cacheVersion: 2,
          owner,
          revision: meta.revision,
          draft,
          pending: saved?.pending ?? null,
          conflict: saved?.conflict ?? false,
        },
      });
    } catch {
      this.invalidCache = true;
      this.publish({
        status: 'error',
        error:
          'Account pending data is invalid. Original local store is preserved; recover it before editing.',
      });
    }
  }
  async connect() {
    await this.restored;
    if (this.busy || this.invalidCache) return;
    try {
      if (
        this.state.cache &&
        this.storage.getItem(gymCacheKey(this.state.cache.owner)) !== this.stamp
      )
        await this.restoreOwner(this.state.cache.owner);
      if (this.invalidCache) return;
      const remote = snapshotSchema.parse(await this.transport.read());
      if (this.busy) return;
      const cache = this.state.cache;
      if (cache && cache.owner !== remote.owner) {
        this.verified = false;
        this.accountMismatch = true;
        this.previousReads.clear();
        throw Error(
          'Signed-in account differs from the cached draft. Sign in to the original account; draft preserved.',
        );
      }
      this.verified = true;
      this.accountMismatch = false;
      this.publish({
        snapshot: remote,
        error: '',
        historyEpoch:
          this.state.historyEpoch +
          (cache && remote.revision > cache.revision ? 1 : 0),
      });
      if (!remote.initialized && !cache?.pending) {
        this.publish({ status: 'empty' });
        return;
      }
      if (cache?.pending || cache?.conflict) {
        if (!cache.pending?.bootstrap && remote.store) {
          this.base = remote.store;
          const draft = applyGymChanges(remote.store, this.working);
          this.publish({ cache: { ...cache, draft } });
        }
        this.publish({ status: cache.conflict ? 'conflict' : 'pending' });
        if (!cache.conflict) await this.flush();
        return;
      }
      if (!remote.store) throw Error('Account Gym state is missing');
      if (cache && remote.revision < cache.revision) return;
      this.base = remote.store;
      const next: Cache = {
        cacheVersion: 2,
        owner: remote.owner,
        revision: remote.revision,
        draft: remote.store,
        pending: null,
        conflict: false,
      };
      await this.persist(next);
      if (this.busy || this.state.cache !== cache) return;
      this.publish({ cache: next, status: 'synced' });
    } catch (e) {
      this.publish({
        status: this.state.cache?.conflict ? 'conflict' : 'error',
        error:
          e instanceof Error ? e.message : 'Connection failed; draft retained.',
      });
    }
  }
  bootstrap(store: GymStore) {
    const remote = this.state.snapshot;
    if (!this.verified || !remote || remote.initialized || this.state.cache)
      throw Error(
        'Bootstrap requires a verified empty account. Existing account data cannot be overwritten.',
      );
    const draft = gymStoreSchema.parse(store);
    const cache: Cache = {
      cacheVersion: 2,
      owner: remote.owner,
      revision: 0,
      draft,
      pending: {
        owner: remote.owner,
        expected: 0,
        operation: newId(),
        bootstrap: true,
        store: draft,
      },
      conflict: false,
    };
    // The one-time upload is journaled asynchronously, never duplicated in localStorage.
    this.base = draft;
    this.publish({ cache, status: 'pending', error: '' });
    void this.flush();
  }
  edit(store: GymStore, previous: GymStore): boolean {
    const cache = this.state.cache;
    if (
      !cache ||
      cache.conflict ||
      cache.pending?.bootstrap ||
      this.accountMismatch ||
      this.state.status === 'loading'
    )
      return false;
    try {
      if (this.storage.getItem(gymCacheKey(cache.owner)) !== this.stamp)
        throw Error(
          'Local draft changed in another view. Reload before editing.',
        );
      const changes = gymChanges(previous, gymStoreSchema.parse(store));
      const draft = applyGymChanges(cache.draft, changes);
      const next: Cache = {
        ...cache,
        draft,
        pending: cache.pending ?? {
          owner: cache.owner,
          expected: cache.revision,
          operation: newId(),
          bootstrap: false,
          changes,
        },
      };
      this.working = gymChanges(this.base, draft);
      void this.persist(next).catch((e) =>
        this.publish({
          status: 'error',
          error:
            e instanceof Error
              ? e.message
              : 'Pending draft could not be retained',
        }),
      );
      this.publish({ cache: next, status: 'pending', error: '' });
      void this.flush();
      return true;
    } catch (e) {
      this.publish({
        error: e instanceof Error ? e.message : 'Could not retain draft',
      });
      return false;
    }
  }
  async flush() {
    const operation = this.state.cache?.pending;
    if (!operation || this.busy || !this.verified || this.state.cache?.conflict)
      return;
    this.busy = true;
    const sent = this.state.cache!.draft;
    try {
      await this.persist(this.state.cache!);
      const result = await this.transport.write(operation);
      // Journal acknowledgement is asynchronous. Inputs may change during its commit;
      // recapture them until stable so the acknowledgement cannot erase a newer edit.
      this.base = sent;
      let next: Cache;
      let changed: boolean;
      for (;;) {
        const cache = this.state.cache!;
        changed = JSON.stringify(cache.draft) !== JSON.stringify(sent);
        next = {
          ...cache,
          revision: result.revision,
          pending: changed
            ? {
                owner: cache.owner,
                expected: result.revision,
                operation: newId(),
                bootstrap: false,
                changes: gymChanges(sent, cache.draft),
              }
            : null,
        };
        await this.persist(next);
        if (this.state.cache === cache) break;
      }
      this.publish({
        cache: next,
        historyEpoch:
          this.state.historyEpoch +
          (operation.bootstrap ||
          operation.store ||
          operation.changes?.arrays.history
            ? 1
            : 0),
        status: changed ? 'pending' : 'synced',
        error: '',
        snapshot: {
          owner: next.owner,
          revision: result.revision,
          initialized: true,
          store: next.draft,
          summary: this.state.snapshot?.summary,
        },
      });
    } catch (e) {
      const conflict = e instanceof CloudRequestError && e.status === 409;
      const cache = { ...this.state.cache!, conflict };
      try {
        await this.persist(cache);
      } catch {
        /* Preserve last durable journal; report failure. */
      }
      this.publish({
        cache,
        status: conflict ? 'conflict' : 'error',
        error: e instanceof Error ? e.message : 'Save failed; draft retained.',
      });
      this.busy = false;
      return;
    }
    this.busy = false;
    if (this.state.cache?.pending) await this.flush();
    else await this.connect(); // discard full bootstrap memory and refresh server summaries/recent window
  }
  async read(query: GymReadQuery) {
    if (this.accountMismatch)
      throw new CloudRequestError(
        'History account requires verification.',
        403,
      );
    if (query.scope === 'previous' || query.scope === 'trend') {
      const owner = this.state.cache?.owner ?? this.state.snapshot?.owner;
      const key = JSON.stringify([owner, this.state.historyEpoch, query]);
      const prior = this.previousReads.get(key);
      if (prior) return prior;
      const pending = this.readVerified(query, owner).catch((error) => {
        this.previousReads.delete(key);
        throw error;
      });
      if (this.previousReads.size >= 100) this.previousReads.clear();
      this.previousReads.set(key, pending);
      return pending;
    }
    return this.readVerified(
      query,
      this.state.cache?.owner ?? this.state.snapshot?.owner,
    );
  }
  private async readVerified(query: GymReadQuery, owner: string | undefined) {
    const value = snapshotSchema.parse(await this.transport.read(query));
    if (
      !owner ||
      value.owner !== owner ||
      owner !== (this.state.cache?.owner ?? this.state.snapshot?.owner)
    )
      throw new CloudRequestError(
        'History account changed. Sign in to the original account.',
        403,
      );
    return value;
  }
  async useCloudAfterConflict() {
    if (this.busy) throw Error('Wait for the current save');
    const remote = await this.read({ scope: 'workspace' });
    if (!remote.store) throw Error('Missing account data');
    await this.journal.put(
      gymCacheKey(remote.owner) + '.rejected.' + Date.now(),
      JSON.stringify({
        pending: this.state.cache!.pending,
        working: gymChanges(this.base, this.state.cache!.draft),
      }),
    );
    this.base = remote.store;
    const cache: Cache = {
      cacheVersion: 2,
      owner: remote.owner,
      revision: remote.revision,
      draft: remote.store,
      pending: null,
      conflict: false,
    };
    await this.persist(cache);
    this.verified = true;
    this.publish({
      cache,
      snapshot: remote,
      status: 'synced',
      error: '',
      historyEpoch: this.state.historyEpoch + 1,
    });
  }
}
