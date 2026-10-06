import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { encodeGym, decodeGym } from '../../src/repositories/gym-cloud-codec';
import { syntheticGymHistory } from '../helpers/gym-history';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${owner}'),('${other}');`,
  );
  await db.exec(
    await readFile('supabase/migrations/0006_account_gym.sql', 'utf8'),
  );
}, 60000);
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
