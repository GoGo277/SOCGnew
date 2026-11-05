import React, { useMemo, useState } from 'react';
import { useEscape } from '../lib/useEscape';
import { ArrowLeftRight, X, Check, Ban, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { DutySchedule, ShiftSwapRequest, SwapStatus, User } from '../types';
import { SHIFT_ORDER, ShiftId, getShift, getShiftWindow, toDateKey } from '../lib/shifts';
import { swapService } from '../services/swapService';
import { useT } from '../i18n';

const STATUS_STYLE: Record<SwapStatus, string> = {
  pending_peer: 'text-amber-300 border-amber-500/30 bg-amber-500/5',
  pending_admin: 'text-sky-300 border-sky-500/30 bg-sky-500/5',
  approved: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
  rejected: 'text-red-300 border-red-500/30 bg-red-500/5',
  declined: 'text-red-300 border-red-500/30 bg-red-500/5',
  cancelled: 'text-zinc-400 border-zinc-700',
};
const STATUS_LABEL: Record<SwapStatus, string> = {
  pending_peer: 'Awaiting colleague', pending_admin: 'Awaiting approval', approved: 'Approved',
  rejected: 'Rejected', declined: 'Declined by colleague', cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
interface RequestProps {
  date: string;
  shift: ShiftId;
  currentUser: User;
  users: User[];
  schedules: Record<string, DutySchedule>;
  swaps: ShiftSwapRequest[];
  onClose: () => void;
  onDone: (msg: string) => void;
}

export const SwapRequestModal: React.FC<RequestProps> = ({ date, shift, currentUser, users, schedules, swaps, onClose, onDone }) => {
  const t = useT();
  useEscape(onClose);
  const [peerId, setPeerId] = useState('');
  const [mode, setMode] = useState<'cover' | 'exchange'>('cover');
  const [returnSlot, setReturnSlot] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const crew = schedules[date]?.[shift] ?? [];
  const candidates = users.filter(u => !u.disabled && u.id !== currentUser.id && !crew.includes(u.id));

  /** Future slots where the chosen colleague works and the requester does not. */
  const returnOptions = useMemo(() => {
    if (!peerId) return [];
    const today = toDateKey(new Date());
    return Object.values(schedules)
      .filter(s => s.date >= today)
      .flatMap(s => SHIFT_ORDER.filter(sh => s[sh].includes(peerId) && !s[sh].includes(currentUser.id)).map(sh => ({ date: s.date, shift: sh })))
      .filter(o => getShiftWindow(o.date, o.shift).start > new Date() && !(o.date === date && o.shift === shift))
      .sort((a, b) => (a.date + SHIFT_ORDER.indexOf(a.shift)).localeCompare(b.date + SHIFT_ORDER.indexOf(b.shift)))
      .slice(0, 40);
  }, [peerId, schedules, currentUser.id, date, shift]);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      const [rd, rs] = mode === 'exchange' && returnSlot ? returnSlot.split('|') : [];
      if (mode === 'exchange' && !returnSlot) throw new Error(t('Choose the shift you will take in return'));
      await swapService.request(currentUser, { date, shift, peerId, reason, returnDate: rd, returnShift: rs as ShiftId | undefined }, schedules, users, swaps);
      onDone(t('Swap request sent'));
      onClose();
    } catch (e: any) { setError(t(e.message)); } finally { setBusy(false); }
  };

  const s = getShift(shift);
  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50';
  const label = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest';

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="swap-title">
      <div className="modal-entrance w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h3 id="swap-title" className="text-lg font-black text-white flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-blue-400" /> {t('Request shift swap')}</h3>
            <p className={`text-xs mt-1 ${s.text}`}>{t(s.label)} · {date} · {s.timing}</p>
          </div>
          <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block space-y-1"><span className={label}>{t('Colleague who takes this shift')}</span>
            <select value={peerId} onChange={e => { setPeerId(e.target.value); setReturnSlot(''); }} className={input}>
              <option value="">{t('Select colleague…')}</option>
              {candidates.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Swap type')}>
            {(['cover', 'exchange'] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`p-3 rounded-xl border text-left text-xs ${mode === m ? 'border-blue-500/60 bg-blue-500/10 text-white' : 'border-zinc-800 text-zinc-400'}`}>
                <b className="block">{m === 'cover' ? t('Cover') : t('Exchange')}</b>
                {m === 'cover' ? t('Colleague takes my shift') : t('I take one of their shifts in return')}
              </button>
            ))}
          </div>
          {mode === 'exchange' && (
            <label className="block space-y-1"><span className={label}>{t('Shift you take in return')}</span>
              <select value={returnSlot} onChange={e => setReturnSlot(e.target.value)} className={input} disabled={!peerId}>
                <option value="">{peerId ? (returnOptions.length ? t('Select shift…') : t('Colleague has no upcoming shifts')) : t('Select a colleague first')}</option>
                {returnOptions.map(o => <option key={`${o.date}|${o.shift}`} value={`${o.date}|${o.shift}`}>{o.date} · {t(getShift(o.shift).label)} ({getShift(o.shift).timing})</option>)}
              </select></label>
          )}
          <label className="block space-y-1"><span className={label}>{t('Reason')} *</span>
            <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className={input} placeholder={t('e.g. medical appointment, training, leave…')} /></label>
          <p className="text-[11px] text-zinc-500">{t('Your colleague must accept, then an administrator approves. The roster updates automatically on approval.')}</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="p-6 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">{t('Cancel')}</button>
          <button onClick={submit} disabled={busy || !peerId || !reason.trim()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">{busy ? t('Sending…') : t('Send request')}</button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
interface PanelProps {
  swaps: ShiftSwapRequest[];
  schedules: Record<string, DutySchedule>;
  users: User[];
  currentUser: User;
  isAdmin: boolean;
  onToast: (m: string) => void;
}

export const SwapPanel: React.FC<PanelProps> = ({ swaps, schedules, users, currentUser, isAdmin, onToast }) => {
  const t = useT();
  const [tab, setTab] = useState<'action' | 'mine' | 'history'>('action');
  const [busyId, setBusyId] = useState<string | null>(null);

  const needsMe = swaps.filter(s => (s.status === 'pending_peer' && s.peerId === currentUser.id) || (isAdmin && s.status === 'pending_admin'));
  const mine = swaps.filter(s => s.requesterId === currentUser.id || s.peerId === currentUser.id);
  const history = isAdmin ? swaps : mine;
  const list = tab === 'action' ? needsMe : tab === 'mine' ? mine.filter(swapService.isPending) : history.filter(s => !swapService.isPending(s));

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusyId(id);
    try { await fn(); onToast(ok); } catch (e: any) { onToast(t(e.message)); } finally { setBusyId(null); }
  };

  const slot = (date?: string, shift?: ShiftId) => (date && shift ? `${date} · ${t(getShift(shift).label)}` : '');

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden" aria-labelledby="swaps-title">
      <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <h4 id="swaps-title" className="text-sm font-black text-white flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-blue-400" /> {t('Shift swap requests')}</h4>
        <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-1" role="tablist">
          {([['action', t('Needs action'), needsMe.length], ['mine', t('My pending'), mine.filter(swapService.isPending).length], ['history', t('History'), 0]] as const).map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === k ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
              {l}{n > 0 && <span className="ml-1.5 bg-red-600 text-white text-[9px] px-1.5 rounded-full">{n}</span>}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="p-6 text-xs text-zinc-500 text-center">{t('Nothing here.')}</p> : (
        <ul className="divide-y divide-zinc-800/60">
          {list.slice(0, 30).map(s => {
            const sh = getShift(s.shift);
            return (
              <li key={s.id} className="p-4 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[220px] space-y-1">
                  <p className="text-sm text-zinc-100"><b>{s.requesterName}</b> → <b>{s.peerName}</b> <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border font-bold ${sh.badge}`}>{slot(s.date, s.shift)}</span></p>
                  {s.returnDate && <p className="text-[11px] text-zinc-400">{t('In return {name} takes {slot}', { name: s.requesterName, slot: slot(s.returnDate, s.returnShift) })}</p>}
                  <p className="text-[11px] text-zinc-500">“{s.reason}” · {new Date(s.createdAt).toLocaleString()}</p>
                  {s.decidedBy && <p className="text-[11px] text-zinc-500">{t('Decided by {user}', { user: s.decidedBy })}{s.decisionNote ? ` — ${s.decisionNote}` : ''}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${STATUS_STYLE[s.status]}`}>
                  {s.status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : s.status.startsWith('pending') ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {t(STATUS_LABEL[s.status])}
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  {s.status === 'pending_peer' && s.peerId === currentUser.id && (
                    <>
                      <button disabled={busyId === s.id} onClick={() => run(s.id, () => swapService.peerRespond(currentUser, s, true, schedules), t('Swap accepted — awaiting approval'))} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {t('Accept')}</button>
                      <button disabled={busyId === s.id} onClick={() => run(s.id, () => swapService.peerRespond(currentUser, s, false, schedules), t('Swap declined'))} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-bold">{t('Decline')}</button>
                    </>
                  )}
                  {isAdmin && s.status === 'pending_admin' && (
                    <>
                      <button disabled={busyId === s.id} onClick={() => run(s.id, () => swapService.decide(currentUser, s, true, '', schedules, users), t('Swap approved — roster updated'))} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {t('Approve')}</button>
                      <button disabled={busyId === s.id} onClick={() => { const note = prompt(t('Reason for rejection')); if (note !== null) run(s.id, () => swapService.decide(currentUser, s, false, note, schedules, users), t('Swap rejected')); }} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> {t('Reject')}</button>
                    </>
                  )}
                  {s.requesterId === currentUser.id && swapService.isPending(s) && (
                    <button disabled={busyId === s.id} onClick={() => run(s.id, () => swapService.cancel(currentUser, s), t('Request cancelled'))} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-xs font-bold">{t('Cancel request')}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
