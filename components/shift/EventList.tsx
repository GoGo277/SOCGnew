import React, { useState } from 'react';
import { Edit3, Trash2, Siren, CornerDownRight, ChevronDown, ExternalLink } from 'lucide-react';
import { Alert, DfirCase, EventStatus, ShiftEvent, SlaPolicy } from '../../types';
import { ALERT_STATUS_STYLE } from '../../lib/dfir';
import { EVENT_STATUSES, EVENT_STATUS_STYLE, SLA_STYLE, evaluateSla, eventStatus, formatMinutes, SlaState } from '../../lib/sla';
import { SEVERITY_STYLE } from '../../services/analytics';
import { useT } from '../../i18n';

interface Props {
  events: ShiftEvent[];
  sla: SlaPolicy;
  editable: boolean;
  canEscalate: boolean;
  onEdit: (e: ShiftEvent) => void;
  onRemove: (e: ShiftEvent) => void;
  onStatus: (e: ShiftEvent, s: EventStatus) => void;
  onEscalate: (e: ShiftEvent) => void;
  alerts?: Alert[];
  cases?: DfirCase[];
  onOpenAlert?: (id: string) => void;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtFull = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

/** Combined SLA state for display: the first unmet checkpoint. */
const headline = (c: SlaState, r: SlaState): { state: SlaState; label: string } =>
  c === 'breached' ? { state: c, label: 'Contain' } : c === 'met' || c === 'n/a' ? { state: r, label: 'Resolve' } : { state: c, label: 'Contain' };

const SlaBadge: React.FC<{ e: ShiftEvent; sla: SlaPolicy }> = ({ e, sla }) => {
  const t = useT();
  const ev = evaluateSla(e, sla);
  const h = headline(ev.contain, ev.resolve);
  const due = h.label === 'Contain' ? ev.containDueAt : ev.resolveDueAt;
  return (
    <span title={`${t('Contain')}: ${t(ev.contain)} · ${t('Resolve')}: ${t(ev.resolve)} · ${t('due')} ${fmtFull(due)}`}
      className={`inline-flex text-[9px] px-1.5 py-0.5 rounded border font-black uppercase whitespace-nowrap ${SLA_STYLE[h.state]}`}>
      {h.state === 'n/a' ? t('n/a') : `${t(h.label)} · ${t(h.state)}`}
    </span>
  );
};

const StatusControl: React.FC<{ e: ShiftEvent; editable: boolean; onStatus: (s: EventStatus) => void }> = ({ e, editable, onStatus }) => {
  const t = useT();
  const st = eventStatus(e);
  if (!editable) return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-black uppercase ${EVENT_STATUS_STYLE[st]}`}>{t(st)}</span>;
  return (
    <select aria-label={t('Status')} value={st} onClick={ev => ev.stopPropagation()} onChange={ev => onStatus(ev.target.value as EventStatus)}
      className={`text-[10px] px-1.5 py-0.5 rounded border font-black uppercase bg-transparent cursor-pointer ${EVENT_STATUS_STYLE[st]}`}>
      {EVENT_STATUSES.map(s => <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{t(s)}</option>)}
    </select>
  );
};

const Details: React.FC<{ e: ShiftEvent; sla: SlaPolicy }> = ({ e, sla }) => {
  const t = useT();
  const ev = evaluateSla(e, sla);
  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          [t('First activity'), fmtFull(e.occurredAt)], [t('Detected'), fmtFull(e.timestamp)], [t('Contained'), fmtFull(e.containedAt)],
          [t('Resolved'), fmtFull(e.resolvedAt)], [t('Time to contain'), formatMinutes(ev.ttcMinutes)], [t('Time to resolve'), formatMinutes(ev.ttrMinutes)],
        ].map(([k, v]) => <div key={k}><p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{k}</p><p className="text-zinc-300">{v}</p></div>)}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[[t('Investigation / forensic findings'), e.investigation], [t('Remediation'), e.remediation], [t('SOC conclusion'), e.conclusion]].map(([k, v]) => (
          <div key={k}><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{k}</p><p className="text-zinc-300 whitespace-pre-wrap">{v || '—'}</p></div>
        ))}
      </div>
    </div>
  );
};

const Markers: React.FC<{ e: ShiftEvent; alerts?: Alert[]; cases?: DfirCase[]; onOpenAlert?: (id: string) => void }> = ({ e, alerts = [], cases = [], onOpenAlert }) => {
  const t = useT();
  const alert = e.escalatedAlertId ? alerts.find(a => a.id === e.escalatedAlertId) : undefined;
  const linkedCase = alert?.caseId ? cases.find(c => c.id === alert.caseId) : undefined;
  return (
    <>
      {e.carriedFromReportId && <span title={t('Carried over from {id}', { id: e.carriedFromReportId })} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 rounded border border-violet-500/30 text-violet-400"><CornerDownRight className="w-2.5 h-2.5" />{t('Carried over')}</span>}
      {e.escalatedIncidentId && <span title={t('Escalated by {user}', { user: e.escalatedBy ?? '' })} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 rounded border border-red-500/30 text-red-400"><ExternalLink className="w-2.5 h-2.5" />{t('Incident')} {e.escalatedIncidentId.slice(0, 8)}</span>}
      {e.escalatedAlertId && (
        <button type="button" onClick={ev => { ev.stopPropagation(); onOpenAlert?.(e.escalatedAlertId!); }} title={t('Escalated by {user}', { user: e.escalatedBy ?? '' })}
          className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 rounded border ${alert ? ALERT_STATUS_STYLE[alert.status] : 'border-red-500/30 text-red-400'}`}>
          <ExternalLink className="w-2.5 h-2.5" />{t('Alert')} #{alert?.number ?? '…'}{alert && ` · ${t(alert.status)}`}{linkedCase && ` → ${t('Case')} #${linkedCase.number}`}
        </button>
      )}
    </>
  );
};

