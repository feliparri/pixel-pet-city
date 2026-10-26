-- Villager missions that pay real gold (docs/trip-api.md, trip-mission). Only the Edge Function writes these (RLS stays on with no policy).
--  * trips.earned: the gold the pet earned from missions on this trip; the return package's gold becomes outbound - spent + earned, and the
--    shop's available gold is gold - spent + earned (the board applies the signed delta, so a higher returned gold is earned gold).
--  * pet_days: per board (the pet's stable identity) and Chile town day (the 06:00 to 06:00 day of the villagers), the gold missions paid across
--    all trips that day and the villagers whose mission was paid. The function applies a daily cap with a conditional update on `earned`.
alter table public.trips
  add column earned integer not null default 0 check (earned >= 0);

create table public.pet_days (
  device_id  text not null references public.devices(id) on delete cascade,
  day        text not null check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  earned     integer not null default 0 check (earned >= 0),
  done       jsonb not null default '[]'::jsonb check (jsonb_typeof(done) = 'array' and jsonb_array_length(done) <= 12),
  updated_at timestamptz not null default now(),
  primary key (device_id, day)
);

alter table public.pet_days enable row level security;
revoke all on public.pet_days from anon, authenticated;
