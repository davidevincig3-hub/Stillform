-- Unapplied model alignment only. Local Gym runs without Supabase.
-- Missing primary anatomy is SQL NULL, matching the canonical local domain.
alter table public.exercises alter column primary_muscle_group drop not null;
alter table public.exercises alter column primary_muscle_group drop default;
update public.exercises set primary_muscle_group = null
where btrim(primary_muscle_group) = '' or lower(btrim(primary_muscle_group)) = 'unassigned';
alter table public.exercises add constraint primary_muscle_group_valid
check (primary_muscle_group is null or length(btrim(primary_muscle_group)) between 1 and 60);
-- secondary_muscle_groups uses {} for absence; equipment/category already allow NULL.
-- Historical JSON snapshots are normalized by the versioned repository decoder.
