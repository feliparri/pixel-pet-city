# Trip API (board <-> server <-> town), phase 1

The pet travels from the board to the web town. The board uploads its travel package (pixel-pet `common/travel.h`, version 1), keeps a postcard
with the pet's time frozen, and shows a short code and a QR. The browser claims the code, the pet arrives in the town and lives there; its
state lives on the server, so the browser need not stay open. The board recalls it and downloads the return package. One pet, one place.

There is ONE Edge Function, `trip`, that routes by the last path segment: `POST https://cyzsawujfcfrorntugrm.supabase.co/functions/v1/trip/<action>` with `<action>` one of `device-register trip-start trip-claim trip-save trip-recall trip-status trip-return trip-ack` (anything else: `404 {"error":"unknown_action"}`). In this document "function" means action. Every function takes `POST` with a JSON body
(`content-type: application/json`, at most 12288 bytes, else `413 too_large`) and answers JSON. Errors are always
`{ "error": "<code>", ...extra }`; the HTTP status is listed per call. No function needs the Supabase API key: the gateway JWT check is off
(`verify_jwt = false`, `supabase/config.toml`); each function authenticates by itself as below.

## States of a trip

```
waiting --claim--> active --recall--> recalled --return--> returned --ack--> closed
   |  \--(24 h unclaimed)--> expired --recall--> recalled
   \--recall--> recalled                  any open state --(the board starts another trip)--> cancelled
```

* `waiting`: uploaded, the code was not claimed. `expired`: nobody claimed it in 24 h; the pet never left, the board may still recall it.
* A board has at most one open trip: `trip-start` cancels the board's other open trips (their late recall/return answers `trip_cancelled`).
* `returned` keeps answering the same return package until `closed`. `closed` drops the stored package and the web session. Finished trips
  are deleted after 7 days, abandoned expired ones after 30 (`public.cleanup_trips()`, also called by `trip-start`).

## Device authentication (board endpoints)

`trip-start`, `trip-recall`, `trip-return`, `trip-ack` (and `trip-status` when the board calls it) carry three headers:

| header | value |
|---|---|
| `x-device-id` | the 16 random bytes registered, 32 lower-case hex characters |
| `x-timestamp` | unix seconds, decimal. The server accepts +-300 s from its clock (`401 stale` otherwise) |
| `x-signature` | lower-case hex of `HMAC-SHA256(key, "POST" + "|" + fn + "|" + timestamp + "|" + sha256_hex(body))` |

* `fn` is the action name only (`trip-recall`), not the URL path. `body` is the exact bytes sent. `sha256_hex` is 64 lower-case hex chars.
* `key` is the 32 bytes `SHA-256(secret)`, where `secret` is the 32 random bytes of `device-register`. The server stores only that hash
  (hex), never the secret. Honest limit: a leaked database would allow forging requests for the registered boards (HMAC is symmetric).
* A signed request replayed inside the window is harmless: every call is idempotent or refused by the trip state.
* Errors (`401`): `bad_headers`, `unknown_device`, `stale`, `bad_signature`.
* The board needs time (RTC/SNTP) within five minutes of real time; it has Wi-Fi when it uploads, so SNTP is available.

Test vector (also asserted in `tests/trip-crypto.test.js`): secret `000102...1f` (bytes 0..31), key = `630dcd29...710dd`
(`630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd`), `POST /trip-recall`, timestamp `1800000000`, body `{"trip_id":1}`:
body hash `a85d204c767e1c6428ba1a67c46077c500b39cb362b78f6ecee0eba41a068e79`, signature
`c51de50e0560e0a0b35f34e12a2e7dc45701f40842346aa1144c3e7799506060`. mbedTLS: `mbedtls_md_hmac` with `MBEDTLS_MD_SHA256`.

## Board endpoints

### `device-register` (no auth, first use)
Request `{ "device_id": "<32 hex>", "secret": "<64 hex>" }`.
`201 { "device_id", "existed": false }` first time; `200 { ..., "existed": true }` repeat with the same secret (idempotent);
`409 device_conflict` another secret for a registered id; `400 bad_device`, `bad_json`.

