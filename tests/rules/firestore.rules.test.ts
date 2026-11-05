import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

const admin = (mfa = true) => env.authenticatedContext('admin1', { role: 'Admin', name: 'Admin', ...(mfa ? { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } as any } : {}) }).firestore();
const analyst = (uid = 'alice', name = 'alice') => env.authenticatedContext(uid, { role: 'L1', name }).firestore();
const noRole = () => env.authenticatedContext('mallory', { name: 'mallory' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const draft = (id = '2026-11-05_morning', createdById = 'alice') => ({
  id, date: id.slice(0, 10), shift: id.slice(11), title: 't', status: 'draft', events: [], summary: '', handoverNotes: '',
  contributors: ['alice'], createdBy: 'alice', createdById, createdAt: '2026-11-05T08:00:00.000Z', updatedAt: '2026-11-05T08:00:00.000Z', updatedBy: 'alice', revision: 0,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-geyes-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { id: 'alice', username: 'alice', role: 'L1', bio: '' });
    await setDoc(doc(db, 'login_index/alice'), { email: 'alice@soc.test', uid: 'alice' });
    await setDoc(doc(db, 'shift_reports/2026-11-04_evening'), { ...draft('2026-11-04_evening'), status: 'finalized', integrityHash: 'abc' });
  });
});

describe('identity', () => {
  it('lets anyone resolve a single username but not list the index', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'login_index/alice')));
    await assertFails(getDocs(collection(anon(), 'login_index')));
  });
  it('requires a platform role to read the directory', async () => {
    await assertSucceeds(getDoc(doc(analyst(), 'users/alice')));
    await assertFails(getDoc(doc(noRole(), 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
  it('allows profile edits only, never role escalation', async () => {
    await assertSucceeds(updateDoc(doc(analyst(), 'users/alice'), { bio: 'hello' }));
    await assertFails(updateDoc(doc(analyst(), 'users/alice'), { role: 'Admin' }));
    await assertFails(updateDoc(doc(analyst('bob', 'bob'), 'users/alice'), { bio: 'x' }));
    await assertFails(setDoc(doc(admin(), 'users/new'), { role: 'Admin' }));
  });
});

describe('administrator MFA enforcement', () => {
  it('rejects admin writes without a second factor while the policy is on', async () => {
    await assertFails(setDoc(doc(admin(false), 'duty_schedules/2026-11-06'), { id: '2026-11-06', date: '2026-11-06', morning: [], evening: [], night: [] }));
    await assertSucceeds(setDoc(doc(admin(true), 'duty_schedules/2026-11-06'), { id: '2026-11-06', date: '2026-11-06', morning: [], evening: [], night: [] }));
  });
  it('accepts admin writes without MFA when the policy is disabled', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'app_settings/global'), { requireAdminMfa: false }));
    await assertSucceeds(setDoc(doc(admin(false), 'duty_schedules/2026-11-06'), { id: '2026-11-06', date: '2026-11-06', morning: [], evening: [], night: [] }));
  });
  it('blocks analysts from rosters, schedules and settings', async () => {
    await assertFails(setDoc(doc(analyst(), 'duty_schedules/2026-11-06'), { id: '2026-11-06', date: '2026-11-06', morning: ['alice'], evening: [], night: [] }));
    await assertFails(setDoc(doc(analyst(), 'report_schedules/s1'), { name: 'x' }));
    await assertFails(setDoc(doc(analyst(), 'app_settings/global'), { requireAdminMfa: false }));
  });
});

describe('shift reports', () => {
  it('lets analysts create and edit drafts they own', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'shift_reports/2026-11-05_morning'), draft()));
    await assertSucceeds(updateDoc(doc(analyst('bob', 'bob'), 'shift_reports/2026-11-05_morning'), { summary: 'collab edit' }));
  });
  it('rejects spoofed creators and malformed ids', async () => {
    await assertFails(setDoc(doc(analyst(), 'shift_reports/2026-11-05_morning'), draft(undefined, 'someone-else')));
    await assertFails(setDoc(doc(analyst(), 'shift_reports/bad-id'), { ...draft(), id: 'bad-id' }));
  });
  it('never lets a client seal a report', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'shift_reports/2026-11-05_morning'), draft()));
    await assertFails(updateDoc(doc(analyst(), 'shift_reports/2026-11-05_morning'), { status: 'finalized', integrityHash: 'forged' }));
    await assertFails(updateDoc(doc(admin(), 'shift_reports/2026-11-05_morning'), { status: 'finalized', integrityHash: 'forged' }));
  });
  it('keeps finalized reports immutable', async () => {
    await assertFails(updateDoc(doc(analyst(), 'shift_reports/2026-11-04_evening'), { summary: 'tamper' }));
    await assertFails(updateDoc(doc(admin(), 'shift_reports/2026-11-04_evening'), { summary: 'tamper' }));
  });
  it('allows deletion by verified administrators only', async () => {
    await assertFails(deleteDoc(doc(analyst(), 'shift_reports/2026-11-04_evening')));
    await assertSucceeds(deleteDoc(doc(admin(), 'shift_reports/2026-11-04_evening')));
  });
});

