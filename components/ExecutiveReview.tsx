import React, { useMemo, useState } from 'react';
import { TrendingUp, Crosshair, Globe, Gauge, Download, Timer, ShieldAlert, ArrowRightLeft, ListChecks } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell, LineChart, Line } from 'recharts';
import { HandoverAck, ShiftReport, SlaPolicy, User } from '../types';
import { SHIFTS, getShift, toDateKey } from '../lib/shifts';
import { computeHandoverCompliance, computeMetrics, filterReports, presetRange, RangePreset, SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import { DEFAULT_SLA, formatMinutes, SLA_STYLE } from '../lib/sla';
import { downloadBlob } from '../services/reportExport';
import { auditService } from '../services/auditService';
import { useT } from '../i18n';

interface Props { reports: ShiftReport[]; acks: HandoverAck[]; sla?: SlaPolicy; currentUser: User }

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 };

/** Pure markdown builder for the executive brief (also used by scheduled reports). */
export const buildExecutiveBrief = (
  reports: ShiftReport[], acks: HandoverAck[], range: { from: string; to: string } | null, sla: SlaPolicy,
  meta: { generatedBy: string; includeDrafts: boolean; title?: string }
): string => {
  const scoped = filterReports(reports, range, meta.includeDrafts);
  const m = computeMetrics(scoped, range, sla);
  const h = computeHandoverCompliance(scoped, acks);
  const rangeLabel = range ? `${range.from} → ${range.to}` : 'All time';
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v}%`);
  return [
    `# ${meta.title ?? 'Executive Threat Brief'}`, '',
    `_Window: ${rangeLabel} · ${meta.includeDrafts ? 'drafts included' : 'finalized reports only'} · generated ${new Date().toLocaleString()} by ${meta.generatedBy}_`, '',
    '## Headline', '',
    `- Reports in scope: **${m.totalReports}** (${m.finalizedReports} finalized)`,
    `- Monitored events: **${m.totalEvents}**`,
    `- Criticality index: **${m.criticalityIndex}%**`,
    `- Severity: ${SEVERITIES.map(s => `${s} ${m.bySeverity[s]}`).join(' · ')}`, '',
    '## Response performance', '',
    `- SLA compliance: **${pct(m.sla.compliancePct)}** (contain met ${m.sla.containMet} / breached ${m.sla.containBreached}; resolve met ${m.sla.resolveMet} / breached ${m.sla.resolveBreached})`,
    `- Mean time to detect: ${formatMinutes(m.sla.mttdMinutes)} · to contain: ${formatMinutes(m.sla.mttcMinutes)} · to resolve: ${formatMinutes(m.sla.mttrMinutes)}`,
    `- Open items: **${m.sla.openItems}** (Open ${m.sla.byStatus.Open}, Contained ${m.sla.byStatus.Contained})`,
    `- Handover sign-off compliance: **${pct(h.pct)}** (${h.acknowledged}/${h.finalized} finalized reports acknowledged)`, '',
    '| Severity | MTTC | MTTR | Breached / total |', '|---|---|---|---|',
    ...SEVERITIES.map(s => `| ${s} | ${formatMinutes(m.sla.bySeverity[s].mttc)} | ${formatMinutes(m.sla.bySeverity[s].mttr)} | ${m.sla.bySeverity[s].breached} / ${m.sla.bySeverity[s].total} |`), '',
    ...(m.sla.breaches.length ? ['## SLA breaches', '', ...m.sla.breaches.slice(0, 20).map(b => `- **${b.event.severity}** ${b.event.eventName} (${b.event.reportId}) — ${b.kind} target missed, status ${b.event.status ?? 'Open'}`), ''] : []),
    '## Top threat vectors', '', ...(m.topAttackTypes.length ? m.topAttackTypes.map((a, i) => `${i + 1}. ${a.name} — ${a.count}`) : ['_None_']), '',
    '## Top hostile source IPs', '', ...(m.topSourceIps.length ? m.topSourceIps.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count} events (max ${a.maxSeverity})`) : ['_None_']), '',
    '## Most targeted assets', '', ...(m.topTargets.length ? m.topTargets.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count}`) : ['_None_']), '',
    '## Volume by shift', '', ...SHIFTS.map(s => `- ${s.label}: ${m.byShift[s.id]}`),
  ].join('\n');
};

