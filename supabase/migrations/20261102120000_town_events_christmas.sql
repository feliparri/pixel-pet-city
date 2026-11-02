-- A fifth kind of scheduled sky show: 'christmas' (the Christmas night). The kind constraint was last set in 20261029120000_town_events_halloween.sql.
alter table public.town_events drop constraint if exists town_events_kind_check;
alter table public.town_events add constraint town_events_kind_check check (kind in ('fireworks', 'meteors', 'drones', 'halloween', 'christmas'));
