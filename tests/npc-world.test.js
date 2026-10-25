import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, dayOf, townHour, showSpans, PERSONA, AFFORDANCES, DRIVES, npcTile, farmTile, EARLIEST_BED, SHOW_PAD_MS } from '../src/npc-world.js';
import { createNpcs, createVariants, lineAt, VILLAGERS, OBJECT_LINES, DRIVE_LINES, NIGHT_LINES, SHOW_LINES, SLOT_MS, SLEEP_LINE } from '../src/npcs.js';
import { zonedToMs } from '../src/admin-time.js';
import { findPath } from '../src/path.js';

const SEED = 'FOCA-LUNA-42';
const IDS = Object.keys(PERSONA);
const fakeSprites = { pets: { id: 'sheet' }, parts: {}, catalogue: { tophat: {}, scarf: {}, bow: {}, bell_collar: {}, beanie: {}, sunglasses: {}, cape: {} } };
const DAY = dayOf(zonedToMs('2026-10-25', '12:00'));          // a spring day in Santiago (UTC-3)
const WINTER = dayOf(zonedToMs('2026-07-10', '12:00'));        // and a winter one (UTC-4)
const okTile = (p) => (p.area === 'town' ? npcTile(p.x, p.y) || (p.x === 47 && p.y === 29) : farmTile(p.x, p.y) || (p.x === 0 && p.y === 17));
const fullDay = (world, day, spans = []) => IDS.map((_, i) => { world.pose(i, day.end - 1, spans); return world.segments(i, day.end - 1, spans); });
const mkNpcs = () => createNpcs({ seed: SEED, sprites: fakeSprites, variants: createVariants(() => ({})) });

test('the town day runs from 06:00 to 06:00 Chile time, whatever the clock change', () => {
  for (const d of [DAY, WINTER]) {
    assert.equal(townHour(d.start), 6);
    assert.equal(townHour(d.end), 6);
    assert.ok(d.end - d.start >= 23 * 3600e3 && d.end - d.start <= 25 * 3600e3);
  }
  assert.equal(dayOf(DAY.start - 1).end, DAY.start);                       // 05:59 still belongs to the day before
  assert.equal(dayOf(DAY.start).start, DAY.start);
  assert.equal(townHour(zonedToMs('2026-10-25', '03:30')), 3.5);
});

test('two instances of a room agree on every villager, line and place over a whole day', () => {
  const a = mkNpcs(), b = mkNpcs();
  assert.notEqual(a.world, b.world);
  const view = (e) => { const p = e.walker.pos(); return [p.x, p.y, e.walker.d, e.say, e.area, e.asleep]; };
  for (let t = DAY.start; t < DAY.end; t += 4999) assert.deepEqual(a.update(t).map(view), b.update(t).map(view));
  assert.notDeepEqual(mkNpcs().update(DAY.start + 9e6).map((e) => e.area + e.walker.tx), createNpcs({ seed: 'GATO-RANA-07', sprites: fakeSprites, variants: createVariants(() => ({})) }).update(DAY.start + 9e6).map((e) => e.area + e.walker.tx));
});

test('villagers are always on open ground of the area they are in, one step at a time, outside the games and the paddock', () => {
  for (const seed of [SEED, 'GATO-RANA-07']) {
    const world = createWorld(seed);
    for (let i = 0; i < IDS.length; i++) {
      let prev = null;
      for (let t = DAY.start; t < DAY.end; t += 997) {
        const p = world.pose(i, t);
        assert.ok(okTile(p), `${seed} ${IDS[i]} ${t}: (${p.x}, ${p.y}) of ${p.area}`);
        assert.ok(Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0) <= 1 && p.k >= 0 && p.k < 1);
        if (prev && prev.area === p.area) assert.ok(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) <= 997 / 160 + 1, 'no jumps');
        prev = p;
      }
    }
  }
});

test('every object can be reached from every other, and from the homes, in the town and on the farm', () => {
  for (const area of ['town', 'farm']) {
    const stands = AFFORDANCES.filter((a) => a.area === area).flatMap((a) => a.stands).concat(IDS.map((id) => PERSONA[id].home).filter((h) => h.area === area).map((h) => h.at));
    const door = area === 'town' ? [47, 29] : [0, 17];
    for (const s of stands) {
      assert.ok(area === 'town' ? npcTile(s[0], s[1]) : farmTile(s[0], s[1]), `${area} ${s}`);
      assert.ok(findPath(s[0], s[1], door[0], door[1], (x, y) => (area === 'town' ? npcTile(x, y) || (x === 47 && y === 29) : farmTile(x, y) || (x === 0 && y === 17))).length > 0 || (s[0] === door[0] && s[1] === door[1]), `${area} ${s} reaches the road`);
    }
  }
});

