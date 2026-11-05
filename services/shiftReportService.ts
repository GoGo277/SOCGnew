import { ShiftEvent, ShiftReport, User } from '../types';
import { ShiftId, getShift } from '../lib/shifts';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { sha256, canonicalJson } from '../lib/crypto';

export const REPORTS_COLLECTION = 'shift_reports';

export const reportId = (date: string, shift: ShiftId) => `${date}_${shift}`;

/** The content that is sealed by the integrity hash at finalisation. */
const sealedContent = (r: ShiftReport) => canonicalJson({
  id: r.id, date: r.date, shift: r.shift, title: r.title, events: r.events,
  summary: r.summary, handoverNotes: r.handoverNotes, contributors: r.contributors,
  createdBy: r.createdBy, createdAt: r.createdAt, finalizedAt: r.finalizedAt, finalizedBy: r.finalizedBy,
});

export const computeIntegrityHash = (r: ShiftReport) => sha256(sealedContent(r));

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
    await realtimeStore.set(REPORTS_COLLECTION, draft);
    auditService.log(actor, 'SHIFT_REPORT_CREATED', { id, name: draft.title });
    return draft;
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

  async upsertEvent(actor: User, report: ShiftReport, event: ShiftEvent, latest?: ShiftReport): Promise<ShiftReport> {
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
    auditService.log(actor, exists ? 'SHIFT_EVENT_UPDATED' : 'SHIFT_EVENT_ADDED', { id: report.id, name: event.eventName }, {
      eventId: event.id, severity: event.severity, sourceIp: event.sourceIp,
    });
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
