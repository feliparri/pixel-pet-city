-- The farm store (Almacén, docs/trip-api.md trip-buy-tool): tools the pet owns in the town. They belong to the board (the pet's stable identity in
-- this API: devices.id), so they stay across trips; they are never part of a return package. Only the Edge Function writes this table (RLS stays on
-- with no policy). The gold they cost goes through trips.spent exactly like a shop purchase.
create table public.pet_tools (
  device_id  text not null references public.devices(id) on delete cascade,
  tool       text not null check (tool in ('sickle', 'bucket', 'feed_sack')),
  bought_at  timestamptz not null default now(),
  primary key (device_id, tool)
);

alter table public.pet_tools enable row level security;
revoke all on public.pet_tools from anon, authenticated;
