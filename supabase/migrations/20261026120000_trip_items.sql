-- The catalogue size a board advertised in its signed trip-start body ("items": the firmware's ITEM_COUNT; docs/trip-api.md). trip-buy sells the town's
-- own hats (shop.js `town`) only to a board that knows their ids: an older firmware refuses a return package with an unknown item, which would leave the
-- pet away. Boards that do not say (every firmware before the hats) knew 14 items. Only the Edge Function writes it (RLS stays on with no policy).
alter table public.trips
  add column items smallint not null default 14 check (items between 1 and 255);
