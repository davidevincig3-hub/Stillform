-- Secure integration persistence. Apply intentionally; never migrates browser Gym data.
-- Only the server service role accesses these records. No browser table grants.
create table public.integration_registry (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.integration_accounts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('strava', 'polar')),
  athlete_id text not null,
  credential text not null, -- AES-256-GCM envelope; encryption key remains server-only
  primary key(owner_id, provider),
  unique(provider, athlete_id)
);
create table public.integration_rich_data (
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  data jsonb not null,
  primary key(owner_id, source_key)
);
create table public.integration_webhook_jobs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key(owner_id, id)
);
create index integration_pending_jobs on public.integration_webhook_jobs(owner_id, created_at) where processed_at is null;
create table public.integration_leases (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  lease uuid not null,
  expires_at timestamptz not null
);
alter table public.integration_registry enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.integration_rich_data enable row level security;
alter table public.integration_webhook_jobs enable row level security;
alter table public.integration_leases enable row level security;
revoke all on public.integration_registry, public.integration_accounts, public.integration_rich_data, public.integration_webhook_jobs, public.integration_leases from public, anon, authenticated;
grant all on public.integration_registry, public.integration_accounts, public.integration_rich_data, public.integration_webhook_jobs, public.integration_leases to service_role;

create function public.save_integration_registry(p_owner uuid, p_version bigint, p_state jsonb)
returns boolean language plpgsql set search_path = '' as $$
begin
  if p_version = 0 then
    insert into public.integration_registry(owner_id,version,state) values(p_owner,1,p_state)
      on conflict(owner_id) do nothing;
  else
    update public.integration_registry set version=version+1, state=p_state, updated_at=now()
      where owner_id=p_owner and version=p_version;
  end if;
  return found;
end;
$$;
create function public.acquire_integration_lease(p_owner uuid, p_lease uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  insert into public.integration_leases(owner_id,lease,expires_at)
    values(p_owner,p_lease,now()+interval '180 seconds')
    on conflict(owner_id) do update set lease=excluded.lease, expires_at=excluded.expires_at
      where public.integration_leases.expires_at < now();
  return found;
end;
$$;
create function public.release_integration_lease(p_owner uuid, p_lease uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  delete from public.integration_leases where owner_id=p_owner and lease=p_lease;
  return found;
end;
$$;
revoke all on function public.save_integration_registry(uuid,bigint,jsonb), public.acquire_integration_lease(uuid,uuid), public.release_integration_lease(uuid,uuid) from public, anon, authenticated;
grant execute on function public.save_integration_registry(uuid,bigint,jsonb), public.acquire_integration_lease(uuid,uuid), public.release_integration_lease(uuid,uuid) to service_role;
