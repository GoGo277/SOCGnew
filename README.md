# G-Eyes SR — SOC Operations & Intelligence Platform

G-Eyes SR is a Security Operations Center (SOC) platform for **24/7 shift operations**:
duty rostering, shift incident logging, immutable shift reports, executive threat
analytics, a tamper-evident audit trail and multi-format report export.

| Area | What you get |
|---|---|
| **Access control** | Admin / Analyst (Tier 1, Tier 2) RBAC, temporary credential `12345a` + forced password change on first login, PBKDF2 hashing, password policy, lockout after 5 failures, 12 h session expiry |
| **3-shift duty engine** | Morning 08–16 · Evening 16–00 · Night 00–08, live **Duty Now** panel (current shift, crew, time remaining, next crew) |
| **Monthly roster** | 7-column calendar, cyan/amber/indigo shift badges, day roster modal with instant cloud persistence, weekly replication, coverage-gap and shift-load stats |
| **Shift reports** | Event logging (timestamp, name, attack type, source/destination IP, port, protocol, severity, investigation, remediation, conclusion), IP/port validation, real-time draft sync with auto-save, **finalize → immutable + SHA-256 seal**, integrity verification |
| **Executive review** | Threat-vector analysis, hostile IP ranking, criticality index, volume by day/shift/analyst — Today / 7 d / 30 d / custom / all |
| **Export** | PDF (jsPDF vector text), standalone HTML, Markdown, JSON; customizer (title, classification/TLP, custom header/body/footer sections, page numbers); multi-report **ZIP** with SHA-256 manifest and comparative analysis |
| **Audit** | Every security-relevant action logged with a per-entry SHA-256 hash; filter, verify, export CSV/JSON; Firestore rules make it append-only |

The platform also keeps the original asset inventory, incidents, tasks,
announcements, messaging, SOP guidelines and approval-request modules.

## Tech stack

React 19 + TypeScript · Tailwind CSS · Lucide icons · Recharts · jsPDF · JSZip ·
Google Cloud Firestore (`onSnapshot` real-time listeners) · Vite.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in as **Admin** with the temporary password
**`12345a`**. You will be required to set a new password immediately.

Without Firebase configuration the app runs in **local mode**: data is stored in
the browser and synchronised across tabs (useful for evaluation only).

## Enabling Firestore real-time sync

1. Create a Firebase project and a Firestore database.
2. In **Authentication → Sign-in method** enable the **Anonymous** provider
   (used for the transport session the security rules require).
3. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.
4. Deploy the security rules and indexes:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

On first start against an empty project the local bootstrap admin is seeded into
the `users` collection.

### Firestore collections

| Collection | Document id | Purpose |
|---|---|---|
| `users` | user id | Directory, role, PBKDF2 hash/salt, `forcePasswordChange`, lockout state |
| `duty_schedules` | `YYYY-MM-DD` | `{ morning: [], evening: [], night: [] }` user ids per shift |
| `shift_reports` | `YYYY-MM-DD_<shift>` | Shift report with event stack; immutable once `status = finalized` |
| `audit_logs` | uuid | Append-only audit trail entries with SHA-256 hash |
| `app_settings` | `global` | Platform name, language, role permissions, nav order |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | TypeScript type-check |

## Audit & compliance

See [`docs/SOC_AUDIT_READINESS.md`](docs/SOC_AUDIT_READINESS.md) for the control
mapping, evidence sources, operating procedures and known limitations.
