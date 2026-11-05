/**
 * Creates the first administrator in a new project.
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node lib/bootstrap.js <username> <email>
 * Against the emulator set FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT.
 */
import { adminAuth, db, TEMP_PASSWORD, USERNAME_RE, EMAIL_RE, writeAudit } from './common';

const [username, email] = process.argv.slice(2);
(async () => {
  if (!username || !USERNAME_RE.test(username) || !email || !EMAIL_RE.test(email)) {
    console.error('Usage: node lib/bootstrap.js <username> <email>');
    process.exit(1);
  }
  const existing = await db.collection('users').where('role', '==', 'Admin').limit(1).get();
  if (!existing.empty) { console.error('An administrator already exists — use the platform to provision users.'); process.exit(1); }
  const { uid } = await adminAuth.createUser({ email: email.toLowerCase(), password: TEMP_PASSWORD, displayName: username });
  await adminAuth.setCustomUserClaims(uid, { role: 'Admin' });
  await db.doc(`users/${uid}`).set({ id: uid, username, email: email.toLowerCase(), role: 'Admin', createdAt: new Date().toISOString(), createdBy: 'bootstrap', bio: '', profilePic: '', forcePasswordChange: true });
  await db.doc(`login_index/${username.toLowerCase()}`).set({ email: email.toLowerCase(), uid });
  await writeAudit({ uid: 'system', username: 'bootstrap', role: 'system' }, 'USER_CREATED', { id: uid, name: username }, { role: 'Admin' });
  console.log(`Administrator "${username}" created. Temporary password: ${TEMP_PASSWORD} (must be changed at first sign-in; MFA enrolment required).`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
