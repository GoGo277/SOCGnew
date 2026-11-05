/** Cryptographic helpers used for credential storage and record integrity. */

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

export const sha256 = async (input: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));

/** Deterministic JSON serialisation (sorted keys) so hashes are reproducible. */
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
    .map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
};

export const randomSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

export const PBKDF2_ITERATIONS = 120_000;

/** PBKDF2-SHA256 password hash. */
export const hashPassword = async (password: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    key,
    256
  );
  return toHex(bits);
};

/** Constant-time string comparison. */
export const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export interface PasswordPolicyResult { ok: boolean; errors: string[] }

/** Password policy enforced on every password change. */
export const checkPasswordPolicy = (password: string, username = ''): PasswordPolicyResult => {
  const errors: string[] = [];
  if (password.length < 10) errors.push('At least 10 characters');
  if (!/[a-z]/.test(password)) errors.push('A lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('An uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('A digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('A symbol');
  if (username && password.toLowerCase().includes(username.toLowerCase())) errors.push('Must not contain the username');
  return { ok: errors.length === 0, errors };
};
