-- The trip shop (docs/trip-api.md, trip-buy): the pet's gold buys core items while it is in the town. Only the Edge Function writes these
-- columns (RLS stays on with no policy). `can_spend` comes from the board's signed trip-start body ("spend": 1: its firmware applies a gold
-- decrease on return); `spent` is the gold spent so far and `bought` the item keys, which come home as gifts.
alter table public.trips
  add column can_spend boolean not null default false,
  add column spent     integer not null default 0 check (spent >= 0),
  add column bought    jsonb   not null default '[]'::jsonb check (jsonb_typeof(bought) = 'array' and jsonb_array_length(bought) <= 3);
