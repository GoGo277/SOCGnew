/**
 * RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) — compatible with
 * Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input: string): Uint8Array => {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
};

export const generateTotpSecret = (): string => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export const hotp = async (secret: string, counter: number, digits = 6): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0xf;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
};

export const totp = (secret: string, at: number = Date.now(), step = 30) => hotp(secret, Math.floor(at / 1000 / step));

/**
 * Verify a code allowing ±1 step of clock drift. Returns the matched time-step
 * counter (to block replay of the same code) or null.
 */
export const verifyTotp = async (secret: string, code: string, at: number = Date.now(), lastUsedStep?: number): Promise<number | null> => {
  if (!/^\d{6}$/.test(code.trim())) return null;
  const step = Math.floor(at / 1000 / 30);
  for (const s of [step, step - 1, step + 1]) {
    if (lastUsedStep !== undefined && s <= lastUsedStep) continue;
    if ((await hotp(secret, s)) === code.trim()) return s;
  }
  return null;
};

export const otpauthUri = (secret: string, account: string, issuer = 'G-Eyes SR') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
