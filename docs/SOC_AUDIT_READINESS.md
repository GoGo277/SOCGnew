# G-Eyes SR — SOC Reporting & Audit Readiness

This document describes how G-Eyes SR supports SOC reporting and external audit. It lists the controls in place, where an auditor finds evidence, how the controls are tested, and the residual risks an operator must accept or close.

## 1. Deployment modes

| Mode | Use | Enforcement point |
|---|---|---|
| **Cloud** (Firebase) | Production | Firebase Authentication with TOTP MFA, custom-claim roles, Firestore security rules, Cloud Functions |
| **Local** | Evaluation and demos | The browser only. Data stays in one browser profile. **Not for production evidence.** |

The rest of this document describes **cloud mode** unless stated otherwise.

## 2. Roles

| Role | UI label | Default capabilities |
|---|---|---|
| `Admin` | Administrator | Identity administration, roles, MFA resets, rosters and swap approval, SOC policy (SLA, MFA), report deletion, report schedules, audit trail |
| `L2` | Analyst — Tier 2 | Log events, sync drafts, finalize, acknowledge handovers, request swaps, export, templates |
| `L1` | Analyst — Tier 1 | As Tier 2 for shift operations; fewer asset and SOP rights |

Roles are **custom claims** that only Cloud Functions can set. A client cannot change its own role, because the rules block edits to `users.role`.

## 3. Control mapping

| Control objective | Implementation | Evidence | Verified by | SOC 2 | ISO 27001:2022 |
|---|---|---|---|---|---|
| Unique identities | One Firebase Auth account per analyst. Usernames are unique (`login_index`). | `users`, `USER_CREATED` | functions tests | CC6.1 | A.5.16 |
| Secure initial credential | Temporary password `12345a` plus `forcePasswordChange`. All access is blocked until the password is rotated. | `USER_CREATED`, `PASSWORD_RESET`, `FORCED_PASSWORD_CHANGE` | functions + e2e | CC6.1 | A.5.17 |
| Password strength | Minimum 10 characters with upper, lower, digit and symbol. Must not contain the username, the temporary password, or the current password. Enforced server-side. | `changePassword` | unit + functions | CC6.1 | A.5.17 |
| Multi-factor authentication | TOTP (RFC 6238). **Mandatory for administrators** (policy setting). Admin functions and admin rule paths require `sign_in_second_factor`. | `MFA_ENROLLED`, `MFA_RESET`, rules | rules + functions + e2e | CC6.1 | A.8.5 |
| Brute-force resistance | Firebase Auth throttling in cloud mode; 5-attempt lockout in local mode. Failed sign-ins are recorded server-side with source IP. | `LOGIN_FAILED`, `ACCOUNT_LOCKED` | functions + e2e | CC6.1 | A.8.5 |
| Session control | 12 h platform session. Role changes and disabling an account revoke refresh tokens. | `ROLE_CHANGED`, `USER_UPDATED` | functions | CC6.1 | A.8.5 |
| Least privilege and change of access | Claims-based roles. Before/after values are logged on role changes. The last active admin cannot be demoted, disabled or deleted. Admins cannot demote themselves. | `ROLE_CHANGED` | functions | CC6.2, CC6.3 | A.5.15, A.5.18 |
| Segregation of duties | An admin cannot approve a shift swap they are part of while another admin exists. Report sealing is performed by the server, not the author. | `SHIFT_SWAP_APPROVED.selfDecision` | unit + rules | CC5.1 | A.5.3 |
| 24/7 coverage | Three-shift roster, coverage-gap counter, Duty Now panel, approved swaps. | `duty_schedules`, `DUTY_SCHEDULE_UPDATED` (before/after), `SHIFT_SWAP_*` | rules + e2e | CC7.3 | A.5.24 |
| Incident recording | Structured events with validated IPs and ports, severity taxonomy, lifecycle times, investigation, remediation and conclusion. | `shift_reports.events`, `SHIFT_EVENT_*`, `EVENT_STATUS_CHANGED` | unit + e2e | CC7.3, CC7.4 | A.5.25, A.5.26 |
| Incident response timeliness | SLA targets per severity. Live states (on track, at risk, breached, met). MTTD, MTTC and MTTR. | Executive Review, brief exports | unit + e2e | CC7.4 | A.5.26 |
| Escalation | One-click escalation creates a tracked incident linked to assets and to the source event. | `EVENT_ESCALATED`, incident tags `report:` / `event:` | e2e | CC7.4 | A.5.26 |
| Continuity between shifts | Open items carry over automatically. The incoming shift's sign-off is recorded together with the sealed report's hash and is immutable. | `SHIFT_ITEMS_CARRIED_OVER`, `handover_acks`, `HANDOVER_ACKNOWLEDGED` | unit + rules + e2e | CC7.3 | A.5.24 |
| Record integrity / non-repudiation | Finalized reports are sealed **server-side** (server time, verified identity, SHA-256). Rules reject any client attempt to finalize or edit a sealed report. | `integrityHash`, `SHIFT_REPORT_FINALIZED (sealedBy: server)`, `INTEGRITY_VERIFIED` | rules + functions + e2e | CC7.4 | A.5.28 |
| Audit logging | Every security-relevant action is logged with user, role, timestamp, target, metadata, user agent and a SHA-256 hash. Clients can only write entries under their own identity. | `audit_logs` | rules + e2e | CC7.2 | A.8.15 |
| Log protection | `audit_logs` is append-only. A server sink re-verifies each hash, raises `audit_integrity_alerts`, and forwards entries to Cloud Logging, which routes them to a retention-locked bucket (WORM). | `audit_integrity_alerts`, log bucket | rules + functions | CC7.2 | A.8.15 |
| Reporting and distribution | PDF, HTML, Markdown and JSON with classification / TLP markings. ZIP manifest of SHA-256 hashes. Scheduled briefs are archived with a hash and an immutable archive record. | `REPORT_EXPORTED`, `REPORT_BATCH_EXPORTED`, `report_archive`, `SCHEDULED_REPORT_GENERATED` | functions + e2e | CC2.2 | A.5.12, A.5.13 |
| Management review | Executive Review and scheduled executive briefs: SLA compliance, handover compliance, criticality index, threat landscape. | `report_archive` | functions + e2e | CC4.1 | A.5.35 |
| Case management | Alerts are triaged into cases with state, owner, classification and outcome. A case cannot close without an outcome (enforced by the rules). Closed cases are read-only in the UI. Every case change is written to the case activity feed (append-only) and the audit trail. | `cases`, `case_activity`, `CASE_*`, `ALERT_*` | rules + e2e | CC7.3, CC7.4 | A.5.26 |
| Evidence handling | The SHA-256 hash is computed in the browser and the file is not uploaded. The hash cannot change, and the chain of custody can only grow (enforced by the rules). Only verified admins can delete evidence. | `case_evidence.custody`, `CASE_OBJECT_*` | rules + e2e | CC7.4 | A.5.28 |
| External case-management integration | DFIR-IRIS sync. In cloud mode the API key is a server secret. Config changes and every sync run are audited, and changes applied from IRIS appear in the case activity feed. | `IRIS_CONFIG_CHANGED`, `IRIS_SYNC` | unit (mock IRIS) + e2e | CC9.2 | A.5.19, A.5.20 |
| Change management (code) | CI on every push: type-check, unit tests, i18n coverage, emulator rules and functions tests, end-to-end tests. | GitHub Actions history | — | CC8.1 | A.8.32 |

