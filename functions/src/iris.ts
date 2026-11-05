import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { db, requireAdmin, requireUser, writeAudit } from './common';
import { IrisClient } from '../../lib/iris/client';
import { runIrisSync, SyncResult, SyncStore } from '../../lib/iris/sync';

/**
 * DFIR-IRIS integration (cloud mode).
 *   firebase functions:secrets:set IRIS_API_KEY
 *   IRIS_URL is a deploy-time parameter (functions/.env or prompt on deploy).
 * Non-secret options and the last run status live in integrations/iris.
 */
const IRIS_API_KEY = defineSecret('IRIS_API_KEY');
const IRIS_URL = defineString('IRIS_URL', { default: '' });
const STATUS_DOC = 'integrations/iris';
const DEFAULT_OPTIONS = { pushCases: true, pushAlerts: true, importRemote: true, autoSyncMinutes: 15 };

const firestoreStore: SyncStore = {
  list: async <T,>(col: string) => (await db.collection(col).get()).docs.map(d => ({ ...(d.data() as object), id: d.id }) as T),
  set: async (col, doc) => { await db.collection(col).doc(doc.id).set(JSON.parse(JSON.stringify(doc))); },
  remove: async (col, id) => { await db.collection(col).doc(id).delete(); },
  nextSequence: name => db.runTransaction(async tx => {
    const ref = db.doc(`counters/${name}`);
    const snap = await tx.get(ref);
    const next = (snap.exists ? (snap.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next });
    return next;
  }),
};

const config = () => {
  let key = '';
  try { key = IRIS_API_KEY.value(); } catch { key = ''; }
  return { url: IRIS_URL.value(), key };
};

const client = () => {
  const { url, key } = config();
  if (!url || !key) throw new HttpsError('failed-precondition', 'IRIS is not configured on the server (IRIS_URL and the IRIS_API_KEY secret)');
  return new IrisClient({ baseUrl: url, apiKey: key });
};

const options = async () => ({ ...DEFAULT_OPTIONS, ...((await db.doc(STATUS_DOC).get()).data()?.options ?? {}) });

/** Lease lock so scheduled and manual runs never overlap. */
const withLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const ref = db.doc(STATUS_DOC);
  const acquired = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const until = snap.data()?.lockedUntil as string | undefined;
    if (until && until > new Date().toISOString()) return false;
    tx.set(ref, { lockedUntil: new Date(Date.now() + 5 * 60_000).toISOString() }, { merge: true });
    return true;
  });
  if (!acquired) throw new HttpsError('aborted', 'An IRIS sync is already running — try again in a moment');
  try { return await fn(); } finally { await ref.set({ lockedUntil: null }, { merge: true }); }
};

const run = async (actor: { uid: string; username: string; role?: string }, caseIds?: string[]): Promise<SyncResult> =>
  withLock(async () => {
    const opts = await options();
    try {
      const result = await runIrisSync(client(), firestoreStore, { ...opts, caseIds, actor: actor.username });
      await db.doc(STATUS_DOC).set({ lastResult: result, lastRunAt: result.finishedAt, lastError: result.errors[0] ?? null }, { merge: true });
      await writeAudit(actor, 'IRIS_SYNC', { id: 'iris', name: 'DFIR-IRIS sync' }, { pushed: result.pushed, pulled: result.pulled, errors: result.errors.length, scope: caseIds ? 'case' : 'all' });
      return result;
    } catch (e: any) {
      await db.doc(STATUS_DOC).set({ lastError: e.message, lastRunAt: new Date().toISOString() }, { merge: true });
      throw e instanceof HttpsError ? e : new HttpsError('unavailable', e.message);
    }
  });

export const irisStatus = onCall({ secrets: [IRIS_API_KEY] }, async req => {
  await requireAdmin(req);
  const { url, key } = config();
  const st = (await db.doc(STATUS_DOC).get()).data() ?? {};
  return { configured: !!url && !!key, mode: 'cloud', url, options: await options(), lastResult: st.lastResult, lastRunAt: st.lastRunAt, lastError: st.lastError ?? undefined };
});

export const irisTestConnection = onCall({ secrets: [IRIS_API_KEY] }, async req => {
  await requireAdmin(req);
  try {
    const c = client();
    await c.ping();
    const v = await c.versions();
    return { version: v.iris_current ? `IRIS ${v.iris_current}` : 'IRIS (version not reported)' };
  } catch (e: any) { throw e instanceof HttpsError ? e : new HttpsError('unavailable', e.message); }
});

export const irisSaveOptions = onCall(async req => {
  const actor = await requireAdmin(req);
  const d = req.data ?? {};
  const next = {
    pushCases: !!d.pushCases, pushAlerts: !!d.pushAlerts, importRemote: !!d.importRemote,
    autoSyncMinutes: [0, 5, 15, 60].includes(Number(d.autoSyncMinutes)) ? Number(d.autoSyncMinutes) : 15,
  };
  await db.doc(STATUS_DOC).set({ options: next }, { merge: true });
  await writeAudit(actor, 'IRIS_CONFIG_CHANGED', { id: 'iris', name: 'DFIR-IRIS integration' }, next);
  return next;
});

export const irisSyncNow = onCall({ secrets: [IRIS_API_KEY], timeoutSeconds: 300 }, async req => {
  const actor = await requireUser(req);
  const caseIds = Array.isArray(req.data?.caseIds) ? req.data.caseIds.map(String).slice(0, 20) : undefined;
  return run(actor, caseIds);
});

export const irisScheduledSync = onSchedule({ schedule: 'every 5 minutes', secrets: [IRIS_API_KEY], timeoutSeconds: 300 }, async () => {
  const { url, key } = config();
  if (!url || !key) return;
  const opts = await options();
  if (!opts.autoSyncMinutes) return;
  const last = (await db.doc(STATUS_DOC).get()).data()?.lastRunAt as string | undefined;
  if (last && Date.now() - new Date(last).getTime() < opts.autoSyncMinutes * 60_000 - 30_000) return;
  await run({ uid: 'system', username: 'iris-scheduler', role: 'system' }).catch(() => undefined);
});
