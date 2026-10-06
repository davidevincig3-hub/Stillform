import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { encodeGym, decodeGym } from '../../src/repositories/gym-cloud-codec';
import { syntheticGymHistory } from '../helpers/gym-history';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;
let legacyBefore: unknown;
async function legacySnapshot() {
  return {
    rows: (await db.query('select * from public.gym_sets order by id')).rows,
    columns: (
      await db.query(
        "select column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='gym_sets' order by ordinal_position",
      )
    ).rows,
    security: (
      await db.query(
        "select relrowsecurity,relacl from pg_catalog.pg_class where oid='public.gym_sets'::regclass",
      )
    ).rows,
    policies: (
      await db.query(
        "select policyname,roles,cmd,qual,with_check from pg_catalog.pg_policies where schemaname='public' and tablename='gym_sets' order by policyname",
      )
    ).rows,
    constraints: (
      await db.query(
        "select conname,pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint where conrelid='public.gym_sets'::regclass order by conname",
      )
    ).rows,
  };
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${owner}'),('${other}');`,
  );
  for (const migration of (await readdir('supabase/migrations'))
    .filter((name) => /^000[1-5]_.*\.sql$/.test(name))
    .sort()) {
    await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  }
  await db.exec(`insert into public.profiles(id) values('${owner}');
    insert into public.exercises(id,user_id,name) values('11111111-1111-4111-8111-111111111111','${owner}','Synthetic legacy exercise');
    insert into public.gym_sessions(id,user_id,routine_name,started_at,ended_at,status) values('22222222-2222-4222-8222-222222222222','${owner}','Synthetic legacy session','2026-09-01T08:00:00Z','2026-09-01T09:00:00Z','completed');
    insert into public.gym_sets(id,user_id,session_id,exercise_id,position,weight_kg,reps,rir,completed) values('33333333-3333-4333-8333-333333333333','${owner}','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',0,61,8,1,true);`);
  legacyBefore = await legacySnapshot();
  await db.exec(
    await readFile('supabase/migrations/0006_account_gym.sql', 'utf8'),
  );
}, 60000);
it('applies 0006 after migrations 0001–0005 without changing legacy sets, schema, policies or constraints', async () => {
  expect(await legacySnapshot()).toEqual(legacyBefore);
  const names = (
    await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='gym_workout_sets' order by ordinal_position",
    )
  ).rows.map((r) => r.column_name);
  expect(names).toEqual(['owner_id', 'id', 'parent', 'position', 'data']);
  expect(
    (
      await db.query(
        "select relrowsecurity from pg_catalog.pg_class where oid='public.gym_workout_sets'::regclass",
      )
    ).rows,
  ).toEqual([{ relrowsecurity: true }]);
});
afterAll(async () => {
  await db?.close();
});
async function read(user = owner) {
  return (
    await db.query<{ state: unknown }>(
      'select public.read_account_gym($1::uuid) as state',
      [user],
    )
  ).rows[0].state as {
    revision: number;
    initialized: boolean;
    document: unknown;
  };
}
async function save(
  user: string,
  version: number,
  operation: string,
  digest: string,
  bootstrap: boolean,
  document: unknown,
) {
  return (
    await db.query<{
      result: { ok: boolean; revision: number; replayed?: boolean };
    }>(
      'select public.save_account_gym($1::uuid,$2::bigint,$3::uuid,$4::text,$5::boolean,$6::jsonb) as result',
      [user, version, operation, digest, bootstrap, JSON.stringify(document)],
    )
  ).rows[0].result;
}
it('executes first initialization, retry receipts, CAS, rollback and account isolation in PostgreSQL', async () => {
  const original = syntheticGymHistory(3),
    document = encodeGym(original),
    operation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  expect(await read()).toMatchObject({ revision: 0, initialized: false });
  expect(
    await save(owner, 0, operation, 'synthetic-digest', true, document),
  ).toMatchObject({ ok: true, revision: 1, replayed: false });
  expect(decodeGym((await read()).document)).toEqual(original);
  expect(
    (
      await db.query(
        'select count(*)::integer as count from public.gym_workout_sets',
      )
    ).rows,
  ).toEqual([{ count: document.tables.sets.length }]);
  expect(await legacySnapshot()).toEqual(legacyBefore);
  expect(
    await save(owner, 0, operation, 'synthetic-digest', true, document),
  ).toMatchObject({ ok: true, revision: 1, replayed: true });
  await expect(
    save(owner, 0, operation, 'different-digest', true, document),
  ).rejects.toThrow('Operation reused');
  expect(
    await save(
      owner,
      0,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'another',
      true,
      document,
    ),
  ).toMatchObject({ ok: false, revision: 1 });
  expect(
    await save(
      owner,
      0,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'another',
      false,
      document,
    ),
  ).toMatchObject({ ok: false, revision: 1 });
  const broken = structuredClone(document);
  broken.tables.sets.push(broken.tables.sets[0]);
  await expect(
    save(
      owner,
      1,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'broken',
      false,
      broken,
    ),
  ).rejects.toThrow();
  expect((await read()).revision).toBe(1);
  expect(decodeGym((await read()).document)).toEqual(original);
  expect(await read(other)).toMatchObject({ initialized: false, revision: 0 });
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';`);
  expect(
    (await db.query('select id from public.gym_workouts')).rows,
  ).toHaveLength(0);
  await db.exec(`set request.jwt.claim.sub='${owner}';`);
  expect(
    (await db.query('select id from public.gym_workouts')).rows,
  ).toHaveLength(3);
  await expect(db.query('delete from public.gym_workouts')).rejects.toThrow(
    'permission denied',
  );
  await expect(
    db.query('select public.read_account_gym($1::uuid)', [other]),
  ).rejects.toThrow('permission denied');
  await db.exec('reset role');
  expect(decodeGym((await read()).document)).toEqual(original);
}, 30000);
