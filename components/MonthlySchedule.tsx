import React, { useMemo, useState } from 'react';
import { uiConfirm } from '../lib/dialogs';
import { useEscape } from '../lib/useEscape';
import { ChevronLeft, ChevronRight, CalendarDays, X, Plus, Trash2, Copy, AlertTriangle, Lock, Users, ArrowLeftRight } from 'lucide-react';
import { DutySchedule, ShiftSwapRequest, User } from '../types';
import { SHIFTS, SHIFT_ORDER, ShiftId, getShift, getShiftWindow, toDateKey, fromDateKey } from '../lib/shifts';
import { dutyService, emptySchedule } from '../services/dutyService';
import DutyNow from './DutyNow';
import { SwapPanel, SwapRequestModal } from './SwapRequests';
import { useI18n, localeOf } from '../i18n';

interface Props {
  schedules: Record<string, DutySchedule>;
  users: User[];
  swaps: ShiftSwapRequest[];
  currentUser: User;
  canManage: boolean;
  onToast: (msg: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MonthlySchedule: React.FC<Props> = ({ schedules, users, swaps, currentUser, canManage, onToast }) => {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const activeUsers = users.filter(u => !u.disabled);
  const nameOf = (id: string) => users.find(u => u.id === id)?.username ?? '?';
  const isAdmin = currentUser.role === 'Admin';

  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(year, month, i + 1))), [year, month, daysInMonth]);
  const cells = useMemo(() => {
    const out: (string | null)[] = [...Array(firstWeekday).fill(null), ...days];
    while (out.length % 7) out.push(null);
    return out;
  }, [days, firstWeekday]);

  const monthStats = useMemo(() => {
    let gaps = 0, slots = 0, futureGaps = 0;
    const perAnalyst: Record<string, number> = {};
    days.forEach(k => SHIFTS.forEach(s => {
      const crew = schedules[k]?.[s.id] ?? [];
      if (crew.length === 0) { gaps++; if (k >= today) futureGaps++; }
      slots += crew.length;
      crew.forEach(id => { perAnalyst[id] = (perAnalyst[id] || 0) + 1; });
    }));
    return { gaps, futureGaps, slots, perAnalyst: Object.entries(perAnalyst).sort((a, b) => b[1] - a[1]) };
  }, [days, schedules, today]);

  const badge = (key: string, sid: ShiftId, compact: boolean) => {
    const s = getShift(sid);
    const crew = schedules[key]?.[sid] ?? [];
    const names = crew.map(nameOf);
    return (
      <span key={sid} className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border truncate ${crew.length ? s.badge : 'border-dashed border-zinc-800 text-zinc-700'}`} title={`${t(s.label)}: ${names.join(', ') || t('unassigned')}`}>
        <b>{t(s.label).slice(0, 1)}</b> {crew.length ? (compact ? names.slice(0, 2).join(', ') + (crew.length > 2 ? ` +${crew.length - 2}` : '') : names.join(', ')) : '—'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-white">{t('Duty Roster')}</h3>
          <p className="text-zinc-500 text-sm">{t('24/7 three-shift coverage · Morning 08–16 · Evening 16–00 · Night 00–08')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400 mr-2 cursor-pointer">
            <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="accent-blue-500" /> {t('Highlight my shifts')}
          </label>
          <button aria-label={t('Previous month')} onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="px-3 py-2 rounded-xl border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white">{t('Today')}</button>
          <span className="text-sm font-black text-white w-36 text-center" aria-live="polite">{cursor.toLocaleString(locale, { month: 'long', year: 'numeric' })}</span>
          <button aria-label={t('Next month')} onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <DutyNow schedules={schedules} users={users} currentUser={currentUser} />

      <div className="flex flex-wrap gap-2 text-[11px]">
        {SHIFTS.map(s => <span key={s.id} className={`px-2.5 py-1 rounded-full border font-bold ${s.badge}`}>{t(s.label)} · {s.timing}</span>)}
        <span className="px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-400">{t('{n} assignments', { n: monthStats.slots })}</span>
        <span className={`px-2.5 py-1 rounded-full border ${monthStats.futureGaps ? 'border-red-500/30 text-red-400 bg-red-500/5' : 'border-emerald-500/30 text-emerald-400'}`} title={t('{n} gaps in total this month', { n: monthStats.gaps })}>
          {t('{n} upcoming coverage gaps', { n: monthStats.futureGaps })}
        </span>
        {!canManage && <span className="px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-500 flex items-center gap-1"><Lock className="w-3 h-3" /> {t('Read-only — schedules are managed by administrators')}</span>}
      </div>

      {/* Desktop / tablet month grid */}
      <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/40">
          {WEEKDAYS.map(d => <div key={d} className="p-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">{t(d)}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((key, i) => {
            if (!key) return <div key={`e${i}`} className="min-h-[120px] border-b border-r border-zinc-800/50 bg-zinc-950/30" />;
            const sched = schedules[key];
            const isToday = key === today;
            const mine = SHIFTS.some(s => sched?.[s.id]?.includes(currentUser.id));
            return (
              <button key={key} onClick={() => setOpenDate(key)} aria-label={t('Roster for {date}', { date: key })}
                className={`min-h-[120px] p-2 text-left border-b border-r border-zinc-800/50 hover:bg-zinc-800/30 transition-all flex flex-col gap-1 min-w-0 ${isToday ? 'ring-1 ring-inset ring-blue-500/60 bg-blue-500/[0.04]' : ''} ${mineOnly && !mine ? 'opacity-30' : ''} ${key < today ? 'opacity-70' : ''}`}>
                <span className={`text-xs font-black ${isToday ? 'text-blue-400' : 'text-zinc-400'}`}>{fromDateKey(key).getDate()}</span>
                {SHIFT_ORDER.map(sid => badge(key, sid, true))}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <ul className="md:hidden space-y-2" aria-label={t('Month agenda')}>
        {days.filter(k => !mineOnly || SHIFTS.some(s => schedules[k]?.[s.id]?.includes(currentUser.id))).map(key => (
          <li key={key}>
            <button onClick={() => setOpenDate(key)} aria-label={t('Roster for {date}', { date: key })}
              className={`w-full text-left p-3 rounded-xl border bg-zinc-900 flex gap-3 ${key === today ? 'border-blue-500/60' : 'border-zinc-800'} ${key < today ? 'opacity-70' : ''}`}>
              <div className="w-12 shrink-0 text-center">
                <p className="text-[10px] text-zinc-500 uppercase">{t(WEEKDAYS[fromDateKey(key).getDay()])}</p>
                <p className={`text-xl font-black ${key === today ? 'text-blue-400' : 'text-white'}`}>{fromDateKey(key).getDate()}</p>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">{SHIFT_ORDER.map(sid => badge(key, sid, false))}</div>
            </button>
          </li>
        ))}
      </ul>

      <SwapPanel swaps={swaps} schedules={schedules} users={users} currentUser={currentUser} isAdmin={isAdmin} onToast={onToast} />

      {monthStats.perAnalyst.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> {t('Shift load this month')}</p>
          <div className="flex flex-wrap gap-2">
            {monthStats.perAnalyst.map(([id, n]) => (
              <span key={id} className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-300"><b className="text-white">{nameOf(id)}</b> · {t('{n} shifts', { n })}</span>
            ))}
          </div>
        </div>
      )}

      {openDate && (
        <DayRosterModal date={openDate} schedule={schedules[openDate] ?? emptySchedule(openDate)} schedules={schedules} swaps={swaps}
          users={activeUsers} allUsers={users} canManage={canManage} currentUser={currentUser} onClose={() => setOpenDate(null)} onToast={onToast} />
      )}
    </div>
  );
};

interface ModalProps {
  date: string;
  schedule: DutySchedule;
  schedules: Record<string, DutySchedule>;
  swaps: ShiftSwapRequest[];
  users: User[];
  allUsers: User[];
  canManage: boolean;
  currentUser: User;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const DayRosterModal: React.FC<ModalProps> = ({ date, schedule, schedules, swaps, users, allUsers, canManage, currentUser, onClose, onToast }) => {
  const { t, lang } = useI18n();
  const [swapOpen, setSwapOpenFlag] = useState(false);
  useEscape(onClose, !swapOpen);
  const [pick, setPick] = useState<Record<ShiftId, string>>({ morning: '', evening: '', night: '' });
  const [busy, setBusy] = useState(false);
  const [swapFor, setSwapForState] = useState<ShiftId | null>(null);
  const setSwapFor = (v: ShiftId | null) => { setSwapForState(v); setSwapOpenFlag(!!v); };
  const nameOf = (id: string) => allUsers.find(u => u.id === id)?.username ?? t('Removed user');

  const commit = async (next: DutySchedule) => {
    setBusy(true);
    try { await dutyService.saveDay(currentUser, next, schedule); }
    catch (e: any) { onToast(t('Roster update failed: {msg}', { msg: e.message })); }
    finally { setBusy(false); }
  };

  const add = (sid: ShiftId) => {
    const id = pick[sid];
    if (!id || schedule[sid].includes(id)) return;
    commit({ ...schedule, [sid]: [...schedule[sid], id] });
    setPick(p => ({ ...p, [sid]: '' }));
  };
  const remove = (sid: ShiftId, id: string) => commit({ ...schedule, [sid]: schedule[sid].filter(x => x !== id) });

  const replicate = async () => {
    const d = fromDateKey(date);
    const targets: string[] = [];
    const cur = new Date(d); cur.setDate(cur.getDate() + 7);
    while (cur.getMonth() === d.getMonth()) { targets.push(toDateKey(cur)); cur.setDate(cur.getDate() + 7); }
    if (!targets.length) { onToast(t('No remaining matching weekdays this month')); return; }
    if (!(await uiConfirm(t('Copy this roster to {n} upcoming matching weekday(s) this month? Existing assignments on those days will be replaced.', { n: targets.length })))) return;
    setBusy(true);
    try { await dutyService.copyDay(currentUser, schedule, targets); onToast(t('Roster replicated to {n} day(s)', { n: targets.length })); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="day-title">
      <div className="modal-entrance w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <CalendarDays className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h3 id="day-title" className="text-base sm:text-lg font-black text-white">{fromDateKey(date).toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
              <p className="text-[11px] text-zinc-500">{schedule.updatedBy ? t('Last updated by {user} · {time}', { user: schedule.updatedBy, time: new Date(schedule.updatedAt).toLocaleString() }) : t('No roster saved yet')}{busy ? ` · ${t('syncing…')}` : ''}</p>
            </div>
          </div>
          <button aria-label={t('Close')} onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {SHIFT_ORDER.map(sid => {
            const s = getShift(sid);
            const crew = schedule[sid];
            const available = users.filter(u => !crew.includes(u.id));
            const future = getShiftWindow(date, sid).start > new Date();
            const iAmOn = crew.includes(currentUser.id);
            return (
              <div key={sid} className={`rounded-2xl border p-4 ${s.badge}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className={`text-sm font-black ${s.text}`}>{t(s.label)} <span className="text-zinc-500 font-mono text-xs ml-2">{s.timing}</span></p>
                  <div className="flex items-center gap-2">
                    {crew.length === 0 && <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('Coverage gap')}</span>}
                    {iAmOn && future && (
                      <button onClick={() => setSwapFor(sid)} className="text-[11px] font-bold px-2 py-1 rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> {t('Request swap')}</button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {crew.length === 0 && <span className="text-xs text-zinc-500">{t('No engineers assigned')}</span>}
                  {crew.map(id => (
                    <span key={id} className="flex items-center gap-1.5 text-xs font-bold bg-zinc-950/60 text-zinc-200 px-3 py-1 rounded-full border border-zinc-800">
                      {nameOf(id)}
                      {canManage && <button aria-label={t('Remove {name}', { name: nameOf(id) })} disabled={busy} onClick={() => remove(sid, id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
                    </span>
                  ))}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <select aria-label={t('Select engineer for {shift}', { shift: t(s.label) })} value={pick[sid]} onChange={e => setPick(p => ({ ...p, [sid]: e.target.value }))} className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none">
                      <option value="">{t('Select engineer…')}</option>
                      {available.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                    </select>
                    <button disabled={!pick[sid] || busy} onClick={() => add(sid)} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> {t('Assign')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {canManage && (
          <div className="p-5 sm:p-6 border-t border-zinc-800 flex flex-wrap justify-between items-center gap-3">
            <button onClick={replicate} disabled={busy} className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2"><Copy className="w-4 h-4" /> {t('Repeat weekly for rest of month')}</button>
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-zinc-800 text-white text-xs font-bold">{t('Done')}</button>
          </div>
        )}
      </div>
      {swapFor && (
        <div onClick={e => e.stopPropagation()}>
          <SwapRequestModal date={date} shift={swapFor} currentUser={currentUser} users={users} schedules={schedules} swaps={swaps} onClose={() => setSwapFor(null)} onDone={onToast} />
        </div>
      )}
    </div>
  );
};

export default MonthlySchedule;
