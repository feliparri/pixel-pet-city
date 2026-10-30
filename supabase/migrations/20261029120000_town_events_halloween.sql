-- A fourth kind of scheduled sky show: 'halloween' (the Halloween night). The kind was constrained inline in 20261025120000_town_events.sql.
alter table public.town_events drop constraint if exists town_events_kind_check;
alter table public.town_events add constraint town_events_kind_check check (kind in ('fireworks', 'meteors', 'drones', 'halloween'));
