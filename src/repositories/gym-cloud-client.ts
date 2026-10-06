import { z } from 'zod';
import { newId } from '@/domain/id';
import { gymStoreSchema, type GymStore } from './gym-storage';
const snapshotSchema = z.object({
  owner: z.uuid(),
  revision: z.number().int().nonnegative(),
  initialized: z.boolean(),
  store: gymStoreSchema.nullable(),
});
export type AccountGymSnapshot = z.infer<typeof snapshotSchema>;
const pendingSchema = z.object({
  owner: z.uuid(),
  expected: z.number().int().nonnegative(),
  operation: z.uuid(),
  bootstrap: z.boolean(),
  store: gymStoreSchema,
});
type Pending = z.infer<typeof pendingSchema>;
const cacheSchema = z
  .object({
    cacheVersion: z.literal(1),
    owner: z.uuid(),
    revision: z.number().int().nonnegative(),
    draft: gymStoreSchema,
    pending: pendingSchema.nullable(),
    conflict: z.boolean().default(false),
  })
  .refine(
    (c) => !c.pending || c.pending.owner === c.owner,
    'Pending owner mismatch',
  );
type Cache = z.infer<typeof cacheSchema>;
export interface CloudState {
  snapshot: AccountGymSnapshot | null;
  cache: Cache | null;
  status:
    'local' | 'loading' | 'synced' | 'pending' | 'error' | 'conflict' | 'empty';
  error: string;
}
export const gymAccountKey = 'stillform.gym.account';
export const gymCacheKey = (owner: string) => `stillform.gym.account.${owner}`;
export class CloudRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export interface GymCloudTransport {
  read(): Promise<AccountGymSnapshot>;
  write(input: Pending): Promise<{ revision: number }>;
}
export const gymCloudTransport: GymCloudTransport = {
  async read() {
    return snapshotSchema.parse(await request());
  },
  async write(input) {
    return z
      .object({ revision: z.number().int().positive() })
      .parse(await request(input));
  },
};
async function request(body?: unknown) {
  const response = await fetch('/api/gym', {
    method: body ? 'POST' : 'GET',
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok)
    throw new CloudRequestError(
      typeof value.error === 'string'
        ? value.error
        : 'Account Gym request failed',
      response.status,
    );
  return value;
}
// One account-level CAS queue. Each in-flight operation is immutable; edits made during it
// become a subsequent revision. Lost responses replay the same operation, never new IDs.
export class GymCloudClient {
  state: CloudState = {
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
  constructor(
    private transport: GymCloudTransport,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
  ) {}
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
  private persist(cache: Cache) {
    this.storage.setItem(gymCacheKey(cache.owner), JSON.stringify(cache));
    this.storage.setItem(gymAccountKey, cache.owner);
  }
  restore() {
    try {
      const owner = this.storage.getItem(gymAccountKey);
      if (!owner) return;
      const cache = cacheSchema.parse(
        JSON.parse(this.storage.getItem(gymCacheKey(owner)) || 'null'),
      );
      if (cache.owner !== owner) throw new Error('Owner mismatch');
      this.publish({
        cache,
        status: cache.conflict
          ? 'conflict'
          : cache.pending
            ? 'pending'
            : 'loading',
      });
    } catch {
      this.invalidCache = true;
      this.publish({
        status: 'error',
        error:
          'Account cache is invalid. Original local store is preserved; recover the account draft before editing.',
      });
    }
  }
  async connect() {
    if (this.busy || this.invalidCache) return;
    this.publish({ error: '' });
    try {
      const remote = snapshotSchema.parse(await this.transport.read());
      if (this.busy) return;
      let cache = this.state.cache;
      if (cache) {
        const saved = cacheSchema.parse(
          JSON.parse(this.storage.getItem(gymCacheKey(cache.owner)) || 'null'),
        );
        if (JSON.stringify(cache) !== JSON.stringify(saved)) {
          cache = saved;
          this.publish({ cache });
        }
      }
      if (cache && cache.owner !== remote.owner) {
        this.verified = false;
        this.accountMismatch = true;
        throw new Error(
          'Signed-in account differs from the cached draft. Sign in to the original account; draft preserved.',
        );
      }
      this.verified = true;
      this.accountMismatch = false;
      if (cache && remote.revision < cache.revision) return;
      this.publish({ snapshot: remote });
      if (!remote.initialized && !cache?.pending) {
        this.publish({ status: 'empty' });
        return;
      }
      if (cache?.pending || cache?.conflict) {
        this.publish({ status: cache.conflict ? 'conflict' : 'pending' });
        if (!cache.conflict) await this.flush();
        return;
      }
      if (!remote.store) throw new Error('Account Gym state is missing');
      const next: Cache = {
        cacheVersion: 1,
        owner: remote.owner,
        revision: remote.revision,
        draft: remote.store,
        pending: null,
        conflict: false,
      };
      this.persist(next);
      this.publish({ cache: next, status: 'synced' });
    } catch (e) {
      this.publish({
        status: this.state.cache?.conflict ? 'conflict' : 'error',
        error:
          e instanceof Error
            ? e.message
            : 'Connection failed; local draft retained.',
      });
    }
  }
  bootstrap(store: GymStore) {
    const remote = this.state.snapshot;
    if (!this.verified || !remote || remote.initialized || this.state.cache)
      throw new Error(
        'Bootstrap requires a verified empty account. Existing account data cannot be overwritten.',
      );
    const draft = gymStoreSchema.parse(store);
    const cache: Cache = {
      cacheVersion: 1,
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
    this.persist(cache);
    this.publish({ cache, status: 'pending', error: '' });
    void this.flush();
  }
  edit(store: GymStore, previous: GymStore): boolean {
    const cache = this.state.cache;
    if (
      !cache ||
      cache.conflict ||
      this.accountMismatch ||
      this.state.status === 'loading'
    )
      return false;
    try {
      const saved = cacheSchema.parse(
        JSON.parse(this.storage.getItem(gymCacheKey(cache.owner)) || 'null'),
      );
      if (
        JSON.stringify(saved) !== JSON.stringify(cache) ||
        JSON.stringify(previous) !== JSON.stringify(cache.draft)
      )
        throw new Error(
          'Local draft changed in another view. Reload before editing.',
        );
      const draft = gymStoreSchema.parse(store);
      const next = {
        ...cache,
        draft,
        pending: cache.pending ?? {
          owner: cache.owner,
          expected: cache.revision,
          operation: newId(),
          bootstrap: false,
          store: draft,
        },
      };
      this.persist(next);
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
    try {
      const result = await this.transport.write(operation);
      const memory = this.state.cache!;
      const cache = cacheSchema.parse(
        JSON.parse(this.storage.getItem(gymCacheKey(memory.owner)) || 'null'),
      );
      if (cache.owner !== memory.owner)
        throw new Error('Account cache changed unexpectedly');
      if (cache.pending?.operation !== operation.operation) {
        // Another tab already acknowledged this operation; retain its newer draft/queue.
        this.publish({
          cache,
          status: cache.conflict
            ? 'conflict'
            : cache.pending
              ? 'pending'
              : 'synced',
        });
        this.busy = false;
        if (cache.pending && !cache.conflict) await this.flush();
        return;
      }
      const changed =
        JSON.stringify(cache.draft) !== JSON.stringify(operation.store);
      const next: Cache = {
        ...cache,
        revision: result.revision,
        pending: changed
          ? {
              owner: cache.owner,
              expected: result.revision,
              operation: newId(),
              bootstrap: false,
              store: cache.draft,
            }
          : null,
      };
      this.persist(next);
      this.publish({
        cache: next,
        status: changed ? 'pending' : 'synced',
        error: '',
        snapshot: {
          owner: cache.owner,
          revision: result.revision,
          initialized: true,
          store: operation.store,
        },
      });
    } catch (e) {
      const conflict = e instanceof CloudRequestError && e.status === 409;
      const cache = { ...this.state.cache!, conflict };
      try {
        this.persist(cache);
      } catch {
        /* Existing durable draft remains; surface failure below. */
      }
      this.publish({
        cache,
        status: conflict ? 'conflict' : 'error',
        error:
          e instanceof Error ? e.message : 'Save failed; local draft retained.',
      });
      this.busy = false;
      return;
    }
    this.busy = false;
    if (this.state.cache?.pending) await this.flush();
  }
  async useCloudAfterConflict() {
    if (this.busy) throw new Error('Wait for the current save');
    const remote = snapshotSchema.parse(await this.transport.read());
    if (!remote.store || remote.owner !== this.state.cache?.owner)
      throw new Error('Account mismatch or missing data');
    // Retain rejected draft as a separate recovery backup; never replay it over a newer revision.
    this.storage.setItem(
      `${gymCacheKey(remote.owner)}.rejected.${Date.now()}`,
      JSON.stringify(this.state.cache),
    );
    const cache: Cache = {
      cacheVersion: 1,
      owner: remote.owner,
      revision: remote.revision,
      draft: remote.store,
      pending: null,
      conflict: false,
    };
    this.persist(cache);
    this.verified = true;
    this.publish({ cache, snapshot: remote, status: 'synced', error: '' });
  }
}
