import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { auditEntryHash } from '../../lib/integrity';
import type { AppSettings, UserRole } from '../../types';

if (!getApps().length) initializeApp();

export const db: Firestore = getFirestore();
export const adminAuth = getAuth();

export const ROLES: UserRole[] = ['Admin', 'L1', 'L2'];
export const TEMP_PASSWORD = '12345a';
export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Actor { uid: string; username: string; role: string }

export const getSettings = async (): Promise<Partial<AppSettings>> => {
  const snap = await db.doc('app_settings/global').get();
  return (snap.exists ? snap.data() : {}) as Partial<AppSettings>;
};

/** Resolve the caller and enforce authentication. */
export const requireUser = async (req: CallableRequest): Promise<Actor> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const role = (req.auth.token.role as string) || '';
  if (!ROLES.includes(role as UserRole)) throw new HttpsError('permission-denied', 'No platform role assigned');
  const profile = await db.doc(`users/${req.auth.uid}`).get();
  if (profile.exists && profile.data()?.disabled) throw new HttpsError('permission-denied', 'Account disabled');
  return { uid: req.auth.uid, username: (profile.data()?.username as string) ?? req.auth.token.name ?? req.auth.uid, role };
};

/** Administrators only; second factor required when the policy demands it. */
export const requireAdmin = async (req: CallableRequest): Promise<Actor> => {
  const actor = await requireUser(req);
  if (actor.role !== 'Admin') throw new HttpsError('permission-denied', 'Administrator role required');
  const settings = await getSettings();
  const mfa = (req.auth!.token.firebase as any)?.sign_in_second_factor;
  if (settings.requireAdminMfa !== false && !mfa) {
    throw new HttpsError('failed-precondition', 'Administrator actions require two-step verification');
  }
  return actor;
};

/** Append a server-originated, hashed audit entry. */
export const writeAudit = async (
  actor: { uid: string; username: string; role?: string },
  action: string,
  target?: { id: string; name: string },
  metadata?: Record<string, unknown>
): Promise<void> => {
  const ref = db.collection('audit_logs').doc();
  const entry: Record<string, unknown> = JSON.parse(JSON.stringify({
    id: ref.id,
    userId: actor.uid,
    username: actor.username,
    role: actor.role,
    action,
    targetId: target?.id,
    targetName: target?.name,
    timestamp: new Date().toISOString(),
    metadata: { ...(metadata ?? {}), source: 'server' },
  }));
  entry.hash = await auditEntryHash(entry);
  await ref.set(entry);
};

export const str = (v: unknown, field: string, max = 200): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpsError('invalid-argument', `${field} is required`);
  if (v.length > max) throw new HttpsError('invalid-argument', `${field} is too long`);
  return v.trim();
};

/** Active administrators other than `exceptUid`. */
export const otherActiveAdmins = async (exceptUid: string): Promise<number> => {
  const snap = await db.collection('users').where('role', '==', 'Admin').get();
  return snap.docs.filter(d => d.id !== exceptUid && !d.data().disabled).length;
};
