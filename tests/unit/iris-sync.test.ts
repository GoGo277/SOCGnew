import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockIris, MockIris } from '../iris/mockIris';
import { IrisClient, IrisError } from '../../lib/iris/client';
import { runIrisSync, SyncStore, SyncOptions } from '../../lib/iris/sync';
import { buildTable, fromIrisDate, idOf, toIrisDate } from '../../lib/iris/mapping';
import { COL } from '../../lib/collections';

/** In-memory store standing in for the browser store / Firestore. */
const memoryStore = () => {
  const cols = new Map<string, Map<string, any>>();
  const seq: Record<string, number> = {};
  const col = (n: string) => { if (!cols.has(n)) cols.set(n, new Map()); return cols.get(n)!; };
  const store: SyncStore & { get: (c: string, id: string) => any; all: (c: string) => any[] } = {
    list: async (c) => [...col(c).values()].map(x => structuredClone(x)),
    set: async (c, d) => { col(c).set(d.id, structuredClone(d)); },
    remove: async (c, id) => { col(c).delete(id); },
    nextSequence: async (n) => (seq[n] = (seq[n] ?? 0) + 1),
    get: (c, id) => col(c).get(id),
    all: (c) => [...col(c).values()],
  };
  return store;
};

const T = '2026-11-05T09:00:00.000Z';
const base = { createdAt: T, createdBy: 'alice', updatedAt: T, updatedBy: 'alice' };
let iris: MockIris;
let client: IrisClient;
const opts: SyncOptions = { pushCases: true, pushAlerts: true, importRemote: true, actor: 'alice' };

beforeAll(async () => { iris = await startMockIris(); client = new IrisClient({ baseUrl: iris.url, apiKey: iris.apiKey }); });
afterAll(() => iris.close());

const seed = async (store: ReturnType<typeof memoryStore>) => {
  await store.set(COL.customers, { id: 'internal', name: 'Internal SOC', description: '', contacts: '', createdAt: T, createdBy: 'system' });
  await store.set(COL.cases, { id: 'c1', number: 1, name: 'Ransomware on FS01', description: 'Beaconing then encryption', customerId: 'internal', state: 'Containment', severity: 'Critical', classification: 'malicious-code:ransomware', outcome: 'Unknown', tags: ['ransomware'], openedAt: T, openedBy: 'alice', updatedAt: T, updatedBy: 'alice', sourceAlertIds: [], iris: { origin: 'geyes' } });
  await store.set(COL.assets, { id: 'a1', caseId: 'c1', name: 'FS01', type: 'Windows - Server', ip: '10.0.1.20', domain: '', description: '', compromiseStatus: 'Compromised', analysisStatus: 'Started', tags: [], ...base });
  await store.set(COL.iocs, { id: 'i1', caseId: 'c1', type: 'ip-src', value: '198.51.100.23', description: 'C2', tlp: 'TLP:AMBER', tags: ['c2'], ...base });
  await store.set(COL.timeline, { id: 't1', caseId: 'c1', title: 'First beacon', date: T, category: 'Command and Control', content: '', raw: '', source: 'EDR', assetIds: ['a1'], iocIds: ['i1'], inSummary: true, tags: [], ...base });
  await store.set(COL.tasks, { id: 'k1', caseId: 'c1', title: 'Isolate FS01', description: '', status: 'In progress', assigneeIds: [], tags: [], ...base });
  await store.set(COL.notes, { id: 'n1', caseId: 'c1', directory: 'Investigation', title: 'Ransom note', content: '## Note', ...base });
  await store.set(COL.evidence, { id: 'e1', caseId: 'c1', filename: 'mem.raw', size: 18, sha256: 'a'.repeat(64), type: 'Memory dump', description: '', custody: [{ at: T, by: 'alice', action: 'Registered' }], ...base });
  await store.set(COL.alerts, { id: 'al1', number: 1, title: 'Beacon detected', description: 'x', severity: 'High', status: 'New', source: 'G-Eyes SR shift report', sourceRef: 'r/e', eventTime: T, customerId: 'internal', classification: 'other:other', tags: [], iocs: [{ type: 'ip-src', value: '198.51.100.23', description: '', tlp: 'TLP:AMBER' }], assets: [], note: '', ...base, iris: { origin: 'geyes' } });
};