### `trip-start`
Request `{ "package": "<base64 of the outbound package, <= 6144 bytes>", "entrance": "parachute" }` (`entrance` optional, default
`parachute`; known ids: `parachute`, `blue_bolt`).
The body may also carry `"spend": 1` (optional; it is signed with the rest of the body, so a browser cannot add it): the firmware that sends it applies a gold
**decrease** on return (board gold += returned pet gold - the gold it left with, never below 0, on top of what the board earned meanwhile). Only such a trip may
spend its pet's gold in the shop; without it a lower returned gold is ignored by the board.
The server validates the package as `travel_parse` does (magic, version 1, length, CRC-32, direction OUT, trip id, counts, items, records,
pet record size and schema 14, species, stage, name, worn ids) and reads the pet view from it.
`201 { "trip_id": <u32 of the package>, "trip": "<uuid ref>", "code": "K7M2QX", "url": "https://feliparri.github.io/pixel-pet-city/?trip=K7M2QX",
"expires_at": "<ISO time, now + 24 h>", "entrance", "status": "waiting" }`.
A retry of the same package while `waiting`/`active` answers `200` with the same code. Errors: `400 bad_json | bad_package_encoding | bad_entrance`,
`413 too_large`, `409 trip_exists` (that trip id was used and is over, or the package differs), `422 bad_package` with `reason` one of
`too_short bad_magic bad_version bad_size bad_crc bad_field bad_pet too_many bad_item bad_record unsupported_pet_schema bad_direction`,
`503 no_code_available`. The code has 6 symbols from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`; the QR carries `url`.

### `trip-recall`
Request `{ "trip_id": <u32> }`. `200 { "trip_id", "status": "recalled", "replayed": false|true }` from `waiting`, `active`, `expired` or
`recalled` (idempotent). It works with the browser closed: the state is on the server. `409 trip_already_returned` (returned or closed),
`409 trip_cancelled`, `404 unknown_trip`, `400 bad_trip_id`.

### `trip-status` (the board may also call it)
Request `{ "trip_id": <u32> }`, device-signed. `200 { "status", "recalled", "claimed", "entrance", "version", "trip_id", "radar" }`.
`radar` is `null` or `{ "room": "<code or ''>", "at": <unix seconds>, "pets": [ { "n": "<name, at most 24 chars>", "sp": "frog|seal|cat",
"st": 0..3, "s": [hunger, fun, energy, clean, health] (each 0..100), "a": "idle|walk|hide|chicken|football|race|shop" } ] }`: the pets of the
room the trip's pet is in, as the town's browser last saved them in `state.radar` (see `trip-save`). The browser wrote it, so the server
re-reads it with fixed shapes: a missing or malformed radar, a room that is not a room code (or `''`), an `at` that is not an integer or is
more than 300 s ahead of the server clock answer `null`; a bad pet entry is dropped; at most 8 pets are kept; control characters are removed
from names; unknown keys are not passed on. `room: ""` means the pet is not in a shared room (`pets` is then empty). `at` is the browser's
clock when it saved: the phone treats a radar older than 60 s as stale. Nothing else of the state is returned.
`claimed` is true once the browser claimed it. Polling every 5-10 s is enough (`recalled` is true for recalled, returned, closed).

### `trip-return` (after the recall)
Request `{ "trip_id": <u32> }`. `200 { "trip_id", "seq": <outbound seq + 1>, "size", "package": "<base64>" }`: the same pet, direction BACK,
sequence + 1, valid CRC, parsed by `travel_parse`. Shop purchases (`trip-buy`) patch it: the pet record's gold (u32 at offset 103) becomes the
outbound gold - `spent` (never below 0) and each bought item is appended to the gifts list as a WEAR gift (the gifts sit before the records, so the later
bytes shift; the total length and the CRC are recomputed). Nothing else changes; with nothing bought the bytes are the plain return's. Asking again before the ack gives the same bytes.
`409 not_recalled` (still `waiting|active|expired`), `409 trip_closed`, `409 trip_cancelled`, `404 unknown_trip`.

### `trip-ack` (closes the trip)
Request `{ "trip_id": <u32>, "seq": <the return's seq> }` (`seq` optional; when present it must match, else `409 bad_seq`).
`200 { "trip_id", "status": "closed", "replayed": false|true }`; a repeat answers `ok` with `replayed: true`. `409 not_returned` (return first),
`409 trip_cancelled`. The board sends the ack only after it stored the returned pet.

## Web endpoints (CORS only for `https://feliparri.github.io`; a different `Origin` gets `403`)

Every action answers CORS for that origin, the board's too: the town page relays the board's signed calls over the USB cable (`docs/usb-link.md`).

The browser holds a session `token` (64 hex) from the claim and sends it in the `x-trip-token` header; the body names the trip by its
opaque `trip` ref (the uuid from the claim). The server keeps only `SHA-256(token)`.

### `trip-claim`
Request `{ "code": "k7m-2qx" }` (any case; spaces and dashes ignored) and optionally `"token"` (or the `x-trip-token` header) to resume.
`200 { "trip", "status": "active", "token", "entrance", "pet", "state": { "version", "data" } }` where
`pet = { "name", "species": "frog|seal|cat", "stage": 0..3 (baby..elder), "items": [head, face, neck, back] (catalogue keys of the town's
sprites.json, "" for none), "keepsakes": [ { "slot": 0..3, "name", "w", "h", "pal": ["#rrggbb" x15], "px": "<base64, 4 bits per pixel, row padded to a byte, high nibble first, 0 = transparent>" } ] }`.
`pet` also carries `"stats": [hunger, fun, energy, clean, health]` (0..100 each, read from bytes 52..56 of the schema-14 pet record, clamped; they are
those of the moment the trip started), which the town shows in the pet's presence. A trip started before this field existed has none.
A worn keepsake (a seasonal item whose art travels in the package) appears in `keepsakes` (its first sprite) and its slot is `""` in `items`.
One active web session per trip: a second claim answers `409 already_claimed` unless it resumes with the token, or the session was silent
for 600 s (then it takes over and the old token stops working: `401 bad_session`). Errors: `400 bad_code`, `404 unknown_code`,
`410 code_expired`, `410 trip_over` (with `status`: recalled, returned, closed, cancelled).

### `trip-save`
Request `{ "trip": "<ref>", "base_version": <int>, "state": { ... } , "entrance": "<id>" }` (`state` and `entrance` optional). `state` is a
small JSON object (at most 2048 characters serialized). The town keeps the pet's stars in it, `{ "v": 1, "stars": <int>, ...other keys kept }`
(saved a moment after each change, one request at a time, retried after a failure), and the radar, `"radar": { "room", "at", "pets": [...] }`
(every 10 s and when the room changes; at most 8 pets, about 700 characters with the stars, trimmed to fewer pets if the state would pass 2048).
The page's saves are queued so the stars and the radar never undo each other. `base_version` must equal the stored
version (optimistic concurrency). `200 { "version": base + 1, "entrance" }`. Errors: `401 bad_session`, `400 bad_version | bad_state | bad_entrance`,
`409 version_conflict` (with the current `version`), `409 trip_recalled`, `409 trip_over`.

### `trip-buy`
Request `{ "trip": "<ref>", "item": "<key>" }` with the token: buys one core WEAR item with the pet's gold (prices in `shop.js`, mirrored from the game's `store.c`
and kept equal by a test; the free top hat and the witch hat are not for sale). It comes home as a gift; at most 3 gifts per trip, counting any already in the package.
`200 { "gold_left", "bought": [keys] }`. The ledger (`spent`, `bought`) lives in trip columns only the function writes; the update is conditional on the trip
being `active` and `spent` unchanged, so two buys cannot overspend. Errors: `401 bad_session`, `403 shop_closed` (the trip did not start with `"spend": 1`),
`400 not_for_sale`, `409 owned` (the pet has it, or it was bought already), `409 bag_full`, `409 no_gold` (with `gold_left`, `price`), `409 trip_over`,
`409 conflict` (another buy got in first: read the state and ask again).

