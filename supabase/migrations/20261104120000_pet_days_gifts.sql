-- Seasonal gifts (docs/trip-api.md, trip-gift). The coins a gift pays go through the same rail as the villagers' missions (trips.earned, claimed with a
-- conditional update on the pet's ledger row of the day), and the ledger gains two columns of its own so the gifts have their own cap and their own
-- "already opened" list, apart from the missions' (earned, done):
--  * gift_earned: the coins gifts paid this board on this town day, across trips. It only ever grows (every payment is at least 1), so it is also the
--    compare-and-set column of the claim: two claims racing for the same gift read the same value and only one update matches.
--  * gifts: the ids of the gifts opened that day (`<season>:<slot>:<n>`, one claim per id). jsonb with a length check, like `done` -- not text[] --
--    because PostgREST writes it from a plain JSON array and the function reads it back as one, as it does `done`. The cap (20 coins, a gift pays at
--    least 2) keeps it far below the check's 20.
-- The row of a gift is the town day (06:00 to 06:00 America/Santiago) its slot STARTS in, so a gift has one row whenever it is claimed.
-- Only the Edge Function writes these (RLS stays on with no policy). Apply this before deploying the function that serves trip-gift.
alter table public.pet_days
  add column gift_earned integer not null default 0 check (gift_earned >= 0),
  add column gifts       jsonb   not null default '[]'::jsonb check (jsonb_typeof(gifts) = 'array' and jsonb_array_length(gifts) <= 20);
