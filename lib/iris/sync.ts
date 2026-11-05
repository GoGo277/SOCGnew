import {
  Alert, AlertStatus, CaseAsset, CaseEvidence, CaseIoc, CaseNote, CaseObjectKind, CaseTask, CaseTimelineEvent, Customer, DfirCase,
  IrisLink, Severity,
} from '../../types';
import { canonicalJson, sha256 } from '../crypto';
import { COL } from '../collections';
import { IrisClient, IRIS_ENDPOINTS, IrisError } from './client';
import {
  COMPROMISE_TO_IRIS, Lookups, OUTCOME_TO_IRIS, compromiseFromIris, fetchLookups, fromIrisDate, idOf, nameOf, norm, outcomeFromIris,
  tlpFromIris, tlpToIris, toIrisDate,
} from './mapping';

/**
 * Two-way synchronisation between G-Eyes SR and DFIR-IRIS.
 *
 * Each cycle, per linked record:
 *   1. push   — local records that are new or whose mapped payload changed since
 *               the last push (hash compare); tombstoned deletions are replayed.
 *   2. pull   — remote records are mapped back; when the remote snapshot changed
 *               since the last sync it is applied locally ("remote wins"), new
 *               remote records are imported, records deleted in IRIS are removed.
 * The engine is storage-agnostic (browser local store or Firestore Admin).
 */

export interface SyncStore {
  list<T>(col: string): Promise<T[]>;
  set(col: string, doc: { id: string } & Record<string, any>): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  nextSequence(name: 'case' | 'alert'): Promise<number>;
}

export interface SyncOptions {
  pushCases: boolean;
  pushAlerts: boolean;
  importRemote: boolean;
  /** Restrict to these local case ids (manual "sync this case"). */
  caseIds?: string[];
  actor: string;
  now?: () => string;
}

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  irisVersion?: string;
  pushed: { cases: number; alerts: number; objects: number; deleted: number };
  pulled: { cases: number; alerts: number; objects: number; updated: number; removed: number };
  errors: string[];
}

const hash = (v: unknown) => sha256(canonicalJson(v));
const csv = (tags: string[]) => tags.join(',');
const fromCsv = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(',')).map(s => s.trim()).filter(Boolean);
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const firstId = (r: any, keys: string[]) => { for (const k of keys) if (r?.[k] !== undefined && r[k] !== null) return Number(r[k]); return undefined; };
const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
const severityFromIris = (name?: string): Severity => SEVERITIES.find(s => norm(s) === norm(name ?? '')) ?? (norm(name ?? '') === 'critical' ? 'Critical' : 'Low');

interface Ctx {
  lookups: Lookups;
  cid: number;
  localCase: DfirCase;
  assetRemote: Map<string, number>; // local asset id -> remote id
  iocRemote: Map<string, number>;
  directories: Map<string, number>; // note directory name -> remote id
}

interface KindAdapter<L> {
  col: string;
  idKeys: string[];
  toIris(o: L, ctx: Ctx): Record<string, any>;
  fromIris(r: any, ctx: Ctx): Partial<L>;
  label(o: Partial<L>): string;
}

