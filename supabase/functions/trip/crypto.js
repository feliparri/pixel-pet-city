// Hashing, HMAC, codes and tokens over WebCrypto only (the same in Deno and Node), plus the device request signature.
const enc = new TextEncoder();
export const WINDOW_S = 300;                   // a signed request is good for +-5 minutes

export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (s) => (typeof s === 'string' && s.length % 2 === 0 && /^[0-9a-f]*$/i.test(s)
  ? Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16)) : null);

export async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? enc.encode(bytes) : bytes));
}
export const sha256Hex = async (bytes) => toHex(await sha256(bytes));

export async function hmacSha256(keyBytes, message) {
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, typeof message === 'string' ? enc.encode(message) : message));
}

/** Constant-time comparison of two equal-purpose strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const randomHex = (n) => toHex(globalThis.crypto.getRandomValues(new Uint8Array(n)));

/** The string a device signs: METHOD|function-name|unix-seconds|sha256-hex-of-the-body (the empty body hashes as usual). */
export const canonical = (method, fn, ts, bodyHashHex) => `${method}|${fn}|${ts}|${bodyHashHex}`;

/**
 * The device's HMAC key is sha256(secret): the server keeps only that hash (device-register), never the secret itself.
 * Returns the header values a board sends. `secretHex` is the 32-byte secret in hex.
 */
export async function signRequest({ deviceId, secretHex, method = 'POST', fn, body = new Uint8Array(0), ts }) {
  const key = await sha256(fromHex(secretHex));
  const bodyHash = await sha256Hex(body);
  const sig = toHex(await hmacSha256(key, canonical(method, fn, ts, bodyHash)));
  return { 'x-device-id': deviceId, 'x-timestamp': String(ts), 'x-signature': sig };
}

/**
 * Verifies a signed request against the stored key hash (hex). Returns 'ok' or a reason:
 * bad_headers | stale | bad_signature.
 */
export async function verifyRequest({ headers, method, fn, body, keyHashHex, nowS }) {
  const ts = headers['x-timestamp'], sig = headers['x-signature'];
  if (!/^\d{1,12}$/.test(ts || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return 'bad_headers';
  if (Math.abs(nowS - Number(ts)) > WINDOW_S) return 'stale';
  const key = fromHex(keyHashHex);
  if (!key || key.length !== 32) return 'bad_signature';
  const expect = toHex(await hmacSha256(key, canonical(method, fn, ts, await sha256Hex(body))));
  return safeEqual(expect, sig) ? 'ok' : 'bad_signature';
}
