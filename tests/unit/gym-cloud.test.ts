import { describe, expect, it, vi } from 'vitest';
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
function server() {
  const accounts = new Map<string, { revision: number; store: GymStore }>();
  const receipts = new Map<string, { body: string; revision: number }>();
  let failAfterCommit = false;
  const transport = (user = owner): GymCloudTransport => ({
    async read() {
      const a = accounts.get(user);
      return {
        owner: user,
        revision: a?.revision ?? 0,
        initialized: !!a,
        store: a ? decodeGym(encodeGym(a.store)) : null,
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
      accounts.set(user, { revision, store: decodeGym(encodeGym(p.store)) });
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
    let release!: () => void;
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
    release();
    await vi.waitFor(() => expect(queue.state.cache!.revision).toBe(2));
    release();
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