const ADAPTERS: { [K in CaseObjectKind]: KindAdapter<any> } = {
  iocs: {
    col: COL.iocs, idKeys: ['ioc_id', 'id'],
    toIris: (o: CaseIoc, c) => ({ ioc_value: o.value, ioc_type_id: idOf(c.lookups.iocTypes, o.type, 'other'), ioc_tlp_id: idOf(c.lookups.tlp, tlpToIris(o.tlp), 'amber'), ioc_description: o.description, ioc_tags: csv(o.tags) }),
    fromIris: (r, c) => ({ value: String(r.ioc_value ?? ''), type: (nameOf(c.lookups.iocTypes, r.ioc_type_id) ?? r.ioc_type ?? 'other') as any, tlp: tlpFromIris(nameOf(c.lookups.tlp, r.ioc_tlp_id) ?? r.tlp_name), description: r.ioc_description ?? '', tags: fromCsv(r.ioc_tags) }),
    label: o => o.value ?? '',
  },
  assets: {
    col: COL.assets, idKeys: ['asset_id', 'id'],
    toIris: (o: CaseAsset, c) => ({ asset_name: o.name, asset_type_id: idOf(c.lookups.assetTypes, o.type, 'Other'), asset_ip: o.ip, asset_domain: o.domain, asset_description: o.description, analysis_status_id: idOf(c.lookups.analysisStatus, o.analysisStatus, 'Unspecified'), asset_compromise_status_id: COMPROMISE_TO_IRIS[o.compromiseStatus] ?? 0, asset_tags: csv(o.tags) }),
    fromIris: (r, c) => ({ name: String(r.asset_name ?? ''), type: nameOf(c.lookups.assetTypes, r.asset_type_id) ?? r.asset_type ?? 'Other', ip: r.asset_ip ?? '', domain: r.asset_domain ?? '', description: r.asset_description ?? '', analysisStatus: (nameOf(c.lookups.analysisStatus, r.analysis_status_id) ?? 'Unspecified') as any, compromiseStatus: compromiseFromIris(r.asset_compromise_status_id), tags: fromCsv(r.asset_tags) }),
    label: o => o.name ?? '',
  },
  timeline: {
    col: COL.timeline, idKeys: ['event_id', 'id'],
    toIris: (o: CaseTimelineEvent, c) => ({
      event_title: o.title, event_date: toIrisDate(o.date), event_tz: '+00:00', event_category_id: idOf(c.lookups.eventCategories, o.category, 'Unspecified'),
      event_content: o.content, event_raw: o.raw, event_source: o.source, event_tags: csv(o.tags), event_in_summary: o.inSummary, event_in_graph: true,
      event_assets: o.assetIds.map(id => c.assetRemote.get(id)).filter((x): x is number => x !== undefined),
      event_iocs: o.iocIds.map(id => c.iocRemote.get(id)).filter((x): x is number => x !== undefined),
    }),
    fromIris: (r, c) => {
      const toLocal = (ids: unknown, m: Map<string, number>) => {
        const list = (Array.isArray(ids) ? ids : []).map((x: any) => Number(typeof x === 'object' ? (x.asset_id ?? x.ioc_id ?? x.id) : x));
        return Array.from(m.entries()).filter(([, rid]) => list.includes(rid)).map(([lid]) => lid).sort();
      };
      return {
        title: String(r.event_title ?? ''), date: fromIrisDate(r.event_date, r.event_tz), category: nameOf(c.lookups.eventCategories, r.event_category_id) ?? r.category_name ?? 'Unspecified',
        content: r.event_content ?? '', raw: r.event_raw ?? '', source: r.event_source ?? '', tags: fromCsv(r.event_tags), inSummary: !!r.event_in_summary,
        assetIds: toLocal(r.event_assets ?? r.assets, c.assetRemote), iocIds: toLocal(r.event_iocs ?? r.iocs, c.iocRemote),
      };
    },
    label: o => o.title ?? '',
  },
  tasks: {
    col: COL.tasks, idKeys: ['task_id', 'id'],
    toIris: (o: CaseTask, c) => ({ task_title: o.title, task_description: o.description, task_status_id: idOf(c.lookups.taskStatus, o.status, 'To do'), task_tags: csv(o.tags), task_assignees_id: [] }),
    fromIris: (r, c) => ({ title: String(r.task_title ?? ''), description: r.task_description ?? '', status: (nameOf(c.lookups.taskStatus, r.task_status_id) ?? r.status_name ?? 'To do') as any, tags: fromCsv(r.task_tags) }),
    label: o => o.title ?? '',
  },
  evidence: {
    col: COL.evidence, idKeys: ['id', 'evidence_id'],
    toIris: (o: CaseEvidence, c) => ({ filename: o.filename, file_size: o.size, file_hash: o.sha256, file_description: o.description, type_id: idOf(c.lookups.evidenceTypes, o.type, 'Other') }),
    fromIris: (r, c) => ({ filename: String(r.filename ?? ''), size: Number(r.file_size ?? 0), sha256: String(r.file_hash ?? '').toLowerCase(), description: r.file_description ?? '', type: nameOf(c.lookups.evidenceTypes, r.type_id) ?? 'Other' }),
    label: o => o.filename ?? '',
  },
  notes: {
    col: COL.notes, idKeys: ['note_id', 'id'],
    toIris: (o: CaseNote, c) => ({ note_title: o.title, note_content: o.content, directory_id: c.directories.get(o.directory) }),
    fromIris: (r, c) => ({ title: String(r.note_title ?? r.title ?? ''), content: r.note_content ?? r.content ?? '', directory: Array.from(c.directories.entries()).find(([, id]) => id === Number(r.directory_id))?.[0] ?? 'IRIS' }),
    label: o => o.title ?? '',
  },
};