describe('IRIS mapping', () => {
  it('resolves lookup ids by name, case- and punctuation-insensitively', () => {
    const t = buildTable([{ state_id: 6, state_name: 'Post-Incident' }, { state_id: 1, state_name: 'Open' }]);
    expect(idOf(t, 'Post-incident')).toBe(6);
    expect(idOf(t, 'unknown', 'Open')).toBe(1);
  });
  it('round-trips IRIS event dates as UTC', () => {
    expect(fromIrisDate(toIrisDate(T), '+00:00')).toBe(T);
    expect(fromIrisDate('2026-11-05T11:00:00.000', '+02:00')).toBe(T);
  });
  it('reports an unauthorised API key clearly', async () => {
    const bad = new IrisClient({ baseUrl: iris.url, apiKey: 'wrong' });
    await expect(bad.ping()).rejects.toThrow(IrisError);
    await expect(bad.ping()).rejects.toThrow(/API key/);
  });
});

describe('two-way sync', () => {
  const store = memoryStore();

  it('pushes a case with every object kind, linking ids', async () => {
    await seed(store);
    const r = await runIrisSync(client, store, opts);
    expect(r.errors).toEqual([]);
    expect(r.irisVersion).toBe('v2.4.20');
    const local = store.get(COL.cases, 'c1');
    const remote = iris.state.cases.find(c => c.case_id === local.iris.remoteId)!;
    expect(remote.case_soc_id).toBe('GEYES-1');
    expect(remote.severity_id).toBe(6); // Critical
    expect(remote.state_id).toBe(3);    // Containment
    expect(iris.state.objects.ioc).toHaveLength(1);
    expect(iris.state.objects.assets[0].asset_compromise_status_id).toBe(1);
    const ev = iris.state.objects.timeline[0];
    expect(ev.event_assets).toEqual([store.get(COL.assets, 'a1').iris.remoteId]);
    expect(ev.event_iocs).toEqual([store.get(COL.iocs, 'i1').iris.remoteId]);
    expect(iris.state.directories.map(d => d.name)).toEqual(['Investigation']);
    expect(iris.state.objects.evidences[0].file_hash).toBe('a'.repeat(64));
    expect(iris.state.alerts[0].alert_iocs[0].ioc_value).toBe('198.51.100.23');
    expect(r.pushed).toMatchObject({ cases: 1, alerts: 1, objects: 6 });
  });

  it('is idempotent: a second run pushes and imports nothing', async () => {
    const before = { ioc: iris.state.objects.ioc.length, cases: iris.state.cases.length, alerts: iris.state.alerts.length };
    const r = await runIrisSync(client, store, opts);
    expect(r.errors).toEqual([]);
    expect(r.pushed).toEqual({ cases: 0, alerts: 0, objects: 0, deleted: 0 });
    expect(r.pulled).toEqual({ cases: 0, alerts: 0, objects: 0, updated: 0, removed: 0 });
    expect({ ioc: iris.state.objects.ioc.length, cases: iris.state.cases.length, alerts: iris.state.alerts.length }).toEqual(before);
  });

  it('pushes local edits', async () => {
    await store.set(COL.tasks, { ...store.get(COL.tasks, 'k1'), status: 'Done' });
    const r = await runIrisSync(client, store, opts);
    expect(r.pushed.objects).toBe(1);
    expect(iris.state.objects.tasks[0].task_status_id).toBe(4);
  });

  it('applies changes made in IRIS (remote wins) and logs them', async () => {
    const rc = iris.state.cases[0];
    rc.state_id = 5; // Recovery
    iris.state.objects.tasks[0].task_status_id = 3; // On hold
    iris.state.alerts[0].alert_status_id = 8; // Escalated
    const r = await runIrisSync(client, store, opts);
    expect(r.errors).toEqual([]);
    expect(store.get(COL.cases, 'c1').state).toBe('Recovery');
    expect(store.get(COL.tasks, 'k1').status).toBe('On hold');
    expect(store.get(COL.alerts, 'al1').status).toBe('Escalated');
    expect(store.all(COL.caseActivity).some(a => a.action === 'Updated from IRIS')).toBe(true);
    const again = await runIrisSync(client, store, opts); // no echo back to IRIS
    expect(again.pushed).toEqual({ cases: 0, alerts: 0, objects: 0, deleted: 0 });
  });

  it('imports objects created in IRIS and removes ones deleted there', async () => {
    const cid = store.get(COL.cases, 'c1').iris.remoteId;
    iris.state.objects.ioc.push({ ioc_id: 9001, case_id: cid, ioc_value: 'evil.example', ioc_type_id: 3, ioc_tlp_id: 1, ioc_description: 'Added in IRIS', ioc_tags: 'dns' });
    const evRid = store.get(COL.evidence, 'e1').iris.remoteId;
    iris.state.objects.evidences.splice(iris.state.objects.evidences.findIndex(e => e.id === evRid), 1);
    const r = await runIrisSync(client, store, opts);
    const imported = store.get(COL.iocs, 'iris-iocs-9001');
    expect(imported).toMatchObject({ value: 'evil.example', type: 'domain', tlp: 'TLP:RED', tags: ['dns'], caseId: 'c1' });
    expect(store.get(COL.evidence, 'e1')).toBeUndefined();
    expect(r.pulled.objects).toBe(1);
    expect(r.pulled.removed).toBe(1);
  });

  it('replays local deletions in IRIS via tombstones', async () => {
    const rid = store.get(COL.iocs, 'i1').iris.remoteId;
    await store.remove(COL.iocs, 'i1');
    await store.set(COL.irisTombstones, { id: `iocs-${rid}`, kind: 'iocs', caseRemoteId: store.get(COL.cases, 'c1').iris.remoteId, remoteId: rid, createdAt: T });
    const r = await runIrisSync(client, store, opts);
    expect(r.pushed.deleted).toBe(1);
    expect(iris.state.objects.ioc.some(i => i.ioc_id === rid)).toBe(false);
    expect(store.all(COL.irisTombstones)).toHaveLength(0);
  });

  it('imports cases and alerts created directly in IRIS', async () => {
    iris.state.cases.push({ case_id: 7001, case_name: '#7001 - Phishing wave', case_description: 'From IRIS', case_soc_id: '', case_customer: 1, state_id: 2, severity_id: 5, status_id: 0, classification_id: 4, open_date: '2026-11-04', close_date: null, case_tags: 'phishing' });
    iris.state.objects.tasks.push({ task_id: 7002, case_id: 7001, task_title: 'Purge emails', task_description: '', task_status_id: 1, task_tags: '' });
    iris.state.alerts.push({ alert_id: 7003, alert_title: 'Suspicious login', alert_description: '', alert_severity_id: 4, alert_status_id: 2, alert_source: 'Okta', alert_customer_id: 1, alert_tags: '', iocs: [], assets: [], cases: [] });
    const r = await runIrisSync(client, store, opts);
    expect(r.errors).toEqual([]);
    const c = store.get(COL.cases, 'iris-case-7001');
    expect(c).toMatchObject({ name: 'Phishing wave', state: 'In progress', severity: 'High', classification: 'fraud:phishing', tags: ['phishing'] });
    expect(store.get(COL.customers, 'iris-customer-1').name).toBe('IrisInitialClient');
    expect(store.get(COL.tasks, 'iris-tasks-7002').title).toBe('Purge emails');
    expect(store.get(COL.alerts, 'iris-alert-7003')).toMatchObject({ title: 'Suspicious login', severity: 'Low', status: 'New', source: 'Okta' });
    expect(r.pulled.cases).toBe(1);
  });

  it('never imports its own pushed cases back', async () => {
    const r = await runIrisSync(client, store, opts);
    expect(r.pulled.cases).toBe(0);
    expect(store.all(COL.cases).filter(c => c.iris?.remoteId === store.get(COL.cases, 'c1').iris.remoteId)).toHaveLength(1);
  });
});
