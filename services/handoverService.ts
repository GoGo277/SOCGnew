import { HandoverAck, ShiftReport, User, DutySchedule } from '../types';
import { ShiftId, getActiveShift, previousSlot } from '../lib/shifts';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { reportId } from './shiftReportService';

export const ACKS_COLLECTION = 'handover_acks';

export interface HandoverStatus {
  /** The report the incoming (current) shift must acknowledge. */
  previous?: ShiftReport;
  previousSlot: { date: string; shift: ShiftId };
  state: 'missing' | 'draft' | 'pending_ack' | 'acknowledged';
  ack?: HandoverAck;
  /** Whether the current user is expected to sign off (on duty, or no roster set). */
  responsible: boolean;
}

export const handoverService = {
  subscribe(listener: (acks: HandoverAck[]) => void): () => void {
    return realtimeStore.subscribe<HandoverAck>(ACKS_COLLECTION, listener);
  },

  /** Handover state for the shift that is active right now. */
  currentStatus(reports: ShiftReport[], acks: HandoverAck[], schedules: Record<string, DutySchedule>, user: User, now = new Date()): HandoverStatus {
    const active = getActiveShift(now);
    const prevSlot = previousSlot(active.dateKey, active.shift.id);
    const previous = reports.find(r => r.id === reportId(prevSlot.date, prevSlot.shift));
    const ack = previous ? acks.find(a => a.reportId === previous.id) : undefined;
    const crew = schedules[active.dateKey]?.[active.shift.id] ?? [];
    const responsible = crew.length === 0 || crew.includes(user.id);
    const state: HandoverStatus['state'] = !previous ? 'missing' : previous.status === 'draft' ? 'draft' : ack ? 'acknowledged' : 'pending_ack';
    return { previous, previousSlot: prevSlot, state, ack, responsible };
  },

  async acknowledge(actor: User, report: ShiftReport, incoming: { date: string; shift: ShiftId }, comment: string, existing: HandoverAck[]): Promise<HandoverAck> {
    if (report.status !== 'finalized') throw new Error('Only finalized reports can be acknowledged');
    if (existing.some(a => a.reportId === report.id)) throw new Error('This handover was already acknowledged');
    const ack: HandoverAck = {
      id: report.id,
      reportId: report.id,
      acknowledgedBy: actor.username,
      acknowledgedById: actor.id,
      acknowledgedAt: new Date().toISOString(),
      incomingDate: incoming.date,
      incomingShift: incoming.shift,
      comment: comment.trim(),
      reportIntegrityHash: report.integrityHash,
    };
    await realtimeStore.set(ACKS_COLLECTION, ack);
    auditService.log(actor, 'HANDOVER_ACKNOWLEDGED', { id: report.id, name: report.title }, {
      incoming: `${incoming.date}_${incoming.shift}`, integrityHash: report.integrityHash, comment: ack.comment,
    });
    return ack;
  },
};