const KIND_ORDER: CaseObjectKind[] = ['assets', 'iocs', 'timeline', 'tasks', 'evidence', 'notes'];

export class IrisSync {
  private result!: SyncResult;
  private lookups!: Lookups;
  private now: () => string;

  constructor(private client: IrisClient, private store: SyncStore, private opts: SyncOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  private err(where: string, e: unknown) {
    const msg = `${where}: ${e instanceof Error ? e.message : String(e)}`;
    this.result.errors.push(msg);
  }

  private async activity(caseId: string, action: string, detail: string) {
    await this.store.set(COL.caseActivity, { id: `iris-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, caseId, at: this.now(), by: `${this.opts.actor} (IRIS sync)`, action, detail });
  }

  async run(): Promise<SyncResult> {
    this.result = { startedAt: this.now(), finishedAt: '', pushed: { cases: 0, alerts: 0, objects: 0, deleted: 0 }, pulled: { cases: 0, alerts: 0, objects: 0, updated: 0, removed: 0 }, errors: [] };
    await this.client.ping();
    this.result.irisVersion = (await this.client.versions()).iris_current;
    this.lookups = await fetchLookups(this.client);
    const customers = await this.syncCustomers();
    await this.replayTombstones();
    if (this.opts.importRemote && !this.opts.caseIds) await this.importRemoteCases(customers);
    const cases = (await this.store.list<DfirCase>(COL.cases)).filter(c => (this.opts.caseIds ? this.opts.caseIds.includes(c.id) : true));
    for (const c of cases) {
      if (!c.iris?.remoteId && !this.opts.pushCases) continue;
      try { await this.syncCase(c, customers); } catch (e) { this.err(`Case #${c.number}`, e); await this.store.set(COL.cases, { ...c, iris: { ...c.iris, error: (e as Error).message } }); }
    }
    if (!this.opts.caseIds) {
      try { await this.syncAlerts(customers); } catch (e) { this.err('Alerts', e); }
    }
    this.result.finishedAt = this.now();
    return this.result;
  }

  // ---- customers -----------------------------------------------------------
  private async syncCustomers(): Promise<Map<string, number>> {
    const remote: any[] = await this.client.get(IRIS_ENDPOINTS.customers.list).catch(() => []);
    const remoteByName = new Map(remote.map(r => [norm(String(r.customer_name ?? r.name ?? '')), Number(r.customer_id ?? r.id)]));
    const local = await this.store.list<Customer>(COL.customers);
    const map = new Map<string, number>(); // local id -> remote id
    for (const cust of local) {
      const rid = cust.iris?.remoteId ?? remoteByName.get(norm(cust.name));
      if (rid !== undefined) map.set(cust.id, rid);
    }
    (this as any).remoteCustomers = remote;
    (this as any).remoteByName = remoteByName;
    return map;
  }

  /** Remote customer id for a local customer; creates it in IRIS when missing. */
  private async remoteCustomer(localId: string, map: Map<string, number>): Promise<number> {
    const known = map.get(localId);
    if (known !== undefined) return known;
    const cust = (await this.store.list<Customer>(COL.customers)).find(x => x.id === localId);
    const name = cust?.name ?? 'Internal SOC';
    const existing = ((this as any).remoteByName as Map<string, number>).get(norm(name));
    let rid = existing;
    if (rid === undefined) {
      const res = await this.client.post(IRIS_ENDPOINTS.customers.add, { customer_name: name, customer_description: cust?.description ?? '', customer_sla: '' });
      rid = Number(res?.customer_id ?? res?.id);
    }
    map.set(localId, rid!);
    if (cust) await this.store.set(COL.customers, { ...cust, iris: { ...cust.iris, remoteId: rid, syncedAt: this.now() } });
    return rid!;
  }

  /** Local customer id for a remote customer; creates the local customer when missing. */
  private async localCustomer(remoteId: unknown, map: Map<string, number>): Promise<string> {
    const rid = Number(remoteId);
    const found = Array.from(map.entries()).find(([, r]) => r === rid);
    if (found) return found[0];
    const remote = ((this as any).remoteCustomers as any[]).find(r => Number(r.customer_id ?? r.id) === rid);
    const cust: Customer = { id: `iris-customer-${rid}`, name: remote?.customer_name ?? `IRIS customer ${rid}`, description: remote?.customer_description ?? '', contacts: '', createdAt: this.now(), createdBy: 'IRIS sync', iris: { remoteId: rid, origin: 'iris', syncedAt: this.now() } };
    await this.store.set(COL.customers, cust);
    map.set(cust.id, rid);
    return cust.id;
  }

  // ---- deletions -------------------------------------------------------------
  private async replayTombstones() {
    const stones = await this.store.list<{ id: string; kind: CaseObjectKind; caseRemoteId: number; remoteId: number }>(COL.irisTombstones);
    for (const s of stones) {
      try {
        await this.client.post(IRIS_ENDPOINTS.objects[s.kind].del(s.remoteId), {}, { cid: s.caseRemoteId });
        this.result.pushed.deleted++;
      } catch (e) {
        if (!(e instanceof IrisError && e.status === 404)) { this.err(`Delete ${s.kind} ${s.remoteId}`, e); continue; }
      }
      await this.store.remove(COL.irisTombstones, s.id);
    }
  }

  // ---- cases -----------------------------------------------------------------
  private casePayload(c: DfirCase, customerRid: number) {
    return {
      case_name: c.name, case_description: c.description || c.name, case_soc_id: c.socId ?? `GEYES-${c.number}`, case_customer: customerRid,
      classification_id: idOf(this.lookups.classifications, c.classification, 'other:other'),
      severity_id: idOf(this.lookups.severities, c.severity, 'Medium'), state_id: idOf(this.lookups.caseStates, c.state, 'Open'),
      status_id: OUTCOME_TO_IRIS[c.outcome] ?? 0, case_tags: csv(c.tags),
    };
  }

  private caseFromRemote(r: any): Partial<DfirCase> {
    const state = nameOf(this.lookups.caseStates, r.state_id) ?? r.state_name ?? 'Open';
    const knownState = ['Open', 'In progress', 'Containment', 'Eradication', 'Recovery', 'Post-incident', 'Reporting', 'Closed'].find(s => norm(s) === norm(state));
    return {
      name: String(r.case_name ?? r.name ?? '').replace(/^#\d+\s*-\s*/, ''),
      description: r.case_description ?? r.description ?? '',
      severity: severityFromIris(nameOf(this.lookups.severities, r.severity_id) ?? r.severity_name),
      state: (r.close_date && !knownState ? 'Closed' : knownState ?? 'Open') as DfirCase['state'],
      outcome: outcomeFromIris(r.status_id),
      classification: nameOf(this.lookups.classifications, r.classification_id) ?? r.classification ?? 'other:other',
      tags: fromCsv(r.case_tags),
    };
  }

  private async importRemoteCases(customers: Map<string, number>) {
    const remote: any[] = await this.client.get(IRIS_ENDPOINTS.cases.list).catch(e => { this.err('List IRIS cases', e); return []; });
    const local = await this.store.list<DfirCase>(COL.cases);
    const linked = new Set(local.map(c => c.iris?.remoteId).filter(Boolean));
    for (const r of remote) {
      const rid = Number(r.case_id ?? r.id);
      if (!rid || linked.has(rid)) continue;
      // Cases originally pushed by G-Eyes carry our SOC id: never import them back.
      if (String(r.case_soc_id ?? '').startsWith('GEYES-') && local.some(c => `GEYES-${c.number}` === r.case_soc_id)) continue;
      const detail = await this.client.get(IRIS_ENDPOINTS.cases.get(rid)).catch(() => r);
      const mapped = this.caseFromRemote(detail);
      const t = this.now();
      const c: DfirCase = {
        id: `iris-case-${rid}`, number: await this.store.nextSequence('case'), name: mapped.name || `IRIS case ${rid}`, description: mapped.description ?? '',
        customerId: await this.localCustomer(detail.case_customer ?? detail.client_id ?? detail.customer_id ?? r.client_id, customers),
        state: mapped.state!, severity: mapped.severity!, classification: mapped.classification!, outcome: mapped.outcome!, tags: mapped.tags ?? [],
        socId: detail.case_soc_id || undefined, openedAt: fromIrisDate(detail.open_date ?? r.open_date), openedBy: 'IRIS', updatedAt: t, updatedBy: 'IRIS sync',
        closedAt: detail.close_date ? fromIrisDate(detail.close_date) : undefined, sourceAlertIds: [],
        iris: { remoteId: rid, origin: 'iris', syncedAt: t, remoteVersion: await hash(mapped) },
      };
      await this.store.set(COL.cases, c);
      await this.activity(c.id, 'Imported from IRIS', `IRIS case #${rid}`);
      this.result.pulled.cases++;
    }
  }

  private async syncCase(c: DfirCase, customers: Map<string, number>) {
    const customerRid = await this.remoteCustomer(c.customerId, customers);
    const payload = this.casePayload(c, customerRid);
    const pHash = await hash(payload);
    let rid = c.iris?.remoteId;
    let pushed = false;
    if (!rid) {
      const res = await this.client.post(IRIS_ENDPOINTS.cases.add, { case_soc_id: payload.case_soc_id, case_customer: customerRid, case_name: payload.case_name, case_description: payload.case_description, classification_id: payload.classification_id });
      rid = firstId(res, ['case_id', 'id']);
      if (!rid) throw new IrisError('IRIS did not return a case id');
      await this.activity(c.id, 'Pushed to IRIS', `IRIS case #${rid}`);
      pushed = true;
    }
    if (pushed || c.iris?.pushedHash !== pHash) {
      if (c.iris?.remoteId || pushed) {
        await this.client.post(IRIS_ENDPOINTS.cases.update(rid), payload);
        if (c.state === 'Closed') await this.client.post(IRIS_ENDPOINTS.cases.close(rid), {}).catch(() => undefined);
      }
      this.result.pushed.cases++;
      pushed = true;
    }
    let local: DfirCase = { ...c, iris: { ...c.iris, remoteId: rid, pushedHash: pHash, syncedAt: this.now(), error: undefined } };

    // pull header
    const remote = await this.client.get(IRIS_ENDPOINTS.cases.get(rid));
    const mapped = this.caseFromRemote(remote);
    const rHash = await hash(mapped);
    if (!pushed && c.iris?.remoteVersion && c.iris.remoteVersion !== rHash) {
      const changes = (Object.keys(mapped) as (keyof DfirCase)[]).filter(k => JSON.stringify((c as any)[k]) !== JSON.stringify((mapped as any)[k]));
      local = { ...local, ...mapped, closedAt: mapped.state === 'Closed' ? (c.closedAt ?? this.now()) : undefined, updatedAt: this.now(), updatedBy: 'IRIS sync' };
      local.iris!.pushedHash = await hash(this.casePayload(local, customerRid));
      if (changes.length) { await this.activity(c.id, 'Updated from IRIS', changes.join(', ')); this.result.pulled.updated++; }
    }
    local.iris!.remoteVersion = rHash;
    await this.store.set(COL.cases, local);

    const ctx: Ctx = { lookups: this.lookups, cid: rid, localCase: local, assetRemote: new Map(), iocRemote: new Map(), directories: new Map() };
    await this.loadDirectories(ctx);
    for (const kind of KIND_ORDER) {
      try { await this.syncKind(kind, ctx); } catch (e) { this.err(`Case #${c.number} ${kind}`, e); }
    }
  }

  private async loadDirectories(ctx: Ctx) {
    const dirs: any[] = await this.client.get(IRIS_ENDPOINTS.objects.notes.list, { cid: ctx.cid }).catch(() => []);
    for (const d of Array.isArray(dirs) ? dirs : []) ctx.directories.set(String(d.name ?? d.directory_name), Number(d.id ?? d.directory_id));
    (ctx as any).remoteNotes = (Array.isArray(dirs) ? dirs : []).flatMap((d: any) => (d.notes ?? []).map((n: any) => ({ ...n, directory_id: d.id ?? d.directory_id })));
  }

  private async ensureDirectory(ctx: Ctx, name: string) {
    if (ctx.directories.has(name)) return;
    const res = await this.client.post(IRIS_ENDPOINTS.noteDirectories.add, { name }, { cid: ctx.cid });
    ctx.directories.set(name, Number(res?.id ?? res?.directory_id));
  }

  private async listRemote(kind: CaseObjectKind, ctx: Ctx): Promise<any[]> {
    if (kind === 'notes') {
      const notes = (ctx as any).remoteNotes as any[];
      const full: any[] = [];
      for (const n of notes) full.push({ ...(await this.client.get(IRIS_ENDPOINTS.objects.notes.get(Number(n.id ?? n.note_id)), { cid: ctx.cid }).catch(() => n)), directory_id: n.directory_id, note_id: n.id ?? n.note_id });
      return full;
    }
    const ep = IRIS_ENDPOINTS.objects[kind];
    const res = await this.client.get(ep.list, { cid: ctx.cid });
    return Array.isArray(res) ? res : Array.isArray(res?.[ep.listKey]) ? res[ep.listKey] : [];
  }

  private async syncKind(kind: CaseObjectKind, ctx: Ctx) {
    const a = ADAPTERS[kind];
    const all = await this.store.list<any>(a.col);
    const locals = all.filter(o => o.caseId === ctx.localCase.id);
    const pushedIds = new Set<string>();

    // push
    if (this.opts.pushCases || ctx.localCase.iris?.origin === 'iris') {
      for (const o of locals) {
        if (kind === 'notes') await this.ensureDirectory(ctx, o.directory);
        const payload = a.toIris(o, ctx);
        const h = await hash(payload);
        if (o.iris?.remoteId && o.iris.pushedHash === h) continue;
        let rid = o.iris?.remoteId as number | undefined;
        if (rid) await this.client.post(IRIS_ENDPOINTS.objects[kind].update(rid), payload, { cid: ctx.cid });
        else rid = firstId(await this.client.post(IRIS_ENDPOINTS.objects[kind].add, payload, { cid: ctx.cid }), a.idKeys);
        if (!rid) throw new IrisError(`IRIS did not return an id for ${kind}`);
        const linked = { ...o, iris: { ...o.iris, remoteId: rid, pushedHash: h, syncedAt: this.now(), origin: o.iris?.origin ?? 'geyes' } as IrisLink };
        await this.store.set(a.col, linked);
        Object.assign(o, linked);
        pushedIds.add(o.id);
        this.result.pushed.objects++;
      }
    }
    for (const o of locals) if (o.iris?.remoteId) (kind === 'assets' ? ctx.assetRemote : kind === 'iocs' ? ctx.iocRemote : new Map()).set(o.id, o.iris.remoteId);

    // pull
    const remote = await this.listRemote(kind, ctx);
    const remoteIds = new Set<number>();
    for (const r of remote) {
      const rid = firstId(r, a.idKeys);
      if (rid === undefined) continue;
      remoteIds.add(rid);
      const mapped = a.fromIris(r, ctx);
      const rHash = await hash(mapped);
      const local = locals.find(o => o.iris?.remoteId === rid);
      if (local) {
        if (pushedIds.has(local.id) || !local.iris?.remoteVersion || local.iris.remoteVersion === rHash) {
          if (local.iris?.remoteVersion !== rHash) await this.store.set(a.col, { ...local, iris: { ...local.iris, remoteVersion: rHash } });
          continue;
        }
        const next = { ...local, ...mapped, updatedAt: this.now(), updatedBy: 'IRIS sync' };
        next.iris = { ...local.iris, remoteVersion: rHash, pushedHash: await hash(a.toIris(next, ctx)), syncedAt: this.now() };
        await this.store.set(a.col, next);
        await this.activity(ctx.localCase.id, `Updated ${kind} from IRIS`, a.label(mapped));
        this.result.pulled.updated++;
      } else if (this.opts.importRemote || ctx.localCase.iris?.origin === 'iris') {
        if (kind === 'notes' && !Array.from(ctx.directories.values()).includes(Number(r.directory_id))) continue;
        const t = this.now();
        const base: any = { id: `iris-${kind}-${rid}`, caseId: ctx.localCase.id, createdAt: t, createdBy: 'IRIS', updatedAt: t, updatedBy: 'IRIS sync' };
        const defaults: Record<CaseObjectKind, any> = {
          iocs: { tags: [] }, assets: { tags: [] }, timeline: { assetIds: [], iocIds: [], tags: [] }, tasks: { assigneeIds: [], tags: [] },
          evidence: { custody: [{ at: t, by: 'IRIS sync', action: 'Imported from IRIS' }] }, notes: {},
        };
        const created = { ...defaults[kind], ...base, ...mapped };
        created.iris = { remoteId: rid, origin: 'iris', remoteVersion: rHash, pushedHash: await hash(a.toIris(created, ctx)), syncedAt: t } as IrisLink;
        await this.store.set(a.col, created);
        if (kind === 'assets') ctx.assetRemote.set(created.id, rid);
        if (kind === 'iocs') ctx.iocRemote.set(created.id, rid);
        await this.activity(ctx.localCase.id, `Imported ${kind} from IRIS`, a.label(mapped));
        this.result.pulled.objects++;
      }
    }
    // removed in IRIS
    for (const o of locals) {
      if (o.iris?.remoteId && !pushedIds.has(o.id) && !remoteIds.has(o.iris.remoteId)) {
        await this.store.remove(a.col, o.id);
        await this.activity(ctx.localCase.id, `Removed ${kind} (deleted in IRIS)`, a.label(o));
        this.result.pulled.removed++;
      }
    }
  }

  // ---- alerts ----------------------------------------------------------------
  private alertPayload(a: Alert, customerRid: number) {
    return {
      alert_title: a.title, alert_description: a.description || a.title, alert_source: a.source, alert_source_ref: a.sourceRef || a.id,
      alert_source_link: a.sourceLink ?? '', alert_source_event_time: toIrisDate(a.eventTime), alert_note: a.note,
      alert_severity_id: idOf(this.lookups.severities, a.severity, 'Medium'), alert_status_id: idOf(this.lookups.alertStatus, a.status, 'New'),
      alert_resolution_status_id: a.resolution ? idOf(this.lookups.alertResolutions, a.resolution) : undefined,
      alert_customer_id: customerRid, alert_classification_id: idOf(this.lookups.classifications, a.classification, 'other:other'), alert_tags: csv(a.tags),
      alert_iocs: a.iocs.map(i => ({ ioc_value: i.value, ioc_description: i.description, ioc_type_id: idOf(this.lookups.iocTypes, i.type, 'other'), ioc_tlp_id: idOf(this.lookups.tlp, tlpToIris(i.tlp), 'amber'), ioc_tags: '' })),
      alert_assets: a.assets.map(x => ({ asset_name: x.name, asset_description: x.description, asset_type_id: idOf(this.lookups.assetTypes, x.type, 'Other'), asset_ip: x.ip, asset_domain: '', asset_tags: '' })),
      alert_context: { geyes_alert_id: a.id, geyes_alert_number: a.number, ...(a.shiftRef ? { shift_report: a.shiftRef.reportId } : {}) },
    };
  }

  private alertFromRemote(r: any) {
    const status = nameOf(this.lookups.alertStatus, r.alert_status_id) ?? r.status?.status_name ?? 'New';
    const resolution = nameOf(this.lookups.alertResolutions, r.alert_resolution_status_id);
    return {
      status: (['New', 'Assigned', 'In progress', 'Pending', 'Closed', 'Merged', 'Escalated'].find(s => norm(s) === norm(status)) ?? 'New') as AlertStatus,
      severity: severityFromIris(nameOf(this.lookups.severities, r.alert_severity_id) ?? r.severity?.severity_name),
      resolution: resolution as Alert['resolution'] | undefined,
    };
  }

  private async syncAlerts(customers: Map<string, number>) {
    const locals = await this.store.list<Alert>(COL.alerts);
    const pushed = new Set<string>();
    if (this.opts.pushAlerts) {
      for (const a of locals) {
        try {
          const crid = await this.remoteCustomer(a.customerId, customers);
          const full = this.alertPayload(a, crid);
          const h = await hash(full);
          if (a.iris?.remoteId && a.iris.pushedHash === h) continue;
          let rid = a.iris?.remoteId;
          if (rid) await this.client.post(IRIS_ENDPOINTS.alerts.update(rid), { alert_status_id: full.alert_status_id, alert_severity_id: full.alert_severity_id, alert_resolution_status_id: full.alert_resolution_status_id, alert_note: full.alert_note, alert_tags: full.alert_tags });
          else if (a.iris?.origin !== 'iris') rid = firstId(await this.client.post(IRIS_ENDPOINTS.alerts.add, full), ['alert_id', 'id']);
          if (!rid) continue;
          const linked = { ...a, iris: { ...a.iris, remoteId: rid, pushedHash: h, syncedAt: this.now(), origin: a.iris?.origin ?? 'geyes' } as IrisLink };
          await this.store.set(COL.alerts, linked);
          Object.assign(a, linked);
          pushed.add(a.id);
          this.result.pushed.alerts++;
        } catch (e) { this.err(`Alert #${a.number}`, e); }
      }
    }

    const page: any = await this.client.get(IRIS_ENDPOINTS.alerts.filter, { per_page: 200, page: 1, sort: 'desc' });
    const remote: any[] = Array.isArray(page) ? page : page?.alerts ?? [];
    const cases = await this.store.list<DfirCase>(COL.cases);
    for (const r of remote) {
      const rid = Number(r.alert_id ?? r.id);
      if (!rid) continue;
      const mapped = this.alertFromRemote(r);
      const rHash = await hash(mapped);
      const remoteCaseIds: number[] = (r.cases ?? []).map((x: any) => Number(typeof x === 'object' ? x.case_id ?? x.id : x));
      const linkedCase = cases.find(c => c.iris?.remoteId && remoteCaseIds.includes(c.iris.remoteId));
      const local = locals.find(a => a.iris?.remoteId === rid);
      if (local) {
        if (pushed.has(local.id) || !local.iris?.remoteVersion || local.iris.remoteVersion === rHash) {
          if (local.iris?.remoteVersion !== rHash || (linkedCase && !local.caseId)) await this.store.set(COL.alerts, { ...local, caseId: local.caseId ?? linkedCase?.id, iris: { ...local.iris, remoteVersion: rHash } });
          continue;
        }
        const next: Alert = { ...local, ...mapped, caseId: local.caseId ?? linkedCase?.id, updatedAt: this.now(), updatedBy: 'IRIS sync' };
        next.iris = { ...local.iris, remoteVersion: rHash, pushedHash: await hash(this.alertPayload(next, await this.remoteCustomer(next.customerId, customers))), syncedAt: this.now() };
        await this.store.set(COL.alerts, next);
        this.result.pulled.updated++;
      } else if (this.opts.importRemote && !(r.alert_context?.geyes_alert_id && locals.some(a => a.id === r.alert_context.geyes_alert_id))) {
        const t = this.now();
        const alert: Alert = {
          id: `iris-alert-${rid}`, number: await this.store.nextSequence('alert'), title: String(r.alert_title ?? `IRIS alert ${rid}`), description: r.alert_description ?? '',
          ...mapped, source: r.alert_source ?? 'IRIS', sourceRef: r.alert_source_ref ?? String(rid), sourceLink: r.alert_source_link || undefined,
          eventTime: fromIrisDate(r.alert_source_event_time ?? r.alert_creation_time), customerId: await this.localCustomer(r.alert_customer_id ?? r.customer?.customer_id, customers),
          classification: nameOf(this.lookups.classifications, r.alert_classification_id) ?? 'other:other', tags: fromCsv(r.alert_tags),
          iocs: (r.iocs ?? []).map((i: any) => ({ type: (nameOf(this.lookups.iocTypes, i.ioc_type_id) ?? 'other') as any, value: String(i.ioc_value ?? ''), description: i.ioc_description ?? '', tlp: tlpFromIris(nameOf(this.lookups.tlp, i.ioc_tlp_id)) })),
          assets: (r.assets ?? []).map((x: any) => ({ name: String(x.asset_name ?? ''), type: nameOf(this.lookups.assetTypes, x.asset_type_id) ?? 'Other', ip: x.asset_ip ?? '', description: x.asset_description ?? '' })),
          note: r.alert_note ?? '', caseId: linkedCase?.id, createdAt: t, createdBy: 'IRIS', updatedAt: t, updatedBy: 'IRIS sync',
          iris: { remoteId: rid, origin: 'iris', remoteVersion: rHash, syncedAt: t },
        };
        alert.iris!.pushedHash = await hash(this.alertPayload(alert, await this.remoteCustomer(alert.customerId, customers)));
        await this.store.set(COL.alerts, alert);
        this.result.pulled.alerts++;
      }
    }
  }
}

export const runIrisSync = (client: IrisClient, store: SyncStore, opts: SyncOptions) => new IrisSync(client, store, opts).run();
