# Deploying G-Eyes SR (cloud mode)

## 1. Prerequisites

- A Firebase project on the **Blaze** plan. Cloud Functions and Cloud Scheduler require it.
- Node.js 22, Java 21 (emulators only), and the Firebase CLI (installed as a dev dependency: `npx firebase`).
- `gcloud`, authenticated as a project owner, for the MFA and logging steps.

## 2. Firebase configuration

1. **Firestore:** create the database in Native mode.
2. **Authentication:** enable the **Email/Password** provider. Disable *Email enumeration protection*'s user-facing sign-up; accounts are created only by the `provisionUser` function.
3. **Upgrade to Identity Platform.** In the console go to *Authentication → Settings → Upgrade*. TOTP MFA requires it.
4. **Enable TOTP MFA:**

   ```bash
   PROJECT_ID=your-project
   ```

   ```bash
   curl -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/config?updateMask=mfa" \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "X-Goog-User-Project: $PROJECT_ID" -H "Content-Type: application/json" \
     -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":1}}]}}'
   ```

5. **Web app config:** register a web app and copy its config into `.env.local`. Use `.env.example` as the template.

## 3. Deploy rules, indexes, functions and hosting

```bash
npm ci && npm ci --prefix functions
```

```bash
npx firebase use your-project
```

```bash
npm run deploy
```

`npm run deploy` builds the web app and the functions bundle, then deploys hosting, `firestore.rules`, `firestore.indexes.json` and these functions:

| Function | Purpose |
|---|---|
| `provisionUser`, `updateUserAccount`, `resetUserPassword`, `resetUserMfa`, `deleteUserAccount` | Administrator-only identity management. Sets custom-claim roles and requires a second factor. |
| `changePassword` | Self-service rotation. Requires re-authentication within 5 minutes and enforces the password policy. |
| `recordLoginFailure` | Records failed sign-ins in the audit trail, rate-limited. |
| `finalizeShiftReport` | Server-side sealing: server time, verified identity, SHA-256. |
| `onAuditLogCreated` | Audit sink. Re-verifies each entry's hash, logs it to Cloud Logging, and raises `audit_integrity_alerts` on mismatch. |
| `runScheduledReports` | Runs every 15 minutes. Executes due report schedules, archives the output and queues e-mail. |

## 4. Bootstrap the first administrator

```bash
npm --prefix functions run build
```

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json GCLOUD_PROJECT=your-project \
  node functions/lib/bootstrap.js admin soc-admin@your-company.com
```

The account receives the temporary password `12345a`. At first sign-in the administrator enrols an authenticator and then sets a new password. The script refuses to run once an administrator exists.

## 5. E-mail delivery for scheduled reports

Install the *Trigger Email from Firestore* extension and point it at the `mail` collection:

```bash
npx firebase ext:install firebase/firestore-send-email --project your-project
```

When prompted, set *Email documents collection* to `mail` and supply your SMTP connection URI.

## 6. DFIR-IRIS integration (optional)

1. Store the API key of a dedicated IRIS service user as a secret:

   ```bash
   npx firebase functions:secrets:set IRIS_API_KEY
   ```

2. Add `IRIS_URL=https://iris.example.com` to `functions/.env`.
3. Redeploy the functions.
4. Configure the sync scope in **Integrations**.

[`IRIS_INTEGRATION.md`](IRIS_INTEGRATION.md) covers the mapping, the conflict rules and the first-run checks.

## 7. Write-once (WORM) audit retention

The audit sink writes every verified entry to Cloud Logging with `jsonPayload.geyesAudit=true`. Route those entries to a retention-locked bucket.

1. Create the bucket with a retention period (about 7 years in this example):

   ```bash
   gcloud storage buckets create gs://$PROJECT_ID-geyes-audit --location=EU --retention-period=2557d
   ```

2. Create the log sink:

   ```bash
   gcloud logging sinks create geyes-audit-worm storage.googleapis.com/$PROJECT_ID-geyes-audit \
     --log-filter='jsonPayload.geyesAudit=true'
   ```

3. Grant the sink's writer identity `roles/storage.objectCreator` on the bucket. The identity is printed by the previous command.

4. Lock the retention policy:

   ```bash
   gcloud storage buckets update gs://$PROJECT_ID-geyes-audit --lock-retention-period
   ```

**Locking is irreversible.** Agree the retention period with your compliance owner before you run the last command.

## 8. Post-deployment checklist

- [ ] The administrator can sign in, is asked for a TOTP code, and the Settings → SOC Policy MFA requirement is on.
- [ ] Provision an analyst. The temporary password works once, and a password change is forced.
- [ ] Finalize a test report, then run *Verify integrity*. The audit trail shows `SHIFT_REPORT_FINALIZED` with `sealedBy: server`.
- [ ] Editing the finalized report directly in the console from a client identity is rejected by the rules.
- [ ] Use *Run now* on a schedule. An archive entry appears, and an e-mail arrives if recipients are set.
- [ ] Cloud Logging shows `audit …` entries, and the sink delivers them to the locked bucket.
- [ ] If IRIS is enabled: **Test connection** reports the IRIS version. A first **Sync now** against a test IRIS instance completes without errors, and the pushed case appears in IRIS with the SOC id `GEYES-<n>`.
