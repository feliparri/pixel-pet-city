// Room codes: two short Spanish words and two digits, e.g. FOCA-LUNA-42.
// 100 words x 100 words x 100 numbers = 1,000,000 codes; rooms cannot be listed, so the code is the only way in.

export const WORDS = [
  'FOCA', 'LUNA', 'RANA', 'GATO', 'SOL', 'MAR', 'PINO', 'NUBE', 'LAGO', 'ROCA',
  'OSO', 'PATO', 'LOBO', 'ZORRO', 'BUHO', 'CABRA', 'VACA', 'CERDO', 'PEZ', 'ALGA',
  'CONCHA', 'ARENA', 'OLA', 'VIENTO', 'LLUVIA', 'NIEVE', 'HIELO', 'FUEGO', 'BRASA', 'TRIGO',
  'MAIZ', 'PAN', 'MIEL', 'UVA', 'PERA', 'KIWI', 'LIMA', 'COCO', 'FRESA', 'MORA',
  'ROSA', 'LIRIO', 'TULIPAN', 'HOJA', 'RAMA', 'ROBLE', 'CEDRO', 'MUSGO', 'HELECHO', 'TREBOL',
  'ASTRO', 'ESTRELLA', 'COMETA', 'ORBITA', 'POLO', 'ISLA', 'BAHIA', 'CERRO', 'VALLE', 'RIO',
  'PUENTE', 'TORRE', 'FARO', 'BARCO', 'VELA', 'REMO', 'ANCLA', 'NIDO', 'PLUMA', 'ALA',
  'GARRA', 'COLA', 'BIGOTE', 'SALTO', 'JUEGO', 'BALON', 'KITE', 'DADO', 'NAIPE', 'TRUCO',
  'CAMPO', 'HUERTO', 'PRADO', 'SENDA', 'PLAZA', 'CALLE', 'PARQUE', 'TIENDA', 'CASA', 'PUERTA',
  'RELOJ', 'CAMPANA', 'GLOBO', 'PAJARO', 'GRILLO', 'ABEJA', 'MARIPOSA', 'LUCIERNAGA', 'SAPO', 'TORTUGA',
].filter((w) => w.length <= 6);

const CODE_RE = /^[A-Z]{3,6}-[A-Z]{3,6}-\d{2}$/;

function randomInt(n, rng) {
  if (rng) return Math.floor(rng() * n);
  const buf = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % n);       // rejection sampling: no modulo bias
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

/** A fresh code. `rng` (0..1) is only for tests; the default is crypto-grade. */
export function generateCode(rng) {
  const i = randomInt(WORDS.length, rng);
  const j = (i + 1 + randomInt(WORDS.length - 1, rng)) % WORDS.length;   // any word but the first one
  const a = WORDS[i];
  const b = WORDS[j];
  const n = String(randomInt(100, rng)).padStart(2, '0');
  return `${a}-${b}-${n}`;
}

/** What a player typed, as a code: upper case, no accents, spaces and underscores as dashes. null when it is not a code. */
export function normalizeCode(text) {
  if (typeof text !== 'string' || text.length > 40) return null;
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  return CODE_RE.test(s) ? s : null;
}

export const isValidCode = (text) => normalizeCode(text) === text;

/** The realtime channel of a room. */
export const channelName = (code) => `room:${code}`;
