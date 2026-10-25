import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackage, petView, buildReturn, crc32, BYTES_MAX, fromBase64, toBase64 } from '../supabase/functions/trip/travel-package.js';
import { fixture } from './trip-helpers.js';

const plain = fixture('plain.bin'), kept = fixture('keepsake.bin');
const reseal = (b) => { const c = crc32(b, b.length - 4); b[b.length - 4] = c & 255; b[b.length - 3] = (c >>> 8) & 255; b[b.length - 2] = (c >>> 16) & 255; b[b.length - 1] = c >>> 24; return b; };
const edited = (src, fn) => { const b = new Uint8Array(src); fn(b); return reseal(b); };

test('the real packages built by the game parse, and the pet view shows what they carry', () => {
  const a = parsePackage(plain);
  assert.equal(a.ok, true);
  assert.equal(a.pkg.tripId, 0xA1B2C3D4);
  assert.equal(a.pkg.bag.length, 2);
  assert.deepEqual(petView(a.pkg), { name: 'Mochi', species: 'cat', stage: 2, stats: [80, 80, 100, 100, 100], items: ['bow', 'sunglasses', '', ''], keepsakes: [],
    gold: 5000, owned: ['tophat', 'bow', 'sunglasses'], bag: [{ kind: 'wear', key: 'tophat' }, { kind: 'toy', id: 1 }] });
  const b = parsePackage(kept);
  assert.equal(b.ok, true);
  const v = petView(b.pkg);
  assert.equal(v.name, 'Mochi');
  assert.deepEqual(v.bag, [{ kind: 'season', gid: 258, name: v.bag[0].name }]);
  assert.ok(v.bag[0].name.length > 0);
  assert.equal(v.keepsakes.length, 2);                      // the cape and the ears: worn, with their art
  assert.deepEqual(v.keepsakes.map((k) => k.slot).sort(), [0, 3]);
  for (const k of v.keepsakes) {
    assert.equal(k.pal.length, 15);
    assert.match(k.pal[0], /^#[0-9a-f]{6}$/);
    assert.equal(fromBase64(k.px).length, ((k.w + 1) >> 1) * k.h);
  }
  assert.equal(v.items[0] + v.items[3], '');                // a worn keepsake is not also a catalogue item
});

test('refusals mirror the board: magic, version, size, CRC, direction, trip id', () => {
  const why = (b) => { const r = parsePackage(b); return r.ok ? 'ok' : r.status; };
  assert.equal(why(new Uint8Array(10)), 'too_short');
  assert.equal(why(edited(plain, (b) => { b[0] = 0x58; })), 'bad_magic');
  assert.equal(why(edited(plain, (b) => { b[4] = 2; })), 'bad_version');
  assert.equal(why(edited(plain, (b) => { b[8]++; })), 'bad_size');
  assert.equal(why(plain.subarray(0, plain.length - 1)), 'bad_size');
  const big = new Uint8Array(BYTES_MAX + 1); big.set(plain.subarray(0, 24));
  assert.equal(why(big), 'bad_size');
  const bad = new Uint8Array(plain); bad[30] ^= 1;
  assert.equal(why(bad), 'bad_crc');
  assert.equal(why(edited(plain, (b) => { b[6] = 2; })), 'bad_field');
  assert.equal(why(edited(plain, (b) => { b[7] = 1; })), 'bad_field');
  assert.equal(why(edited(plain, (b) => { b[12] = b[13] = b[14] = b[15] = 0; })), 'bad_field');
});

test('refusals mirror the board: items, pet record, trailing bytes', () => {
  const why = (b) => { const r = parsePackage(b); return r.ok ? 'ok' : r.status; };
  assert.equal(why(edited(plain, (b) => { b[24] = 4; })), 'too_many');                       // four backpack items
  assert.equal(why(edited(plain, (b) => { b[25] = 9; })), 'bad_item');                       // an unknown item kind
  assert.equal(why(edited(plain, (b) => { b[25] = 1; b[26] = 200; })), 'bad_item');          // an unknown wearable id
  assert.equal(why(edited(plain, (b) => { b[25] = 1; b[26] = 1; b[30] = 1; b[31] = 1; })), 'bad_item');   // the top hat twice
  assert.equal(why(edited(plain, (b) => { b[22] = 0; b[23] = 1; })), 'bad_field');           // the pet length disagrees
  assert.equal(why(edited(plain, (b) => { b[20] = 15; })), 'unsupported_pet_schema');
  assert.equal(why(edited(plain, (b) => { b[20] = 13; })), 'bad_pet');
  const petAt = plain.length - 4 - 733;
  assert.equal(why(edited(plain, (b) => { b[petAt + 9] = 7; })), 'bad_pet');                 // a species that does not exist
  assert.equal(why(edited(plain, (b) => { b[petAt + 8] = 9; })), 'bad_pet');                 // a stage that does not exist
  assert.equal(why(edited(plain, (b) => { b[petAt + 111] = 99; })), 'bad_pet');              // a worn id past the catalogue
  assert.equal(why(edited(plain, (b) => { b[petAt + 116] = 25; })), 'bad_pet');              // a name longer than the field
  const trailing = new Uint8Array(plain.length + 1); trailing.set(plain.subarray(0, plain.length - 4)); trailing[plain.length - 4] = 7;
  const c = crc32(trailing, trailing.length - 4);
  new DataView(trailing.buffer).setUint32(trailing.length - 4, c, true); new DataView(trailing.buffer).setUint32(8, trailing.length, true);
  assert.equal(why(reseal(trailing)), 'bad_field');
});

test('a seasonal item needs its record, and a record may not repeat or be broken', () => {
  const why = (b) => { const r = parsePackage(b); return r.ok ? 'ok' : r.status; };
  // the record count is the byte after the two item lists: header 24, bag 1 + 1x5, gifts 1
  assert.equal(why(edited(kept, (b) => { b[24 + 6 + 1] = 1; })), 'bad_field');
  const at = 24 + 6 + 1 + 1;                                                                  // first record: pack u16, len u16
  assert.equal(why(edited(kept, (b) => { b[at + 4] = 0; })), 'bad_record');                  // local id 0
});

test('the return package is the same pet, direction BACK, sequence + 1, and parses', () => {
  const back = buildReturn(plain, 2);
  const r = parsePackage(back);
  assert.equal(r.ok, true);
  assert.equal(r.pkg.dir, 1);
  assert.equal(r.pkg.seq, 2);
  assert.equal(r.pkg.tripId, 0xA1B2C3D4);
  assert.deepEqual(petView(r.pkg), petView(parsePackage(plain).pkg));
  assert.equal(plain[6], 0);                                                                  // the original is untouched
});

test('base64 helpers refuse junk', () => {
  assert.equal(fromBase64('abc'), null);
  assert.equal(fromBase64('ab$='), null);
  assert.deepEqual(fromBase64(toBase64(new Uint8Array([1, 2, 3, 4]))), new Uint8Array([1, 2, 3, 4]));
});

test('the five stats sit at 52..56 of the pet record, in pet.h order, clamped to 100', () => {
  // save_payload_encode: i64 saved (0), stage 8, species 9, status 10, cause 11, four i64 (12..43), age_s 44, pending_ms 48, then stat[PET_STAT_COUNT]
  const petAt = plain.length - 4 - 733;
  const view = (fn) => { const r = parsePackage(edited(plain, fn)); assert.equal(r.ok, true); return petView(r.pkg).stats; };
  assert.deepEqual(petView(parsePackage(plain).pkg).stats, [80, 80, 100, 100, 100]);       // what the game's fixture builder wrote
  assert.deepEqual(view((b) => { [11, 22, 33, 44, 55].forEach((v, i) => { b[petAt + 52 + i] = v; }); }), [11, 22, 33, 44, 55]);   // hunger, fun, energy, clean, health
  assert.deepEqual(view((b) => { b[petAt + 52] = 250; b[petAt + 56] = 0; }), [100, 80, 100, 100, 0]);
  assert.equal(view((b) => { b[petAt + 57] = 77; })[0], 80);                                 // 57.. is stat_frac, not a stat
  assert.deepEqual(petView(parsePackage(kept).pkg).stats, [80, 80, 100, 100, 100]);
});