const ExecutiveReview: React.FC<Props> = ({ reports, acks, sla = DEFAULT_SLA, currentUser }) => {
  const t = useT();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [custom, setCustom] = useState({ from: toDateKey(new Date(Date.now() - 6 * 864e5)), to: toDateKey(new Date()) });
  const [includeDrafts, setIncludeDrafts] = useState(true);

  const range = presetRange(preset, custom);
  const scoped = useMemo(() => filterReports(reports, range, includeDrafts), [reports, range?.from, range?.to, includeDrafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => computeMetrics(scoped, range, sla), [scoped, sla]); // eslint-disable-line react-hooks/exhaustive-deps
  const handover = useMemo(() => computeHandoverCompliance(scoped, acks), [scoped, acks]);

  const critColor = m.criticalityIndex >= 40 ? 'text-red-400' : m.criticalityIndex >= 20 ? 'text-orange-400' : 'text-emerald-400';
  const compColor = m.sla.compliancePct === null ? 'text-zinc-400' : m.sla.compliancePct >= 90 ? 'text-emerald-400' : m.sla.compliancePct >= 75 ? 'text-amber-300' : 'text-red-400';
  const shiftData = SHIFTS.map(s => ({ name: t(s.label), events: m.byShift[s.id], fill: s.hex }));
  const rangeLabel = range ? `${range.from} → ${range.to}` : t('All time');
  const responseTrend = m.daily.map(d => ({ date: d.date, MTTC: d.mttc, MTTR: d.mttr }));
  const hasTrend = responseTrend.some(d => d.MTTC !== null || d.MTTR !== null);

  const exportBrief = () => {
    const md = buildExecutiveBrief(reports, acks, range, sla, { generatedBy: currentUser.username, includeDrafts });
    downloadBlob(new Blob([md], { type: 'text/markdown' }), `GEYES_executive_brief_${toDateKey(new Date())}.md`);
    auditService.log(currentUser, 'REPORT_EXPORTED', { id: 'executive-brief', name: 'Executive Threat Brief' }, { range: rangeLabel });
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-white">{t('Executive Review')}</h3>
          <p className="text-zinc-500 text-sm">{t('Threat and response metrics aggregated across shift reports')} · {rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap bg-zinc-900 border border-zinc-800 rounded-xl p-1" role="tablist" aria-label={t('Date range')}>
            {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['custom', 'Custom'], ['all', 'All']] as [RangePreset, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={preset === k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${preset === k ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{t(l)}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <input type="date" aria-label={t('From')} value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
              <input type="date" aria-label={t('To')} value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-400 px-2"><input type="checkbox" className="accent-blue-500" checked={includeDrafts} onChange={e => setIncludeDrafts(e.target.checked)} /> {t('Include drafts')}</label>
          <button onClick={exportBrief} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-2"><Download className="w-3.5 h-3.5" /> {t('Brief (.md)')}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={TrendingUp} label={t('Monitored events')} value={m.totalEvents} sub={t('{n} reports · {s} sealed', { n: m.totalReports, s: m.finalizedReports })} />
        <Kpi icon={Gauge} label={t('Criticality index')} value={<span className={critColor}>{m.criticalityIndex}%</span>} sub={t('High + Critical share of events')} />
        <Kpi icon={Crosshair} label={t('Top threat vector')} value={<span className="text-xl">{m.topAttackTypes[0]?.name ?? '—'}</span>} sub={m.topAttackTypes[0] ? t('{n} events', { n: m.topAttackTypes[0].count }) : t('No data')} />
        <Kpi icon={Globe} label={t('Primary hostile IP')} value={<span className="text-xl font-mono">{m.topSourceIps[0]?.name ?? '—'}</span>} sub={m.topSourceIps[0] ? t('{n} events · max {s}', { n: m.topSourceIps[0].count, s: t(m.topSourceIps[0].maxSeverity) }) : t('No data')} />
      </div>

      <div>
        <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800" role="img" aria-label={t('Severity distribution')}>
          {SEVERITIES.map(s => m.totalEvents > 0 && m.bySeverity[s] > 0 && (
            <div key={s} title={`${t(s)}: ${m.bySeverity[s]}`} style={{ width: `${(m.bySeverity[s] / m.totalEvents) * 100}%`, background: SEVERITY_STYLE[s].hex }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {SEVERITIES.map(s => <span key={s} className={`text-[11px] px-2 py-0.5 rounded border font-bold ${SEVERITY_STYLE[s].badge}`}>{t(s)} · {m.bySeverity[s]}</span>)}
        </div>
      </div>

      {/* Response performance */}
      <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 pt-2"><Timer className="w-4 h-4 text-sky-400" /> {t('Response performance')}</h4>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Kpi icon={ShieldAlert} label={t('SLA compliance')} value={<span className={compColor}>{m.sla.compliancePct === null ? '—' : `${m.sla.compliancePct}%`}</span>} sub={t('{b} breach(es)', { b: m.sla.containBreached + m.sla.resolveBreached })} />
        <Kpi icon={Timer} label="MTTD" value={formatMinutes(m.sla.mttdMinutes)} sub={t('Mean time to detect')} />
        <Kpi icon={Timer} label="MTTC" value={formatMinutes(m.sla.mttcMinutes)} sub={t('Mean time to contain')} />
        <Kpi icon={Timer} label="MTTR" value={formatMinutes(m.sla.mttrMinutes)} sub={t('Mean time to resolve')} />
        <Kpi icon={ListChecks} label={t('Open items')} value={m.sla.openItems} sub={t('{o} open · {c} contained', { o: m.sla.byStatus.Open, c: m.sla.byStatus.Contained })} />
        <Kpi icon={ArrowRightLeft} label={t('Handover sign-off')} value={handover.pct === null ? '—' : `${handover.pct}%`} sub={t('{a}/{f} acknowledged', { a: handover.acknowledged, f: handover.finalized })} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title={t('Response-time trend (hours)')}>
          {!hasTrend ? <Empty /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={responseTrend.map(d => ({ ...d, MTTC: d.MTTC === null ? null : +(d.MTTC / 60).toFixed(2), MTTR: d.MTTR === null ? null : +(d.MTTR / 60).toFixed(2) }))}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="MTTC" stroke="#38bdf8" strokeWidth={2} connectNulls dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="MTTR" stroke="#a78bfa" strokeWidth={2} connectNulls dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={t('Response times by severity')}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="text-[10px] text-zinc-500 uppercase border-b border-zinc-800"><th className="py-2">{t('Severity')}</th><th className="py-2">{t('Target (contain / resolve)')}</th><th className="py-2">MTTC</th><th className="py-2">MTTR</th><th className="py-2">{t('Breached')}</th></tr></thead>
              <tbody className="divide-y divide-zinc-800/50">
                {SEVERITIES.map(s => (
                  <tr key={s}>
                    <td className="py-2"><span className={`text-[10px] px-2 py-0.5 rounded border font-black ${SEVERITY_STYLE[s].badge}`}>{t(s)}</span></td>
                    <td className="py-2 text-zinc-400">{formatMinutes(sla[s].containMinutes)} / {formatMinutes(sla[s].resolveMinutes)}</td>
                    <td className="py-2 text-zinc-200">{formatMinutes(m.sla.bySeverity[s].mttc)}</td>
                    <td className="py-2 text-zinc-200">{formatMinutes(m.sla.bySeverity[s].mttr)}</td>
                    <td className={`py-2 font-bold ${m.sla.bySeverity[s].breached ? 'text-red-400' : 'text-zinc-500'}`}>{m.sla.bySeverity[s].breached} / {m.sla.bySeverity[s].total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {(m.sla.breaches.length > 0 || m.sla.atRisk.length > 0) && (
        <Panel title={t('SLA breaches & at-risk items')}>
          <ul className="divide-y divide-zinc-800/60">
            {[...m.sla.breaches.map(b => ({ ...b, state: 'breached' as const })), ...m.sla.atRisk.map(b => ({ ...b, state: 'at_risk' as const }))].slice(0, 25).map(b => (
              <li key={`${b.event.reportId}-${b.event.id}-${b.kind}`} className="py-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`px-1.5 rounded border font-black uppercase ${SLA_STYLE[b.state]}`}>{t(b.state)}</span>
                <span className={`px-1.5 rounded border font-bold ${SEVERITY_STYLE[b.event.severity].badge}`}>{t(b.event.severity)}</span>
                <span className="text-zinc-200 font-bold flex-1 min-w-[180px]">{b.event.eventName}</span>
                <span className="text-zinc-500">{t(b.kind === 'contain' ? 'Contain' : 'Resolve')} · {t('due')} {new Date(b.kind === 'contain' ? b.evaluation.containDueAt : b.evaluation.resolveDueAt).toLocaleString()}</span>
                <span className="text-zinc-500 font-mono">{b.event.reportDate} {t(getShift(b.event.shift).label)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 pt-2"><Crosshair className="w-4 h-4 text-red-400" /> {t('Threat landscape')}</h4>
      <Panel title={t('Threat volume over time')}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.daily}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickFormatter={d => d.slice(5)} />
              <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SEVERITIES.map(s => <Bar key={s} dataKey={s} name={t(s)} stackId="sev" fill={SEVERITY_STYLE[s].hex} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title={t('Threat vector analysis')}>
          {m.topAttackTypes.length === 0 ? <Empty /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.topAttackTypes} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={11} width={120} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" name={t('Events')} fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={t('Volume by shift')}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftData}>
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="events" name={t('Events')} radius={[6, 6, 0, 0]}>{shiftData.map(d => <Cell key={d.name} fill={d.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <RankTable title={t('Hostile source IPs')} rows={m.topSourceIps.map(r => ({ name: r.name, count: r.count, tag: r.maxSeverity }))} mono />
        <RankTable title={t('Most targeted destinations')} rows={m.topTargets} mono />
        <RankTable title={t('Analyst activity')} rows={m.byAnalyst} />
      </div>
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub: string }> = ({ icon: Icon, label, value, sub }) => (
  <div className="bg-zinc-900 border border-zinc-800 p-4 sm:p-5 rounded-[1.5rem] shadow-2xl min-w-0">
    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{label}</span></p>
    <div className="text-2xl sm:text-3xl font-black text-white mt-1 truncate">{value}</div>
    <p className="text-[11px] text-zinc-500 mt-1 truncate">{sub}</p>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xl min-w-0">
    <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-4">{title}</h4>
    {children}
  </section>
);

const Empty = () => { const t = useT(); return <p className="text-sm text-zinc-500 py-10 text-center">{t('No events in this window.')}</p>; };

const RankTable: React.FC<{ title: string; rows: { name: string; count: number; tag?: string }[]; mono?: boolean }> = ({ title, rows, mono }) => {
  const t = useT();
  const max = rows[0]?.count || 1;
  return (
    <Panel title={title}>
      {rows.length === 0 ? <Empty /> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className={`truncate text-zinc-200 ${mono ? 'font-mono' : 'font-bold'}`}>{i + 1}. {r.name}</span>
                <span className="text-zinc-400 shrink-0">{r.tag && <span className={`mr-2 text-[9px] px-1.5 rounded border font-bold ${SEVERITY_STYLE[r.tag as keyof typeof SEVERITY_STYLE]?.badge ?? ''}`}>{t(r.tag)}</span>}{r.count}</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full mt-1"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};

export default ExecutiveReview;