test('they cross between the town and the farm by the road, door tile to door tile', () => {
  const world = createWorld(SEED);
  let crossings = 0;
  fullDay(world, DAY).forEach((segs) => {
    for (let k = 1; k < segs.length; k++) {
      const a = segs[k - 1], b = segs[k];
      if (a.area === b.area) continue;
      crossings++;
      assert.equal(a.kind, 'walk'); assert.equal(b.kind, 'walk');
      if (a.area === 'town') { assert.deepEqual([a.x, a.y], [47, 29]); assert.deepEqual(b.from, [0, 17]); assert.deepEqual(b.path[0], [1, 17]); }
      else { assert.deepEqual([a.x, a.y], [0, 17]); assert.deepEqual(b.from, [47, 29]); assert.deepEqual(b.path[0], [46, 29]); }
    }
  });
  assert.ok(crossings >= 6, `${crossings} crossings in a day`);
  const seen = new Set();
  for (let t = DAY.start; t < DAY.end; t += 60000) for (const p of world.poses(t)) seen.add(p.area);
  assert.deepEqual([...seen].sort(), ['farm', 'town']);
});

test('a stay at an object that serves a drive lowers that drive, and every drive has an object to turn to', () => {
  const world = createWorld(SEED);
  let uses = 0;
  const used = new Set();
  fullDay(world, DAY).forEach((segs) => segs.filter((s) => s.kind === 'stay' && s.state === 'use').forEach((s) => {
    const aff = AFFORDANCES.find((a) => a.id === s.aff);
    uses++; used.add(s.aff);
    assert.ok(aff.effects[s.drive] >= 0.25, `${s.aff} serves ${s.drive}`);
    assert.ok(s.after <= s.raised && (s.raised < 0.05 || s.after < s.raised), `${s.drive}: ${s.raised} -> ${s.after}`);
    assert.ok(aff.stands.some(([x, y]) => x === s.x && y === s.y) && aff.area === s.area);
    assert.ok(s.t1 - s.t0 >= 9000);
  }));
  assert.ok(uses > 1000);
  assert.ok(used.size >= AFFORDANCES.length - 1, `${used.size} of ${AFFORDANCES.length} objects used`);
  for (const d of DRIVES) assert.ok(AFFORDANCES.some((a) => a.effects[d] >= 0.25), d);
});

test('the drives rise with time: a villager that waits longer wants more, at its own pace', () => {
  assert.notDeepEqual(PERSONA.bruno.rates, PERSONA.lula.rates);
  const world = createWorld(SEED);
  const seen = new Map();
  fullDay(world, DAY).forEach((segs, i) => segs.filter((s) => s.state === 'use').forEach((s) => { seen.set(IDS[i] + s.drive, (seen.get(IDS[i] + s.drive) || 0) + 1); }));
  const count = (id, d) => seen.get(id + d) || 0;
  assert.ok(count('bruno', 'hunger') > count('lula', 'hunger'), 'a big eater goes to eat more often');
  assert.ok(count('lula', 'social') > count('bruno', 'social'), 'a chatterbox seeks company more often');
});

test('sleep: nobody goes to bed before 01:00, everybody is asleep at home when a day starts and ends, and night owls sleep later', () => {
  for (const day of [DAY, WINTER]) {
    const world = createWorld(SEED), all = fullDay(world, day), beds = [], wakes = [];
    all.forEach((segs, i) => {
      const home = PERSONA[IDS[i]].home;
      assert.equal(segs[0].kind, 'sleep', 'asleep as the day opens');
      assert.deepEqual([segs[0].area, segs[0].x, segs[0].y], [home.area, ...home.at]);
      const sleeps = segs.filter((s) => s.kind === 'sleep'), last = segs[segs.length - 1];
      assert.equal(last.kind, 'sleep'); assert.equal(last.t1, day.end);
      assert.deepEqual([last.area, last.x, last.y], [home.area, ...home.at]);
      const first = sleeps[0], bed = last.t0;
      assert.ok(townHour(first.t1) >= 6 && townHour(first.t1) <= 9.5, `woke at ${townHour(first.t1)}`);
      assert.ok(bed - day.start >= (EARLIEST_BED + 18) * 3600e3 - 1, 'bed at 01:00 or later');
      assert.ok(townHour(bed) >= EARLIEST_BED && townHour(bed) < 4, `${IDS[i]} fell asleep at ${townHour(bed)}`);
      assert.equal(sleeps.length, 2);
      beds.push(bed - day.start); wakes.push(first.t1);
      for (const s of segs.slice(1, -1)) assert.notEqual(s.kind, 'sleep');
    });
    assert.ok(beds[IDS.indexOf('chispa')] > beds[IDS.indexOf('tito')] + 1.5 * 3600e3, 'the raccoon stays up later than the frog');
    assert.ok(wakes[IDS.indexOf('bruno')] > wakes[IDS.indexOf('perla')] + 2 * 3600e3, 'the bear wakes later than the elephant');
    // the next day opens where this one closed: no jump at 06:00
    const next = dayOf(day.end + 1), w2 = createWorld(SEED);
    IDS.forEach((_, i) => { const a = world.pose(i, day.end - 1), b = w2.pose(i, next.start); assert.deepEqual([a.area, a.x, a.y, a.asleep], [b.area, b.x, b.y, b.asleep]); });
  }
});

