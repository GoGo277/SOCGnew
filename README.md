# G-Eyes SR — SOC Operations & Intelligence Platform

G-Eyes SR runs a 24/7 Security Operations Center. It covers duty rostering, shift incident logging, sealed shift reports, response-time SLAs, handover sign-off, executive analytics, scheduled reporting and a tamper-evident audit trail.

## Modules

| Area | Capabilities |
|---|---|
| **Access & identity** | Roles: Admin and Analyst (Tier 1 / Tier 2). New and reset accounts get the temporary password `12345a` and must change it at first sign-in. Password policy, lockout after repeated failures, 12 h sessions. **Two-step verification (TOTP)** is mandatory for administrators and optional for analysts. In cloud mode: Firebase Authentication, custom-claim roles and admin actions run through Cloud Functions. |
| **Duty engine** | Three shifts: Morning 08–16, Evening 16–00, Night 00–08. The live **Duty Now** panel shows the current crew, time remaining and the next crew. Monthly roster calendar (agenda view on phones), weekly replication, coverage-gap and shift-load statistics. |
| **Shift swaps** | Cover or exchange requests. The colleague accepts, then an admin approves; separation of duties applies. The roster updates automatically and every step is audited. |
| **Shift reports** | Each event records detection / first-activity / containment / resolution times, attack type, source and destination IP, port, protocol, severity and status. Notes cover investigation, remediation and conclusion. Drafts sync in real time across analysts. **Finalize** seals the report with SHA-256, server-side in cloud mode. **Integrity verification** recomputes the seal. |
| **Continuity** | Unresolved events **carry over** automatically into the next shift. The incoming shift **signs off the handover** after reviewing the summary, notes and open items. One click **escalates** an event to a tracked incident linked to inventory assets. |
| **SLA & metrics** | SLA targets per severity (contain / resolve). Each event shows a live SLA state (on track, at risk, breached, met). The platform computes MTTD, MTTC and MTTR, SLA compliance, and handover compliance. |
| **Executive Review** | Criticality index, threat vectors, hostile IPs, targeted assets, and volume by day, shift and analyst. Response-time trends and a list of breaches. Date ranges: today, 7 days, 30 days, custom or all. |
| **Reporting** | Exports to PDF (jsPDF), standalone HTML, Markdown and JSON. Customizer: classification / TLP, custom sections, page numbers; settings can be saved as **templates**. Batch **ZIP** includes a SHA-256 manifest and comparative analysis. The **Report Center** schedules daily, weekly or monthly executive briefs and shift digests, emails them in cloud mode, and keeps a verifiable archive. |
| **Audit** | Every security-relevant action gets a hashed audit entry; filter, verify, and export to CSV or JSON. In cloud mode the trail is append-only. A server-side sink re-verifies each entry and forwards it to Cloud Logging for write-once (WORM) retention. |
| **UX** | English and Simplified Chinese. Responsive down to phone width. Keyboard-accessible dialogs. |

The platform also includes asset inventory, incidents, tasks, announcements, messaging, SOP guidelines and approval requests.

## Architecture

```
React 19 + TypeScript + Tailwind ── i18n (en / zh) ── Recharts · jsPDF · JSZip
        │
        ├── Local mode  : localStorage + BroadcastChannel (evaluation, single browser)
        └── Cloud mode  : Firebase Auth (+TOTP MFA)  ── custom claims (role)
                          Firestore (onSnapshot)     ── firestore.rules (role/MFA aware, immutability)
                          Cloud Functions            ── identity admin · report sealing · audit sink
                                                        scheduled reports → Trigger Email
                          Cloud Logging sink         ── retention-locked bucket (WORM)
```

The same pure modules (`lib/`, `services/analytics`, `services/briefService`, `services/reportMarkdown`) run in the browser and inside Cloud Functions. Hashes, SLA figures and reports are therefore identical on both sides.

## Quick start (local evaluation)

```bash
npm install
```

```bash
npm run dev
```

1. Open http://localhost:3000.
2. Sign in as **Admin** with the temporary password **`12345a`**.
3. Enrol an authenticator app by scanning the QR code.
4. Set a new password when prompted.

## Production (cloud mode)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). It covers Firebase project setup, enabling TOTP MFA, deploying rules, indexes and functions, bootstrapping the first administrator, e-mail delivery and WORM audit retention.

## Quality gates

| Command | What it runs |
|---|---|
| `npm run lint` | TypeScript type-check of the app and the Cloud Functions |
| `npm test` | Unit tests: SLA maths, carry-over de-duplication, hashing, TOTP RFC vectors, scheduling, safe Markdown, validation |
| `npm run i18n:check` | Every UI string has a Simplified Chinese translation |
| `npm run test:emulators` | Firebase Emulator Suite: **security-rules tests** and **Cloud Functions integration tests** (needs Java 21) |
| `npm run test:e2e` | Playwright: full SOC workflow with real TOTP codes (desktop), plus a phone-layout run |
| `npm run test:all` | All of the above |

The same checks run on every push in GitHub Actions (`.github/workflows/ci.yml`).

> When the emulator tests run behind an HTTP proxy that intercepts loopback calls, set `GEYES_DISABLE_TRIGGERS=1`. The audit-sink Firestore trigger is then skipped, and its handler is tested directly instead.

## Audit & compliance

[`docs/SOC_AUDIT_READINESS.md`](docs/SOC_AUDIT_READINESS.md) contains the control mapping (SOC 2 / ISO 27001), evidence sources, the audit event catalogue, operating procedures and residual risks.
