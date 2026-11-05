import { Alert, Asset, EventStatus, ShiftEvent, ShiftReport, User } from '../types';
import { alertService } from './alertService';
import { ShiftId, getShift } from '../lib/shifts';
import { isOpenItem } from '../lib/sla';
import { shiftSortKey } from './analytics';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { callFn } from './cloudAuth';

export const REPORTS_COLLECTION = 'shift_reports';

export const reportId = (date: string, shift: ShiftId) => `${date}_${shift}`;

export { computeIntegrityHash } from '../lib/integrity';
import { computeIntegrityHash } from '../lib/integrity';

const assertDraft = (r: ShiftReport) => {
  if (r.status === 'finalized') throw new Error('Report is finalized and immutable');
};

export const shiftReportService = {
  subscribe(listener: (reports: ShiftReport[]) => void): () => void {
    return realtimeStore.subscribe<ShiftReport>(REPORTS_COLLECTION, docs =>
      listener([...docs].sort((a, b) => (b.date + b.shift).localeCompare(a.date + a.shift)))
    );
  },

  newDraft(actor: User, date: string, shift: ShiftId): ShiftReport {
    const now = new Date().toISOString();
    return {
      id: reportId(date, shift),
      date, shift,
      title: `${getShift(shift).label} Report — ${date}`,
      status: 'draft',
      events: [],
      summary: '',
      handoverNotes: '',
      contributors: [actor.username],
      createdBy: actor.username,
      createdById: actor.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.username,
      revision: 0,
    };
  },

  async create(actor: User, date: string, shift: ShiftId, existing: ShiftReport[]): Promise<ShiftReport> {
    const id = reportId(date, shift);
    const found = existing.find(r => r.id === id);
    if (found) return found;
    const draft = shiftReportService.newDraft(actor, date, shift);
    const source = shiftReportService.carryOverSource(existing, date, shift);
    const carried = source ? shiftReportService.openItemsToCarry(source, draft) : [];
    draft.events = carried;
    await realtimeStore.set(REPORTS_COLLECTION, draft);
    auditService.log(actor, 'SHIFT_REPORT_CREATED', { id, name: draft.title });
    if (source && carried.length) {
      auditService.log(actor, 'SHIFT_ITEMS_CARRIED_OVER', { id, name: draft.title }, { from: source.id, count: carried.length, rootEventIds: carried.map(e => e.rootEventId) });
    }
    return draft;
  },

  /** Most recent finalized report strictly before the given shift slot. */
  carryOverSource(reports: ShiftReport[], date: string, shift: ShiftId): ShiftReport | undefined {
    const key = shiftSortKey(date, shift);
    return reports
      .filter(r => r.status === 'finalized' && shiftSortKey(r.date, r.shift) < key)
      .sort((a, b) => shiftSortKey(b.date, b.shift).localeCompare(shiftSortKey(a.date, a.shift)))[0];
  },

  /** Copies of unresolved events from `source` that are not yet present in `target`. */
  openItemsToCarry(source: ShiftReport, target: ShiftReport): ShiftEvent[] {
    const present = new Set(target.events.map(e => e.rootEventId || e.id));
    const now = new Date().toISOString();
    return source.events
      .filter(e => isOpenItem(e) && !present.has(e.rootEventId || e.id))
      .map(e => ({
        ...e,
        id: crypto.randomUUID(),
        rootEventId: e.rootEventId || e.id,
        carriedFromReportId: source.id,
        carriedFromEventId: e.id,
        createdAt: now,
        updatedAt: now,
      }));
  },

  /** Pull newly available open items into an existing draft. */
  async importOpenItems(actor: User, report: ShiftReport, reports: ShiftReport[]): Promise<number> {
    assertDraft(report);
    const source = shiftReportService.carryOverSource(reports, report.date, report.shift);
    if (!source) return 0;
    const items = shiftReportService.openItemsToCarry(source, report);
    if (!items.length) return 0;
    const next: ShiftReport = {
      ...report,
      events: [...report.events, ...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
      revision: (report.revision || 0) + 1,
    };
    await realtimeStore.set(REPORTS_COLLECTION, next);
    auditService.log(actor, 'SHIFT_ITEMS_CARRIED_OVER', { id: report.id, name: report.title }, { from: source.id, count: items.length, rootEventIds: items.map(e => e.rootEventId) });
    return items.length;
  },

  /** Quick lifecycle transition; stamps containment / resolution times. */
  withStatus(ev: ShiftEvent, status: EventStatus, at = new Date().toISOString()): ShiftEvent {
    const next: ShiftEvent = { ...ev, status, updatedAt: at };
    if (status === 'Open') { next.containedAt = undefined; next.resolvedAt = undefined; }
    if (status === 'Contained') { next.containedAt = ev.containedAt ?? at; next.resolvedAt = undefined; }
    if (status === 'Resolved') { next.containedAt = ev.containedAt ?? at; next.resolvedAt = ev.resolvedAt ?? at; }
    return next;
  },

  async setEventStatus(actor: User, report: ShiftReport, ev: ShiftEvent, status: EventStatus): Promise<ShiftReport> {
    const updated = shiftReportService.withStatus(ev, status);
    const next = await shiftReportService.upsertEvent(actor, report, updated, report, true);
    auditService.log(actor, 'EVENT_STATUS_CHANGED', { id: report.id, name: ev.eventName }, { eventId: ev.id, rootEventId: ev.rootEventId || ev.id, from: ev.status ?? 'Open', to: status });
    return next;
  },

  /**
   * Escalate a shift event into the alert triage queue (IRIS-style alert with
   * IOCs, linked inventory assets and shift provenance) and record the link.
   */
  async escalate(actor: User, report: ShiftReport, ev: ShiftEvent, assets: Asset[], customerId?: string): Promise<Alert> {
    assertDraft(report);
    if (ev.escalatedAlertId || ev.escalatedIncidentId) throw new Error('Event already escalated');
    const alert = await alertService.create(actor, alertService.fromShiftEvent(report, ev, assets, customerId));
    const t = new Date().toISOString();
    await shiftReportService.upsertEvent(actor, report, { ...ev, escalatedAlertId: alert.id, escalatedAt: t, escalatedBy: actor.username, updatedAt: t }, report, true);
    auditService.log(actor, 'EVENT_ESCALATED', { id: alert.id, name: ev.eventName }, { reportId: report.id, eventId: ev.id, alertNumber: alert.number, severity: ev.severity });
    return alert;
  },

  /** Sync a working draft without sealing it. */
  async syncDraft(actor: User, report: ShiftReport, latest?: ShiftReport): Promise<ShiftReport> {
    if (latest) assertDraft(latest);
    assertDraft(report);
    const next: ShiftReport = {
      ...report,
      contributors: Array.from(new Set([...(report.contributors || []), actor.username])),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
      revision: (latest?.revision ?? report.revision ?? 0) + 1,
    };
    await realtimeStore.set(REPORTS_COLLECTION, next);
    auditService.log(actor, 'SHIFT_DRAFT_SYNCED', { id: report.id, name: report.title }, { revision: next.revision, events: next.events.length });
    return next;
  },

  async upsertEvent(actor: User, report: ShiftReport, event: ShiftEvent, latest?: ShiftReport, silent = false): Promise<ShiftReport> {
    const base = latest ?? report;
    assertDraft(base);
    const exists = base.events.some(e => e.id === event.id);
    const events = exists ? base.events.map(e => (e.id === event.id ? event : e)) : [...base.events, event];
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const next: ShiftReport = {
      ...base,
      events,
      contributors: Array.from(new Set([...(base.contributors || []), actor.username])),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
      revision: (base.revision || 0) + 1,
    };
    await realtimeStore.set(REPORTS_COLLECTION, next);
    if (!silent) {
      auditService.log(actor, exists ? 'SHIFT_EVENT_UPDATED' : 'SHIFT_EVENT_ADDED', { id: report.id, name: event.eventName }, {
        eventId: event.id, severity: event.severity, sourceIp: event.sourceIp, status: event.status ?? 'Open',
      });
    }
    return next;
  },

  async removeEvent(actor: User, report: ShiftReport, eventId: string): Promise<ShiftReport> {
    assertDraft(report);
    const ev = report.events.find(e => e.id === eventId);
    const next: ShiftReport = {
      ...report,
      events: report.events.filter(e => e.id !== eventId),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
      revision: (report.revision || 0) + 1,
    };
    await realtimeStore.set(REPORTS_COLLECTION, next);
    auditService.log(actor, 'SHIFT_EVENT_REMOVED', { id: report.id, name: ev?.eventName || eventId }, { eventId });
    return next;
  },

  /** Seal the report: compute its SHA-256 integrity hash and lock it permanently. */
  async finalize(actor: User, report: ShiftReport): Promise<ShiftReport> {
    assertDraft(report);
    if (realtimeStore.isCloud()) {
      // Server-side sealing: the Cloud Function stamps the time and identity and computes the hash.
      await realtimeStore.set(REPORTS_COLLECTION, { ...report, updatedAt: new Date().toISOString(), updatedBy: actor.username });
      return callFn<{ reportId: string }, ShiftReport>('finalizeShiftReport', { reportId: report.id });
    }
    const sealed: ShiftReport = {
      ...report,
      status: 'finalized',
      contributors: Array.from(new Set([...(report.contributors || []), actor.username])),
      finalizedAt: new Date().toISOString(),
      finalizedBy: actor.username,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.username,
      revision: (report.revision || 0) + 1,
    };
    sealed.integrityHash = await computeIntegrityHash(sealed);
    await realtimeStore.set(REPORTS_COLLECTION, sealed);
    auditService.log(actor, 'SHIFT_REPORT_FINALIZED', { id: report.id, name: report.title }, {
      integrityHash: sealed.integrityHash, events: sealed.events.length,
    });
    return sealed;
  },

  async verify(actor: User, report: ShiftReport): Promise<boolean> {
    if (!report.integrityHash) return false;
    const ok = (await computeIntegrityHash(report)) === report.integrityHash;
    auditService.log(actor, 'INTEGRITY_VERIFIED', { id: report.id, name: report.title }, { result: ok ? 'PASS' : 'FAIL' });
    return ok;
  },

  async remove(actor: User, report: ShiftReport): Promise<void> {
    await realtimeStore.remove(REPORTS_COLLECTION, report.id);
    auditService.log(actor, 'SHIFT_REPORT_DELETED', { id: report.id, name: report.title }, {
      status: report.status, integrityHash: report.integrityHash, events: report.events.length,
    });
  },
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(\/([0-9]|[12]\d|3[0-2]))?$/;
const IPV6 = /^(([0-9a-fA-F]{1,4}:){1,7}:?|:)(([0-9a-fA-F]{1,4}:?){0,7})(\/\d{1,3})?$/;

export const isValidIp = (v: string) => !v || IPV4.test(v.trim()) || (v.includes(':') && IPV6.test(v.trim()));
export const isValidPort = (v: string) => {
  if (!v) return true;
  return v.split(/[,\s]+/).filter(Boolean).every(p => {
    const [a, b] = p.split('-').map(Number);
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= 65535;
    return ok(a) && (b === undefined || (ok(b) && b >= a));
  });
};
