import React, { useEffect, useState } from 'react';
import { Radio, Clock, ArrowRight, UserCheck, AlertTriangle } from 'lucide-react';
import { DutySchedule, User } from '../types';
import { getActiveShift, formatDuration, SHIFTS } from '../lib/shifts';
import { useT } from '../i18n';

interface Props {
  schedules: Record<string, DutySchedule>;
  users: User[];
  currentUser: User;
  compact?: boolean;
}

/** Real-time "who is on duty right now" panel. */
const DutyNow: React.FC<Props> = ({ schedules, users, currentUser, compact = false }) => {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const active = getActiveShift(now);
  const nameOf = (id: string) => users.find(u => u.id === id)?.username ?? t('Unknown analyst');
  const onDuty = schedules[active.dateKey]?.[active.shift.id] ?? [];
  const nextCrew = schedules[active.next.dateKey]?.[active.next.shift.id] ?? [];
  const iAmOnDuty = onDuty.includes(currentUser.id);

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden" aria-label={t('Duty Now')}>
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: active.shift.hex }} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> {t('Duty Now')} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <h3 className={`text-2xl font-black mt-1 ${active.shift.text}`}>{t(active.shift.label)}</h3>
          <p className="text-xs text-zinc-500 font-mono">{active.shift.timing} · {active.shift.timing12h}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> {t('Ends in')}</p>
          <p className="text-xl font-black text-white">{formatDuration(active.remainingMs)}</p>
          {iAmOnDuty && <span className="inline-flex mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{t('You are on duty')}</span>}
        </div>
      </div>

      <div className="mt-4 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(active.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full transition-all duration-1000" style={{ width: `${active.progress * 100}%`, background: active.shift.hex }} />
      </div>

      <div className={`mt-5 grid gap-4 ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        <div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1"><UserCheck className="w-3 h-3" /> {t('On duty')}</p>
          {onDuty.length === 0 ? (
            <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {t('No engineers assigned — coverage gap')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {onDuty.map(id => (
                <span key={id} className={`text-xs font-bold px-3 py-1 rounded-full border ${active.shift.badge}`}>{nameOf(id)}</span>
              ))}
            </div>
          )}
          {!compact && <p className="text-[11px] text-zinc-500 mt-3">{t('Focus')}: {active.shift.focus.map(f => t(f)).join(' · ')}</p>}
        </div>
        <div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> {t('Next')} · {t(active.next.shift.label)} ({active.next.shift.timing})</p>
          {nextCrew.length === 0 ? (
            <p className="text-xs text-zinc-600">{t('Not yet assigned')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextCrew.map(id => <span key={id} className={`text-xs font-bold px-3 py-1 rounded-full border ${active.next.shift.badge}`}>{nameOf(id)}</span>)}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SHIFTS.map(s => {
            const crew = schedules[active.dateKey]?.[s.id] ?? [];
            const isActive = s.id === active.shift.id;
            return (
              <div key={s.id} className={`rounded-xl border p-3 ${isActive ? s.badge : 'border-zinc-800 bg-zinc-950/40'}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${s.text}`}>{t(s.label)}</p>
                <p className="text-[10px] text-zinc-500 font-mono">{s.timing}</p>
                <p className="text-xs text-zinc-300 mt-1 font-bold">{t('{n} engineers', { n: crew.length })}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default DutyNow;
