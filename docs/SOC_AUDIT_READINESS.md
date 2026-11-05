# G-Eyes SR — SOC Reporting & Audit Readiness

This document explains how G-Eyes SR supports SOC reporting and audits: which
controls exist, where an auditor finds evidence, and which gaps an operator must
close before production use.

## 1. Scope

| In scope | Out of scope |
|---|---|
| Analyst identity, roles and credentials | SIEM / log ingestion (events are logged by analysts) |
| 24/7 duty rostering and shift coverage | Automated alerting / paging |
| Shift incident logging and report finalization | Ticketing / case-management integrations |
| Report generation and export | Long-term archival storage (export ZIPs to your archive) |
| Audit trail of platform activity | |

## 2. Roles (RBAC)

| Role | Label in UI | Default capabilities |
|---|---|---|
| `Admin` | Administrator | Provision users, change roles, reset passwords, unlock/disable/delete accounts, configure monthly schedules, delete reports, view and export the audit trail, change role permissions |
| `L2` | Analyst — Tier 2 | Log shift events, sync drafts, finalize reports, view rosters, export reports |
| `L1` | Analyst — Tier 1 | Same as Tier 2 for shift operations; fewer asset/SOP rights |

Admins can adjust permissions per role in **Settings → User & Role Management**.
Every permission change writes a `SETTINGS_CHANGED` audit entry that contains the full permission matrix.

## 3. Control mapping

| Control objective | Implementation | Evidence | SOC 2 | ISO 27001:2022 |
|---|---|---|---|---|
| Unique user identification | One account per analyst; usernames are unique | `users` collection, `USER_CREATED` entries | CC6.1 | A.5.16 |
| Secure initial credential | New and reset accounts get the temporary password `12345a` with `forcePasswordChange = true`. The **ForceChangePassword** modal blocks all access until it is rotated | `USER_CREATED`, `PASSWORD_RESET`, `FORCED_PASSWORD_CHANGE` | CC6.1, CC6.2 | A.5.17 |
| Password strength | At least 10 characters, with upper, lower, digit and symbol; must not contain the username; must differ from the current and temporary password | `lib/crypto.ts` `checkPasswordPolicy` | CC6.1 | A.5.17 |
| Credential storage | PBKDF2-SHA256, 120,000 iterations, 16-byte random salt per user. Legacy plaintext is migrated on the next successful login | `users.passwordHash`/`passwordSalt` | CC6.1 | A.8.5 |
| Brute-force protection | 5 failed attempts lock the account for 15 minutes; failures are logged even for unknown usernames | `LOGIN_FAILED`, `ACCOUNT_LOCKED` | CC6.1 | A.8.5 |
| Session management | Sessions expire after 12 h. Each session is checked against the synced registry, so disabling or deleting an account ends its access | `SESSION_EXPIRED` | CC6.1 | A.8.5 |
| Least privilege / access changes | Role-based permissions; role changes logged with before and after values; the last admin cannot be demoted or deleted | `ROLE_CHANGED`, `USER_UPDATED`, `USER_DELETED` | CC6.2, CC6.3 | A.5.15, A.5.18 |
| 24/7 coverage | 3-shift roster, coverage-gap counter, live **Duty Now** panel | `duty_schedules`, `DUTY_SCHEDULE_UPDATED` (stores the before and after roster) | CC7.3 | A.5.24 |
| Incident recording | Structured event fields, severity taxonomy, validation of IP addresses and ports, investigation, remediation and conclusion fields | `shift_reports.events`, `SHIFT_EVENT_*` | CC7.3, CC7.4 | A.5.25, A.5.26 |
| Record integrity / non-repudiation | Finalization seals the report with a SHA-256 hash over its canonical content. Firestore rules reject any update to a finalized report. **Verify integrity** recomputes the hash | `integrityHash`, `SHIFT_REPORT_FINALIZED`, `INTEGRITY_VERIFIED` | CC7.4 | A.5.28 |
| Shift handover | Summary and handover notes for each report; the finalize step warns when they are missing | `shift_reports.summary` / `handoverNotes` | CC7.3 | A.5.24 |
| Audit logging | Every auth, admin, roster, report and export action is logged with user, role, timestamp, target, metadata, user agent and a per-entry SHA-256 hash | `audit_logs` | CC7.2 | A.8.15 |
| Log protection | `audit_logs` is append-only (`update, delete: if false`). **Verify integrity** in the Audit Trail recomputes every hash | `firestore.rules` | CC7.2 | A.8.15 |
| Reporting & distribution | Exports in PDF, HTML, MD and JSON carry a classification or TLP marking. Batch ZIPs include `MANIFEST.json` with SHA-256 hashes of each file and the seal of each report | `REPORT_EXPORTED`, `REPORT_BATCH_EXPORTED` | CC2.2 | A.5.12, A.5.13 |
| Management review | Executive Review shows the criticality index, top vectors, hostile IPs and volume by day and shift; it exports an executive brief | `REPORT_EXPORTED` (`executive-brief`) | CC4.1 | A.5.35 |

