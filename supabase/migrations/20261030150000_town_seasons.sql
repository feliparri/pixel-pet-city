-- Seasons of the online town (Halloween, ...): each season's art and default yearly dates ship in the client code (src/seasons.js); this table holds only the
-- owner's overrides from admin.html: other dates for one year (mode 'dates'), forced on ('on') or forced off ('off'). No row for (season, year) means the
-- built-in default window. `year` is the year the season's window starts in (Chile time). Same access as town_events: only the `trip` Edge Function touches
-- it, with the service role; RLS is on and there is deliberately NO policy for anon or authenticated. The public overrides are served by the `events` action.

create table public.town_seasons (
  season      text not null check (season ~ '^[a-z][a-z0-9-]{0,31}$'),   -- a key of the client registry; the Edge Function checks the known list on save
  year        integer not null check (year between 2000 and 2100),
  starts_at   timestamptz,
  ends_at     timestamptz,
  mode        text not null check (mode in ('dates', 'on', 'off')),
  updated_at  timestamptz not null default now(),
  primary key (season, year),
  check (mode <> 'dates' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

alter table public.town_seasons enable row level security;
revoke all on public.town_seasons from anon, authenticated;
