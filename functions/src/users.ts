import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { checkPasswordPolicy } from '../../lib/crypto';
import { adminAuth, db, requireAdmin, requireUser, writeAudit, str, ROLES, TEMP_PASSWORD, USERNAME_RE, EMAIL_RE, otherActiveAdmins } from './common';
import type { UserRole } from '../../types';

/** Admin: provision an analyst with the temporary credential (forced change at first login). */
export const provisionUser = onCall(async req => {
  const actor = await requireAdmin(req);
  const username = str(req.data?.username, 'username', 32);
  const email = str(req.data?.email, 'email', 254).toLowerCase();
  const role = req.data?.role as UserRole;
  if (!USERNAME_RE.test(username)) throw new HttpsError('invalid-argument', 'Username must be 3-32 characters: letters, digits, . _ -');
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Invalid email address');
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Invalid role');
  const indexRef = db.doc(`login_index/${username.toLowerCase()}`);
  if ((await indexRef.get()).exists) throw new HttpsError('already-exists', 'Username already exists');

  let uid: string;
  try {
    uid = (await adminAuth.createUser({ email, password: TEMP_PASSWORD, displayName: username })).uid;
  } catch (e: any) {
    throw new HttpsError('already-exists', e?.code === 'auth/email-already-exists' ? 'Email already in use' : 'Could not create account');
  }
  await adminAuth.setCustomUserClaims(uid, { role });
  const profile = {
    id: uid, username, email, role, createdAt: new Date().toISOString(), createdBy: actor.username,
    bio: '', profilePic: '', forcePasswordChange: true,
  };
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), profile);
  batch.set(indexRef, { email, uid });
  await batch.commit();
  await writeAudit(actor, 'USER_CREATED', { id: uid, name: username }, { role, email });
  return profile;
});

/** Admin: change username, email, role or disabled state. */
export const updateUserAccount = onCall(async req => {
  const actor = await requireAdmin(req);
  const uid = str(req.data?.uid, 'uid', 128);
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const current = snap.data()!;
  const patch: Record<string, any> = {};
  const authPatch: Record<string, unknown> = {};

  if (req.data.role !== undefined) {
    if (!ROLES.includes(req.data.role)) throw new HttpsError('invalid-argument', 'Invalid role');
    patch.role = req.data.role;
  }
  if (req.data.disabled !== undefined) { patch.disabled = !!req.data.disabled; authPatch.disabled = !!req.data.disabled; }
  if (req.data.email !== undefined && req.data.email !== current.email) {
    const email = str(req.data.email, 'email', 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Invalid email address');
    patch.email = email; authPatch.email = email;
  }
  let newIndex: string | null = null;
  if (req.data.username !== undefined && req.data.username !== current.username) {
    const username = str(req.data.username, 'username', 32);
    if (!USERNAME_RE.test(username)) throw new HttpsError('invalid-argument', 'Invalid username');
    if ((await db.doc(`login_index/${username.toLowerCase()}`).get()).exists) throw new HttpsError('already-exists', 'Username already exists');
    patch.username = username; authPatch.displayName = username; newIndex = username.toLowerCase();
  }
  const losingAdmin = current.role === 'Admin' && ((patch.role && patch.role !== 'Admin') || patch.disabled === true);
  if (losingAdmin && (await otherActiveAdmins(uid)) === 0) throw new HttpsError('failed-precondition', 'At least one active administrator is required');
  if (uid === actor.uid && (patch.disabled === true || (patch.role && patch.role !== 'Admin'))) {
    throw new HttpsError('failed-precondition', 'You cannot demote or disable your own account');
  }

  if (Object.keys(authPatch).length) await adminAuth.updateUser(uid, authPatch);
  if (patch.role) await adminAuth.setCustomUserClaims(uid, { role: patch.role });
  if (patch.role || patch.disabled) await adminAuth.revokeRefreshTokens(uid);

  const batch = db.batch();
  batch.update(ref, patch);
  const email = (patch.email as string) ?? current.email;
  if (newIndex) {
    batch.delete(db.doc(`login_index/${String(current.username).toLowerCase()}`));
    batch.set(db.doc(`login_index/${newIndex}`), { email, uid });
  } else if (patch.email) {
    batch.set(db.doc(`login_index/${String(current.username).toLowerCase()}`), { email, uid });
  }
  await batch.commit();

  if (patch.role && patch.role !== current.role) {
    await writeAudit(actor, 'ROLE_CHANGED', { id: uid, name: (patch.username as string) ?? current.username }, { from: current.role, to: patch.role });
  }
  await writeAudit(actor, 'USER_UPDATED', { id: uid, name: (patch.username as string) ?? current.username }, patch);
  return { ...current, ...patch };
});

/** Admin: reset to the temporary credential, force rotation, end sessions. */
export const resetUserPassword = onCall(async req => {
  const actor = await requireAdmin(req);
  const uid = str(req.data?.uid, 'uid', 128);
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  await adminAuth.updateUser(uid, { password: TEMP_PASSWORD });
  await adminAuth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).update({ forcePasswordChange: true });
  await writeAudit(actor, 'PASSWORD_RESET', { id: uid, name: snap.data()!.username });
  return { ok: true };
});

