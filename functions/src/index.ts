/**
 * G-Eyes SR Cloud Functions.
 * Identity & roles (custom claims), password and MFA administration, server-side
 * report sealing, audit sink and scheduled reporting.
 */
import { onAuditLogCreated as auditSink } from './reports';

export { provisionUser, updateUserAccount, resetUserPassword, resetUserMfa, deleteUserAccount, changePassword, recordLoginFailure } from './users';
export { finalizeShiftReport, runScheduledReports } from './reports';
export { irisStatus, irisTestConnection, irisSaveOptions, irisSyncNow, irisScheduledSync } from './iris';

/**
 * GEYES_DISABLE_TRIGGERS=1 omits the Firestore trigger in emulator runs behind
 * HTTP proxies that intercept the CLI's loopback trigger registration.
 */
export const onAuditLogCreated = process.env.GEYES_DISABLE_TRIGGERS === '1' ? undefined : auditSink;
