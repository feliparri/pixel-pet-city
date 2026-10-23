-- The web trip of the pet (docs/trip-api.md): boards (devices) and the trips their pets make to the online town.
-- Only the Edge Functions touch these tables, with the service role: RLS is on and there is deliberately NO policy for anon or
-- authenticated, so the public API key can neither read nor write them.

create type public.trip_status as enum (
  'waiting',    -- uploaded, the code was not claimed yet
  'active',     -- claimed: the pet lives in the town
  'recalled',   -- the board asked for it back
  'returned',   -- the return package was handed to the board, its ack is pending
  'closed',     -- acknowledged: finished
  'cancelled',  -- replaced by a newer trip of the same board
  'expired'     -- never claimed in time (still recallable: the pet never left)
);

create table public.devices (
  id          text primary key check (id ~ '^[0-9a-f]{32}$'),        -- 16 random bytes, hex
  key_hash    text not null check (key_hash ~ '^[0-9a-f]{64}$'),     -- sha256(secret), hex: the HMAC key (never the secret itself)
  created_at  timestamptz not null default now()
);

create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  device_id        text not null references public.devices(id) on delete cascade,
  trip_id          bigint not null check (trip_id between 1 and 4294967295),   -- the package's own trip id (u32)
  code             text not null unique check (code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  status           public.trip_status not null default 'waiting',
  package_b64      text not null check (octet_length(package_b64) <= 8192),    -- the outbound package as received; emptied on close
  package_sha256   text not null check (package_sha256 ~ '^[0-9a-f]{64}$'),
  package_bytes    integer not null check (package_bytes between 1 and 6144),
  seq              bigint not null check (seq between 0 and 4294967295),       -- the board's sequence; the return carries seq + 1
  pet_view         jsonb not null,                                             -- what the town draws (name, species, stage, items, keepsakes)
  entrance         text not null default 'parachute' check (entrance ~ '^[a-z_]{1,24}$'),
  state            jsonb not null default '{}'::jsonb check (pg_column_size(state) <= 4096),
  state_version    integer not null default 0 check (state_version >= 0),
  session_hash     text check (session_hash ~ '^[0-9a-f]{64}$'),              -- sha256 of the web session token
  session_seen_at  timestamptz,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '24 hours',   -- the deadline to claim the code
  claimed_at       timestamptz,
  recalled_at      timestamptz,
  returned_at      timestamptz,
  closed_at        timestamptz,
  updated_at       timestamptz not null default now(),
  unique (device_id, trip_id)
);

create index trips_open_by_device on public.trips (device_id) where status in ('waiting', 'active', 'recalled', 'returned');
create index trips_waiting_expiry on public.trips (expires_at) where status = 'waiting';
create index trips_cleanup on public.trips (updated_at) where status in ('closed', 'cancelled', 'expired');

create function public.trips_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trips_touch before update on public.trips for each row execute function public.trips_touch();

alter table public.devices enable row level security;
alter table public.trips enable row level security;
revoke all on public.devices, public.trips from anon, authenticated;

-- Housekeeping, safe to call at any time (the trip-start function calls it too):
--   unclaimed trips past their deadline become 'expired' (the board can still recall them);
--   finished trips are forgotten after 7 days, abandoned expired ones after 30.
create function public.cleanup_trips() returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer;
begin
  update trips set status = 'expired' where status = 'waiting' and expires_at < now();
  get diagnostics k = row_count; n := n + k;
  delete from trips where status in ('closed', 'cancelled') and updated_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  delete from trips where status = 'expired' and updated_at < now() - interval '30 days';
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function public.cleanup_trips() from public, anon, authenticated;
grant execute on function public.cleanup_trips() to service_role;

-- Hourly, when pg_cron is available (enable it in Database > Extensions); otherwise trip-start's own call is enough.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cleanup-trips', '17 * * * *', 'select public.cleanup_trips()');
  end if;
end $$;