describe('handover sign-off', () => {
  const ack = (reportId: string, by = 'alice') => ({ id: reportId, reportId, acknowledgedBy: by, acknowledgedById: by, acknowledgedAt: 'x', incomingDate: '2026-11-05', incomingShift: 'night', comment: '' });
  it('accepts an acknowledgement of a finalized report by the signer', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'handover_acks/2026-11-04_evening'), ack('2026-11-04_evening')));
  });
  it('rejects acks for drafts, on behalf of others, and any change afterwards', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'shift_reports/2026-11-05_morning'), draft()));
    await assertFails(setDoc(doc(analyst(), 'handover_acks/2026-11-05_morning'), ack('2026-11-05_morning')));
    await assertFails(setDoc(doc(analyst(), 'handover_acks/2026-11-04_evening'), ack('2026-11-04_evening', 'bob')));
    await assertSucceeds(setDoc(doc(analyst(), 'handover_acks/2026-11-04_evening'), ack('2026-11-04_evening')));
    await assertFails(updateDoc(doc(analyst(), 'handover_acks/2026-11-04_evening'), { comment: 'edited' }));
    await assertFails(deleteDoc(doc(admin(), 'handover_acks/2026-11-04_evening')));
  });
});

describe('shift swap state machine', () => {
  const swap = { id: 's1', requesterId: 'alice', requesterName: 'alice', peerId: 'bob', peerName: 'bob', date: '2026-12-01', shift: 'night', reason: 'x', status: 'pending_peer', createdAt: 'x' };
  it('follows request → peer accept → admin approve', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'shift_swaps/s1'), swap));
    await assertFails(updateDoc(doc(analyst(), 'shift_swaps/s1'), { status: 'pending_admin', peerRespondedAt: 'x' })); // requester cannot accept for peer
    await assertSucceeds(updateDoc(doc(analyst('bob', 'bob'), 'shift_swaps/s1'), { status: 'pending_admin', peerRespondedAt: 'x' }));
    await assertFails(updateDoc(doc(analyst('bob', 'bob'), 'shift_swaps/s1'), { status: 'approved', decidedAt: 'x', decidedBy: 'bob' }));
    await assertSucceeds(updateDoc(doc(admin(), 'shift_swaps/s1'), { status: 'approved', decidedAt: 'x', decidedBy: 'Admin' }));
  });
  it('rejects requests on behalf of someone else', async () => {
    await assertFails(setDoc(doc(analyst('bob', 'bob'), 'shift_swaps/s1'), swap));
  });
});

describe('append-only audit trail', () => {
  const entry = (id: string, userId = 'alice', username = 'alice') => ({ id, userId, username, action: 'LOGIN', timestamp: 'x', hash: 'h' });
  it('accepts own entries only and never allows changes', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'audit_logs/a1'), entry('a1')));
    await assertFails(setDoc(doc(analyst(), 'audit_logs/a2'), entry('a2', 'bob', 'bob')));
    await assertFails(setDoc(doc(analyst(), 'audit_logs/a3'), entry('a3', 'alice', 'Admin')));
    await assertFails(updateDoc(doc(admin(), 'audit_logs/a1'), { action: 'LOGOUT' }));
    await assertFails(deleteDoc(doc(admin(), 'audit_logs/a1')));
  });
  it('restricts reading the trail to verified administrators', async () => {
    await assertFails(getDocs(collection(analyst(), 'audit_logs')));
    await assertFails(getDocs(collection(admin(false), 'audit_logs')));
    await assertSucceeds(getDocs(collection(admin(), 'audit_logs')));
  });
});