### `trip-status`
Request `{ "trip": "<ref>" }` with the token. `200 { "status", "recalled", "claimed", "entrance", "version", "can_spend", "gold_left", "bought" }`; it also refreshes the session's
idle clock, so the page polls it every 5 s while open. `recalled: true` means: play the departure, leave the room, show "Volvió a su casa".

## Entrada (arrival and exit pair)

An "entrada" is a cosmetic pair by id: how the pet arrives in the town and how it leaves. It is stored with the trip (`entrance`), set by
`trip-start` and changeable through `trip-save`. Ids: `parachute` (default: falls from the top and lands; leaves lifted by a balloon) and
`blue_bolt` (demo: arrives and leaves as a bolt of blue lightning; the town selects it only with `?dev=1&entrance=blue_bolt`). Unknown ids
are refused with `400 bad_entrance`; a stored id the town does not know falls back to `parachute`.

## Town events (scheduled sky shows)

The owner schedules a show (kind `fireworks`, `meteors` or `drones`, a seed and a start time) and every player in the town sees it at that moment
(table `town_events`, migration `20261025120000_town_events.sql`, RLS on and no policy: only these actions touch it).

* `events` (GET or POST, no key): `{ now, events: [{ id, kind, seed, start_at, start_ms, duration_ms }] }`, `now` being the server's clock in ms
  (the town keeps the offset). It lists what is running and what starts within 7 days, up to 20, earliest first; a POST body `{ ahead_days (1..60), limit (1..50) }` widens that. Cancelled ones are not listed.
