# Room access: what is enforced and what is not

Goal: only a real pet (a claimed trip from a board or the phone) takes part in the town's rooms.

## Enforced today (client side)

* `index.html` without `?trip=<code>` is a landing page that explains how to enter and claims a code ("Tengo un código", the same as `?trip=`).
* The pet chooser and local rooms exist only with `?local=1&dev=1`.
* The old `#n=..&s=..` fragment is ignored.
* Room controls ("Crear sala", "Unirse") are shown only inside a trip, and `enter()` refuses an online (`supabase`) room unless the trip client
  holds a claimed session.
* Stars are stored in the trip's server state (`trip-save`, `{ v: 1, stars: n }`), so they belong to the pet.

## Not enforced (known limitation)

Rooms are Supabase Realtime Broadcast/Presence channels (`room:<code>`) opened with the public anon key. Nothing on the server checks that
a client holds a claimed trip, so someone who writes their own client can still join a room with the anon key and a code, or claim stars
by saving a state on a trip they hold (the server only checks size and version, not the stars' provenance).

## What true enforcement needs

1. A `room-token` action in the `trip` function: given the trip session token, answer a short-lived (a few minutes) signed token naming the
   pet's peer id.
2. Realtime private channels with an authorization policy (RLS on `realtime.messages`) that accepts only clients presenting that token, or a
   function that issues a per-room JWT used as the channel's access token.
3. Stars awarded by the referee are still self-reported: moving the economy to the server (a `trip-award` call with referee proofs) is part of
   the later economy task.
