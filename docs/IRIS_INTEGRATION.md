# DFIR-IRIS integration

G-Eyes SR synchronises investigations with [DFIR-IRIS](https://dfir-iris.org) in both directions. It targets the **IRIS v2.4 REST API**.

## What is synchronised

| G-Eyes SR | DFIR-IRIS | Direction |
|---|---|---|
| Case: name, description, severity, state, outcome, classification, tags, customer | Case | both |
| Timeline events, with linked assets and IOCs | Case timeline | both |
| IOCs: type, value, TLP, description, tags | Case IOCs | both |
| Assets: type, IP, domain, compromise and analysis status | Case assets | both |
| Evidence metadata: file name, size, SHA-256, type | Case evidences | both |
| Notes, grouped in directories | Case notes and directories | both |
| Tasks: title, description, status, tags | Case tasks | both |
| Alerts: IOCs, assets, severity, status, resolution | Alerts | both |
| Customers | Customers | both; matched by name |

**Not synchronised:**

- User assignment (owners, assignees). IRIS and G-Eyes accounts are separate.
- Evidence file contents. Only the metadata and SHA-256 hash are synchronised.
- IRIS modules and enrichment.
- The G-Eyes chain-of-custody log. It stays in G-Eyes.

## How a sync run works

1. **Lookups.** Severities, case states, IOC types, TLP levels, asset types, classifications, alert and task statuses, event categories, analysis statuses and evidence types are read from your IRIS server. G-Eyes matches values by name, ignoring case and punctuation, so custom IRIS lookups keep working. Case outcome and asset compromise status are fixed IRIS enumerations.
2. **Customers.** Each local customer is matched to an IRIS customer by name. A missing customer is created on the side that lacks it.
3. **Deletions.** Deleting an IRIS-linked object in G-Eyes leaves a tombstone record. The next sync deletes the object in IRIS, then removes the tombstone.
4. **Push.** New records are created in IRIS. An existing record is updated only when the hash of its mapped content has changed since the last push, so unchanged records cost no API writes.
5. **Pull.** Each remote record is mapped back to G-Eyes fields:
   - If its remote snapshot changed since the last sync, the change is applied locally. **IRIS wins** when both sides changed, and the change is written to the case activity feed.
   - Records created in IRIS are imported, if *import* is enabled.
   - Records deleted in IRIS are removed locally.
6. **Echo suppression.** After a pull is applied, G-Eyes stores the new content hash. The record is therefore not pushed straight back to IRIS.

Each pushed case gets the SOC id `GEYES-<case number>`. The importer uses this id to recognise cases G-Eyes created, and never imports them back as new cases.

## Setup

### Cloud mode (production)

The API key is held only by Cloud Functions, in Secret Manager, and is never sent to browsers.

1. In IRIS, create a dedicated service user with access to the relevant customers. Copy its API key from **My settings**.
2. Store the API key as a secret:

   ```bash
   npx firebase functions:secrets:set IRIS_API_KEY
   ```

3. Add the IRIS URL to the functions environment:

   ```bash
   echo "IRIS_URL=https://iris.example.com" >> functions/.env
   ```

4. Deploy:

   ```bash
   npm run deploy
   ```

5. In G-Eyes, go to **Administration → Integrations**. Select **Test connection**, set the sync scope and the automatic interval, then select **Sync now**.

The following functions are added:

| Function | Purpose |
|---|---|
| `irisStatus` | Connection state and last run. Admins only. |
| `irisTestConnection` | Checks the connection. Admins only. |
| `irisSaveOptions` | Saves the sync scope and interval. Admins only. |
| `irisSyncNow` | Runs a sync. Available to all analysts, so they can sync one case. |
| `irisScheduledSync` | Runs every 5 minutes and follows the configured interval. A lease lock stops two runs from overlapping. |

### Local mode (evaluation)

1. Go to **Integrations**, enter the IRIS URL and API key, then select **Save settings** and **Test connection**.
2. The browser calls IRIS directly, so IRIS must allow the G-Eyes origin with CORS. Alternatively, reach IRIS through a reverse proxy that adds CORS headers.
3. The key is stored only in that browser's local storage.

## Audit

Configuration changes are recorded as `IRIS_CONFIG_CHANGED`. The API key is never logged. Each run is recorded as `IRIS_SYNC`, with push and pull counts and the error count. Changes applied from IRIS appear in each case's activity feed as *Updated from IRIS* or *Imported from IRIS*.

## Adapting to your IRIS version

Every endpoint path is defined in one place: `IRIS_ENDPOINTS` in `lib/iris/client.ts`. Field mapping is in `lib/iris/sync.ts`, with one adapter for each object kind.

## Verification status

**Tested:** the connector passes contract tests against an in-memory mock of the IRIS v2.x API (`tests/iris/mockIris.ts`). The mock is built from the documented request and response formats: the response envelope, Bearer key authentication, lookup tables and per-case `?cid=` endpoints. The tests cover:

- pushing every object kind, including linked ids;
- idempotency (a second run changes nothing);
- local edits, and remote-wins updates without an echo back;
- imports from IRIS;
- deletions in both directions.

A browser end-to-end test runs the same flow through the Integrations page.

**Not yet tested against a live IRIS server.** Before enabling automatic sync:

1. Run **Sync now** once against a test IRIS instance.
2. Check the result counts and any errors on the Integrations page.
3. If your IRIS build uses different paths or field names, adjust `IRIS_ENDPOINTS` and the adapters to match.