test('nobody falls asleep while a show runs: they wait for its end, even when they are already home', () => {
  const base = createWorld(SEED);
  IDS.forEach((id, i) => {
    const bed = base.bedtime(i, DAY.start);
    const show = [{ from: bed - 90000, to: bed + 600000 }];             // starts a minute and a half before bedtime, runs ten minutes
    const w = createWorld(SEED), segs = w.segments(i, DAY.end - 1, show);
    w.pose(i, DAY.end - 1, show);
    const last = w.segments(i, DAY.end - 1, show).at(-1);
    assert.equal(last.kind, 'sleep');
    assert.ok(last.t0 >= show[0].to, `${id} slept at ${last.t0 - bed} after bedtime`);
    for (const s of segs) if (s.kind === 'sleep' && s.t0 > DAY.start + 6 * 3600e3) assert.ok(s.t0 >= show[0].to);
    // and a show that starts only after it went to bed does not wake it up
    const late = [{ from: last.t0 + 60000, to: last.t0 + 120000 }], w3 = createWorld(SEED), later = w3.segments(i, DAY.end - 1, late);
    assert.equal(w3.pose(i, last.t0 + 90000, late).asleep, true);
    assert.ok(later.length > 0);
  });
  const spans = showSpans([{ id: 'a', kind: 'fireworks', seed: 1, start_ms: 1000 }, { kind: 'nope', start_ms: 5 }, null]);
  assert.deepEqual(spans, [{ from: 1000, to: 1000 + 38000 + SHOW_PAD_MS }]);
});

test('a show that is announced later changes the day only from the first time it is asked about', () => {
  const w = createWorld(SEED), i = 0, noon = DAY.start + 6 * 3600e3;
  const a = w.pose(i, noon), b = w.pose(i, noon, [{ from: DAY.end + 1e6, to: DAY.end + 2e6 }]);        // a show on another day: nothing changes
  assert.deepEqual(a, b);
});

test('the sleeping villager is drawn in place with a Zzz, eyes shut; the others never say it', () => {
  const n = mkNpcs();
  const asleep = n.update(DAY.start + 1000).filter((e) => e.asleep);
  assert.ok(asleep.length >= 4);
  for (const e of asleep) assert.equal(e.say, SLEEP_LINE);
  let said = 0;
  for (let t = DAY.start + 3.5 * 3600e3; t < DAY.start + 17 * 3600e3; t += 1000) for (const e of n.update(t)) { assert.equal(e.asleep, false); if (e.say) said++; assert.notEqual(e.say, SLEEP_LINE); }
  assert.ok(said > 100);
});

test('a line is stable for its slot and talks about what the villager attends to', () => {
  const world = createWorld(SEED), act = (i) => (t) => world.pose(i, t).act;
  const pools = {};
  VILLAGERS.forEach((v, i) => {
    let ctxual = 0, drive = 0;
    for (let slot = Math.floor(DAY.start / SLOT_MS) + 10; slot < Math.floor(DAY.end / SLOT_MS) - 10; slot++) {
      const base = slot * SLOT_MS, a = act(i), first = lineAt(SEED, i, base, {}, 0, a);
      for (let dt = 0; dt < 4000; dt += 1000) assert.equal(lineAt(SEED, i, base + dt, {}, 0, a), first, 'stable within the slot');
      if (!first) continue;
      const at = a(base);
      if (at.state === 'sleep') { assert.equal(first, null); continue; }
      const allowed = [...v.lines, ...NIGHT_LINES, ...SHOW_LINES, ...(at.pool ? OBJECT_LINES[at.pool] : []), ...(at.state === 'walk' && at.drive ? DRIVE_LINES[at.drive] : [])];
      assert.ok(allowed.includes(first), `${v.id} said "${first}" while ${at.state} ${at.aff}`);
      if (at.pool && OBJECT_LINES[at.pool].includes(first)) ctxual++;
      if (at.drive && DRIVE_LINES[at.drive].includes(first)) drive++;
    }
    pools[v.id] = [ctxual, drive];
    assert.ok(ctxual > 150, `${v.id} talked about its object ${ctxual} times`);
    assert.ok(drive > 20, `${v.id} talked about its drive ${drive} times`);
  });
});

