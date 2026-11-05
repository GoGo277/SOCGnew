import { DutySchedule, ShiftSwapRequest, User } from '../types';
import { ShiftId, getShift, getShiftWindow } from '../lib/shifts';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { dutyService, emptySchedule } from './dutyService';

export const SWAPS_COLLECTION = 'shift_swaps';

export interface SwapInput {
  date: string;
  shift: ShiftId;
  peerId: string;
  returnDate?: string;
  returnShift?: ShiftId;
  reason: string;
}

const crewOf = (schedules: Record<string, DutySchedule>, date: string, shift: ShiftId) => schedules[date]?.[shift] ?? [];
const slotLabel = (date: string, shift: ShiftId) => `${getShift(shift).label} ${date}`;
const isPending = (s: ShiftSwapRequest) => s.status === 'pending_peer' || s.status === 'pending_admin';

/** Validate that the roster still allows the swap. Throws a user-facing error. */
const validate = (
  s: Pick<ShiftSwapRequest, 'requesterId' | 'peerId' | 'date' | 'shift' | 'returnDate' | 'returnShift'>,
  schedules: Record<string, DutySchedule>,
  now = new Date()
) => {
  if (s.peerId === s.requesterId) throw new Error('Choose a different colleague');
  if (getShiftWindow(s.date, s.shift).start <= now) throw new Error('Only future shifts can be swapped');
  const crew = crewOf(schedules, s.date, s.shift);
  if (!crew.includes(s.requesterId)) throw new Error('The requester is no longer assigned to this shift');
  if (crew.includes(s.peerId)) throw new Error('The colleague is already assigned to this shift');
  if (s.returnDate && s.returnShift) {
    if (getShiftWindow(s.returnDate, s.returnShift).start <= now) throw new Error('The return shift has already started');
    const ret = crewOf(schedules, s.returnDate, s.returnShift);
    if (!ret.includes(s.peerId)) throw new Error('The colleague is not assigned to the return shift');
    if (ret.includes(s.requesterId)) throw new Error('The requester is already assigned to the return shift');
    if (s.returnDate === s.date && s.returnShift === s.shift) throw new Error('Return shift must differ from the swapped shift');
  }
};