/** Admin: remove enrolled second factors so the user re-enrols. */
export const resetUserMfa = onCall(async req => {
  const actor = await requireAdmin(req);
  const uid = str(req.data?.uid, 'uid', 128);
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  await adminAuth.updateUser(uid, { multiFactor: { enrolledFactors: null } } as any);
  await adminAuth.revokeRefreshTokens(uid);
  await writeAudit(actor, 'MFA_RESET', { id: uid, name: snap.data()!.username });
  return { ok: true };
});

export const deleteUserAccount = onCall(async req => {
  const actor = await requireAdmin(req);
  const uid = str(req.data?.uid, 'uid', 128);
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot delete your own account');
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const u = snap.data()!;
  if (u.role === 'Admin' && (await otherActiveAdmins(uid)) === 0) throw new HttpsError('failed-precondition', 'At least one administrator is required');
  await adminAuth.deleteUser(uid).catch(() => undefined);
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`login_index/${String(u.username).toLowerCase()}`));
  await batch.commit();
  await writeAudit(actor, 'USER_DELETED', { id: uid, name: u.username }, { role: u.role });
  return { ok: true };
});

/** Self-service password change after a fresh re-authentication (≤ 5 minutes). */
export const changePassword = onCall(async req => {
  const actor = await requireUser(req);
  const newPassword = req.data?.newPassword;
  if (typeof newPassword !== 'string') throw new HttpsError('invalid-argument', 'newPassword is required');
  const authTime = Number(req.auth!.token.auth_time) * 1000;
  if (!authTime || Date.now() - authTime > 5 * 60_000) throw new HttpsError('failed-precondition', 'Please re-authenticate and try again');
  const policy = checkPasswordPolicy(newPassword, actor.username);
  if (!policy.ok) throw new HttpsError('invalid-argument', `Password policy: ${policy.errors.join(', ')}`);
  if (newPassword === TEMP_PASSWORD) throw new HttpsError('invalid-argument', 'The temporary password cannot be reused');
  const ref = db.doc(`users/${actor.uid}`);
  const wasForced = !!(await ref.get()).data()?.forcePasswordChange;
  await adminAuth.updateUser(actor.uid, { password: newPassword });
  await ref.set({ forcePasswordChange: false, passwordChangedAt: new Date().toISOString() }, { merge: true });
  await writeAudit(actor, wasForced ? 'FORCED_PASSWORD_CHANGE' : 'PASSWORD_CHANGED', { id: actor.uid, name: actor.username });
  return { ok: true };
});

/** Records failed sign-ins (called before authentication succeeds). */
export const recordLoginFailure = onCall(async req => {
  const username = typeof req.data?.username === 'string' ? req.data.username.trim().slice(0, 64) : '(empty)';
  const idx = await db.doc(`login_index/${username.toLowerCase()}`).get();
  const ip = (req.rawRequest?.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.rawRequest?.ip;
  // Coarse rate limit per username: drop entries beyond 30/minute.
  const bucket = db.doc(`login_failure_rate/${username.toLowerCase()}_${Math.floor(Date.now() / 60_000)}`);
  const n = await db.runTransaction(async tx => {
    const s = await tx.get(bucket);
    const count = (s.exists ? (s.data()!.count as number) : 0) + 1;
    tx.set(bucket, { count, expireAt: new Date(Date.now() + 3_600_000) });
    return count;
  });
  if (n > 30) return { ok: true };
  await writeAudit(
    { uid: (idx.data()?.uid as string) ?? 'unknown', username },
    'LOGIN_FAILED',
    idx.exists ? { id: idx.data()!.uid, name: username } : undefined,
    { reason: idx.exists ? (req.data?.mfa ? 'bad_mfa_code' : 'bad_credentials') : 'unknown_user', ip }
  );
  return { ok: true };
});

