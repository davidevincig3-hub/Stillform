import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { decodeGym, encodeGym } from '@/repositories/gym-cloud-codec';
import { gymStoreSchema, type GymStore } from '@/repositories/gym-storage';
import type { IntegrationConfig } from './integration-config';

export class GymCloudError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
export interface GymSnapshot {
  owner: string;
  revision: number;
  initialized: boolean;
  store: GymStore | null;
}
export const gymWriteSchema = z.object({
  owner: z.uuid(),
  expected: z.number().int().nonnegative(),
  operation: z.uuid(),
  bootstrap: z.boolean().default(false),
  store: gymStoreSchema,
});
export class SupabaseGymRepository {
  constructor(
    private config: IntegrationConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async rpc(name: string, payload: unknown): Promise<unknown> {
    const c = this.config;
    const response = await this.fetcher(
      `${c.supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          apikey: c.secretKey || c.serviceKey,
          ...(!c.secretKey ? { Authorization: `Bearer ${c.serviceKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new GymCloudError(
        response.status === 404
          ? 'Account Gym schema is unavailable. Apply migration 0006 before bootstrap.'
          : 'Account Gym persistence failed. Local draft retained.',
      );
    return response.json();
  }
  async read(owner: string): Promise<GymSnapshot> {
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
      store: value.initialized ? decodeGym(value.document) : null,
    };
  }
  async save(owner: string, input: unknown) {
    const {
      owner: expectedOwner,
      expected,
      operation,
      bootstrap,
      store,
    } = gymWriteSchema.parse(input);
    if (expectedOwner !== owner)
      throw new GymCloudError(
        'Signed-in account changed. Original owner draft is retained; sign in to that account before retrying.',
        403,
      );
    const document = encodeGym(store);
    const digest = createHash('sha256')
      .update(JSON.stringify({ expected, bootstrap, document }))
      .digest('hex');
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