describe('reporting', () => {
  it('lets members archive generated reports under their own name, immutably', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'report_archive/r1'), { generatedBy: 'alice', sha256: 'x', markdown: '#' }));
    await assertFails(setDoc(doc(analyst(), 'report_archive/r2'), { generatedBy: 'Admin', sha256: 'x' }));
    await assertFails(updateDoc(doc(analyst(), 'report_archive/r1'), { markdown: 'tamper' }));
  });
  it('lets template owners manage their templates', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'report_templates/t1'), { createdBy: 'alice', name: 'mine' }));
    await assertFails(updateDoc(doc(analyst('bob', 'bob'), 'report_templates/t1'), { name: 'hijack' }));
    await assertSucceeds(updateDoc(doc(admin(), 'report_templates/t1'), { name: 'admin edit' }));
  });
  it('keeps the outbound mail queue server-only', async () => {
    await assertFails(setDoc(doc(admin(), 'mail/m1'), { to: ['x@y.z'] }));
  });
});

describe('case management', () => {
  const kase = (over: Record<string, unknown> = {}) => ({ id: 'k1', number: 1, name: 'Phish', state: 'Open', outcome: 'Unknown', openedBy: 'alice', openedAt: 't', customerId: 'internal', ...over });
  it('lets members open and work cases, but only closes with an outcome', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'cases/k1'), kase()));
    await assertFails(setDoc(doc(analyst(), 'cases/k2'), { ...kase({ id: 'k2', openedBy: 'Admin' }) }));
    await assertSucceeds(updateDoc(doc(analyst(), 'cases/k1'), { state: 'Containment' }));
    await assertFails(updateDoc(doc(analyst(), 'cases/k1'), { state: 'Closed' }));
    await assertSucceeds(updateDoc(doc(analyst(), 'cases/k1'), { state: 'Closed', outcome: 'False positive' }));
    await assertFails(updateDoc(doc(analyst(), 'cases/k1'), { number: 99 }));
  });
  it('restricts case deletion to verified administrators', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'cases/k1'), kase()));
    await assertFails(deleteDoc(doc(analyst(), 'cases/k1')));
    await assertFails(deleteDoc(doc(admin(false), 'cases/k1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'cases/k1')));
  });
  it('protects evidence hashes and the chain of custody', async () => {
    const ev = { id: 'e1', caseId: 'k1', sha256: 'a'.repeat(64), custody: [{ at: 't', by: 'alice', action: 'Registered' }] };
    await assertSucceeds(setDoc(doc(analyst(), 'case_evidence/e1'), ev));
    await assertFails(updateDoc(doc(analyst(), 'case_evidence/e1'), { sha256: 'b'.repeat(64) }));
    await assertFails(updateDoc(doc(analyst(), 'case_evidence/e1'), { custody: [] }));
    await assertSucceeds(updateDoc(doc(analyst(), 'case_evidence/e1'), { custody: [...ev.custody, { at: 't2', by: 'alice', action: 'Copied' }] }));
    await assertFails(deleteDoc(doc(analyst(), 'case_evidence/e1')));
  });
  it('keeps the case activity feed append-only and attributed', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'case_activity/a1'), { id: 'a1', caseId: 'k1', by: 'alice', action: 'x', at: 't', detail: '' }));
    await assertFails(setDoc(doc(analyst(), 'case_activity/a2'), { id: 'a2', caseId: 'k1', by: 'Admin', action: 'x', at: 't', detail: '' }));
    await assertFails(updateDoc(doc(analyst(), 'case_activity/a1'), { detail: 'edited' }));
  });
  it('only increments sequence counters by one', async () => {
    await assertSucceeds(setDoc(doc(analyst(), 'counters/case'), { value: 1 }));
    await assertSucceeds(setDoc(doc(analyst(), 'counters/case'), { value: 2 }));
    await assertFails(setDoc(doc(analyst(), 'counters/case'), { value: 10 }));
    await assertFails(setDoc(doc(analyst(), 'counters/other'), { value: 1 }));
  });
  it('restricts customers, case templates and integration state', async () => {
    await assertFails(setDoc(doc(analyst(), 'customers/c1'), { name: 'ACME' }));
    await assertSucceeds(setDoc(doc(admin(), 'customers/c1'), { name: 'ACME' }));
    await assertFails(setDoc(doc(analyst(), 'case_templates/t1'), { name: 'x' }));
    await assertFails(getDoc(doc(analyst(), 'integrations/iris')));
    await assertFails(setDoc(doc(admin(), 'integrations/iris'), { lockedUntil: null }));
  });
});
