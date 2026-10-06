-- Account Gym V1. Domain IDs are text: built-in IDs and hevy-<fingerprint> are preserved.
-- Entity JSON contains only that entity's scalar fields/snapshot; children live in separate tables.
-- Logical document key "sets" maps to gym_workout_sets; legacy gym_sets is never touched.
create table public.gym_accounts (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision >= 0),
 updated_at timestamptz not null default now()
);
create table public.gym_operations (
 owner_id uuid not null references public.gym_accounts(owner_id) on delete cascade,
 operation_id uuid not null,
 digest text not null,
 revision bigint not null,
 primary key(owner_id, operation_id)
);
do $ddl$
declare entity text;
begin
 foreach entity in array array['exercises','routines','routine_exercises','workouts','workout_exercises','sets','preferences','mappings','batches'] loop
  execute format('create table public.%I (owner_id uuid not null references public.gym_accounts(owner_id) on delete cascade, id text not null, parent text, position integer not null check(position >= 0), data jsonb not null check(jsonb_typeof(data) = ''object''), primary key(owner_id,id))',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
 end loop;
end $ddl$;
-- Relationships include owner_id; no cross-account child references.
alter table public.gym_routine_exercises add foreign key(owner_id,parent) references public.gym_routines(owner_id,id) on delete cascade;
alter table public.gym_workout_exercises add foreign key(owner_id,parent) references public.gym_workouts(owner_id,id) on delete cascade;
alter table public.gym_workout_sets add foreign key(owner_id,parent) references public.gym_workout_exercises(owner_id,id) on delete cascade;
alter table public.gym_preferences add foreign key(owner_id,id) references public.gym_exercises(owner_id,id) on delete cascade;
create unique index gym_one_active on public.gym_workouts(owner_id) where data->>'bucket'='active';
create unique index gym_source_fingerprint on public.gym_workouts(owner_id,(data->'provenance'->>'fingerprint')) where data->>'bucket'='history' and data->'provenance'->>'fingerprint' is not null;
do $rls$
declare entity text;
begin
 foreach entity in array array['accounts','operations','exercises','routines','routine_exercises','workouts','workout_exercises','sets','preferences','mappings','batches'] loop
  execute format('alter table public.%I enable row level security',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
  execute format('revoke all on public.%I from anon, authenticated',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
  execute format('grant select on public.%I to authenticated',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
  execute format('grant all on public.%I to service_role',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end);
 end loop;
end $rls$;
create function public.read_account_gym(p_owner uuid) returns jsonb
language plpgsql set search_path = '' as $fn$
declare result jsonb := '{}'::jsonb; entity text; rows jsonb; rev bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_owner::text,0));
 select revision into rev from public.gym_accounts where owner_id=p_owner;
 foreach entity in array array['exercises','routines','routine_exercises','workouts','workout_exercises','sets','preferences','mappings','batches'] loop
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''parent'',parent,''position'',position,''data'',data) order by position,id),''[]''::jsonb) from public.%I where owner_id=$1',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end) into rows using p_owner;
  result := result || jsonb_build_object(entity,rows);
 end loop;
 return jsonb_build_object('revision',coalesce(rev,0),'initialized',rev is not null,'document',jsonb_build_object('formatVersion',1,'tables',result));
end $fn$;
create function public.save_account_gym(p_owner uuid,p_expected bigint,p_operation uuid,p_digest text,p_bootstrap boolean,p_document jsonb) returns jsonb
language plpgsql set search_path = '' as $fn$
declare rev bigint; receipt public.gym_operations; entity text;
begin
 -- Serialize all account mutations. Receipt checked before CAS: retry after a lost HTTP response is safe.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,0));
 select * into receipt from public.gym_operations where owner_id=p_owner and operation_id=p_operation;
 if found then
  if receipt.digest <> p_digest then raise exception 'Operation reused with different data'; end if;
  return jsonb_build_object('ok',true,'revision',receipt.revision,'replayed',true);
 end if;
 select revision into rev from public.gym_accounts where owner_id=p_owner;
 if coalesce(rev,0) <> p_expected or (p_bootstrap and rev is not null) or (not p_bootstrap and rev is null) then
  return jsonb_build_object('ok',false,'revision',coalesce(rev,0),'conflict',true);
 end if;
 insert into public.gym_accounts(owner_id,revision) values(p_owner,1)
 on conflict(owner_id) do update set revision=public.gym_accounts.revision+1,updated_at=now()
 returning revision into rev;
 -- Replace entity rows atomically under CAS, retaining all domain IDs and snapshots.
 -- A failed constraint rolls the entire transaction back; no partial historical imports.
 foreach entity in array array['sets','workout_exercises','routine_exercises','preferences','mappings','batches','workouts','routines','exercises'] loop
  execute format('delete from public.%I where owner_id=$1',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end) using p_owner;
 end loop;
 foreach entity in array array['exercises','routines','routine_exercises','workouts','workout_exercises','sets','preferences','mappings','batches'] loop
  execute format('insert into public.%I(owner_id,id,parent,position,data) select $1,x.id,x.parent,x.position,x.data from jsonb_to_recordset($2) x(id text,parent text,position integer,data jsonb)',case when entity='sets' then 'gym_workout_sets' else 'gym_'||entity end) using p_owner,p_document->'tables'->entity;
 end loop;
 insert into public.gym_operations(owner_id,operation_id,digest,revision) values(p_owner,p_operation,p_digest,rev);
 return jsonb_build_object('ok',true,'revision',rev,'replayed',false);
end $fn$;
revoke all on function public.read_account_gym(uuid) from public,anon,authenticated;
revoke all on function public.save_account_gym(uuid,bigint,uuid,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.read_account_gym(uuid) to service_role;
grant execute on function public.save_account_gym(uuid,bigint,uuid,text,boolean,jsonb) to service_role;