export const swapService = {
  subscribe(listener: (swaps: ShiftSwapRequest[]) => void): () => void {
    return realtimeStore.subscribe<ShiftSwapRequest>(SWAPS_COLLECTION, docs =>
      listener([...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  },

  validate,
  isPending,

  async request(actor: User, input: SwapInput, schedules: Record<string, DutySchedule>, users: User[], existing: ShiftSwapRequest[]): Promise<ShiftSwapRequest> {
    if (!input.reason.trim()) throw new Error('A reason is required');
    const peer = users.find(u => u.id === input.peerId && !u.disabled);
    if (!peer) throw new Error('Colleague not found');
    const draft = { requesterId: actor.id, peerId: peer.id, date: input.date, shift: input.shift, returnDate: input.returnDate || undefined, returnShift: input.returnDate ? input.returnShift : undefined };
    validate(draft, schedules);
    if (existing.some(s => isPending(s) && s.requesterId === actor.id && s.date === input.date && s.shift === input.shift)) {
      throw new Error('You already have a pending swap request for this shift');
    }
    const swap: ShiftSwapRequest = {
      id: crypto.randomUUID(),
      requesterName: actor.username,
      peerName: peer.username,
      reason: input.reason.trim(),
      status: 'pending_peer',
      createdAt: new Date().toISOString(),
      ...draft,
    };
    await realtimeStore.set(SWAPS_COLLECTION, swap);
    auditService.log(actor, 'SHIFT_SWAP_REQUESTED', { id: swap.id, name: slotLabel(swap.date, swap.shift) }, {
      peer: peer.username, returnSlot: swap.returnDate ? `${swap.returnDate}_${swap.returnShift}` : null,
    });
    return swap;
  },

  async peerRespond(actor: User, swap: ShiftSwapRequest, accept: boolean, schedules: Record<string, DutySchedule>): Promise<void> {
    if (swap.peerId !== actor.id) throw new Error('Only the requested colleague can respond');
    if (swap.status !== 'pending_peer') throw new Error('This request is no longer awaiting your response');
    if (accept) validate(swap, schedules);
    const next: ShiftSwapRequest = { ...swap, status: accept ? 'pending_admin' : 'declined', peerRespondedAt: new Date().toISOString() };
    await realtimeStore.set(SWAPS_COLLECTION, next);
    auditService.log(actor, accept ? 'SHIFT_SWAP_PEER_ACCEPTED' : 'SHIFT_SWAP_PEER_DECLINED', { id: swap.id, name: slotLabel(swap.date, swap.shift) }, { requester: swap.requesterName });
  },

  /**
   * Admin decision. Approval re-validates the roster and applies the change.
   * Separation of duties: an administrator cannot approve a swap they are part of
   * when another active administrator exists.
   */
  async decide(admin: User, swap: ShiftSwapRequest, approve: boolean, note: string, schedules: Record<string, DutySchedule>, users: User[]): Promise<void> {
    if (swap.status !== 'pending_admin') throw new Error('This request is not awaiting approval');
    const involved = admin.id === swap.requesterId || admin.id === swap.peerId;
    const otherAdmins = users.filter(u => u.role === 'Admin' && !u.disabled && u.id !== admin.id);
    if (involved && otherAdmins.length > 0) throw new Error('Separation of duties: another administrator must decide on a swap you are part of');
    if (approve) {
      validate(swap, schedules);
      const day = schedules[swap.date] ?? emptySchedule(swap.date);
      const updated: DutySchedule = { ...day, [swap.shift]: day[swap.shift].map(id => (id === swap.requesterId ? swap.peerId : id)) };
      await dutyService.saveDay(admin, updated, day);
      if (swap.returnDate && swap.returnShift) {
        const base = swap.returnDate === swap.date ? updated : (schedules[swap.returnDate] ?? emptySchedule(swap.returnDate));
        const ret: DutySchedule = { ...base, [swap.returnShift]: base[swap.returnShift].map(id => (id === swap.peerId ? swap.requesterId : id)) };
        await dutyService.saveDay(admin, ret, base);
      }
    }
    const next: ShiftSwapRequest = { ...swap, status: approve ? 'approved' : 'rejected', decidedAt: new Date().toISOString(), decidedBy: admin.username, decisionNote: note.trim() || undefined };
    await realtimeStore.set(SWAPS_COLLECTION, next);
    auditService.log(admin, approve ? 'SHIFT_SWAP_APPROVED' : 'SHIFT_SWAP_REJECTED', { id: swap.id, name: slotLabel(swap.date, swap.shift) }, {
      requester: swap.requesterName, peer: swap.peerName, note: note.trim() || undefined, selfDecision: involved,
    });
  },

  async cancel(actor: User, swap: ShiftSwapRequest): Promise<void> {
    if (swap.requesterId !== actor.id) throw new Error('Only the requester can cancel');
    if (!isPending(swap)) throw new Error('Only pending requests can be cancelled');
    await realtimeStore.set(SWAPS_COLLECTION, { ...swap, status: 'cancelled', decidedAt: new Date().toISOString(), decidedBy: actor.username });
    auditService.log(actor, 'SHIFT_SWAP_CANCELLED', { id: swap.id, name: slotLabel(swap.date, swap.shift) });
  },

  /** Count of swap requests needing this user's action. */
  actionCount(swaps: ShiftSwapRequest[], user: User, isAdmin: boolean): number {
    return swaps.filter(s => (s.status === 'pending_peer' && s.peerId === user.id) || (isAdmin && s.status === 'pending_admin')).length;
  },
};
