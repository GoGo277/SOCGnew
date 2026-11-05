import {
  signInWithEmailAndPassword, signOut, getMultiFactorResolver, TotpMultiFactorGenerator, TotpSecret,
  multiFactor, MultiFactorResolver, EmailAuthProvider, reauthenticateWithCredential, onAuthStateChanged,
  type User as FbUser, type MultiFactorError,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { User, UserRole } from '../types';

/** Cloud-mode authentication (Firebase Auth + TOTP MFA + callable admin API). */

export class CloudAuthError extends Error {}

const need = <T,>(v: T | null, what: string): T => { if (!v) throw new CloudAuthError(`${what} unavailable`); return v; };

const FRIENDLY: Record<string, string> = {
  'auth/invalid-credential': 'Invalid security credentials provided',
  'auth/wrong-password': 'Invalid security credentials provided',
  'auth/user-not-found': 'Invalid security credentials provided',
  'auth/user-disabled': 'Account disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many failed attempts. Try again later or contact an administrator.',
  'auth/invalid-verification-code': 'Invalid authentication code',
  'auth/requires-recent-login': 'Please sign in again to continue',
  'auth/network-request-failed': 'Network error — check your connection',
};

export const friendlyError = (e: any): string => FRIENDLY[e?.code] ?? e?.message ?? 'Authentication failed';

/** Call a Cloud Function and surface its HttpsError message. */
export const callFn = async <Req, Res = unknown>(name: string, data: Req): Promise<Res> => {
  try {
    const res = await httpsCallable<Req, Res>(need(functions, 'Functions'), name)(data);
    return res.data;
  } catch (e: any) {
    throw new CloudAuthError(e?.message?.replace(/^.*?:\s*/, '') || friendlyError(e));
  }
};

/** Resolve a username to its sign-in email via the public login index. */
const resolveEmail = async (login: string): Promise<string | null> => {
  if (login.includes('@')) return login.trim();
  const snap = await getDoc(doc(need(db, 'Firestore'), 'login_index', login.trim().toLowerCase()));
  return snap.exists() ? (snap.data().email as string) : null;
};

export type CloudSignIn =
  | { status: 'ok'; fbUser: FbUser }
  | { status: 'mfa_challenge'; resolver: MultiFactorResolver }
  | { status: 'error'; error: string };

export const cloudAuth = {
  current: () => auth?.currentUser ?? null,

  onChange(cb: (u: FbUser | null) => void): () => void {
    return auth ? onAuthStateChanged(auth, cb) : () => {};
  },

  async signIn(login: string, password: string): Promise<CloudSignIn> {
    const email = await resolveEmail(login);
    if (!email) {
      callFn('recordLoginFailure', { username: login }).catch(() => {});
      return { status: 'error', error: FRIENDLY['auth/invalid-credential'] };
    }
    try {
      const cred = await signInWithEmailAndPassword(need(auth, 'Auth'), email, password);
      return { status: 'ok', fbUser: cred.user };
    } catch (e: any) {
      if (e?.code === 'auth/multi-factor-auth-required') {
        return { status: 'mfa_challenge', resolver: getMultiFactorResolver(need(auth, 'Auth'), e as MultiFactorError) };
      }
      callFn('recordLoginFailure', { username: login }).catch(() => {});
      return { status: 'error', error: friendlyError(e) };
    }
  },

  async completeMfa(resolver: MultiFactorResolver, code: string): Promise<FbUser> {
    const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ?? resolver.hints[0];
    try {
      const cred = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()));
      return cred.user;
    } catch (e) {
      throw new CloudAuthError(friendlyError(e));
    }
  },

  async startTotpEnrollment(account: string): Promise<{ secret: TotpSecret; uri: string; key: string }> {
    const user = need(auth?.currentUser ?? null, 'Signed-in user');
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    return { secret, uri: secret.generateQrCodeUrl(account, 'G-Eyes SR'), key: secret.secretKey };
  },

  async finishTotpEnrollment(secret: TotpSecret, code: string): Promise<void> {
    const user = need(auth?.currentUser ?? null, 'Signed-in user');
    try {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim()), 'Authenticator app');
      await user.getIdToken(true);
    } catch (e) {
      throw new CloudAuthError(friendlyError(e));
    }
  },

  isMfaEnrolled: (): boolean => !!auth?.currentUser && multiFactor(auth.currentUser).enrolledFactors.length > 0,

  async reauthenticate(password: string): Promise<void> {
    const user = need(auth?.currentUser ?? null, 'Signed-in user');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password));
    } catch (e: any) {
      if (e?.code === 'auth/multi-factor-auth-required') {
        throw new CloudAuthError('Re-authentication requires your authenticator code — sign out and sign in again, then retry within 5 minutes');
      }
      throw new CloudAuthError(e?.code === 'auth/invalid-credential' || e?.code === 'auth/wrong-password' ? 'Current password is incorrect' : friendlyError(e));
    }
  },

  /** Build the platform profile from the ID-token claims and users/{uid}. */
  async loadProfile(fbUser: FbUser): Promise<User> {
    const token = await fbUser.getIdTokenResult(true);
    const snap = await getDoc(doc(need(db, 'Firestore'), 'users', fbUser.uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      ...(data as any),
      id: fbUser.uid,
      username: (data as any).username ?? fbUser.displayName ?? fbUser.email ?? 'analyst',
      email: fbUser.email ?? '',
      role: ((token.claims.role as UserRole) ?? (data as any).role ?? 'L1'),
      createdAt: (data as any).createdAt ?? fbUser.metadata.creationTime ?? '',
      mfaEnrolledAt: multiFactor(fbUser).enrolledFactors[0]?.enrollmentTime,
    };
  },

  signOut: () => (auth ? signOut(auth) : Promise.resolve()),
};
