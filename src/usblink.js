// The frames of the USB link (docs/usb-link.md): the page carries the board's signed trip requests over the board's USB serial port. One frame is one text line
// "@pp1 <type> <fields...> <crc>" that shares the port with the board's logs; anything else on a line is a log and is ignored. Mirror of pixel-pet's common/usblink.c.
export const PREFIX = '@pp1 ';
export const BODY_MAX = 8448;
export const LINE_MAX = 11520;

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
/** CRC-32 (zlib/PNG) of bytes. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return btoa(s);
}
const fromB64 = (s) => (B64.test(s) ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : null);
const bodyField = (s) => (s === '-' ? new Uint8Array(0) : s.length <= Math.ceil(BODY_MAX / 3) * 4 ? fromB64(s) : null);
const num = (s, digits) => (new RegExp(`^[0-9]{1,${digits}}$`).test(s) ? Number(s) : null);
const id32 = (s) => { const v = num(s, 10); return v !== null && v > 0 && v <= 0xffffffff ? v : null; };
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** One line -> the message, `undefined` when it is not a frame (a log: ignore it), `null` when it starts like one but is not a good one (drop it). */
export function decodeFrame(line) {
  line = line.replace(/[\r\n]+$/, '');
  if (!line.startsWith(PREFIX)) return undefined;
  if (line.length > LINE_MAX) return null;
  const t = line.split(' ');
  if (t.length < 4 || t.length > 9 || t.some((x) => x === '')) return null;
  const crc = t[t.length - 1];
  if (!/^[0-9a-f]{8}$/.test(crc) || crc32(new TextEncoder().encode(line.slice(0, line.length - 9))) !== parseInt(crc, 16)) return null;
  switch (t[1]) {
    case 'H': case 'K': {
      const unix = t.length === 4 ? num(t[2], 12) : null;
      return unix === null ? null : { type: t[1], unix };
    }
    case 'B':
      if (t.length !== 6 || !HEX32.test(t[2]) || !/^[A-Za-z0-9._+-]{1,23}$/.test(t[3]) || !/^[a-z_]{1,15}$/.test(t[4])) return null;
      return { type: 'B', device: t[2], fw: t[3], state: t[4] };
    case 'Q': {
      if (t.length !== 9) return null;
      const id = id32(t[2]);
      const signed = [t[4], t[5], t[6]].map((x) => x !== '-');
      if (id === null || !/^[a-z-]{1,23}$/.test(t[3]) || !signed.every((x) => x === signed[0])) return null;
      let auth = null;
      if (signed[0]) {
        const ts = num(t[5], 12);
        if (!HEX32.test(t[4]) || ts === null || !HEX64.test(t[6])) return null;
        auth = { device: t[4], ts, sig: t[6] };
      }
      const body = bodyField(t[7]);
      return body ? { type: 'Q', id, action: t[3], auth, body } : null;
    }
    case 'R': {
      if (t.length !== 6) return null;
      const id = id32(t[2]), status = num(t[3], 3), body = bodyField(t[4]);
      return id === null || status === null || status > 599 || !body ? null : { type: 'R', id, status, body };
    }
    default: return null;
  }
}

/** A message -> its line with the '\n'. Throws for a field that is not valid or a body over BODY_MAX. */
export function encodeFrame(m) {
  const body = m.body ?? new Uint8Array(0);
  if (body.length > BODY_MAX) throw new Error('usblink: body too big');
  const b64 = () => (body.length ? toB64(body) : '-');
  let head;
  switch (m.type) {
    case 'H': case 'K': head = `${PREFIX}${m.type} ${m.unix}`; break;
    case 'B': head = `${PREFIX}B ${m.device} ${m.fw} ${m.state}`; break;
    case 'Q': head = `${PREFIX}Q ${m.id} ${m.action} ${m.auth ? `${m.auth.device} ${m.auth.ts} ${m.auth.sig}` : '- - -'} ${b64()}`; break;
    case 'R': head = `${PREFIX}R ${m.id} ${m.status} ${b64()}`; break;
    default: throw new Error('usblink: unknown type');
  }
  const line = `${head} ${crc32(new TextEncoder().encode(head)).toString(16).padStart(8, '0')}`;
  if (decodeFrame(line) === null) throw new Error('usblink: not a valid frame');
  return `${line}\n`;
}