## 4. Audit trail event catalogue

| Category | Actions |
|---|---|
| Authentication | `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `SESSION_EXPIRED` |
| Credentials | `PASSWORD_CHANGED`, `FORCED_PASSWORD_CHANGE`, `PASSWORD_RESET` |
| Administration | `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `ROLE_CHANGED`, `SETTINGS_CHANGED` |
| Roster | `DUTY_SCHEDULE_UPDATED` |
| Shift reporting | `SHIFT_REPORT_CREATED`, `SHIFT_EVENT_ADDED`, `SHIFT_EVENT_UPDATED`, `SHIFT_EVENT_REMOVED`, `SHIFT_DRAFT_SYNCED`, `SHIFT_REPORT_FINALIZED`, `SHIFT_REPORT_DELETED`, `INTEGRITY_VERIFIED` |
| Distribution | `REPORT_EXPORTED`, `REPORT_BATCH_EXPORTED`, `AUDIT_LOG_EXPORTED` |
| Legacy modules | `CREATE_/EDIT_/DELETE_ASSET`, `CREATE_/EDIT_/DELETE_INCIDENT`, `VIEW_*`, `REQUEST_*`, `TASK_*`, `SOP_COMMIT`, `ANNOUNCEMENT_POST` |

## 5. Operating procedures

**Shift lifecycle**
1. At shift start, open **Shift Reports → Open current shift**. The platform creates or reopens the draft `YYYY-MM-DD_<shift>`.
2. Log every triaged event. Drafts auto-sync 2.5 s after the last edit, and any analyst on the shift can contribute in real time.
3. Before handover, write the shift summary and handover notes.
4. Select **Finalize** to seal the report. After that it cannot be edited, only verified, exported or (by an admin) deleted with an audit entry.

**Periodic evidence pack (monthly or quarterly)**
1. In **Shift Reports**, filter by the period and select **Finalized**, then select all and choose **Export ZIP** in PDF and JSON.
2. In **Audit Trail**, filter by the same period, select **Verify integrity**, then export CSV and JSON.
3. In **Executive Review**, choose a custom range and export the brief.
4. Store the three artifacts in your evidence repository. The ZIP `MANIFEST.json` hashes let reviewers confirm the files were not modified.

**Access reviews (quarterly)**
1. Review **Settings → All Members**: check roles, disabled accounts, accounts flagged "Must change password" and last-login dates.
2. Cross-check with the `USER_*` and `ROLE_CHANGED` entries in the audit export.

## 6. Known limitations & hardening before production

The platform enforces RBAC in the client and uses its own credential store.
Firestore rules enforce data integrity (sealed reports, append-only audit), but
they do **not** know an analyst's role, because every browser shares an anonymous
Firebase transport identity. Close these gaps for regulated or production use:

1. **Move authentication server-side.** Use Firebase Authentication (email/password or SSO/OIDC) and set the role as a custom claim from a Cloud Function. Then change the rules to check `request.auth.token.role == 'admin'` for user management, roster writes and report deletion, and stop clients from reading `passwordHash`.
2. **Seal reports server-side.** Compute the finalization hash and timestamp in a Cloud Function, so a modified client cannot seal tampered content.
3. **Export the audit trail to WORM storage**, for example a Cloud Logging sink or a BigQuery table with retention locks, so retention does not depend on Firestore.
4. **Enable MFA** for administrator accounts in the identity provider.
5. **Set a Content-Security-Policy** in hosting headers once the final domains are known (`firebase.json` already sets HSTS, `nosniff`, frame denial and referrer policy).
6. **Local mode is for evaluation only.** Data stays in one browser profile, and the local audit cache keeps the latest 5,000 entries.