test('the orchard makes them talk about apples, being tired about a rest, and a bench is not an orchard', () => {
  const world = createWorld(SEED);
  let orchard = 0, rest = 0;
  VILLAGERS.forEach((v, i) => {
    for (let slot = Math.floor(DAY.start / SLOT_MS) + 10; slot < Math.floor(DAY.end / SLOT_MS) - 10; slot++) {
      const base = slot * SLOT_MS, a = (t) => world.pose(i, t).act, at = a(base), line = lineAt(SEED, i, base, {}, 0, a);
      if (!line) continue;
      if (at.aff === 'orchard' && OBJECT_LINES.orchard.includes(line)) orchard++;
      if (at.pool === 'bench') assert.ok(!OBJECT_LINES.orchard.includes(line));
      if (at.state === 'walk' && at.drive === 'tired' && DRIVE_LINES.tired.includes(line)) rest++;
    }
  });
  assert.ok(orchard > 20 && rest > 10, `${orchard} orchard lines, ${rest} tired lines`);
  assert.ok(OBJECT_LINES.orchard.includes('¡Qué ricas manzanas!') && DRIVE_LINES.tired.includes('Necesito un descanso…'));
});

test('the same line never comes twice in a row, also across contexts', () => {
  const world = createWorld(SEED);
  for (const ctx of [{}, { night: true }, { show: true }, { pet: 'Mochi' }]) VILLAGERS.forEach((v, i) => {
    let prev = null, n = 0;
    const a = (t) => world.pose(i, t).act;
    for (let slot = Math.floor(DAY.start / SLOT_MS); slot < Math.floor(DAY.start / SLOT_MS) + 3000; slot++) {
      const line = lineAt(SEED, i, slot * SLOT_MS, ctx, 0, a);
      if (line) { n++; if (prev) assert.notEqual(line, prev, `${v.id} slot ${slot}`); }
      prev = line;
    }
    assert.ok(n > 1000);
  });
});

test('a villager greets the local pet by name when it is near, and only then', () => {
  const n = mkNpcs(), t = DAY.start + 10 * 3600e3;
  let greeted = 0;
  for (let k = 0; k < 600; k++) for (let j = 0; j < SLOT_MS; j += 1000) {
    const at = t + k * SLOT_MS + j, p = n.world.pose(0, at), near = { name: 'Mochi', area: p.area, x: p.x + 1, y: p.y };
    const e = n.update(at, { pet: near })[0];
    if (e.say && e.say.includes('Mochi')) greeted++;
    const farSay = n.update(at, { pet: { ...near, x: p.x + 9 } })[0].say || '';
    assert.ok(!farSay.includes('Mochi') && !farSay.includes('[object'), 'a far pet is not greeted');
    assert.ok(!(n.update(at, { pet: { ...near, area: p.area === 'town' ? 'farm' : 'town' } })[0].say || '').includes('Mochi'), 'nor one in the other area');
  }
  assert.ok(greeted > 300, `${greeted} greetings`);
});

test('per frame the timeline is only looked up: a day is built once, and asking again costs next to nothing', () => {
  const n = mkNpcs(), w = n.world;
  n.update(DAY.start + 5 * 3600e3);
  for (let t = DAY.start; t < DAY.end; t += 20000) n.update(t);                       // the first sweep builds the timelines
  const built = { ...w.stats };
  assert.equal(built.days, 1);
  const t0 = performance.now();
  for (let k = 0; k < 20000; k++) n.update(DAY.start + (k * 4321) % (DAY.end - DAY.start - 1));       // jumping about the day: all of it cached
  const ms = performance.now() - t0;
  assert.deepEqual(w.stats, built, 'no new steps, no new day');
  assert.ok(ms / 20000 < 0.5, `${(ms / 20000).toFixed(3)} ms per frame`);
  n.update(DAY.end + 5000);
  assert.equal(w.stats.days, 2);
});
