-- Scheduled sky shows of the online town (docs/town-events.md): the owner schedules one (kind, seed, start time) from admin.html and every
-- player in the town sees it at that moment. Only the `trip` Edge Function touches this table, with the service role: RLS is on and there is
-- deliberately NO policy for anon or authenticated, so the public API key can neither read nor write it. The public list of upcoming
-- shows is the function's `events` action.

create table public.town_events (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('fireworks', 'meteors', 'drones')),
  seed          integer not null check (seed between 0 and 2147483647),   -- the show is a pure function of (seed, time): the same sky everywhere
  start_at      timestamptz not null,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

create index town_events_upcoming on public.town_events (start_at) where cancelled_at is null;

alter table public.town_events enable row level security;
revoke all on public.town_events from anon, authenticated;

-- Housekeeping: shows over for more than 30 days are forgotten.
create function public.cleanup_town_events() returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from town_events where start_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cleanup_town_events() from public, anon, authenticated;
grant execute on function public.cleanup_town_events() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cleanup-town-events', '23 3 * * *', 'select public.cleanup_town_events()');
  end if;
end $$;
