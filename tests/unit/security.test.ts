import { describe, expect, it } from 'vitest';
import { canonicalJson, checkPasswordPolicy, hashPassword, safeEqual, sha256 } from '../../lib/crypto';
import { computeIntegrityHash, auditEntryHash } from '../../lib/integrity';
import { base32Encode, base32Decode, hotp, verifyTotp, totp, generateTotpSecret, otpauthUri } from '../../lib/totp';
import { markdownToHtml } from '../../lib/markdown';
import { isValidIp, isValidPort } from '../../services/shiftReportService';

describe('hashing & integrity', () => {
  it('produces canonical JSON independent of key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(canonicalJson({ a: [2, { d: 3 }], b: 1 }));
  });
  it('matches a known SHA-256 vector', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('detects any change to a sealed report', async () => {
    const r: any = { id: 'r', date: 'd', shift: 'night', title: 't', events: [{ id: 'e', severity: 'Low' }], summary: 's', handoverNotes: 'h', contributors: ['a'], createdBy: 'a', createdAt: 'c', finalizedAt: 'f', finalizedBy: 'a' };
    const h = await computeIntegrityHash(r);
    expect(await computeIntegrityHash({ ...r })).toBe(h);
    expect(await computeIntegrityHash({ ...r, events: [{ id: 'e', severity: 'High' }] })).not.toBe(h);
    expect(await computeIntegrityHash({ ...r, summary: 's.' })).not.toBe(h);
  });
  it('audit entry hash ignores the hash field itself', async () => {
    const e: Record<string, unknown> = { id: '1', action: 'LOGIN' };
    e.hash = await auditEntryHash(e);
    expect(await auditEntryHash(e)).toBe(e.hash);
  });
  it('derives stable PBKDF2 hashes and compares in constant time', async () => {
    const a = await hashPassword('Secret!123x', 'salt', 1000);
    expect(a).toBe(await hashPassword('Secret!123x', 'salt', 1000));
    expect(a).not.toBe(await hashPassword('Secret!123x', 'salt2', 1000));
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, a.slice(1) + '0')).toBe(false);
  });
  it('enforces the password policy', () => {
    expect(checkPasswordPolicy('12345a').ok).toBe(false);
    expect(checkPasswordPolicy('alice!Strong1', 'alice').errors).toContain('Must not contain the username');
    expect(checkPasswordPolicy('Str0ng!Passw0rd').ok).toBe(true);
  });
});

describe('TOTP (RFC 4226 / 6238)', () => {
  const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
  it('matches the RFC 4226 HOTP test vectors', async () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (let i = 0; i < 10; i++) expect(await hotp(secret, i)).toBe(expected[i]);
  });
  it('round-trips base32', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
  });
  it('accepts ±1 step drift and blocks replay', async () => {
    const s = generateTotpSecret();
    const now = Date.UTC(2026, 10, 5, 10, 0, 15);
    const code = await totp(s, now - 30_000);
    const step = await verifyTotp(s, code, now);
    expect(step).not.toBeNull();
    expect(await verifyTotp(s, code, now, step!)).toBeNull();
    expect(await verifyTotp(s, await totp(s, now - 120_000), now)).toBeNull();
    expect(await verifyTotp(s, 'abcdef', now)).toBeNull();
  });
  it('builds an otpauth URI for authenticator apps', () => {
    expect(otpauthUri('ABC', 'alice')).toMatch(/^otpauth:\/\/totp\/G-Eyes%20SR:alice\?secret=ABC&issuer=G-Eyes%20SR/);
  });
});

describe('safe markdown rendering', () => {
  it('escapes HTML so report content cannot inject script', () => {
    const html = markdownToHtml('# Title <script>alert(1)</script>\n\n**bold** <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
  });
  it('renders tables and lists', () => {
    const html = markdownToHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('<ul><li>x</li><li>y</li></ul>');
  });
});

describe('input validation', () => {
  it('validates IPv4/IPv6 addresses', () => {
    expect(['10.0.0.1', '192.168.1.0/24', '2001:db8::1', ''].every(isValidIp)).toBe(true);
    expect(['999.1.1.1', '10.0.0', 'abc', '1.2.3.4/33'].some(isValidIp)).toBe(false);
  });
  it('validates ports, lists and ranges', () => {
    expect(['22', '80,443', '1000-2000', ''].every(isValidPort)).toBe(true);
    expect(['70000', '20-10', 'x'].some(isValidPort)).toBe(false);
  });
});
