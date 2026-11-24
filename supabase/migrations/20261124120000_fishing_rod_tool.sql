-- The fishing rod joins the Almacén's tools: widen the pet_tools check so the Edge Function can store it (docs/trip-api.md trip-buy-tool).
alter table public.pet_tools drop constraint if exists pet_tools_tool_check;
alter table public.pet_tools add constraint pet_tools_tool_check check (tool in ('sickle', 'bucket', 'feed_sack', 'fishing_rod'));
