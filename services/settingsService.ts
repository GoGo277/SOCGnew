
import { AppSettings, User, UserRole, RolePermissions, Language } from '../types';
import { realtimeStore } from './realtimeStore';
import { hashPassword, randomSalt, safeEqual, checkPasswordPolicy } from '../lib/crypto';
import { auditService } from './auditService';
import { DEFAULT_SLA } from '../lib/sla';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../lib/totp';
import { cloudAuth, callFn } from './cloudAuth';
import type { MultiFactorResolver, TotpSecret } from 'firebase/auth';

const SETTINGS_KEY = 'soc_app_settings';
const LOCAL_USERS_KEY = 'soc_app_users';
const CLOUD_USERS_KEY = 'soc_app_users_cloud';
/** Separate caches so local-mode bootstrap users never mix with the cloud directory. */
const usersKey = () => (realtimeStore.isCloud() ? CLOUD_USERS_KEY : LOCAL_USERS_KEY);
const SESSION_KEY = 'soc_active_session';
const USERS_COLLECTION = 'users';

/** Temporary password assigned to newly provisioned / reset accounts. */
export const TEMP_PASSWORD = '12345a';
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
export const SESSION_TTL_HOURS = 12;

/**
 * Demo build (`vite build --mode demo`): local mode only, bootstrap admin is
 * admin / admin with no forced rotation and no mandatory MFA. Never use for real data.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true' && !realtimeStore.isCloud();

export const DEFAULT_NAV_ORDER = ['dashboard', 'duty', 'shift-reports', 'executive', 'reporting', 'incidents', 'assets', 'tasks', 'announcements', 'messaging', 'guidelines', 'requests', 'admin-requests', 'audit'];

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'G-Eyes SR',
  logoUrl: '',
  language: 'en',
  navOrder: [...DEFAULT_NAV_ORDER],
  sla: JSON.parse(JSON.stringify(DEFAULT_SLA)),
  requireAdminMfa: !DEMO_MODE,
  rolePermissions: {
    Admin: {
      canCreateAsset: true,
      canEditAsset: true,
      canDeleteAsset: true,
      canCreateIncident: true,
      canEditIncident: true,
      canDeleteIncident: true,
      canCreateGuideline: true,
      canEditGuideline: true,
      canDeleteGuideline: true,
      canManageUsers: true,
      canApproveRequests: true,
      canManageTasks: true,
      canImportExport: true,
      canDeleteNotes: true,
      canManageSchedules: true,
      canLogShiftEvents: true,
      canFinalizeReports: true,
      canDeleteReports: true,
      canExportReports: true,
      canViewAuditLog: true,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true, duty: true, shiftReports: true, executive: true }
    },
    L2: {
      canCreateAsset: true,
      canEditAsset: false,
      canDeleteAsset: false,
      canCreateIncident: true,
      canEditIncident: true,
      canDeleteIncident: false,
      canCreateGuideline: true,
      canEditGuideline: true,
      canDeleteGuideline: false,
      canManageUsers: false,
      canApproveRequests: false,
      canManageTasks: true,
      canImportExport: false,
      canDeleteNotes: false,
      canManageSchedules: false,
      canLogShiftEvents: true,
      canFinalizeReports: true,
      canDeleteReports: false,
      canExportReports: true,
      canViewAuditLog: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true, duty: true, shiftReports: true, executive: true }
    },
    L1: {
      canCreateAsset: false,
      canEditAsset: false,
      canDeleteAsset: false,
      canCreateIncident: true,
      canEditIncident: false,
      canDeleteIncident: false,
      canCreateGuideline: false,
      canEditGuideline: false,
      canDeleteGuideline: false,
      canManageUsers: false,
      canApproveRequests: false,
      canManageTasks: false,
      canImportExport: false,
      canDeleteNotes: false,
      canManageSchedules: false,
      canLogShiftEvents: true,
      canFinalizeReports: true,
      canDeleteReports: false,
      canExportReports: true,
      canViewAuditLog: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true, duty: true, shiftReports: true, executive: true }
    }
  }
};

const DEFAULT_ADMIN_ID = 'u1';

/**
 * Bootstrap administrator. Its credential is the temporary password and it is
 * flagged forcePasswordChange, so the first login must rotate it.
 */
