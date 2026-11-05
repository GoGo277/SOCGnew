/**
 * Integration tests for the Cloud Functions against the Emulator Suite
 * (auth + firestore + functions). Run with `npm run test:emulators`.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { computeIntegrityHash, auditEntryHash } from '../../lib/integrity';

const PROJECT = 'demo-geyes';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// firebase-admin lives in functions/node_modules
const fnRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminInit, getApps: adminApps } = fnRequire('firebase-admin/app');
const { getAuth: adminAuthOf } = fnRequire('firebase-admin/auth');
const { getFirestore: adminDbOf } = fnRequire('firebase-admin/firestore');
if (!adminApps().length) adminInit({ projectId: PROJECT });
const adminAuth = adminAuthOf();
const adminDb = adminDbOf();

const ADMIN_PW = 'Adm1n!Passw0rd';
let seq = 0;

/** A signed-in client app (separate instance per identity). */
const client = async (email: string, password: string) => {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `c${++seq}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, email, password);
  return { app, auth, db, call: <T = any>(name: string, data: unknown) => httpsCallable(fns, name)(data).then(r => r.data as T) };
};
type Client = Awaited<ReturnType<typeof client>>;
const apps: FirebaseApp[] = [];
const open = async (email: string, pw: string) => { const c = await client(email, pw); apps.push(c.app); return c; };

const setMfaPolicy = (on: boolean) => adminDb.doc('app_settings/global').set({ requireAdminMfa: on }, { merge: true });
const waitFor = async <T,>(fn: () => Promise<T | undefined>, ms = 15000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timeout'); await new Promise(r => setTimeout(r, 300)); }
};
const auditOf = async (action: string, targetName?: string) =>
  (await adminDb.collection('audit_logs').where('action', '==', action).get()).docs.map((d: any) => d.data()).filter((e: any) => !targetName || e.targetName === targetName);

let admin: Client;

beforeAll(async () => {
  const { uid } = await adminAuth.createUser({ email: 'admin@soc.test', password: ADMIN_PW, displayName: 'Admin' });
  await adminAuth.setCustomUserClaims(uid, { role: 'Admin' });
  await adminDb.doc(`users/${uid}`).set({ id: uid, username: 'Admin', email: 'admin@soc.test', role: 'Admin', createdAt: new Date().toISOString() });
  await adminDb.doc('login_index/admin').set({ email: 'admin@soc.test', uid });
  // The Auth emulator cannot complete TOTP, so the MFA policy is toggled per test.
  await setMfaPolicy(false);
  admin = await open('admin@soc.test', ADMIN_PW);
});

afterAll(async () => { await Promise.all(apps.map(a => deleteApp(a))); });

describe('identity administration', () => {
  it('provisions an analyst with the temporary password and a forced change', async () => {
    const created = await admin.call('provisionUser', { username: 'alice', email: 'alice@soc.test', role: 'L1' });
    expect(created.forcePasswordChange).toBe(true);
    const rec = await adminAuth.getUser(created.id);
    expect(rec.customClaims).toEqual({ role: 'L1' });
    expect((await adminDb.doc('login_index/alice').get()).data()).toMatchObject({ email: 'alice@soc.test' });
    const alice = await open('alice@soc.test', '12345a');
    expect(alice.auth.currentUser?.uid).toBe(created.id);
    const [entry] = await auditOf('USER_CREATED', 'alice');
    expect(entry.hash).toBe(await auditEntryHash(entry));
  });

  it('rejects duplicate usernames and invalid input', async () => {
    await expect(admin.call('provisionUser', { username: 'alice', email: 'other@soc.test', role: 'L1' })).rejects.toThrow(/already exists/);
    await expect(admin.call('provisionUser', { username: 'x', email: 'bad', role: 'L1' })).rejects.toThrow();
    await expect(admin.call('provisionUser', { username: 'eve', email: 'eve@soc.test', role: 'Root' })).rejects.toThrow(/Invalid role/);
  });

  it('denies administration to analysts', async () => {
    const alice = await open('alice@soc.test', '12345a');
    await expect(alice.call('provisionUser', { username: 'eve', email: 'eve@soc.test', role: 'Admin' })).rejects.toThrow(/Administrator role required/);
  });

  it('requires a second factor for administrators when the policy is on', async () => {
    await setMfaPolicy(true);
    try {
      await expect(admin.call('provisionUser', { username: 'bob', email: 'bob@soc.test', role: 'L2' })).rejects.toThrow(/two-step verification/);
    } finally { await setMfaPolicy(false); }
  });

  it('changes a role through custom claims and protects the last administrator', async () => {
    const bob = await admin.call('provisionUser', { username: 'bob', email: 'bob@soc.test', role: 'L1' });
    await admin.call('updateUserAccount', { uid: bob.id, role: 'L2' });
    expect((await adminAuth.getUser(bob.id)).customClaims).toEqual({ role: 'L2' });
    expect((await auditOf('ROLE_CHANGED', 'bob'))[0].metadata).toMatchObject({ from: 'L1', to: 'L2' });
    const adminUid = admin.auth.currentUser!.uid;
    await expect(admin.call('updateUserAccount', { uid: adminUid, role: 'L1' })).rejects.toThrow(/administrator is required|own account/);
    await expect(admin.call('deleteUserAccount', { uid: adminUid })).rejects.toThrow(/own account/);
  });
});

describe('password lifecycle', () => {
  it('enforces the policy and clears the forced-change flag', async () => {
    const alice = await open('alice@soc.test', '12345a');
    await expect(alice.call('changePassword', { newPassword: 'short' })).rejects.toThrow(/Password policy/);
    await expect(alice.call('changePassword', { newPassword: '12345a' })).rejects.toThrow();
    await alice.call('changePassword', { newPassword: 'N3w!Secure#Pass' });
    const profile = (await adminDb.doc(`users/${alice.auth.currentUser!.uid}`).get()).data();
    expect(profile.forcePasswordChange).toBe(false);
    await open('alice@soc.test', 'N3w!Secure#Pass');
    expect(await auditOf('FORCED_PASSWORD_CHANGE', 'alice')).toHaveLength(1);
  });

  it('resets to the temporary credential on admin request', async () => {
    const uid = (await adminDb.doc('login_index/alice').get()).data().uid;
    await admin.call('resetUserPassword', { uid });
    expect((await adminDb.doc(`users/${uid}`).get()).data().forcePasswordChange).toBe(true);
    await open('alice@soc.test', '12345a');
  });

  it('records failed sign-ins without authentication', async () => {
    const anonApp = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, `anon${++seq}`);
    apps.push(anonApp);
    const fns = getFunctions(anonApp, 'us-central1');
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    await httpsCallable(fns, 'recordLoginFailure')({ username: 'alice' });
    const entries = await auditOf('LOGIN_FAILED', 'alice');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].metadata.reason).toBe('bad_credentials');
  });
});

describe('server-side report sealing', () => {
  it('seals a draft with a verifiable hash and refuses to seal twice', async () => {
    const alice = await open('alice@soc.test', '12345a');
    const uid = alice.auth.currentUser!.uid;
    const id = '2026-11-05_morning';
    await setDoc(doc(alice.db, 'shift_reports', id), {
      id, date: '2026-11-05', shift: 'morning', title: 'Morning', status: 'draft', summary: 's', handoverNotes: 'h',
      events: [{ id: 'e1', timestamp: '2026-11-05T09:00:00.000Z', eventName: 'SSH brute force', attackType: 'Brute Force', sourceIp: '203.0.113.5', destinationIp: '10.0.0.5', port: '22', protocol: 'TCP', severity: 'High', investigation: '', remediation: '', conclusion: '', loggedBy: 'alice', loggedById: uid, createdAt: 'x', updatedAt: 'x' }],
      contributors: ['alice'], createdBy: 'alice', createdById: uid, createdAt: '2026-11-05T08:00:00.000Z', updatedAt: 'x', updatedBy: 'alice', revision: 1,
    });
    const sealed = await alice.call('finalizeShiftReport', { reportId: id });
    expect(sealed.status).toBe('finalized');
    expect(sealed.finalizedBy).toBe('alice');
    const stored = (await getDoc(doc(alice.db, 'shift_reports', id))).data() as any;
    expect(stored.integrityHash).toBe(await computeIntegrityHash(stored));
    await expect(alice.call('finalizeShiftReport', { reportId: id })).rejects.toThrow(/already finalized/);
    expect((await auditOf('SHIFT_REPORT_FINALIZED'))[0].metadata.sealedBy).toBe('server');
  });
});

describe('audit sink', () => {
  it('flags audit entries whose hash does not match their content', async () => {
    const tampered = { id: 'tampered1', userId: 'x', username: 'x', action: 'LOGIN', timestamp: new Date().toISOString(), hash: 'not-the-real-hash' };
    await adminDb.doc('audit_logs/tampered1').set(tampered);
    if (process.env.GEYES_DISABLE_TRIGGERS === '1') {
      // Trigger not registered in this environment: exercise the handler directly.
      const { handleAuditEntry } = await import('../../functions/src/reports');
      expect(await handleAuditEntry('tampered1', tampered)).toBe(false);
      const genuine: Record<string, unknown> = { id: 'ok1', userId: 'x', username: 'x', action: 'LOGIN', timestamp: 't' };
      genuine.hash = await auditEntryHash(genuine);
      expect(await handleAuditEntry('ok1', genuine)).toBe(true);
    }
    const alert = await waitFor(async () => { const s = await adminDb.doc('audit_integrity_alerts/tampered1').get(); return s.exists ? s.data() : undefined; });
    expect(alert.action).toBe('LOGIN');
  });
});

describe('scheduled reporting', () => {
  it('runs due schedules once, archives the brief and queues e-mail', async () => {
    const { runDueSchedules } = await import('../../functions/src/reports');
    const due = new Date(Date.now() - 60_000).toISOString();
    await adminDb.doc('report_schedules/s1').set({ id: 's1', name: 'Weekly CISO brief', kind: 'executive_brief', frequency: 'weekly', dayOfWeek: 1, hour: 7, recipients: ['ciso@soc.test'], includeDrafts: false, enabled: true, createdBy: 'Admin', createdAt: 'x', updatedAt: 'x', nextRunAt: due });
    expect(await runDueSchedules(new Date())).toBe(1);
    expect(await runDueSchedules(new Date())).toBe(0); // advanced, no duplicate run
    const archive = (await adminDb.collection('report_archive').where('scheduleId', '==', 's1').get()).docs.map((d: any) => d.data());
    expect(archive).toHaveLength(1);
    expect(archive[0].markdown).toContain('# Weekly CISO brief');
    expect(archive[0].delivery).toBe('queued');
    const mail = (await adminDb.collection('mail').get()).docs.map((d: any) => d.data());
    expect(mail[0].to).toEqual(['ciso@soc.test']);
    expect(mail[0].message.html).toContain('<h1>');
    const next = (await adminDb.doc('report_schedules/s1').get()).data().nextRunAt;
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now());
  });
});