const EventList: React.FC<Props> = ({ events, sla, editable, canEscalate, onEdit, onRemove, onStatus, onEscalate, alerts, cases, onOpenAlert }) => {
  const t = useT();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (events.length === 0) return <p className="p-8 text-center text-sm text-zinc-500">{t('No events logged for this shift yet.')}</p>;

  const actions = (e: ShiftEvent) => editable && (
    <div className="flex justify-end gap-1" onClick={ev => ev.stopPropagation()}>
      {canEscalate && !e.escalatedIncidentId && !e.escalatedAlertId && (e.severity === 'Critical' || e.severity === 'High' || eventStatus(e) === 'Open') && (
        <button aria-label={t('Escalate to alert')} title={t('Escalate to alert')} onClick={() => onEscalate(e)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Siren className="w-4 h-4" /></button>
      )}
      <button aria-label={t('Edit event')} title={t('Edit event')} onClick={() => onEdit(e)} className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400"><Edit3 className="w-4 h-4" /></button>
      <button aria-label={t('Remove event')} title={t('Remove event')} onClick={() => onRemove(e)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
    </div>
  );

  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] font-bold text-zinc-500 uppercase">
            <th className="p-3">{t('Time')}</th><th className="p-3">{t('Severity')}</th><th className="p-3">{t('Status')}</th><th className="p-3">{t('Event')}</th>
            <th className="p-3">{t('Source → Destination')}</th><th className="p-3">{t('SLA')}</th><th className="p-3">{t('Analyst')}</th><th className="p-3 text-right">{t('Actions')}</th>
          </tr></thead>
          <tbody className="divide-y divide-zinc-800/50">
            {events.map(e => (
              <React.Fragment key={e.id}>
                <tr className="hover:bg-zinc-800/20 cursor-pointer" onClick={() => setExpanded(x => (x === e.id ? null : e.id))} aria-expanded={expanded === e.id}>
                  <td className="p-3 text-xs font-mono text-zinc-400 whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                  <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase ${SEVERITY_STYLE[e.severity].badge}`}>{t(e.severity)}</span></td>
                  <td className="p-3"><StatusControl e={e} editable={editable} onStatus={s => onStatus(e, s)} /></td>
                  <td className="p-3"><p className="text-sm font-bold text-zinc-200">{e.eventName}</p><div className="flex flex-wrap items-center gap-1 mt-0.5"><span className="text-[10px] text-zinc-500">{e.attackType || t('Unclassified')}</span><Markers e={e} alerts={alerts} cases={cases} onOpenAlert={onOpenAlert} /></div></td>
                  <td className="p-3 text-xs font-mono whitespace-nowrap"><span className="text-red-400/80">{e.sourceIp || '—'}</span> <span className="text-zinc-600">→</span> <span className="text-blue-400/80">{e.destinationIp || '—'}</span>{e.port && <span className="text-zinc-500">:{e.port}</span>}</td>
                  <td className="p-3"><SlaBadge e={e} sla={sla} /></td>
                  <td className="p-3 text-xs text-zinc-400">{e.loggedBy}</td>
                  <td className="p-3 text-right">{actions(e)}</td>
                </tr>
                {expanded === e.id && <tr className="bg-zinc-950/40"><td colSpan={8} className="p-4"><Details e={e} sla={sla} /></td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <ul className="lg:hidden divide-y divide-zinc-800/60">
        {events.map(e => (
          <li key={e.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <button className="text-left flex-1 min-w-0" onClick={() => setExpanded(x => (x === e.id ? null : e.id))} aria-expanded={expanded === e.id}>
                <p className="text-sm font-bold text-zinc-100 break-words">{e.eventName}</p>
                <p className="text-[11px] text-zinc-500">{fmtTime(e.timestamp)} · {e.attackType || t('Unclassified')} · {e.loggedBy}</p>
              </button>
              <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${expanded === e.id ? 'rotate-180' : ''}`} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase ${SEVERITY_STYLE[e.severity].badge}`}>{t(e.severity)}</span>
              <StatusControl e={e} editable={editable} onStatus={s => onStatus(e, s)} />
              <SlaBadge e={e} sla={sla} />
              <Markers e={e} alerts={alerts} cases={cases} onOpenAlert={onOpenAlert} />
            </div>
            <p className="text-xs font-mono break-all"><span className="text-red-400/80">{e.sourceIp || '—'}</span> → <span className="text-blue-400/80">{e.destinationIp || '—'}</span>{e.port && <span className="text-zinc-500">:{e.port}</span>}</p>
            {expanded === e.id && <div className="pt-2"><Details e={e} sla={sla} /></div>}
            {actions(e)}
          </li>
        ))}
      </ul>
    </>
  );
};

export default EventList;