const buildDefaultUsers = (): User[] => DEMO_MODE ? [
  {
    id: DEFAULT_ADMIN_ID,
    username: 'admin',
    email: 'admin@geyes.demo',
    role: 'Admin',
    createdAt: new Date().toISOString(),
    bio: 'Demo administrator.',
    profilePic: '',
    password: 'admin', // migrated to a PBKDF2 hash at first sign-in
    forcePasswordChange: false,
  },
] : [
  {
    id: DEFAULT_ADMIN_ID,
    username: 'Admin',
    email: 'admin@geyes.local',
    role: 'Admin',
    createdAt: new Date().toISOString(),
    bio: 'Security Operations Center Lead.',
    profilePic: '',
    forcePasswordChange: true,
  },
];

interface StoredSession extends User { sessionExpiresAt?: string }

const stripSecrets = (u: User): User => {
  const { password, passwordHash, passwordSalt, failedLoginAttempts, lockedUntil, mfaSecret, mfaLastStep, ...rest } = u;
  return rest as User;
};

/** Result of a sign-in step. Sessions are only created on `ok`. */
export type AuthResult =
  | { status: 'ok'; user: User }
  | { status: 'mfa_challenge' }
  | { status: 'mfa_enroll'; secret: string; uri: string }
  | { status: 'error'; error: string };

type Pending =
  | { kind: 'local_challenge'; userId: string; expires: number }
  | { kind: 'local_enroll'; userId: string; secret: string; expires: number; self?: boolean }
  | { kind: 'cloud_challenge'; resolver: MultiFactorResolver; login: string }
  | { kind: 'cloud_enroll'; secret: TotpSecret; self?: boolean };

let pending: Pending | null = null;
const PENDING_TTL = 5 * 60_000;

const establishSession = (u: User): User => {
  const clean = stripSecrets(u);
  const session: StoredSession = { ...clean, sessionExpiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000).toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  pending = null;
  return clean;
};

const mfaRequiredFor = (u: User) => u.role === 'Admin' && settingsService.getSettings().requireAdminMfa !== false;

const writeUsersCache = (users: User[]) => {
  localStorage.setItem(usersKey(), JSON.stringify(users));
};

const persistUser = async (user: User) => {
  const users = settingsService.getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx === -1) users.push(user); else users[idx] = user;
  writeUsersCache(users);
  refreshSessionFrom(user);
  window.dispatchEvent(new Event('storage'));
  if (realtimeStore.isCloud()) await realtimeStore.set(USERS_COLLECTION, user as any);
};

const refreshSessionFrom = (user: User) => {
  const active = settingsService.getActiveSession() as StoredSession | null;
  if (active && active.id === user.id) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stripSecrets(user), sessionExpiresAt: active.sessionExpiresAt }));
  }
};

/** Verify a password against a stored user (supports legacy plaintext → migrates on success). */
const verifyCredential = async (user: User, pass: string): Promise<boolean> => {
  if (user.passwordHash && user.passwordSalt) {
    return safeEqual(await hashPassword(pass, user.passwordSalt), user.passwordHash);
  }
  // Legacy / bootstrap accounts: plaintext or temporary credential.
  const legacy = user.password ?? TEMP_PASSWORD;
  return safeEqual(pass, legacy);
};

let userSyncUnsub: (() => void) | null = null;