* `event-save` (POST, header `x-admin-key`): body `{ kind, seed?, start_at }`; `start_at` is ISO 8601 with a time zone (`Z` or `-03:00`), in the future
  and at most 60 days ahead; `seed` is an integer 0..2^31-1 (random when left out); `201 { event }`. At most 50 upcoming shows (`429 too_many_events`).
* `event-cancel` (POST, header `x-admin-key`): body `{ id }`; `200 { id, cancelled, replayed }`, `404 unknown_event`.
* The admin key is the function secret `ADMIN_KEY`, set by the owner in the dashboard (Edge Functions > Secrets). Without it the two admin actions answer
  `503 admin_disabled`; a wrong or missing key is `401 bad_admin_key` (compared in constant time), and 10 wrong keys in 10 minutes in one function instance
  answer `429 too_many_attempts`. The key is never stored, logged or echoed.
* Errors: `bad_kind`, `bad_seed`, `bad_start`, `start_in_the_past`, `start_too_far`, `bad_id`, `bad_json`.

## Sizes and limits

Request body 12288 B; package 6144 B (8192 base64 chars); saved state 2048 characters; code 6 symbols; claim window 24 h; session idle 600 s;
timestamp window 300 s. Known gap: the code is the only secret of a `waiting` trip (887 million codes, 24 h); there is no per-IP throttle
on `trip-claim` yet (add one at the gateway if abused).

## Deploy (the parent applies these)

1. `supabase db push` / apply `supabase/migrations/20261023120000_trips.sql` (tables `devices`, `trips`, enum `trip_status`, RLS on with no policy,
   `cleanup_trips()`, and an hourly pg_cron job when the extension is enabled).
1b. Apply `supabase/migrations/20261025120000_town_events.sql` (table `town_events`, RLS on with no policy, `cleanup_town_events()`).
1c. Apply `supabase/migrations/20261025140000_trip_shop.sql` (trips gain `can_spend`, `spent`, `bought`; apply it before deploying the function).
2. Deploy the single function `trip` with `--no-verify-jwt` (or via `supabase/config.toml`). Entrypoint `index.ts`; files (relative to
   `supabase/functions/trip/`): `index.ts serve.ts db.ts handlers.js events.js crypto.js radar.js shop.js travel-package.js trip-code.js`. Secret `ADMIN_KEY` (the owner's, for the admin actions). Optional secret `TOWN_URL` (default `https://feliparri.github.io/pixel-pet-city/`);
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase to every function.
3. End-to-end test: `node tools/fake-board.mjs run` (see the README's "Web trip" section).
