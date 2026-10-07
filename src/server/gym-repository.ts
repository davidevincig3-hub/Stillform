import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { decodeGym, encodeGym } from '@/repositories/gym-cloud-codec';
import { gymStoreSchema, type GymStore } from '@/repositories/gym-storage';
import {
  applyGymChanges,
  gymChangesSchema,
} from '@/repositories/gym-cloud-changes';
import {
  selectGymView,
  type GymReadQuery,
  type GymReadSummary,
} from '@/repositories/gym-cloud-query';
import type { IntegrationConfig } from './integration-config';
import { readPreviousGym } from './gym-previous-read';

export class GymCloudError extends Error {
  constructor(
    message: string,
    readonly status = 503,
    readonly code:
      'provider' | 'timeout' | 'network' | 'validation' = 'provider',
  ) {
    super(message);
  }
}
export interface GymSnapshot {
  owner: string;
  revision: number;
  initialized: boolean;
  store: GymStore | null;
  summary?: GymReadSummary;
}
export const gymWriteSchema = z.object({
  owner: z.uuid(),
  expected: z.number().int().nonnegative(),
  operation: z.uuid(),
  bootstrap: z.boolean().default(false),
  store: gymStoreSchema.optional(),
  changes: gymChangesSchema.optional(),
});
export class SupabaseGymRepository {
  constructor(
    private config: IntegrationConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async rpc(name: string, payload: unknown): Promise<unknown> {
    const c = this.config;
    let response: Response;
    try {
      response = await this.fetcher(`${c.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: c.secretKey || c.serviceKey,
          ...(!c.secretKey ? { Authorization: `Bearer ${c.serviceKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw new GymCloudError(
        'Account Gym persistence request failed. Draft retained.',
        503,
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : 'network',
      );
    }
    if (!response.ok)
      throw new GymCloudError(
        response.status === 404
          ? 'Account Gym schema is unavailable. Apply migration 0006 before bootstrap.'
          : 'Account Gym persistence failed. Local draft retained.',
      );
    try {
      return await response.json();
    } catch (error) {
      throw new GymCloudError(
        'Account Gym response could not be validated. Draft retained.',
        503,
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : error instanceof SyntaxError
            ? 'validation'
            : 'network',
      );
    }
  }
  async read(owner: string, query?: GymReadQuery): Promise<GymSnapshot> {
    if (query?.scope === 'previous') {
      if (!query.id)
        throw new GymCloudError(
          'Previous history requires an exercise ID',
          400,
        );
      return readPreviousGym(
        this.config,
        this.fetcher,
        owner,
        query.id,
        Math.min(query.limit ?? 4, 4),
      );
    }
    const value = z
      .object({
        revision: z.number().int().nonnegative(),
        initialized: z.boolean(),
        document: z.unknown(),
      })
      .parse(await this.rpc('read_account_gym', { p_owner: owner }));
    return {
      owner,
      revision: value.revision,
      initialized: value.initialized,
      ...(value.initialized
        ? query
          ? selectGymView(decodeGym(value.document), query)
          : { store: decodeGym(value.document) }
        : { store: null }),
    };
  }
  async save(owner: string, input: unknown) {
    const {
      owner: expectedOwner,
      expected,
      operation,
      bootstrap,
      store,
      changes,
    } = gymWriteSchema.parse(input);
    if (expectedOwner !== owner)
      throw new GymCloudError(
        'Signed-in account changed. Original owner draft is retained; sign in to that account before retrying.',
        403,
      );
    if (bootstrap ? !store || !!changes : !store && !changes)
      throw new GymCloudError('Missing Gym operation data', 400);
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          expected,
          bootstrap,
          ...(changes ? { changes } : { document: encodeGym(store!) }),
        }),
      )
      .digest('hex');
    // Resolve immutable receipts before reconstructing deltas: a lost response can be retried
    // even after other accepted revisions, without changing the digest or replaying edits.
    if (changes) {
      const receiptResponse = await this.fetcher(
        this.config.supabaseUrl +
          '/rest/v1/gym_operations?owner_id=eq.' +
          owner +
          '&operation_id=eq.' +
          operation +
          '&select=digest,revision',
        {
          headers: {
            apikey: this.config.secretKey || this.config.serviceKey,
            ...(!this.config.secretKey
              ? { Authorization: 'Bearer ' + this.config.serviceKey }
              : {}),
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!receiptResponse.ok)
        throw new GymCloudError('Gym operation receipt could not be checked');
      const receipts = z
        .array(z.object({ digest: z.string(), revision: z.number().int() }))
        .parse(await receiptResponse.json());
      if (receipts.length) {
        if (receipts[0].digest !== digest)
          throw new GymCloudError('Operation reused with different data', 409);
        return { ok: true, revision: receipts[0].revision, replayed: true };
      }
    }
    let full = store;
    if (changes) {
      const current = await this.read(owner);
      if (!current.store || current.revision !== expected)
        throw new GymCloudError(
          'Another device changed account Gym data. Reload cloud data before editing; your local draft is retained.',
          409,
        );
      full = applyGymChanges(current.store, changes);
    }
    const document = encodeGym(full!);
    const result = z
      .object({
        ok: z.boolean(),
        revision: z.number().int().nonnegative(),
        replayed: z.boolean().optional(),
        conflict: z.boolean().optional(),
      })
      .parse(
        await this.rpc('save_account_gym', {
          p_owner: owner,
          p_expected: expected,
          p_operation: operation,
          p_digest: digest,
          p_bootstrap: bootstrap,
          p_document: document,
        }),
      );
    if (!result.ok)
      throw new GymCloudError(
        'Another device changed account Gym data. Reload cloud data before editing; your local draft is retained.',
        409,
      );
    return result;
  }
}
