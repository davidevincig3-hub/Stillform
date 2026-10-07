import { describe, expect, it, vi } from 'vitest';
import { performanceHistory } from '../helpers/gym-performance';
import { config } from '../helpers/integrations';
import { encodeGym } from '../../src/repositories/gym-cloud-codec';
import { SupabaseGymRepository } from '../../src/server/gym-repository';
import { gymReadFailure } from '../../src/server/gym-read-error';
import { GymHistoryReadError } from '../../src/server/gym-previous-read';
import { AuthError } from '../../src/server/integration-auth';
import {
  GymCloudClient,
  CloudRequestError,
  gymCloudTransport,
} from '../../src/repositories/gym-cloud-client';
import { selectGymView } from '../../src/repositories/gym-cloud-query';
import { applyGymChanges } from '../../src/repositories/gym-cloud-changes';
import {
  startGymWorkout,
  finishGymWorkout,
  type GymStore,
} from '../../src/repositories/gym-storage';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'synthetic-ex-0';
function rest(store: GymStore, revisions = [1]) {
  const tables = encodeGym(store).tables;
  let checks = 0;
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    expect(url.searchParams.get('owner_id')).toBe(`eq.${owner}`);
    const table = url.pathname.split('/').at(-1)!;
    if (table === 'gym_accounts')
      return Response.json([
        { revision: revisions[Math.min(checks++, revisions.length - 1)] },
      ]);
    expect(table).not.toContain('rpc');
    const key =
      table === 'gym_workout_sets'
        ? 'sets'
        : (table.slice(4) as keyof typeof tables);
    let rows = [...tables[key]];
    for (const [field, filter] of url.searchParams) {
      if (['select', 'owner_id', 'offset', 'limit', 'order'].includes(field))
        continue;
      rows = rows.filter((r) => {
        const value = field.startsWith('data->>')
          ? r.data[field.slice(7)]
          : r[field as 'id' | 'parent'];
        if (filter.startsWith('eq.')) return String(value) === filter.slice(3);
        return (JSON.parse(`[${filter.slice(4, -1)}]`) as string[]).includes(
          String(value),
        );
      });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    const offset = Number(url.searchParams.get('offset'));
    return Response.json(
      rows.slice(offset, offset + Number(url.searchParams.get('limit'))),
    );
  });
  return fetcher;
}
describe('previous references: normalized owner-scoped reads', () => {
  it('finds four real exposures beyond loaded pages, without effort/equipment or account/analytics reconstruction', async () => {
    const store = performanceHistory(1);
    const template = store.history[0];
    store.history = Array.from({ length: 520 }, (_, i) => {
      const workout = structuredClone(template);
      workout.id = `synthetic-workout-${i}`;
      workout.startedAt = new Date(Date.UTC(2024, 0, 1 + i, 8)).toISOString();
      workout.endedAt = new Date(
        Date.parse(workout.startedAt) + 3600000,
      ).toISOString();
      workout.exercises[0].sets[0].weight = 50 + i;
      return workout;
    });
    store.history.forEach((w) => {
      w.exercises[0].equipment = null;
      w.exercises[0].sets[0].rir = null;
    });
    // Newer unrelated workouts cannot displace matching exercise exposures.
    store.history.slice(-20).forEach((w) => {
      w.exercises[0].exerciseId = 'other-id';
    });
    store.history[499].exercises[0].sets[0].completed = false;
    const repeated = structuredClone(store.history[498].exercises[0]);
    repeated.id = 'repeated-block';
    repeated.sets[0].id = 'repeated-set';
    store.history[498].exercises.push(repeated);
    const fetcher = rest(store);
    const result = await new SupabaseGymRepository(config, fetcher).read(
      owner,
      { scope: 'previous', id, limit: 4 },
    );
    expect(result.store?.history.map((w) => w.id)).toEqual(
      [498, 497, 496, 495].map((i) => `synthetic-workout-${i}`),
    );
    expect(result.store?.history[0].exercises[0].sets[0]).toMatchObject({
      weight: 548,
      rir: null,
    });
    expect(result.summary).toBeUndefined();
    expect(result.store?.history[0].exercises).toHaveLength(2);
    expect(result.store?.exercises).toEqual([]);
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('offset=500')),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('rpc/')),
    ).toBe(false);
    const empty = await new SupabaseGymRepository(config, fetcher).read(owner, {
      scope: 'previous',
      id: 'missing',
    });
    expect(empty.store?.history).toEqual([]);
  });
  it('retries one mixed revision and refuses a continuously changing account', async () => {
    const store = performanceHistory();
    const stable = await new SupabaseGymRepository(
      config,
      rest(store, [1, 2, 2, 2]),
    ).read(owner, { scope: 'previous', id });
    expect(stable.revision).toBe(2);
    await expect(
      new SupabaseGymRepository(config, rest(store, [1, 2, 3, 4])).read(owner, {
        scope: 'previous',
        id,
      }),
    ).rejects.toMatchObject({ code: 'revision_changed' });
  });
  it('categorizes timeouts, network, validation and provider failures without sensitive messages', async () => {
    const interruptedBody = Response.json([]);
    vi.spyOn(interruptedBody, 'json').mockRejectedValue(
      new DOMException('PRIVATE', 'AbortError'),
    );
    for (const [fetcher, code] of [
      [
        vi.fn().mockRejectedValue(new DOMException('PRIVATE', 'TimeoutError')),
        'timeout',
      ],
      [vi.fn().mockRejectedValue(new TypeError('PRIVATE')), 'network'],
      [vi.fn().mockResolvedValue(interruptedBody), 'timeout'],
      [
        vi.fn().mockResolvedValue(new Response('PRIVATE invalid JSON')),
        'validation',
      ],
      [
        vi.fn().mockResolvedValue(Response.json({ private: 'payload' })),
        'validation',
      ],
      [
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ private: 'payload' }, { status: 500 }),
          ),
        'provider',
      ],
    ] as const) {
      await expect(
        new SupabaseGymRepository(config, fetcher).read(owner, {
          scope: 'previous',
          id,
        }),
      ).rejects.toMatchObject({ code });
    }
    for (const error of [
      new GymHistoryReadError('timeout'),
      new AuthError('PRIVATE', 401),
      new Error('PRIVATE'),
    ]) {
      const response = gymReadFailure(error);
      const body = await response.json();
      expect(body).toHaveProperty('diagnostic.operation', 'gym_read');
      expect(JSON.stringify(body)).not.toContain('PRIVATE');
      expect(body.error).not.toContain('Local data is preserved');
    }
  });
});
describe('history reads remain independent of saves', () => {
  it('coalesces previous reads, ignores active-set revisions, invalidates accepted history changes, and keeps writes working after read failure', async () => {
    let store = performanceHistory(),
      revision = 1,
      failRead = false;
    const read = vi.fn(async (query) => {
      if (failRead && query?.scope === 'previous')
        throw new CloudRequestError('History only', 503);
      return {
        owner,
        revision,
        initialized: true,
        ...selectGymView(store, query),
      };
    });
    const write = vi.fn(async (input) => {
      store = applyGymChanges(store, input.changes);
      return { revision: ++revision };
    });
    const storage = new Map<string, string>();
    const client = new GymCloudClient(
      { read, write },
      {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => {
          storage.set(k, v);
        },
      },
    );
    await client.connect();
    const query = { scope: 'previous' as const, id, limit: 4 };
    await Promise.all([client.read(query), client.read(query)]);
    const epoch = client.state.historyEpoch;
    let previous = client.state.cache!.draft;
    let active = startGymWorkout(previous, {
      id: 'routine',
      name: 'Synthetic',
      notes: '',
      createdAt: '2026-10-07T00:00:00Z',
      updatedAt: '2026-10-07T00:00:00Z',
      exercises: [
        { id: 're', exerciseId: id, defaultSets: 1, notes: '', repRange: null },
      ],
    });
    client.edit(active, previous);
    await vi.waitFor(() => expect(client.state.status).toBe('synced'));
    for (const weight of [60, 61, 62]) {
      previous = client.state.cache!.draft;
      active = structuredClone(previous);
      active.active!.exercises[0].sets[0].weight = weight;
      client.edit(active, previous);
      await vi.waitFor(() => expect(client.state.status).toBe('synced'));
      await client.read(query);
    }
    expect(client.state.historyEpoch).toBe(epoch);
    expect(
      read.mock.calls.filter(([q]) => q?.scope === 'previous'),
    ).toHaveLength(1);
    // A completion changes history; no unrelated active edit invalidates references.
    previous = client.state.cache!.draft;
    active = structuredClone(previous);
    Object.assign(active.active!.exercises[0].sets[0], {
      reps: 8,
      completed: true,
    });
    const completed = finishGymWorkout(active);
    client.edit(completed, previous);
    await vi.waitFor(() => expect(client.state.status).toBe('synced'));
    expect(client.state.historyEpoch).toBe(epoch + 1);
    failRead = true;
    await expect(client.read(query)).rejects.toMatchObject({ status: 503 });
    expect(client.state.status).toBe('synced');
    previous = client.state.cache!.draft;
    const edited = structuredClone(previous);
    edited.history[0].notes = 'Synthetic correction';
    client.edit(edited, previous);
    await vi.waitFor(() => expect(client.state.status).toBe('synced'));
    failRead = false;
    expect((await client.read(query)).store?.history).toHaveLength(4);
    expect(write).toHaveBeenCalledTimes(6);
    store.history.pop();
    revision++;
    await client.connect();
    expect(client.state.historyEpoch).toBe(epoch + 3);
    previous = client.state.cache!.draft;
    const deleted = structuredClone(previous);
    deleted.history.pop();
    client.edit(deleted, previous);
    await vi.waitFor(() => expect(client.state.status).toBe('synced'));
    expect(client.state.historyEpoch).toBe(epoch + 4);
    previous = client.state.cache!.draft;
    const imported = structuredClone(previous);
    const newSession = structuredClone(store.history[0]);
    newSession.id = 'synthetic-incremental-import';
    newSession.provenance.source = 'hevy_import';
    imported.history.push(newSession);
    client.edit(imported, previous);
    await vi.waitFor(() => expect(client.state.status).toBe('synced'));
    expect(client.state.historyEpoch).toBe(epoch + 5);
    expect(store.history.some((w) => w.id === newSession.id)).toBe(true);
  });
  it('rejects an account change and never shares results for another canonical exercise ID', async () => {
    let user = owner;
    const s = performanceHistory();
    const storage = new Map<string, string>();
    const client = new GymCloudClient(
      {
        read: async (q) => ({
          owner: user,
          revision: 1,
          initialized: true,
          ...selectGymView(s, q),
        }),
        write: async () => ({ revision: 2 }),
      },
      {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
    );
    await client.connect();
    expect(
      (await client.read({ scope: 'previous', id })).store?.history,
    ).toHaveLength(4);
    expect(
      (await client.read({ scope: 'previous', id: 'missing' })).store?.history,
    ).toEqual([]);
    user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await expect(
      client.read({ scope: 'previous', id: 'another' }),
    ).rejects.toMatchObject({ status: 403 });
    await client.connect();
    await expect(client.read({ scope: 'previous', id })).rejects.toMatchObject({
      status: 403,
    });
  });
  it('retains only allowlisted diagnostic codes and handles non-JSON HTTP failures', async () => {
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json(
            {
              error: 'History read failed',
              diagnostic: { code: 'timeout', private: 'not retained' },
            },
            { status: 503 },
          ),
        ),
      );
      await expect(
        gymCloudTransport.read({ scope: 'previous', id }),
      ).rejects.toMatchObject({ status: 503, diagnostic: { code: 'timeout' } });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('private platform body', { status: 504 }),
          ),
      );
      await expect(
        gymCloudTransport.read({ scope: 'previous', id }),
      ).rejects.toMatchObject({
        status: 504,
        message: 'Gym history response could not be read.',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json(
            {
              error: 'History read failed',
              diagnostic: { code: 'private value' },
            },
            { status: 503 },
          ),
        ),
      );
      await expect(
        gymCloudTransport.read({ scope: 'previous', id }),
      ).rejects.toMatchObject({ diagnostic: undefined });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json(null, { status: 401 })),
      );
      await expect(
        gymCloudTransport.read({ scope: 'previous', id }),
      ).rejects.toMatchObject({ status: 401, diagnostic: undefined });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