## 4. Audit event catalogue

| Category | Actions |
|---|---|
| Authentication | `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `SESSION_EXPIRED`, `MFA_CHALLENGE_FAILED` |
| Credentials & MFA | `PASSWORD_CHANGED`, `FORCED_PASSWORD_CHANGE`, `PASSWORD_RESET`, `MFA_ENROLLED`, `MFA_RESET` |
| Administration | `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `ROLE_CHANGED`, `SETTINGS_CHANGED` (includes SLA / MFA policy before & after) |
| Roster | `DUTY_SCHEDULE_UPDATED`, `SHIFT_SWAP_REQUESTED`, `SHIFT_SWAP_PEER_ACCEPTED`, `SHIFT_SWAP_PEER_DECLINED`, `SHIFT_SWAP_APPROVED`, `SHIFT_SWAP_REJECTED`, `SHIFT_SWAP_CANCELLED` |
| Shift reporting | `SHIFT_REPORT_CREATED`, `SHIFT_EVENT_ADDED`, `SHIFT_EVENT_UPDATED`, `SHIFT_EVENT_REMOVED`, `EVENT_STATUS_CHANGED`, `EVENT_ESCALATED`, `SHIFT_ITEMS_CARRIED_OVER`, `SHIFT_DRAFT_SYNCED`, `SHIFT_REPORT_FINALIZED`, `SHIFT_REPORT_DELETED`, `HANDOVER_ACKNOWLEDGED`, `INTEGRITY_VERIFIED` |
| Reporting | `REPORT_EXPORTED`, `REPORT_BATCH_EXPORTED`, `REPORT_TEMPLATE_SAVED`, `REPORT_TEMPLATE_DELETED`, `REPORT_SCHEDULE_SAVED`, `REPORT_SCHEDULE_DELETED`, `SCHEDULED_REPORT_GENERATED`, `AUDIT_LOG_EXPORTED`, `CASE_REPORT_EXPORTED` |
| Investigation | `ALERT_CREATED`, `ALERT_UPDATED`, `ALERT_ESCALATED`, `ALERT_MERGED`, `ALERT_CLOSED`, `CASE_CREATED`, `CASE_UPDATED`, `CASE_CLOSED`, `CASE_REOPENED`, `CASE_DELETED`, `CASE_OBJECT_ADDED`, `CASE_OBJECT_UPDATED`, `CASE_OBJECT_REMOVED`, `CUSTOMER_SAVED`, `CUSTOMER_DELETED`, `CASE_TEMPLATE_SAVED`, `CASE_TEMPLATE_DELETED` |
| Integration | `IRIS_CONFIG_CHANGED`, `IRIS_SYNC` |
| Legacy modules | asset, incident, request, task, SOP and announcement actions |

