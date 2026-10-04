-- Apply intentionally after 0004. Does not touch browser Gym storage.
create table public.integration_polar (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 version bigint not null default 0,
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.integration_polar enable row level security;
revoke all on public.integration_polar from public, anon, authenticated;
grant all on public.integration_polar to service_role;
create function public.save_integration_polar(p_owner uuid,p_version bigint,p_state jsonb)
returns boolean language plpgsql set search_path = '' as $$
begin
 if p_version = 0 then
  insert into public.integration_polar(owner_id,version,state) values(p_owner,1,p_state) on conflict(owner_id) do nothing;
 else
  update public.integration_polar set version=version+1,state=p_state,updated_at=now() where owner_id=p_owner and version=p_version;
 end if;
 return found;
end;
$$;
revoke all on function public.save_integration_polar(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_integration_polar(uuid,bigint,jsonb) to service_role;
