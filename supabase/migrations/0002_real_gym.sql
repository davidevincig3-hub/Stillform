-- Foundation extension only: still unapplied. Test with Supabase before use.
alter table public.exercises add column primary_muscle_group text not null default 'Unassigned';
alter table public.exercises add column secondary_muscle_groups text[] not null default '{}';
alter table public.exercises add column equipment text;
alter table public.exercises add column category text;
alter table public.exercises add column custom boolean not null default true;
alter table public.exercises add column library_key text;
create unique index exercise_library_identity on public.exercises(user_id,library_key) where library_key is not null;
alter table public.routines add column notes text not null default '';
alter table public.routines add column created_at timestamptz not null default now();
alter table public.routines add column updated_at timestamptz not null default now();
alter table public.routine_exercises add column default_sets integer not null default 3 check(default_sets between 1 and 30);
alter table public.routine_exercises add column rep_min integer check(rep_min between 1 and 200);
alter table public.routine_exercises add column rep_max integer check(rep_max between 1 and 200);
alter table public.routine_exercises add column notes text not null default '';
alter table public.routine_exercises add constraint rep_range_valid check((rep_min is null and rep_max is null) or (rep_min is not null and rep_max is not null and rep_min<=rep_max));
alter table public.gym_sessions add column routine_snapshot jsonb;
alter table public.gym_sessions add column exercise_snapshots jsonb not null default '[]';
alter table public.gym_sessions add column duration_minutes numeric check(duration_minutes>=0);
alter table public.gym_sessions add column notes text not null default '';
alter table public.gym_sessions add column data_origin text not null default 'legacy_unverified' check(data_origin in ('user','legacy_unverified','demo'));
alter table public.gym_sessions add column provenance jsonb not null default '{"source":"legacy_v1"}';
-- Snapshot arrays retain order and names/muscles at logging time, regardless of later edits.
-- Future repository queries must require data_origin='user' AND status='completed'.
-- Routine deletion must preserve session snapshots; normalize library_key to exercise UUIDs in the SQL adapter.
-- The future SQL adapter soft-deletes routines to preserve owner foreign keys.
alter table public.routines add column archived_at timestamptz;
