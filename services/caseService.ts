import {
  Alert, CaseActivity, CaseObjectKind, CaseObjectMap, CaseTemplate, Customer, DfirCase, User,
} from '../types';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { INTERNAL_CUSTOMER_ID } from '../lib/dfir';

import { COL } from '../lib/collections';

export const CASES = COL.cases;
export const CUSTOMERS = COL.customers;
export const CASE_TEMPLATES = COL.caseTemplates;
export const CASE_ACTIVITY = COL.caseActivity;
export const OBJECT_COLLECTIONS: Record<CaseObjectKind, string> = {
  iocs: COL.iocs, assets: COL.assets, timeline: COL.timeline, evidence: COL.evidence, notes: COL.notes, tasks: COL.tasks,
};
const OBJECT_LABEL: Record<CaseObjectKind, string> = { iocs: 'IOC', assets: 'asset', timeline: 'timeline event', evidence: 'evidence', notes: 'note', tasks: 'task' };

const now = () => new Date().toISOString();
const sortBy = <T,>(k: (x: T) => string, desc = false) => (a: T, b: T) => (desc ? k(b).localeCompare(k(a)) : k(a).localeCompare(k(b)));

/** Human summary of the fields that changed, e.g. "state: Open → Containment". */
const diffSummary = (before: Record<string, any>, patch: Record<string, any>) =>
  Object.keys(patch)
    .filter(k => !['updatedAt', 'updatedBy', 'iris'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(patch[k]))
    .map(k => (typeof patch[k] === 'string' && patch[k].length < 60 && typeof before[k] !== 'object' ? `${k}: ${before[k] ?? '—'} → ${patch[k]}` : k))
    .join('; ');

export const DEFAULT_CUSTOMER: Customer = {
  id: INTERNAL_CUSTOMER_ID, name: 'Internal SOC', description: 'Default customer for internal investigations.',
  contacts: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system',
};

export const caseService = {
  // ---- subscriptions ----------------------------------------------------
  subscribeCases: (l: (c: DfirCase[]) => void) => realtimeStore.subscribe<DfirCase>(CASES, d => l([...d].sort((a, b) => b.number - a.number))),
  subscribeCustomers: (l: (c: Customer[]) => void) => realtimeStore.subscribe<Customer>(CUSTOMERS, d => {
    const list = d.some(c => c.id === INTERNAL_CUSTOMER_ID) ? d : [DEFAULT_CUSTOMER, ...d];
    l([...list].sort(sortBy(c => c.name)));
  }),
  subscribeTemplates: (l: (t: CaseTemplate[]) => void) => realtimeStore.subscribe<CaseTemplate>(CASE_TEMPLATES, d => l([...d].sort(sortBy(t => t.name)))),
  subscribeActivity: (l: (a: CaseActivity[]) => void) => realtimeStore.subscribe<CaseActivity>(CASE_ACTIVITY, d => l([...d].sort(sortBy(a => a.at, true)))),
  subscribeObjects<K extends CaseObjectKind>(kind: K, l: (o: CaseObjectMap[K][]) => void) {
    return realtimeStore.subscribe<CaseObjectMap[K]>(OBJECT_COLLECTIONS[kind], d => l([...d].sort(sortBy(o => (o as any).date ?? o.createdAt))));
  },

  async logActivity(actor: User, caseId: string, action: string, detail: string) {
    await realtimeStore.set(CASE_ACTIVITY, { id: crypto.randomUUID(), caseId, at: now(), by: actor.username, action, detail } satisfies CaseActivity);
  },

  // ---- cases ------------------------------------------------------------
  async createCase(actor: User, input: {
    name: string; description: string; customerId: string; severity: DfirCase['severity']; classification: string;
    tags?: string[]; ownerId?: string; ownerName?: string; templateId?: string; sourceAlertIds?: string[]; socId?: string;
  }, templates: CaseTemplate[] = []): Promise<DfirCase> {
    if (!input.name.trim()) throw new Error('Case name is required');
    const t = now();
    const c: DfirCase = {
      id: crypto.randomUUID(),
      number: await realtimeStore.nextSequence('case'),
      name: input.name.trim(),
      description: input.description,
      customerId: input.customerId || INTERNAL_CUSTOMER_ID,
      state: 'Open',
      severity: input.severity,
      classification: input.classification || 'other:other',
      outcome: 'Unknown',
      ownerId: input.ownerId ?? actor.id,
      ownerName: input.ownerName ?? actor.username,
      tags: input.tags ?? [],
      socId: input.socId,
      openedAt: t, openedBy: actor.username, updatedAt: t, updatedBy: actor.username,
      sourceAlertIds: input.sourceAlertIds ?? [],
      templateId: input.templateId,
      iris: { origin: 'geyes' },
    };
    await realtimeStore.set(CASES, c);
    await caseService.logActivity(actor, c.id, 'Case opened', input.templateId ? `from template` : '');
    const tpl = templates.find(x => x.id === input.templateId);
    if (tpl) {
      for (const task of tpl.tasks) await caseService.addObject(actor, c, 'tasks', { title: task.title, description: task.description, status: 'To do', assigneeIds: [], tags: [] }, true);
      for (const note of tpl.notes) await caseService.addObject(actor, c, 'notes', { directory: note.directory, title: note.title, content: note.content }, true);
    }
    auditService.log(actor, 'CASE_CREATED', { id: c.id, name: `#${c.number} ${c.name}` }, { customerId: c.customerId, severity: c.severity, template: tpl?.name });
    return c;
  },

  async updateCase(actor: User, c: DfirCase, patch: Partial<DfirCase>): Promise<DfirCase> {
    if (patch.state === 'Closed' && c.state !== 'Closed') return caseService.closeCase(actor, c, patch.outcome ?? c.outcome, patch);
    const detail = diffSummary(c, patch);
    const next: DfirCase = { ...c, ...patch, updatedAt: now(), updatedBy: actor.username };
    await realtimeStore.set(CASES, next);
    if (detail) {
      await caseService.logActivity(actor, c.id, 'Case updated', detail);
      auditService.log(actor, 'CASE_UPDATED', { id: c.id, name: `#${c.number} ${c.name}` }, { changes: detail });
    }
    return next;
  },

  async closeCase(actor: User, c: DfirCase, outcome: DfirCase['outcome'], extra: Partial<DfirCase> = {}): Promise<DfirCase> {
    if (outcome === 'Unknown') throw new Error('Set a case outcome before closing');
    const next: DfirCase = { ...c, ...extra, state: 'Closed', outcome, closedAt: now(), closedBy: actor.username, updatedAt: now(), updatedBy: actor.username };
    await realtimeStore.set(CASES, next);
    await caseService.logActivity(actor, c.id, 'Case closed', outcome);
    auditService.log(actor, 'CASE_CLOSED', { id: c.id, name: `#${c.number} ${c.name}` }, { outcome });
    return next;
  },

  async reopenCase(actor: User, c: DfirCase): Promise<DfirCase> {
    const next: DfirCase = { ...c, state: 'In progress', closedAt: undefined, closedBy: undefined, updatedAt: now(), updatedBy: actor.username };
    await realtimeStore.set(CASES, next);
    await caseService.logActivity(actor, c.id, 'Case reopened', '');
    auditService.log(actor, 'CASE_REOPENED', { id: c.id, name: `#${c.number} ${c.name}` });
    return next;
  },

  async deleteCase(actor: User, c: DfirCase, objects: { [K in CaseObjectKind]?: { id: string; caseId: string }[] }): Promise<void> {
    for (const kind of Object.keys(OBJECT_COLLECTIONS) as CaseObjectKind[]) {
      for (const o of (objects[kind] ?? []).filter(o => o.caseId === c.id)) await realtimeStore.remove(OBJECT_COLLECTIONS[kind], o.id);
    }
    await realtimeStore.remove(CASES, c.id);
    auditService.log(actor, 'CASE_DELETED', { id: c.id, name: `#${c.number} ${c.name}` }, { state: c.state, irisCaseId: c.iris?.remoteId });
  },

  // ---- case objects -------------------------------------------------------
  async addObject<K extends CaseObjectKind>(
    actor: User, c: DfirCase, kind: K,
    data: Omit<CaseObjectMap[K], 'id' | 'caseId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>, quiet = false
  ): Promise<CaseObjectMap[K]> {
    const t = now();
    const obj = { ...data, id: crypto.randomUUID(), caseId: c.id, createdAt: t, createdBy: actor.username, updatedAt: t, updatedBy: actor.username } as CaseObjectMap[K];
    await realtimeStore.set(OBJECT_COLLECTIONS[kind], obj as any);
    const label = (obj as any).title ?? (obj as any).value ?? (obj as any).name ?? (obj as any).filename ?? '';
    await caseService.logActivity(actor, c.id, `Added ${OBJECT_LABEL[kind]}`, label);
    if (!quiet) auditService.log(actor, 'CASE_OBJECT_ADDED', { id: c.id, name: `#${c.number} ${c.name}` }, { kind, objectId: obj.id, label });
    await caseService.touch(actor, c);
    return obj;
  },

  async updateObject<K extends CaseObjectKind>(actor: User, c: DfirCase, kind: K, obj: CaseObjectMap[K], patch: Partial<CaseObjectMap[K]>): Promise<CaseObjectMap[K]> {
    const next = { ...obj, ...patch, updatedAt: now(), updatedBy: actor.username } as CaseObjectMap[K];
    await realtimeStore.set(OBJECT_COLLECTIONS[kind], next as any);
    const detail = diffSummary(obj as any, patch as any);
    if (detail) {
      await caseService.logActivity(actor, c.id, `Updated ${OBJECT_LABEL[kind]}`, detail);
      auditService.log(actor, 'CASE_OBJECT_UPDATED', { id: c.id, name: `#${c.number} ${c.name}` }, { kind, objectId: obj.id, changes: detail });
    }
    await caseService.touch(actor, c);
    return next;
  },

  async removeObject(actor: User, c: DfirCase, kind: CaseObjectKind, obj: { id: string } & Record<string, any>): Promise<void> {
    await realtimeStore.remove(OBJECT_COLLECTIONS[kind], obj.id);
    // Remember IRIS-linked deletions so the next sync removes them in IRIS too.
    if (obj.iris?.remoteId && c.iris?.remoteId) {
      await realtimeStore.set(COL.irisTombstones, { id: `${kind}-${obj.iris.remoteId}`, kind, caseRemoteId: c.iris.remoteId, remoteId: obj.iris.remoteId, createdAt: now() });
    }
    const label = obj.title ?? obj.value ?? obj.name ?? obj.filename ?? obj.id;
    await caseService.logActivity(actor, c.id, `Removed ${OBJECT_LABEL[kind]}`, label);
    auditService.log(actor, 'CASE_OBJECT_REMOVED', { id: c.id, name: `#${c.number} ${c.name}` }, { kind, objectId: obj.id, label, irisId: obj.iris?.remoteId });
    await caseService.touch(actor, c);
  },

  /** Bump the case's updatedAt so lists and sync see the change. */
  async touch(actor: User, c: DfirCase) {
    await realtimeStore.update(CASES, c.id, { updatedAt: now(), updatedBy: actor.username }).catch(() => undefined);
  },

  // ---- customers & templates ---------------------------------------------
  async saveCustomer(actor: User, data: Pick<Customer, 'name' | 'description' | 'contacts'>, existing?: Customer): Promise<Customer> {
    if (!data.name.trim()) throw new Error('Customer name is required');
    const cust: Customer = { ...(existing ?? { id: crypto.randomUUID(), createdAt: now(), createdBy: actor.username }), ...data, name: data.name.trim() } as Customer;
    await realtimeStore.set(CUSTOMERS, cust);
    auditService.log(actor, 'CUSTOMER_SAVED', { id: cust.id, name: cust.name });
    return cust;
  },

  async deleteCustomer(actor: User, cust: Customer, cases: DfirCase[], alerts: Alert[]): Promise<void> {
    if (cust.id === INTERNAL_CUSTOMER_ID) throw new Error('The default customer cannot be deleted');
    if (cases.some(c => c.customerId === cust.id) || alerts.some(a => a.customerId === cust.id)) throw new Error('Customer still has cases or alerts');
    await realtimeStore.remove(CUSTOMERS, cust.id);
    auditService.log(actor, 'CUSTOMER_DELETED', { id: cust.id, name: cust.name });
  },

  async saveTemplate(actor: User, data: Omit<CaseTemplate, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>, existing?: CaseTemplate): Promise<CaseTemplate> {
    if (!data.name.trim()) throw new Error('Template name is required');
    const t = now();
    const tpl: CaseTemplate = { ...data, name: data.name.trim(), id: existing?.id ?? crypto.randomUUID(), createdBy: existing?.createdBy ?? actor.username, createdAt: existing?.createdAt ?? t, updatedAt: t };
    await realtimeStore.set(CASE_TEMPLATES, tpl);
    auditService.log(actor, 'CASE_TEMPLATE_SAVED', { id: tpl.id, name: tpl.name }, { tasks: tpl.tasks.length, notes: tpl.notes.length });
    return tpl;
  },

  async deleteTemplate(actor: User, tpl: CaseTemplate): Promise<void> {
    await realtimeStore.remove(CASE_TEMPLATES, tpl.id);
    auditService.log(actor, 'CASE_TEMPLATE_DELETED', { id: tpl.id, name: tpl.name });
  },
};
