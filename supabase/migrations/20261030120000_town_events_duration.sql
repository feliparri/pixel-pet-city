-- How long a scheduled sky show runs, in seconds (the admin page picks it per show). NULL is the kind's own length (src/show/timeline.js SHOWS),
-- which is what every event saved before this column behaves as; the Edge Function checks the same 20 s to 10 min bounds on save.
alter table public.town_events add column duration_s integer check (duration_s between 20 and 600);
