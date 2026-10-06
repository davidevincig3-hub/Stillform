import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  GymCloudClient,
  CloudRequestError,
  type GymCloudTransport,
} from '../../src/repositories/gym-cloud-client';
import {
  decodeGym,
  encodeGym,
  gymMigrationCounts,
} from '../../src/repositories/gym-cloud-codec';
import {
  gymStoreSchema,
  saveRoutine,
  startGymWorkout,
  finishGymWorkout,
  type GymStore,
} from '../../src/repositories/gym-storage';
import { syntheticGymHistory } from '../helpers/gym-history';
import { recentExercises } from '../../src/analytics/gym-shortlist';
import { SupabaseGymRepository } from '../../src/server/gym-repository';
import { config } from '../helpers/integrations';
import { gymConfig } from '../../src/server/gym-auth';
import {
  previewHevyImport,
  buildHevyPlan,
} from '../../src/integrations/hevy-import';
import { hevyColumns } from '../../src/integrations/hevy-import';
import { selectGymView } from '../../src/repositories/gym-cloud-query';
import { gymChanges } from '../../src/repositories/gym-cloud-changes';
import { applyGymChanges } from '../../src/repositories/gym-cloud-changes';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}
function server(bounded = false) {
  const accounts = new Map<string, { revision: number; store: GymStore }>();
  const receipts = new Map<string, { body: string; revision: number }>();
  let failAfterCommit = false;
  const transport = (user = owner): GymCloudTransport => ({
    async read(query) {
      const a = accounts.get(user);
      return {
        owner: user,
        revision: a?.revision ?? 0,
        initialized: !!a,
        ...(a
          ? bounded
            ? selectGymView(a.store, query ?? { scope: 'workspace' })
            : { store: decodeGym(encodeGym(a.store)) }
          : { store: null }),
      };
    },
    async write(p) {
      const key = user + p.operation,
        body = JSON.stringify(p),
        prior = receipts.get(key);
      if (prior) {
        if (prior.body !== body) throw Error('Different retry payload');
        return { revision: prior.revision };
      }
      const a = accounts.get(user);
      if ((a?.revision ?? 0) !== p.expected || (p.bootstrap ? !!a : !a))
        throw new CloudRequestError('Stale revision', 409);
      const revision = (a?.revision ?? 0) + 1;
      accounts.set(user, {
        revision,
        store: decodeGym(
          encodeGym(
            p.changes ? applyGymChanges(a!.store, p.changes) : p.store!,
          ),
        ),
      });
      receipts.set(key, { body, revision });
      if (failAfterCommit) {
        failAfterCommit = false;
        throw Error('Lost response');
      }
      return { revision };
    },
  });
  return {
    accounts,
    receipts,
    transport,
    loseResponse: () => {
      failAfterCommit = true;
    },
  };
}
const settle = async (c: GymCloudClient) => {
  await vi.waitFor(() => expect(c.state.status).not.toBe('pending'));
};
function withRoutine(s: GymStore) {
  return saveRoutine(s, {
    id: 'saved-routine',
    name: 'Synthetic Push',
    notes: '',
    createdAt: '2026-10-06T08:00:00Z',
    updatedAt: '2026-10-06T08:00:00Z',
    exercises: [
      {
        id: 'routine-ex',
        exerciseId: s.exercises[0].id,
        defaultSets: 2,
        repRange: null,
        notes: '',
      },
    ],
  });
}
describe('account Gym persistence', () => {
  it('normalizes and reconstructs all historical data without changing domain IDs, provenance or null metadata', () => {
    const s = withRoutine(syntheticGymHistory(30));
    s.exercisePreferences[s.exercises[0].id] = {
      pinned: true,
      dismissed: false,
    };
    s.hevyMappings['Synthetic alias'] = s.exercises[0].id;
    s.history[0].provenance.fingerprint = 'synthetic-fingerprint';
    s.history[0].provenance.externalId = 'synthetic-source-id';
    s.history[0].provenance.sourceStart = '1 set 2026, 10:00';
    s.history[0].provenance.timeZone = 'Europe/Rome';
    s.history[0].exercises[0].sourceName = 'Synthetic original alias';
    Object.assign(s.history[0].exercises[0].sets[0], {
      rpe: 9,
      failure: true,
      setType: 'normal',
      sourceSetIndex: 0,
      sourceRowOrder: 0,
      sourceExerciseNotes: 'Synthetic historical notes',
      supersetId: '1',
      distanceKm: null,
      durationSeconds: null,
    });
    const active = startGymWorkout(s, s.routines[0]);
    expect(decodeGym(encodeGym(active))).toEqual(active);
    expect(gymMigrationCounts(active).completedWorkouts).toBe(30);
    expect(encodeGym(active).tables.workouts[0].data).not.toHaveProperty(
      'exercises',
    );
    expect(
      encodeGym(active).tables.workout_exercises[0].data,
    ).not.toHaveProperty('sets');
  });
  it('bootstraps once, retries a lost response idempotently, and refuses nonempty bootstrap', async () => {
    const db = server(),
      storage = memoryStorage(),
      c = new GymCloudClient(db.transport(), storage);
    await c.connect();
    db.loseResponse();
    c.bootstrap(syntheticGymHistory(30));
    await settle(c);
    expect(c.state.status).toBe('error');
    expect(c.state.cache?.pending).not.toBeNull();
    const restored = new GymCloudClient(db.transport(), storage);
    restored.restore();
    await restored.connect();
    expect(restored.state.status).toBe('synced');
    expect(db.receipts.size).toBe(1);
    expect(db.accounts.get(owner)?.store.history).toHaveLength(30);
    expect(() => restored.bootstrap(syntheticGymHistory())).toThrow();
  });
  it('shares phone/desktop routines, sets, active resume, completed history and shortlist in both directions', async () => {
    const db = server(),
      desktop = new GymCloudClient(db.transport(), memoryStorage()),
      phone = new GymCloudClient(db.transport(), memoryStorage());
    await desktop.connect();
    desktop.bootstrap(withRoutine(syntheticGymHistory(3)));
    await settle(desktop);
    await phone.connect();
    let s = phone.state.cache!.draft;
    expect(phone.edit(startGymWorkout(s, s.routines[0]), s)).toBe(true);
    await settle(phone);
    await desktop.connect();
    s = desktop.state.cache!.draft;
    const next = structuredClone(s);
    next.active!.exercises[0].sets[0].weight = 61;
    next.active!.exercises[0].sets[0].reps = 9;
    next.active!.exercises[0].sets[0].completed = true;
    next.active!.exercises[0].sets[0].loggedAt = new Date().toISOString();
    next.active!.exercises[0].sets.push({
      ...next.active!.exercises[0].sets[0],
      id: 'additional-real-set',
    });
    expect(desktop.edit(next, s)).toBe(true);
    await settle(desktop);
    await phone.connect();
    expect(phone.state.cache!.draft.active!.id).toBe(next.active!.id);
    expect(phone.state.cache!.draft.active!.exercises[0].sets).toHaveLength(3);
    s = phone.state.cache!.draft;
    expect(phone.edit(finishGymWorkout(s), s)).toBe(true);
    await settle(phone);
    await desktop.connect();
    expect(desktop.state.cache!.draft.history).toHaveLength(4);
    expect(recentExercises(desktop.state.cache!.draft)).toEqual(
      recentExercises(phone.state.cache!.draft),
    );
  });
  it('rejects stale edits and retains the rejected draft; explicit reload preserves a local recovery backup', async () => {
    const db = server(),
      a = new GymCloudClient(db.transport(), memoryStorage()),
      local = memoryStorage(),
      b = new GymCloudClient(db.transport(), local);
    await a.connect();
    a.bootstrap(syntheticGymHistory(3));
    await settle(a);
    await b.connect();
    const old = b.state.cache!.draft;
    a.edit(withRoutine(a.state.cache!.draft), a.state.cache!.draft);
    await settle(a);
    const rejected = {
      ...old,
      exercisePreferences: {
        [old.exercises[1].id]: { pinned: true, dismissed: false },
      },
    };
    b.edit(rejected, old);
    await settle(b);
    expect(b.state.status).toBe('conflict');
    expect(b.state.cache!.draft).toEqual(rejected);
    expect(b.edit(old, rejected)).toBe(false);
    await b.useCloudAfterConflict();
    expect(b.state.cache!.draft.routines).toHaveLength(1);
    expect([...local.data.keys()].some((k) => k.includes('.rejected.'))).toBe(
      true,
    );
  });
  it('retains edits made while a save is in flight and applies a second revision', async () => {
    const db = server(),
      normal = db.transport();
    let release: (() => void) | undefined;
    const c = new GymCloudClient(normal, memoryStorage());
    await c.connect();
    c.bootstrap(syntheticGymHistory(3));
    await settle(c);
    const deferred: GymCloudTransport = {
      read: normal.read,
      write: async (p) => {
        await new Promise<void>((r) => {
          release = r;
        });
        return normal.write(p);
      },
    };
    const queue = new GymCloudClient(deferred, memoryStorage());
    await queue.connect();
    const old = queue.state.cache!.draft,
      one = withRoutine(old);
    queue.edit(one, old);
    const two = {
      ...one,
      exercisePreferences: {
        [one.exercises[0].id]: { pinned: true, dismissed: false },
      },
    };
    queue.edit(two, one);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release!();
    release = undefined;
    await vi.waitFor(() => expect(queue.state.cache!.revision).toBe(2));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release!();
    await settle(queue);
    expect(db.accounts.get(owner)?.store).toEqual(gymStoreSchema.parse(two));
    expect(db.accounts.get(owner)?.revision).toBe(3);
  });
  it('isolates accounts and will never upload a cached owner draft into a different signed-in owner', async () => {
    const db = server(),
      storage = memoryStorage(),
      a = new GymCloudClient(db.transport(), storage);
    await a.connect();
    a.bootstrap(syntheticGymHistory(3));
    await settle(a);
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      b = new GymCloudClient(db.transport(other), storage);
    b.restore();
    await b.connect();
    expect(b.state.status).toBe('error');
    expect(b.state.error).toContain('differs');
    expect(db.accounts.has(other)).toBe(false);
  });
  it('continues incremental Hevy import against reconstructed shared data without duplicate native or imported sessions', async () => {
    const base = withRoutine(syntheticGymHistory(3));
    const csv = [
      hevyColumns.join(','),
      [
        'Synthetic new',
        '6 ott 2026, 08:00',
        '6 ott 2026, 09:00',
        '',
        'Synthetic exercise 000',
        '',
        '',
        '0',
        'normal',
        '60',
        '8',
        '',
        '',
        '',
      ]
        .map((value) => `"${value.replaceAll('"', '""')}"`)
        .join(','),
    ].join('\n');
    const preview = await previewHevyImport(csv);
    const mappings = [
      {
        incomingName: 'Synthetic exercise 000',
        exerciseId: base.exercises[0].id,
        resolution: 'existing' as const,
      },
    ];
    const plan = buildHevyPlan(
      decodeGym(encodeGym(base)),
      preview,
      mappings,
      {},
    );
    const shared = decodeGym(encodeGym(plan.store));
    const repeat = buildHevyPlan(shared, preview, mappings, {});
    expect(shared.history).toHaveLength(4);
    expect(repeat.summary.workouts).toBe(0);
    expect(repeat.summary.duplicates).toBe(1);
    for (const workout of base.history)
      expect(shared.history.find((w) => w.id === workout.id)).toEqual(workout);
  });
  it('sends validated normalized rows with numeric CAS version, server-authenticated owner and preserves RPC false as conflict', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, revision: 2, conflict: true }),
          { status: 200 },
        ),
      );
    const repo = new SupabaseGymRepository(config, fetcher);
    await expect(
      repo.save(owner, {
        owner,
        expected: 0,
        operation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        bootstrap: true,
        store: syntheticGymHistory(3),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const payload = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(payload.p_owner).toBe(owner);
    expect(payload.p_expected).toBe(0);
    expect(payload.p_document.tables.sets.length).toBeGreaterThan(0);
    expect(payload.p_digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it('permits only exact trusted HTTPS LAN origin, rejects HTTP sign-in and foreign write origins', () => {
    const env = {
      NODE_ENV: 'development' as const,
      APP_ORIGIN: 'http://localhost:3000',
      SUPABASE_URL: config.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: 'synthetic',
      SUPABASE_SECRET_KEY: 'synthetic',
      INTEGRATION_ENCRYPTION_KEY: 'ab'.repeat(32),
      STILLFORM_LAN_HOST: '192.168.1.103',
    };
    expect(
      gymConfig(new Request('https://192.168.1.103:3000/api/gym'), env).origin,
    ).toBe('https://192.168.1.103:3000');
    expect(() =>
      gymConfig(new Request('http://192.168.1.103:3000/api/gym'), env),
    ).toThrow();
    expect(() =>
      gymConfig(
        new Request('https://192.168.1.103:3000/api/gym', {
          method: 'POST',
          headers: { origin: 'https://foreign.test' },
        }),
        env,
      ),
    ).toThrow();
  });
  it('resolves Next HTTPS bind-host URLs only to exact allowed browser authorities and preserves write-origin checks', () => {
    const env = {
      NODE_ENV: 'development' as const,
      APP_ORIGIN: 'http://localhost:3000',
      SUPABASE_URL: config.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: 'synthetic',
      SUPABASE_SECRET_KEY: 'synthetic',
      INTEGRATION_ENCRYPTION_KEY: 'ab'.repeat(32),
      STILLFORM_LAN_HOST: '192.168.10.20',
    };
    const request = (
      host: string,
      origin = `https://${host}`,
      protocol = 'https',
    ) =>
      new Request(`${protocol}://0.0.0.0:3000/api/gym`, {
        method: 'POST',
        headers: {
          host,
          origin,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': '192.168.10.20:3000',
        },
      });
    for (const host of [
      '192.168.10.20:3000',
      'localhost:3000',
      '127.0.0.1:3000',
    ])
      expect(gymConfig(request(host), env).origin).toBe(`https://${host}`);
    for (const host of [
      'foreign.test:3000',
      '192.168.10.21:3000',
      '192.168.10.20:444',
      'localhost:3000@foreign.test',
    ])
      expect(() => gymConfig(request(host), env)).toThrow();
    expect(() =>
      gymConfig(request('192.168.10.20:3000', 'https://foreign.test'), env),
    ).toThrow('origin is not trusted');
    expect(() =>
      gymConfig(request('192.168.10.20:3000', undefined, 'http'), env),
    ).toThrow();
    expect(() =>
      gymConfig(request('192.168.10.20:3000'), {
        ...env,
        NODE_ENV: 'production',
      }),
    ).toThrow();
  });
  it('blocks an account switch before any server write even when its revision happens to match', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repo = new SupabaseGymRepository(config, fetcher);
    await expect(
      repo.save('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
        owner,
        expected: 0,
        operation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        bootstrap: true,
        store: syntheticGymHistory(3),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function memoryJournal() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k: string) => data.get(k) ?? null,
    put: async (k: string, v: string) => {
      data.set(k, v);
    },
    remove: async (k: string) => {
      data.delete(k);
    },
  };
}
describe('bounded cloud persistence and large accounts', () => {
  it('bootstraps an account larger than localStorage without caching history and retries a lost response once', async () => {
    const db = server(true),
      local = memoryStorage(),
      journal = memoryJournal();
    const large = syntheticGymHistory(287);
    for (const w of large.history) {
      w.exercises = [
        {
          ...structuredClone(large.history[0].exercises[0]),
          id: 'large-ex-' + w.id,
          notes: 'Synthetic large snapshot '.repeat(1200),
          sets: [
            {
              ...large.history[0].exercises[0].sets[0],
              id: 'large-set-' + w.id,
            },
          ],
        },
      ];
    }
    expect(JSON.stringify(large).length).toBeGreaterThan(5 * 1024 * 1024);
    const backup = JSON.stringify(large);
    local.setItem('adaptive-coach.gym.v2', backup);
    const limited = {
      getItem: local.getItem,
      setItem: (k: string, v: string) => {
        if (v.length > 16000)
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        local.setItem(k, v);
      },
    };
    const client = new GymCloudClient(db.transport(), limited, journal);
    await client.connect();
    db.loseResponse();
    client.bootstrap(large);
    await settle(client);
    expect(client.state.status).toBe('error');
    expect(db.accounts.get(owner)!.store.history).toHaveLength(287);
    const reload = new GymCloudClient(db.transport(), limited, journal);
    reload.restore();
    await reload.connect();
    expect(reload.state.status).toBe('synced');
    expect(reload.state.cache!.draft.history).toHaveLength(3);
    expect(db.receipts.size).toBe(1);
    expect(journal.data.size).toBe(0);
    expect(local.getItem('adaptive-coach.gym.v2')).toBe(backup);
    const metadata = JSON.parse(
      local.getItem('stillform.gym.account.' + owner)!,
    );
    expect(metadata).not.toHaveProperty('draft');
    expect(metadata).not.toHaveProperty('history');
    const page = await reload.read({ scope: 'history', page: 1 });
    expect(page.store!.history).toHaveLength(20);
    expect(page.summary!.total).toBe(287);
    const first = selectGymView(large, { scope: 'history' }).store.history;
    expect(
      page.store!.history.some((w) => first.some((x) => x.id === w.id)),
    ).toBe(false);
  });
  it('journals only changed workout drafts, restores active sets and retries without duplicating unloaded history', async () => {
    const db = server(true),
      local = memoryStorage(),
      journal = memoryJournal();
    const client = new GymCloudClient(db.transport(), local, journal);
    await client.connect();
    client.bootstrap(withRoutine(syntheticGymHistory(40)));
    await settle(client);
    const original = db.accounts.get(owner)!.store.history;
    let before = client.state.cache!.draft;
    db.loseResponse();
    const active = startGymWorkout(before, before.routines[0]);
    active.active!.exercises[0].sets[0].weight = 61;
    active.active!.exercises[0].sets[0].reps = 8;
    active.active!.exercises[0].sets[0].completed = true;
    expect(client.edit(active, before)).toBe(true);
    await settle(client);
    const pending = JSON.parse([...journal.data.values()][0]);
    expect(pending.pending.store).toBeUndefined();
    expect(pending.pending.changes.arrays.history).toBeUndefined();
    const reload = new GymCloudClient(db.transport(), local, journal);
    reload.restore();
    await reload.connect();
    expect(reload.state.cache!.draft.active!.exercises[0].sets[0].weight).toBe(
      61,
    );
    expect(db.accounts.get(owner)!.store.history).toEqual(original);
    before = reload.state.cache!.draft;
    expect(reload.edit(finishGymWorkout(before), before)).toBe(true);
    await settle(reload);
    expect(db.accounts.get(owner)!.store.history).toHaveLength(41);
    expect(
      new Set(db.accounts.get(owner)!.store.history.map((w) => w.id)).size,
    ).toBe(41);
    expect(db.receipts.size).toBe(3);
  });
  it('uses deltas for loaded detail deletion without deleting unloaded sessions', () => {
    const full = syntheticGymHistory(50);
    const view = selectGymView(full, {
      scope: 'workout',
      id: full.history[25].id,
    }).store;
    const changes = gymChanges(view, { ...view, history: [] });
    const next = applyGymChanges(full, changes);
    expect(next.history).toHaveLength(49);
    expect(next.history.some((w) => w.id === full.history[25].id)).toBe(false);
    expect(next.history.find((w) => w.id === full.history[0].id)).toEqual(
      full.history[0],
    );
  });
  it('does not upload if the pending journal cannot be committed', async () => {
    const db = server(),
      local = memoryStorage();
    const journal = memoryJournal();
    journal.put = async () => {
      throw Error('IndexedDB unavailable');
    };
    const client = new GymCloudClient(db.transport(), local, journal);
    await client.connect();
    client.bootstrap(syntheticGymHistory(3));
    await settle(client);
    expect(client.state.status).toBe('error');
    expect(db.accounts.size).toBe(0);
    expect(db.receipts.size).toBe(0);
  });
});

it('preserves input arriving during asynchronous journal acknowledgement', async () => {
  const db = server(),
    journal = memoryJournal(),
    local = memoryStorage();
  const normalRemove = journal.remove;
  let hold = false,
    release: (() => void) | undefined;
  journal.remove = async (key) => {
    if (hold) {
      hold = false;
      await new Promise<void>((r) => {
        release = r;
      });
    }
    await normalRemove(key);
  };
  const client = new GymCloudClient(db.transport(), local, journal);
  await client.connect();
  client.bootstrap(syntheticGymHistory(3));
  await settle(client);
  const before = client.state.cache!.draft,
    one = withRoutine(before);
  hold = true;
  client.edit(one, before);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const two = {
    ...one,
    exercisePreferences: {
      [one.exercises[0].id]: { pinned: true, dismissed: false },
    },
  };
  client.edit(two, one);
  release!();
  await vi.waitFor(() => expect(db.accounts.get(owner)!.revision).toBe(3));
  await settle(client);
  expect(db.accounts.get(owner)!.store).toEqual(two);
  expect(journal.data.size).toBe(0);
});

it('merges a historical page edit on the server without removing unloaded rows', async () => {
  const full = syntheticGymHistory(50),
    view = selectGymView(full, {
      scope: 'workout',
      id: full.history[20].id,
    }).store;
  const changes = gymChanges(view, { ...view, history: [] });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('[]'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          revision: 1,
          initialized: true,
          document: encodeGym(full),
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, revision: 2 })),
    );
  const repo = new SupabaseGymRepository(config, fetcher);
  await repo.save(owner, {
    owner,
    expected: 1,
    operation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    bootstrap: false,
    changes,
  });
  const payload = JSON.parse(fetcher.mock.calls[2][1]!.body as string);
  const saved = decodeGym(payload.p_document);
  expect(saved.history).toHaveLength(49);
  expect(saved.history.find((w) => w.id === full.history[0].id)).toEqual(
    full.history[0],
  );
  expect(payload.p_expected).toBe(1);
});
it('resolves a delta receipt before reading newer revisions on a lost-response retry', async () => {
  const before = syntheticGymHistory(3),
    changes = gymChanges(before, withRoutine(before));
  const digest = createHash('sha256')
    .update(JSON.stringify({ expected: 1, bootstrap: false, changes }))
    .digest('hex');
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify([{ digest, revision: 2 }])),
    );
  const repo = new SupabaseGymRepository(config, fetcher);
  await expect(
    repo.save(owner, {
      owner,
      expected: 1,
      operation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      bootstrap: false,
      changes,
    }),
  ).resolves.toMatchObject({ revision: 2, replayed: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
