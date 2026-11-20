-- A show may now run up to 24 hours (the admin schedules it as a start-to-end range): widen the bound of town_events.duration_s from 600 s to 86400 s.
-- Run this before the event-save function that accepts long shows is deployed; older rows (null or up to 600) stay valid.
alter table public.town_events drop constraint if exists town_events_duration_s_check;
alter table public.town_events add constraint town_events_duration_s_check check (duration_s between 20 and 86400);