Entries written by Cloud Functions carry `metadata.source = "server"`.

## 5. Operating procedures

### Shift lifecycle

1. At shift start, review the **handover banner** and acknowledge the previous report. Open items carry over automatically.
2. Open **Shift Reports → Open current shift** and log each triaged event.
3. Update each event's status as it progresses (Contained, Resolved, False Positive). Escalate significant events to incidents.
4. Before handover, write the summary and handover notes, then **Finalize**. The finalize step warns about open Critical items and missing conclusions.

### Monthly or quarterly evidence pack

1. **Shift Reports:** filter by period and *Finalized*. Select all and export a ZIP in PDF and JSON. The ZIP manifest hashes the files.
2. **Executive Review:** choose a custom range and export the brief. Alternatively, use the archived scheduled brief from the **Report Center**, which can be verified against its stored hash.
3. **Audit Trail:** filter by the same period, select *Verify integrity*, then export CSV and JSON.
4. Confirm `audit_integrity_alerts` is empty and that the WORM bucket holds the period's log objects.

### Access review (quarterly)

1. In **Settings → All Members**, review roles, disabled accounts, *Must change password* flags, MFA status and last sign-in.
2. Reconcile against `USER_*`, `ROLE_CHANGED` and `MFA_*` entries in the audit export.

## 6. Test evidence

| Suite | Scope | Command |
|---|---|---|
| Unit | SLA maths, carry-over de-duplication, report and audit hashing, PBKDF2, password policy, TOTP RFC 4226 vectors and replay protection, safe Markdown (XSS), IP/port validation, scheduling, swap validation | `npm test` |
| Security rules | Directory access, role escalation, admin MFA gate, draft-only edits, server-only sealing, immutability, handover and swap state machines, append-only audit, archive and mail protection, case closure needs an outcome, evidence hash and custody protection, append-only case activity, +1-only counters | `npm run test:emulators` |
| Cloud Functions | Provisioning, claims, MFA gate, password lifecycle, failed-login recording, server sealing, audit sink, scheduled reports (no duplicate runs) | `npm run test:emulators` |
| IRIS connector | Contract tests against a mock IRIS v2.x API: push of every object kind, idempotency, remote-wins pull, imports, deletions both ways | `npm test` |
| End-to-end | Full workflow with real TOTP: MFA enrolment and challenge, forced rotation, provisioning, roster, carry-over, handover, escalation, SLA, sealing, exports, swaps, Report Center, audit verification, Chinese UI, phone layout; alert triage → case → evidence → IRIS round trip → case report | `npm run test:e2e` |

## 7. Residual risks and limitations

1. **Not yet validated against a live Firebase project:** Firebase TOTP MFA in production, e-mail delivery and the WORM log sink. The emulator cannot complete TOTP, so admin MFA is tested at the rules and functions level by asserting the second-factor claim. Run the checklist in `docs/DEPLOYMENT.md` §8 after the first deployment.
2. **Fine-grained analyst permissions** (for example disabling *Log shift events* for a role) are applied in the UI and in the `finalizeShiftReport` function. The Firestore rules enforce role membership and state machines, not every individual permission toggle.
3. **Username lookup:** `login_index` allows single-document reads before authentication, so a caller can test whether a username exists. Use non-obvious usernames, or switch sign-in to e-mail only, if username enumeration is in scope.
4. **Audit reading:** only administrators who have passed MFA can read `audit_logs`. Analyst dashboards therefore show no audit-derived statistics in cloud mode.
5. **DFIR-IRIS integration** is contract-tested against a mock of the IRIS v2.x API, not yet against a live IRIS server. Run the first sync against a test IRIS instance (see `docs/IRIS_INTEGRATION.md`). Case-level access control follows the platform roles; IRIS-style per-case access lists are not implemented.
6. **Legacy modules** (assets, incidents, tasks, messaging, guidelines, requests) still use browser storage and optional Supabase. Integrate them with Firestore and the rules model before using them as audit evidence.
7. **Scheduling** uses the browser's local hour when the schedule is saved, then advances in fixed periods. Daylight-saving transitions may shift run times by one hour.
8. **Content-Security-Policy:** add a CSP header in `firebase.json` once the final domains are known. HSTS, `nosniff`, frame denial and referrer policy are already set.
