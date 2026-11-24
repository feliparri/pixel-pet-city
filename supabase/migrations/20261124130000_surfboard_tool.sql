-- The surfboard joins the Almacén's tools: widen the pet_tools check so the Edge Function can store it (docs/trip-api.md trip-buy-tool). The list repeats the fishing rod, so
-- this migration is complete on its own whether or not 20261124120000_fishing_rod_tool.sql has been applied yet.
alter table public.pet_tools drop constraint if exists pet_tools_tool_check;
alter table public.pet_tools add constraint pet_tools_tool_check check (tool in ('sickle', 'bucket', 'feed_sack', 'fishing_rod', 'surfboard'));