export const settingsService = {
  getSettings: (): AppSettings => {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const parsed: AppSettings = data ? JSON.parse(data) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      if (!parsed.language) parsed.language = 'en';
      if (!parsed.navOrder) parsed.navOrder = [...DEFAULT_NAV_ORDER];
      parsed.sla = { ...JSON.parse(JSON.stringify(DEFAULT_SLA)), ...(parsed.sla || {}) };
      if (parsed.requireAdminMfa === undefined) parsed.requireAdminMfa = !DEMO_MODE;
      // Merge in newly introduced modules / permissions for previously saved settings.
      DEFAULT_NAV_ORDER.forEach(id => { if (!parsed.navOrder.includes(id)) parsed.navOrder.push(id); });
      (Object.keys(DEFAULT_SETTINGS.rolePermissions) as UserRole[]).forEach(role => {
        const def = DEFAULT_SETTINGS.rolePermissions[role];
        const cur = parsed.rolePermissions?.[role];
        if (!cur) { parsed.rolePermissions[role] = JSON.parse(JSON.stringify(def)); return; }
        (Object.keys(def) as (keyof RolePermissions)[]).forEach(k => {
          if (cur[k] === undefined) (cur as any)[k] = JSON.parse(JSON.stringify(def[k]));
        });
        cur.visiblePages = { ...def.visiblePages, ...cur.visiblePages };
      });
      return parsed;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings: (settings: AppSettings): void => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('storage'));
    if (realtimeStore.isCloud()) {
      realtimeStore.set('app_settings', { id: 'global', ...settings } as any).catch(e => console.error('Settings sync failed', e));
    }
  },

  /**
   * Keep the user directory & global settings cache in sync with Firestore.
   * Listeners attach only while a Firebase user is signed in (rules require auth).
   */
  startCloudSync: (): (() => void) => {
    if (!realtimeStore.isCloud() || userSyncUnsub) return () => {};
    let inner: (() => void) | null = null;
    const stopInner = () => { inner?.(); inner = null; };
    const unsubAuth = cloudAuth.onChange(fbUser => {
      stopInner();
      if (!fbUser) return;
      const unsubUsers = realtimeStore.subscribe<User & { id: string }>(USERS_COLLECTION, docs => {
        writeUsersCache(docs);
        const session = settingsService.getActiveSession();
        const fresh = session && docs.find(d => d.id === session.id);
        if (fresh) refreshSessionFrom(fresh);
        window.dispatchEvent(new Event('storage'));
      });
      const unsubSettings = realtimeStore.subscribe<any>('app_settings', docs => {
        const global = docs.find(d => d.id === 'global');
        if (global) {
          const { id, ...rest } = global;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
          window.dispatchEvent(new Event('storage'));
        }
      });
      inner = () => { unsubUsers(); unsubSettings(); };
    });
    userSyncUnsub = () => { stopInner(); unsubAuth(); userSyncUnsub = null; };
    return userSyncUnsub;
  },

  getUsers: (): User[] => {
    try {
      const data = localStorage.getItem(usersKey());
      if (!data && realtimeStore.isCloud()) return [];
      if (!data) {
        const defaults = buildDefaultUsers();
        writeUsersCache(defaults);
        return defaults;
      }
      return JSON.parse(data);
    } catch (e) {
      return buildDefaultUsers();
    }
  },

  /** Public user directory (no credential material). */
  getDirectory: (): User[] => settingsService.getUsers().map(stripSecrets),

  /** Update non-credential profile fields. Passwords go through the dedicated flows below. */
  saveUser: (user: Partial<User> & { id?: string }): User => {
    const users = settingsService.getUsers();
    const { password, passwordHash, passwordSalt, ...safe } = user;
    const existing = user.id ? users.find(u => u.id === user.id) : undefined;
    if (!existing) throw new Error('Use provisionUser() to create accounts');
    const saved = { ...existing, ...safe } as User;
    persistUser(saved).catch(e => console.error('User sync failed', e));
    return saved;
  },

  /**
   * Admin: provision a new analyst. The account receives the temporary
   * password and must change it on first login.
   */
  provisionUser: async (actor: User, data: { username: string; email: string; role: UserRole }): Promise<User> => {
    if (realtimeStore.isCloud()) return callFn<typeof data, User>('provisionUser', data);
    const users = settingsService.getUsers();
    if (users.some(u => u.username.toLowerCase() === data.username.trim().toLowerCase())) {
      throw new Error('Username already exists');
    }
    const salt = randomSalt();
    const user: User = {
      id: `user-${crypto.randomUUID()}`,
      username: data.username.trim(),
      email: data.email.trim(),
      role: data.role,
      createdAt: new Date().toISOString(),
      createdBy: actor.username,
      bio: '',
      profilePic: '',
      passwordSalt: salt,
      passwordHash: await hashPassword(TEMP_PASSWORD, salt),
      forcePasswordChange: true,
      failedLoginAttempts: 0,
    };
    await persistUser(user);
    auditService.log(actor, 'USER_CREATED', { id: user.id, name: user.username }, { role: user.role, email: user.email });
    return user;
  },

  updateUserAccount: async (actor: User, id: string, patch: { username?: string; email?: string; role?: UserRole; disabled?: boolean }): Promise<User> => {
    if (realtimeStore.isCloud()) return callFn<any, User>('updateUserAccount', { uid: id, ...patch });
    const existing = settingsService.getUsers().find(u => u.id === id);
    if (!existing) throw new Error('User not found');
    if (patch.username && settingsService.getUsers().some(u => u.id !== id && u.username.toLowerCase() === patch.username!.toLowerCase())) {
      throw new Error('Username already exists');
    }
    const admins = settingsService.getUsers().filter(u => u.role === 'Admin' && !u.disabled);
    if (existing.role === 'Admin' && admins.length === 1 && ((patch.role && patch.role !== 'Admin') || patch.disabled)) {
      throw new Error('At least one active administrator is required');
    }
    const updated = { ...existing, ...patch };
    await persistUser(updated);
    if (patch.role && patch.role !== existing.role) {
      auditService.log(actor, 'ROLE_CHANGED', { id, name: updated.username }, { from: existing.role, to: patch.role });
    }
    auditService.log(actor, 'USER_UPDATED', { id, name: updated.username }, patch);
    return updated;
  },

  /** Admin: reset to the temporary password and force rotation on next login. */
  resetPassword: async (actor: User, id: string): Promise<void> => {
    if (realtimeStore.isCloud()) { await callFn('resetUserPassword', { uid: id }); return; }
    const existing = settingsService.getUsers().find(u => u.id === id);
    if (!existing) throw new Error('User not found');
    const salt = randomSalt();
    const { password, ...rest } = existing;
    await persistUser({
      ...rest,
      passwordSalt: salt,
      passwordHash: await hashPassword(TEMP_PASSWORD, salt),
      forcePasswordChange: true,
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });
    auditService.log(actor, 'PASSWORD_RESET', { id, name: existing.username });
  },

  unlockUser: async (actor: User, id: string): Promise<void> => {
    if (realtimeStore.isCloud()) throw new Error('In cloud mode lockout is managed by Firebase Authentication');
    const existing = settingsService.getUsers().find(u => u.id === id);
    if (!existing) return;
    await persistUser({ ...existing, failedLoginAttempts: 0, lockedUntil: undefined });
    auditService.log(actor, 'USER_UPDATED', { id, name: existing.username }, { unlocked: true });
  },

  /** User-initiated (or forced) password change. */
  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
    if (realtimeStore.isCloud()) {
      const self = settingsService.getActiveSession();
      const policy = checkPasswordPolicy(newPassword, self?.username ?? '');
      if (!policy.ok) throw new Error(`Password policy: ${policy.errors.join(', ')}`);
      if (newPassword === TEMP_PASSWORD) throw new Error('The temporary password cannot be reused');
      await cloudAuth.reauthenticate(currentPassword);
      await callFn('changePassword', { newPassword });
      const fb = cloudAuth.current();
      if (fb) establishSession(await cloudAuth.loadProfile(fb));
      return;
    }
    const existing = settingsService.getUsers().find(u => u.id === userId);
    if (!existing) throw new Error('User not found');
    if (!(await verifyCredential(existing, currentPassword))) throw new Error('Current password is incorrect');
    const policy = checkPasswordPolicy(newPassword, existing.username);
    if (!policy.ok) throw new Error(`Password policy: ${policy.errors.join(', ')}`);
    if (await verifyCredential(existing, newPassword)) throw new Error('New password must differ from the current one');
    if (newPassword === TEMP_PASSWORD) throw new Error('The temporary password cannot be reused');
    const salt = randomSalt();
    const wasForced = !!existing.forcePasswordChange;
    const { password, ...rest } = existing;
    await persistUser({
      ...rest,
      passwordSalt: salt,
      passwordHash: await hashPassword(newPassword, salt),
      forcePasswordChange: false,
      passwordChangedAt: new Date().toISOString(),
    });
    auditService.log(existing, wasForced ? 'FORCED_PASSWORD_CHANGE' : 'PASSWORD_CHANGED', { id: existing.id, name: existing.username });
  },

  deleteUser: async (actor: User, id: string): Promise<void> => {
    if (realtimeStore.isCloud()) { await callFn('deleteUserAccount', { uid: id }); return; }
    const users = settingsService.getUsers();
    const target = users.find(u => u.id === id);
    if (!target) return;
    if (target.id === actor.id) throw new Error('You cannot delete your own account');
    if (target.role === 'Admin' && users.filter(u => u.role === 'Admin').length === 1) {
      throw new Error('At least one administrator is required');
    }
    writeUsersCache(users.filter(u => u.id !== id));
    window.dispatchEvent(new Event('storage'));
    if (realtimeStore.isCloud()) await realtimeStore.remove(USERS_COLLECTION, id);
    auditService.log(actor, 'USER_DELETED', { id, name: target.username }, { role: target.role });
  },

  /**
   * Step 1 of sign-in: password verification. May require a TOTP challenge or
   * (for administrators when MFA is mandatory) enrolment before a session exists.
   */
  authenticate: async (username: string, pass: string): Promise<AuthResult> => {
    pending = null;
    if (realtimeStore.isCloud()) return settingsService.cloudAuthenticate(username, pass);

    const users = settingsService.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    const generic = 'Invalid security credentials provided';
    if (!user) {
      auditService.log({ id: 'unknown', username: username.trim() || '(empty)' }, 'LOGIN_FAILED', undefined, { reason: 'unknown_user' });
      return { status: 'error', error: generic };
    }
    if (user.disabled) {
      auditService.log(user, 'LOGIN_FAILED', { id: user.id, name: user.username }, { reason: 'disabled' });
      return { status: 'error', error: 'Account disabled. Contact an administrator.' };
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      auditService.log(user, 'LOGIN_FAILED', { id: user.id, name: user.username }, { reason: 'locked' });
      return { status: 'error', error: `Account locked until ${new Date(user.lockedUntil).toLocaleTimeString()}` };
    }
    if (!(await verifyCredential(user, pass))) {
      return { status: 'error', error: await settingsService.registerFailure(user, 'LOGIN_FAILED') };
    }
    const updated: User = { ...user, failedLoginAttempts: 0, lockedUntil: undefined };
    // Migrate legacy plaintext credentials to PBKDF2 hashes on successful login.
    if (!user.passwordHash && user.password) {
      const salt = randomSalt();
      updated.passwordSalt = salt;
      updated.passwordHash = await hashPassword(pass, salt);
      delete updated.password;
    }
    await persistUser(updated);

    if (updated.mfaEnrolledAt && updated.mfaSecret) {
      pending = { kind: 'local_challenge', userId: updated.id, expires: Date.now() + PENDING_TTL };
      return { status: 'mfa_challenge' };
    }
    if (mfaRequiredFor(updated)) {
      const secret = generateTotpSecret();
      pending = { kind: 'local_enroll', userId: updated.id, secret, expires: Date.now() + PENDING_TTL };
      return { status: 'mfa_enroll', secret, uri: otpauthUri(secret, updated.username) };
    }
    return { status: 'ok', user: await settingsService.completeLocalLogin(updated) };
  },

  /** Count a failed password / MFA attempt and lock the account when the limit is reached. */
  registerFailure: async (user: User, action: 'LOGIN_FAILED' | 'MFA_CHALLENGE_FAILED'): Promise<string> => {
    const fresh = settingsService.getUsers().find(u => u.id === user.id) ?? user;
    const attempts = (fresh.failedLoginAttempts || 0) + 1;
    const locked = attempts >= MAX_FAILED_LOGINS;
    await persistUser({
      ...fresh,
      failedLoginAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : fresh.lockedUntil,
    });
    auditService.log(fresh, locked ? 'ACCOUNT_LOCKED' : action, { id: fresh.id, name: fresh.username }, { attempts });
    if (locked) { pending = null; return `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`; }
    return action === 'MFA_CHALLENGE_FAILED' ? 'Invalid authentication code' : 'Invalid security credentials provided';
  },

  completeLocalLogin: async (u: User): Promise<User> => {
    const updated = { ...u, failedLoginAttempts: 0, lockedUntil: undefined, lastLoginAt: new Date().toISOString() };
    await persistUser(updated);
    return establishSession(updated);
  },

  cloudAuthenticate: async (login: string, pass: string): Promise<AuthResult> => {
    const res = await cloudAuth.signIn(login, pass);
    if (res.status === 'error') return res;
    if (res.status === 'mfa_challenge') {
      pending = { kind: 'cloud_challenge', resolver: res.resolver, login };
      return { status: 'mfa_challenge' };
    }
    const profile = await cloudAuth.loadProfile(res.fbUser);
    if (profile.disabled) { await cloudAuth.signOut(); return { status: 'error', error: 'Account disabled. Contact an administrator.' }; }
    if (mfaRequiredFor(profile) && !cloudAuth.isMfaEnrolled()) {
      try {
        const { secret, uri, key } = await cloudAuth.startTotpEnrollment(profile.email || profile.username);
        pending = { kind: 'cloud_enroll', secret };
        return { status: 'mfa_enroll', secret: key, uri };
      } catch (e: any) {
        await cloudAuth.signOut();
        return { status: 'error', error: `MFA enrolment unavailable: ${e.message}. Enable TOTP MFA (Identity Platform) for this project.` };
      }
    }
    return { status: 'ok', user: establishSession(profile) };
  },

  /** Step 2a: verify a TOTP code for an enrolled account. */
  verifyMfa: async (code: string): Promise<AuthResult> => {
    const p = pending;
    if (!p) return { status: 'error', error: 'Sign-in session expired. Start again.' };
    if (p.kind === 'cloud_challenge') {
      try {
        const fb = await cloudAuth.completeMfa(p.resolver, code);
        return { status: 'ok', user: establishSession(await cloudAuth.loadProfile(fb)) };
      } catch (e: any) {
        callFn('recordLoginFailure', { username: p.login, mfa: true }).catch(() => {});
        return { status: 'error', error: e.message };
      }
    }
    if (p.kind !== 'local_challenge' || p.expires < Date.now()) { pending = null; return { status: 'error', error: 'Sign-in session expired. Start again.' }; }
    const user = settingsService.getUsers().find(u => u.id === p.userId);
    if (!user?.mfaSecret) return { status: 'error', error: 'MFA is not configured for this account' };
    const step = await verifyTotp(user.mfaSecret, code, Date.now(), user.mfaLastStep);
    if (step === null) return { status: 'error', error: await settingsService.registerFailure(user, 'MFA_CHALLENGE_FAILED') };
    return { status: 'ok', user: await settingsService.completeLocalLogin({ ...user, mfaLastStep: step }) };
  },

  /** Step 2b: confirm authenticator enrolment with a first valid code. */
  confirmMfaEnrollment: async (code: string): Promise<AuthResult> => {
    const p = pending;
    if (!p) return { status: 'error', error: 'Enrolment session expired. Start again.' };
    if (p.kind === 'cloud_enroll') {
      try {
        await cloudAuth.finishTotpEnrollment(p.secret, code);
        const fb = cloudAuth.current()!;
        const profile = await cloudAuth.loadProfile(fb);
        auditService.log(profile, 'MFA_ENROLLED', { id: profile.id, name: profile.username }, { factor: 'totp', self: !!p.self });
        return { status: 'ok', user: establishSession(profile) };
      } catch (e: any) { return { status: 'error', error: e.message }; }
    }
    if (p.kind !== 'local_enroll' || p.expires < Date.now()) { pending = null; return { status: 'error', error: 'Enrolment session expired. Start again.' }; }
    const user = settingsService.getUsers().find(u => u.id === p.userId);
    if (!user) return { status: 'error', error: 'User not found' };
    const step = await verifyTotp(p.secret, code);
    if (step === null) return { status: 'error', error: 'Invalid authentication code — check the time on your device' };
    const enrolled: User = { ...user, mfaSecret: p.secret, mfaEnrolledAt: new Date().toISOString(), mfaLastStep: step };
    auditService.log(user, 'MFA_ENROLLED', { id: user.id, name: user.username }, { factor: 'totp', self: !!p.self });
    if (p.self) { await persistUser(enrolled); pending = null; return { status: 'ok', user: stripSecrets(enrolled) }; }
    return { status: 'ok', user: await settingsService.completeLocalLogin(enrolled) };
  },

  /** Signed-in user voluntarily enrols an authenticator. */
  beginSelfEnrollment: async (user: User): Promise<{ secret: string; uri: string }> => {
    if (realtimeStore.isCloud()) {
      const { secret, uri, key } = await cloudAuth.startTotpEnrollment(user.email || user.username);
      pending = { kind: 'cloud_enroll', secret, self: true };
      return { secret: key, uri };
    }
    const secret = generateTotpSecret();
    pending = { kind: 'local_enroll', userId: user.id, secret, expires: Date.now() + PENDING_TTL, self: true };
    return { secret, uri: otpauthUri(secret, user.username) };
  },

  cancelPendingAuth: async (): Promise<void> => {
    const wasCloud = pending?.kind?.startsWith('cloud') && !(pending as any).self;
    pending = null;
    if (wasCloud) await cloudAuth.signOut();
  },

  /** Admin: remove a user's authenticator so they re-enrol at next sign-in. */
  resetMfa: async (actor: User, id: string): Promise<void> => {
    if (realtimeStore.isCloud()) { await callFn('resetUserMfa', { uid: id }); return; }
    const existing = settingsService.getUsers().find(u => u.id === id);
    if (!existing) throw new Error('User not found');
    const { mfaSecret, mfaEnrolledAt, mfaLastStep, ...rest } = existing;
    await persistUser(rest as User);
    auditService.log(actor, 'MFA_RESET', { id, name: existing.username });
  },

  /** Returns the session if still valid; revalidates against the (synced) user registry. */
  getActiveSession: (): User | null => {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (!data) return null;
      const session: StoredSession = JSON.parse(data);
      if (session.sessionExpiresAt && new Date(session.sessionExpiresAt).getTime() < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        auditService.log(session, 'SESSION_EXPIRED');
        if (realtimeStore.isCloud()) cloudAuth.signOut().catch(() => {});
        return null;
      }
      const raw = localStorage.getItem(usersKey());
      if (raw) {
        const registry: User[] = JSON.parse(raw);
        const fresh = registry.find(u => u.id === session.id);
        // In cloud mode the directory may still be loading — the server enforces access.
        if ((!fresh && !realtimeStore.isCloud()) || fresh?.disabled) {
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        if (fresh) return { ...stripSecrets(fresh), role: realtimeStore.isCloud() ? session.role : fresh.role };
      }
      return session;
    } catch (e) {
      return null;
    }
  },

  logout: (): void => {
    localStorage.removeItem(SESSION_KEY);
    pending = null;
    if (realtimeStore.isCloud()) cloudAuth.signOut().catch(() => {});
    window.dispatchEvent(new Event('storage'));
  },

  exportFullSystem: (): string => {
    const keys = [
      'soc_assets_data', 'soc_incidents_data', 'soc_app_settings', 
      'soc_app_users', 'soc_guidelines_data', 'soc_announcements', 
      'soc_tasks_data', 'soc_approval_requests', 'soc_audit_logs'
    ];
    // G-Eyes SR collections (local mirror)
    Object.keys(localStorage).filter(k => k.startsWith('geyes_col_')).forEach(k => keys.push(k));
    const archive: Record<string, any> = {
      archive_timestamp: new Date().toISOString(),
      archive_version: '4.0'
    };
    keys.forEach(key => {
      const val = localStorage.getItem(key);
      if (val) archive[key] = JSON.parse(val);
    });
    return JSON.stringify(archive, null, 2);
  },

  importFullSystem: (archive: any): void => {
    Object.entries(archive).forEach(([key, val]) => {
      if (key.startsWith('soc_') || key.startsWith('geyes_col_')) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    });
    window.dispatchEvent(new Event('storage'));
  }
};
