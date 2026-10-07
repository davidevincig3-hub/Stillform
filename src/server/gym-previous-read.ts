import 'server-only';
import { z } from 'zod';
import {
  cloudDocumentSchema,
  cloudTables,
  decodeGym,
} from '@/repositories/gym-cloud-codec';
import { realHistory } from '@/analytics/gym';
import type { IntegrationConfig } from './integration-config';

export class GymHistoryReadError extends Error {
  constructor(
    readonly code:
      | 'timeout'
      | 'network'
      | 'provider'
      | 'validation'
      | 'processing'
      | 'revision_changed',
    readonly status = 503,
  ) {
    super('Gym history read failed');
  }
}
const row = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  position: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
});
const account = z
  .array(z.object({ revision: z.number().int().nonnegative() }))
  .max(1);
const list = (values: string[]) =>
  `in.(${values.map((value) => JSON.stringify(value)).join(',')})`;

// No new RPC/schema: read only owner-filtered normalized rows. Bracket the multi-request
// view with CAS revisions; never expose a mixed snapshot during an atomic replacement.
export async function readPreviousGym(
  config: IntegrationConfig,
  fetcher: typeof fetch,
  owner: string,
  id: string,
  limit: number,
) {
  async function get(table: string, filters: Record<string, string>) {
    const query = new URLSearchParams({ owner_id: `eq.${owner}`, ...filters });
    let response: Response;
    try {
      response = await fetcher(
        `${config.supabaseUrl}/rest/v1/${table}?${query}`,
        {
          headers: {
            apikey: config.secretKey || config.serviceKey,
            ...(!config.secretKey
              ? { Authorization: `Bearer ${config.serviceKey}` }
              : {}),
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch (error) {
      throw new GymHistoryReadError(
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : 'network',
      );
    }
    if (!response.ok)
      throw new GymHistoryReadError(
        'provider',
        response.status === 429 ? 429 : 503,
      );
    try {
      return await response.json();
    } catch (error) {
      throw new GymHistoryReadError(
        error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : error instanceof SyntaxError
            ? 'validation'
            : 'network',
      );
    }
  }
  async function rows(table: string, filters: Record<string, string>) {
    const result: z.infer<typeof row>[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = z.array(row).parse(
        await get(table, {
          select: 'id,parent,position,data',
          order: 'id.asc',
          ...filters,
          offset: String(offset),
          limit: '500',
        }),
      );
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  async function byIds(
    table: string,
    field: string,
    ids: string[],
    filters: Record<string, string> = {},
  ) {
    const result: z.infer<typeof row>[] = [];
    for (let i = 0; i < ids.length; i += 30)
      result.push(
        ...(await rows(table, {
          ...filters,
          [field]: list(ids.slice(i, i + 30)),
        })),
      );
    return result;
  }
  const revision = async () =>
    account.parse(await get('gym_accounts', { select: 'revision' }))[0]
      ?.revision;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await revision();
      if (before === undefined)
        return { owner, revision: 0, initialized: false, store: null };
      const blocks = await rows('gym_workout_exercises', {
        'data->>exerciseId': `eq.${id}`,
      });
      const workouts = await byIds(
        'gym_workouts',
        'id',
        [...new Set(blocks.map((b) => b.parent!))],
        {
          'data->>bucket': 'eq.history',
          'data->>status': 'eq.completed',
          'data->>dataOrigin': 'eq.user',
        },
      );
      workouts.sort(
        (a, b) =>
          Date.parse(String(b.data.startedAt)) -
            Date.parse(String(a.data.startedAt)) || a.id.localeCompare(b.id),
      );
      const tables = cloudDocumentSchema.parse({
        formatVersion: 1,
        tables: Object.fromEntries(cloudTables.map((name) => [name, []])),
      }).tables;
      for (
        let i = 0;
        i < workouts.length && tables.workouts.length < limit;
        i += 10
      ) {
        const candidates = workouts.slice(i, i + 10);
        const parents = new Set(candidates.map((w) => w.id));
        const exercises = blocks.filter((b) => parents.has(b.parent!));
        const sets = await byIds(
          'gym_workout_sets',
          'parent',
          exercises.map((b) => b.id),
          { 'data->>completed': 'eq.true' },
        );
        for (const workout of candidates) {
          const matching = exercises.filter((b) => b.parent === workout.id);
          const keys = new Set(matching.map((b) => b.id));
          const completed = sets.filter((s) => keys.has(s.parent!));
          if (!completed.length) continue;
          tables.workouts.push(workout);
          tables.workout_exercises.push(...matching);
          tables.sets.push(...completed);
          if (tables.workouts.length === limit) break;
        }
      }
      const store = decodeGym({ formatVersion: 1, tables });
      store.history = realHistory(store.history);
      if ((await revision()) === before)
        return { owner, revision: before, initialized: true, store };
    }
    throw new GymHistoryReadError('revision_changed');
  } catch (error) {
    if (error instanceof GymHistoryReadError) throw error;
    throw new GymHistoryReadError(
      error instanceof z.ZodError ? 'validation' : 'processing',
    );
  }
}
