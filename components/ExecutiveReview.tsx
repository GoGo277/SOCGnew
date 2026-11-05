import React, { useMemo, useState } from 'react';
import { TrendingUp, Crosshair, Globe, Gauge, FileCheck2, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import { ShiftReport, User } from '../types';
import { SHIFTS, toDateKey } from '../lib/shifts';
import { computeMetrics, filterReports, presetRange, RangePreset, SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import { downloadBlob } from '../services/reportExport';
import { auditService } from '../services/auditService';

interface Props { reports: ShiftReport[]; currentUser: User }

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 };

const ExecutiveReview: React.FC<Props> = ({ reports, currentUser }) => {
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [custom, setCustom] = useState({ from: toDateKey(new Date(Date.now() - 6 * 864e5)), to: toDateKey(new Date()) });
  const [includeDrafts, setIncludeDrafts] = useState(true);

  const range = presetRange(preset, custom);
  const scoped = useMemo(() => filterReports(reports, range, includeDrafts), [reports, range?.from, range?.to, includeDrafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => computeMetrics(scoped, range), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps

  const critColor = m.criticalityIndex >= 40 ? 'text-red-400' : m.criticalityIndex >= 20 ? 'text-orange-400' : 'text-emerald-400';
  const shiftData = SHIFTS.map(s => ({ name: s.label.replace(' Shift', ''), events: m.byShift[s.id], fill: s.hex }));
  const rangeLabel = range ? `${range.from} → ${range.to}` : 'All time';

  const exportBrief = () => {
    const lines = [
      `# Executive Threat Brief`, '', `_Window: ${rangeLabel} · ${includeDrafts ? 'drafts included' : 'finalized reports only'} · generated ${new Date().toLocaleString()} by ${currentUser.username}_`, '',
      `- Reports in scope: **${m.totalReports}** (${m.finalizedReports} finalized)`,
      `- Total monitored events: **${m.totalEvents}**`,
      `- Criticality index: **${m.criticalityIndex}%**`,
      `- Severity: ${SEVERITIES.map(s => `${s} ${m.bySeverity[s]}`).join(' · ')}`, '',
      '## Top threat vectors', '', ...m.topAttackTypes.map((a, i) => `${i + 1}. ${a.name} — ${a.count}`), '',
      '## Top hostile source IPs', '', ...m.topSourceIps.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count} events (max ${a.maxSeverity})`), '',
      '## Most targeted assets', '', ...m.topTargets.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count}`), '',
      '## Volume by shift', '', ...SHIFTS.map(s => `- ${s.label}: ${m.byShift[s.id]}`),
    ];
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), `GEYES_executive_brief_${toDateKey(new Date())}.md`);
    auditService.log(currentUser, 'REPORT_EXPORTED', { id: 'executive-brief', name: 'Executive Threat Brief' }, { range: rangeLabel });
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black text-white">Executive Review</h3>
          <p className="text-zinc-500 text-sm">Threat metrics aggregated across shift reports · {rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1" role="tablist">
            {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['custom', 'Custom'], ['all', 'All']] as [RangePreset, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={preset === k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${preset === k ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <input type="date" aria-label="From" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
              <input type="date" aria-label="To" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-400 px-2"><input type="checkbox" className="accent-blue-500" checked={includeDrafts} onChange={e => setIncludeDrafts(e.target.checked)} /> Include drafts</label>
          <button onClick={exportBrief} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-2"><Download className="w-3.5 h-3.5" /> Brief (.md)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={TrendingUp} label="Monitored events" value={m.totalEvents} sub={`${m.totalReports} reports · ${m.finalizedReports} sealed`} />
        <Kpi icon={Gauge} label="Criticality index" value={<span className={critColor}>{m.criticalityIndex}%</span>} sub="High + Critical share of events" />
        <Kpi icon={Crosshair} label="Top threat vector" value={<span className="text-xl">{m.topAttackTypes[0]?.name ?? '—'}</span>} sub={m.topAttackTypes[0] ? `${m.topAttackTypes[0].count} events` : 'No data'} />
        <Kpi icon={Globe} label="Primary hostile IP" value={<span className="text-xl font-mono">{m.topSourceIps[0]?.name ?? '—'}</span>} sub={m.topSourceIps[0] ? `${m.topSourceIps[0].count} events · max ${m.topSourceIps[0].maxSeverity}` : 'No data'} />
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800" aria-label="Severity distribution">
        {SEVERITIES.map(s => m.totalEvents > 0 && m.bySeverity[s] > 0 && (
          <div key={s} title={`${s}: ${m.bySeverity[s]}`} style={{ width: `${(m.bySeverity[s] / m.totalEvents) * 100}%`, background: SEVERITY_STYLE[s].hex }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 -mt-3">
        {SEVERITIES.map(s => <span key={s} className={`text-[11px] px-2 py-0.5 rounded border font-bold ${SEVERITY_STYLE[s].badge}`}>{s} · {m.bySeverity[s]}</span>)}
      </div>

      <Panel title="Threat volume over time">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.daily}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickFormatter={d => d.slice(5)} />
              <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SEVERITIES.map(s => <Bar key={s} dataKey={s} stackId="sev" fill={SEVERITY_STYLE[s].hex} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Threat vector analysis">
          {m.topAttackTypes.length === 0 ? <Empty /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.topAttackTypes} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={11} width={140} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Volume by shift">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftData}>
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="events" radius={[6, 6, 0, 0]}>{shiftData.map(d => <Cell key={d.name} fill={d.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <RankTable title="Hostile source IPs" rows={m.topSourceIps.map(r => ({ name: r.name, count: r.count, tag: r.maxSeverity }))} mono />
        <RankTable title="Most targeted destinations" rows={m.topTargets} mono />
        <RankTable title="Analyst activity" rows={m.byAnalyst} icon={FileCheck2} />
      </div>
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub: string }> = ({ icon: Icon, label, value, sub }) => (
  <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-[1.5rem] shadow-2xl min-w-0">
    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Icon className="w-3.5 h-3.5" /> {label}</p>
    <div className="text-3xl font-black text-white mt-1 truncate">{value}</div>
    <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl">
    <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-4">{title}</h4>
    {children}
  </section>
);

const Empty = () => <p className="text-sm text-zinc-500 py-10 text-center">No events in this window.</p>;

const RankTable: React.FC<{ title: string; rows: { name: string; count: number; tag?: string }[]; mono?: boolean; icon?: React.ElementType }> = ({ title, rows, mono }) => {
  const max = rows[0]?.count || 1;
  return (
    <Panel title={title}>
      {rows.length === 0 ? <Empty /> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className={`truncate text-zinc-200 ${mono ? 'font-mono' : 'font-bold'}`}>{i + 1}. {r.name}</span>
                <span className="text-zinc-400 shrink-0">{r.tag && <span className={`mr-2 text-[9px] px-1.5 rounded border font-bold ${SEVERITY_STYLE[r.tag as keyof typeof SEVERITY_STYLE]?.badge ?? ''}`}>{r.tag}</span>}{r.count}</span>
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
