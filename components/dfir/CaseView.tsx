import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Edit3, Lock, Unlock, Trash2, Plus, FileDown, Copy, Siren, ShieldAlert, Server, Clock, ListChecks, FileArchive,
  NotebookPen, Eye, Save, FolderOpen, RefreshCw, CloudOff, CheckCircle2,
} from 'lucide-react';
import { CaseObjectKind, CaseOutcome, CaseState, DfirCase, ExportFormat, Severity, User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { caseService } from '../../services/caseService';
import { CaseReportTemplate, caseReportService } from '../../services/caseReport';
import { downloadBlob } from '../../services/reportExport';
import { auditService } from '../../services/auditService';
import { markdownToHtml, MARKDOWN_CSS } from '../../lib/markdown';
import { CASE_OUTCOMES, CASE_STATES, CASE_STATE_STYLE, CLASSIFICATIONS, TASK_STATUSES, TASK_STATUS_STYLE, TLP_STYLE } from '../../lib/dfir';
import { SEVERITIES } from '../../services/analytics';
import { uiConfirm, uiPrompt } from '../../lib/dialogs';
import { AssetForm, EvidenceForm, IocForm, TaskForm, TimelineForm } from './CaseObjectForms';
import { Badge, Empty, Field, Modal, SeverityBadge, Tabs, TagInput, btn, card, fmtDate, inputCls } from './ui';
import { useT } from '../../i18n';

type Tab = 'summary' | 'timeline' | 'iocs' | 'assets' | 'evidence' | 'notes' | 'tasks' | 'activity';

interface Props {
  caseId: string;
  data: DfirData;
  users: User[];
  currentUser: User;
  reportTemplates: CaseReportTemplate[];
  onBack: () => void;
  onOpenAlert: (id: string) => void;
  onToast: (m: string) => void;
  iris?: { enabled: boolean; sync: (c: DfirCase) => Promise<string> };
}

const CATEGORY_COLOR: Record<string, string> = {
  'Initial Access': '#ef4444', Execution: '#f97316', Persistence: '#f59e0b', 'Privilege Escalation': '#eab308', 'Defense Evasion': '#84cc16',
  'Credential Access': '#22c55e', Discovery: '#14b8a6', 'Lateral Movement': '#06b6d4', Collection: '#0ea5e9', 'Command and Control': '#6366f1',
  Exfiltration: '#8b5cf6', Impact: '#d946ef', Remediation: '#10b981', Legitimate: '#64748b', Unspecified: '#94a3b8',
};

const CaseView: React.FC<Props> = ({ caseId, data, users, currentUser, reportTemplates, onBack, onOpenAlert, onToast, iris }) => {
  const t = useT();
  const c = data.cases.find(x => x.id === caseId);
  const [tab, setTab] = useState<Tab>('summary');
  const [form, setForm] = useState<null | { kind: CaseObjectKind | 'case' | 'close' | 'report'; value?: any }>(null);
  const [syncing, setSyncing] = useState(false);
  const isAdmin = currentUser.role === 'Admin';

  const own = useMemo(() => {
    const f = <T extends { caseId: string }>(xs: T[]) => xs.filter(x => x.caseId === caseId);
    return {
      iocs: f(data.iocs), assets: f(data.assets), timeline: f(data.timeline).sort((a, b) => a.date.localeCompare(b.date)),
      evidence: f(data.evidence), notes: f(data.notes), tasks: f(data.tasks), activity: f(data.activity),
    };
  }, [data, caseId]);

  if (!c) return <div className="space-y-4"><button onClick={onBack} className={btn.ghost}><ArrowLeft className="w-4 h-4" /> {t('All cases')}</button><Empty>{t('This case no longer exists.')}</Empty></div>;

  const locked = c.state === 'Closed';
  const customer = data.customers.find(x => x.id === c.customerId);
  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) onToast(ok); setForm(null); } catch (e: any) { onToast(t(e.message)); }
  };
  const saveObject = (kind: CaseObjectKind) => async (payload: any) => {
    if (form?.value) await caseService.updateObject(currentUser, c, kind, form.value, payload);
    else await caseService.addObject(currentUser, c, kind, payload);
    setForm(null);
  };
  const remove = async (kind: CaseObjectKind, obj: any, label: string) => {
    if (await uiConfirm(t('Remove "{name}" from this case?', { name: label }), { tone: 'danger', confirmLabel: t('Remove') })) {
      guard(() => caseService.removeObject(currentUser, c, kind, obj), t('Removed'));
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'summary', label: t('Summary') },
    { id: 'timeline', label: t('Timeline'), count: own.timeline.length },
    { id: 'iocs', label: t('IOCs'), count: own.iocs.length },
    { id: 'assets', label: t('Assets'), count: own.assets.length },
    { id: 'evidence', label: t('Evidence'), count: own.evidence.length },
    { id: 'notes', label: t('Notes'), count: own.notes.length },
    { id: 'tasks', label: t('Tasks'), count: own.tasks.length },
    { id: 'activity', label: t('Activity') },
  ];
  const AddButton: React.FC<{ kind: CaseObjectKind; label: string }> = ({ kind, label }) => (locked ? null : <button onClick={() => setForm({ kind })} className={btn.primary}><Plus className="w-4 h-4" /> {label}</button>);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs font-bold text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> {t('All cases')}</button>

      {/* Case header */}
      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500 font-mono">{t('Case')} #{c.number}{c.socId ? ` · SOC ${c.socId}` : ''}</p>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-100 break-words">{c.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge className={CASE_STATE_STYLE[c.state]}>{t(c.state)}</Badge>
              <SeverityBadge s={c.severity} />
              <Badge className="border-zinc-700 text-zinc-300">{customer?.name ?? '—'}</Badge>
              <Badge className="border-zinc-700 text-zinc-400">{c.classification}</Badge>
              {c.state === 'Closed' && <Badge className="border-zinc-700 text-zinc-300">{t(c.outcome)}</Badge>}
              {c.tags.map(tag => <Badge key={tag} className="border-zinc-800 text-zinc-500">{tag}</Badge>)}
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">{t('Owner')}: {c.ownerName ?? '—'} · {t('Opened {time} by {user}', { time: fmtDate(c.openedAt), user: c.openedBy })}{c.closedAt ? ` · ${t('Closed {time} by {user}', { time: fmtDate(c.closedAt), user: c.closedBy ?? '' })}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <select aria-label={t('Case state')} value={c.state} onChange={e => {
                const s = e.target.value as CaseState;
                if (s === 'Closed') setForm({ kind: 'close' }); else guard(() => caseService.updateCase(currentUser, c, { state: s }), t('State set to {s}', { s: t(s) }));
              }} className={`${inputCls} w-auto py-1.5 text-xs`}>{CASE_STATES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select>
            )}
            {!locked && <button onClick={() => setForm({ kind: 'case' })} className={btn.ghost}><Edit3 className="w-3.5 h-3.5" /> {t('Edit')}</button>}
            {locked
              ? <button onClick={() => guard(() => caseService.reopenCase(currentUser, c), t('Case reopened'))} className={btn.ghost}><Unlock className="w-3.5 h-3.5" /> {t('Reopen')}</button>
              : <button onClick={() => setForm({ kind: 'close' })} className={btn.ghost}><Lock className="w-3.5 h-3.5" /> {t('Close case')}</button>}
            <button onClick={() => setForm({ kind: 'report' })} className={btn.ghost}><FileDown className="w-3.5 h-3.5" /> {t('Report')}</button>
            {iris?.enabled && (
              <button disabled={syncing} onClick={async () => { setSyncing(true); try { onToast(await iris.sync(c)); } catch (e: any) { onToast(e.message); } finally { setSyncing(false); } }} className={btn.ghost}>
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {t('Sync with IRIS')}
              </button>
            )}
            {isAdmin && <button aria-label={t('Delete case')} title={t('Delete case')} onClick={async () => {
              const typed = await uiPrompt(t('Deleting case #{n} removes all its objects. Type the case number to confirm.', { n: c.number }), { title: t('Delete case'), confirmLabel: t('Delete case') });
              if (typed === String(c.number)) guard(async () => { await caseService.deleteCase(currentUser, c, own); onBack(); }, t('Case deleted'));
            }} className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {iris?.enabled && (
          <p className="mt-3 text-[11px] flex items-center gap-1.5 text-zinc-500">
            {c.iris?.error ? <><CloudOff className="w-3.5 h-3.5 text-red-500" /> <span className="text-red-500">{t('IRIS sync failed')}: {c.iris.error}</span></>
              : c.iris?.remoteId ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t('Linked to IRIS case #{id} · last sync {time}', { id: c.iris.remoteId, time: fmtDate(c.iris.syncedAt) })}</>
              : <><CloudOff className="w-3.5 h-3.5" /> {t('Not yet synced to IRIS')}</>}
          </p>
        )}
        {locked && <p className="mt-3 text-xs text-zinc-400 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {t('Closed cases are read-only. Reopen the case to change it.')}</p>}
      </section>

      <section className={card}>
        <div className="px-3 sm:px-4 pt-2"><Tabs<Tab> tabs={tabs} active={tab} onChange={setTab} label={t('Case sections')} /></div>
        <div className="p-3 sm:p-4">
          {tab === 'summary' && <Summary c={c} own={own} data={data} onOpenAlert={onOpenAlert} />}

          {tab === 'timeline' && (
            <div className="space-y-3">
              <div className="flex justify-end"><AddButton kind="timeline" label={t('Add event')} /></div>
              {own.timeline.length === 0 ? <Empty>{t('No timeline events yet.')}</Empty> : (
                <ol className="relative border-l-2 border-zinc-800 ml-2 space-y-4">
                  {own.timeline.map(e => (
                    <li key={e.id} className="ml-4">
                      <span className="absolute -left-[7px] w-3 h-3 rounded-full ring-2 ring-[var(--app-surface)]" style={{ background: CATEGORY_COLOR[e.category] ?? '#94a3b8' }} aria-hidden="true" />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-zinc-500 font-mono">{fmtDate(e.date)} · {t(e.category)}{e.source ? ` · ${e.source}` : ''}{e.inSummary ? ` · ${t('in summary')}` : ''}</p>
                          <p className="text-sm font-bold text-zinc-100">{e.title}</p>
                          {e.content && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{e.content}</p>}
                          {e.raw && <pre className="mt-1 text-[11px] bg-[var(--app-bg)] border border-zinc-800 rounded p-2 overflow-x-auto text-zinc-400">{e.raw}</pre>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {e.assetIds.map(id => own.assets.find(a => a.id === id)).filter(Boolean).map(a => <Badge key={a!.id} className="border-zinc-700 text-zinc-400"><Server className="w-3 h-3" />{a!.name}</Badge>)}
                            {e.iocIds.map(id => own.iocs.find(i => i.id === id)).filter(Boolean).map(i => <Badge key={i!.id} className="border-zinc-700 text-zinc-400 font-mono">{i!.value}</Badge>)}
                          </div>
                        </div>
                        {!locked && <div className="flex gap-1"><button aria-label={t('Edit')} onClick={() => setForm({ kind: 'timeline', value: e })} className={btn.icon}><Edit3 className="w-4 h-4" /></button><button aria-label={t('Remove')} onClick={() => remove('timeline', e, e.title)} className={btn.icon}><Trash2 className="w-4 h-4" /></button></div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {tab === 'iocs' && (
            <div className="space-y-3">
              <div className="flex justify-end"><AddButton kind="iocs" label={t('Add IOC')} /></div>
              {own.iocs.length === 0 ? <Empty>{t('No IOCs yet.')}</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <thead><tr className="text-[11px] uppercase text-zinc-500 border-b border-zinc-800"><th className="py-2 pr-3">{t('Type')}</th><th className="py-2 pr-3">{t('Value')}</th><th className="py-2 pr-3">TLP</th><th className="py-2 pr-3">{t('Description')}</th><th className="py-2 pr-3">{t('Tags')}</th><th className="py-2 text-right">{t('Actions')}</th></tr></thead>
                    <tbody className="divide-y divide-zinc-800">
                      {own.iocs.map(i => (
                        <tr key={i.id}>
                          <td className="py-2 pr-3 text-xs text-zinc-400">{i.type}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-zinc-100 break-all">{i.value}</td>
                          <td className="py-2 pr-3"><Badge className={TLP_STYLE[i.tlp]}>{i.tlp}</Badge></td>
                          <td className="py-2 pr-3 text-xs text-zinc-400">{i.description}</td>
                          <td className="py-2 pr-3 text-xs text-zinc-500">{i.tags.join(', ')}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <button aria-label={t('Copy value')} onClick={() => navigator.clipboard?.writeText(i.value).then(() => onToast(t('Copied')), () => onToast(i.value))} className={btn.icon}><Copy className="w-4 h-4" /></button>
                            {!locked && <><button aria-label={t('Edit')} onClick={() => setForm({ kind: 'iocs', value: i })} className={btn.icon}><Edit3 className="w-4 h-4" /></button><button aria-label={t('Remove')} onClick={() => remove('iocs', i, i.value)} className={btn.icon}><Trash2 className="w-4 h-4" /></button></>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'assets' && (
            <div className="space-y-3">
              <div className="flex justify-end"><AddButton kind="assets" label={t('Add asset')} /></div>
              {own.assets.length === 0 ? <Empty>{t('No assets yet.')}</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <thead><tr className="text-[11px] uppercase text-zinc-500 border-b border-zinc-800"><th className="py-2 pr-3">{t('Name')}</th><th className="py-2 pr-3">{t('Type')}</th><th className="py-2 pr-3">IP</th><th className="py-2 pr-3">{t('Compromise')}</th><th className="py-2 pr-3">{t('Analysis')}</th><th className="py-2 text-right">{t('Actions')}</th></tr></thead>
                    <tbody className="divide-y divide-zinc-800">
                      {own.assets.map(a => (
                        <tr key={a.id}>
                          <td className="py-2 pr-3 font-bold text-zinc-100">{a.name}<span className="block text-[11px] font-normal text-zinc-500">{a.description}</span></td>
                          <td className="py-2 pr-3 text-xs text-zinc-400">{a.type}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-zinc-300">{a.ip || '—'}</td>
                          <td className="py-2 pr-3"><Badge className={a.compromiseStatus === 'Compromised' ? 'border-red-500/40 text-red-500' : a.compromiseStatus === 'Not compromised' ? 'border-emerald-500/40 text-emerald-500' : 'border-zinc-700 text-zinc-400'}>{t(a.compromiseStatus)}</Badge></td>
                          <td className="py-2 pr-3 text-xs text-zinc-400">{t(a.analysisStatus)}</td>
                          <td className="py-2 text-right whitespace-nowrap">{!locked && <><button aria-label={t('Edit')} onClick={() => setForm({ kind: 'assets', value: a })} className={btn.icon}><Edit3 className="w-4 h-4" /></button><button aria-label={t('Remove')} onClick={() => remove('assets', a, a.name)} className={btn.icon}><Trash2 className="w-4 h-4" /></button></>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'evidence' && (
            <div className="space-y-3">
              <div className="flex justify-end"><AddButton kind="evidence" label={t('Register evidence')} /></div>
              {own.evidence.length === 0 ? <Empty>{t('No evidence registered yet.')}</Empty> : (
                <ul className="space-y-3">
                  {own.evidence.map(e => (
                    <li key={e.id} className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-100 flex items-center gap-1.5"><FileArchive className="w-4 h-4 text-zinc-500" /> {e.filename}</p>
                          <p className="text-[11px] text-zinc-500">{t(e.type)} · {e.size.toLocaleString()} B · {t('registered by {user}', { user: e.createdBy })}</p>
                          <p className="text-[11px] font-mono text-zinc-400 break-all">SHA-256 {e.sha256}</p>
                          {e.description && <p className="text-xs text-zinc-300 mt-1">{e.description}</p>}
                        </div>
                        {!locked && <button onClick={async () => {
                          const action = await uiPrompt(t('Describe the custody action (e.g. transferred to forensic lab, copied to analysis host).'), { title: t('Add custody entry') });
                          if (action?.trim()) guard(() => caseService.updateObject(currentUser, c, 'evidence', e, { custody: [...e.custody, { at: new Date().toISOString(), by: currentUser.username, action: action.trim() }] }), t('Custody entry added'));
                        }} className={btn.ghost}><Plus className="w-3.5 h-3.5" /> {t('Custody entry')}</button>}
                      </div>
                      <ol className="mt-2 space-y-0.5 text-[11px] text-zinc-400 border-t border-zinc-800 pt-2">
                        {e.custody.map((x, n) => <li key={n}><span className="font-mono text-zinc-500">{fmtDate(x.at)}</span> · {x.by} — {x.action}</li>)}
                      </ol>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'notes' && <Notes c={c} own={own} locked={locked} currentUser={currentUser} onToast={onToast} />}

          {tab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex justify-end"><AddButton kind="tasks" label={t('Add task')} /></div>
              {own.tasks.length === 0 ? <Empty>{t('No tasks yet.')}</Empty> : (
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {(['To do', 'In progress', 'On hold', 'Done'] as const).map(col => {
                    const items = own.tasks.filter(x => (col === 'Done' ? x.status === 'Done' || x.status === 'Canceled' : x.status === col));
                    return (
                      <div key={col} className="bg-[var(--app-bg)] border border-zinc-800 rounded-lg p-2 min-w-0">
                        <p className="text-[11px] font-bold uppercase text-zinc-500 px-1 pb-2">{t(col)} <span className="opacity-60">{items.length}</span></p>
                        <ul className="space-y-2">
                          {items.map(x => (
                            <li key={x.id} className={`${card} p-2.5 space-y-1.5`}>
                              <p className={`text-sm font-bold text-zinc-100 ${x.status === 'Canceled' ? 'line-through opacity-60' : ''}`}>{x.title}</p>
                              {x.description && <p className="text-xs text-zinc-400 line-clamp-3">{x.description}</p>}
                              <p className="text-[11px] text-zinc-500">{x.assigneeIds.map(id => users.find(u => u.id === id)?.username).filter(Boolean).join(', ') || t('Unassigned')}{x.dueDate ? ` · ${t('due')} ${x.dueDate}` : ''}</p>
                              <div className="flex items-center gap-1">
                                <select aria-label={t('Task status')} disabled={locked} value={x.status} onChange={e => guard(() => caseService.updateObject(currentUser, c, 'tasks', x, { status: e.target.value as any }))} className={`text-[11px] px-1.5 py-0.5 rounded border bg-transparent ${TASK_STATUS_STYLE[x.status]}`}>
                                  {TASK_STATUSES.map(s => <option key={s} value={s} className="bg-[var(--app-surface)] text-zinc-100">{t(s)}</option>)}
                                </select>
                                {!locked && <><button aria-label={t('Edit')} onClick={() => setForm({ kind: 'tasks', value: x })} className={`${btn.icon} ml-auto`}><Edit3 className="w-3.5 h-3.5" /></button><button aria-label={t('Remove')} onClick={() => remove('tasks', x, x.title)} className={btn.icon}><Trash2 className="w-3.5 h-3.5" /></button></>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'activity' && (own.activity.length === 0 ? <Empty>{t('No activity yet.')}</Empty> : (
            <ul className="divide-y divide-zinc-800">
              {own.activity.map(a => (
                <li key={a.id} className="py-2 text-sm flex flex-wrap gap-x-3"><span className="text-[11px] font-mono text-zinc-500 w-40 shrink-0">{fmtDate(a.at)}</span><span className="font-bold text-zinc-200">{a.by}</span><span className="text-zinc-300">{t(a.action)}</span><span className="text-zinc-500 break-all">{a.detail}</span></li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {form?.kind === 'iocs' && <IocForm value={form.value} onClose={() => setForm(null)} onSave={saveObject('iocs')} />}
      {form?.kind === 'assets' && <AssetForm value={form.value} onClose={() => setForm(null)} onSave={saveObject('assets')} />}
      {form?.kind === 'timeline' && <TimelineForm value={form.value} assets={own.assets} iocs={own.iocs} onClose={() => setForm(null)} onSave={saveObject('timeline')} />}
      {form?.kind === 'evidence' && <EvidenceForm currentUser={currentUser} onClose={() => setForm(null)} onSave={saveObject('evidence')} />}
      {form?.kind === 'tasks' && <TaskForm value={form.value} users={users} onClose={() => setForm(null)} onSave={saveObject('tasks')} />}
      {form?.kind === 'case' && <CaseEditForm c={c} data={data} users={users} onClose={() => setForm(null)} onSave={patch => guard(() => caseService.updateCase(currentUser, c, patch), t('Case updated'))} />}
      {form?.kind === 'close' && <CloseCaseForm onClose={() => setForm(null)} onSave={outcome => guard(() => caseService.closeCase(currentUser, c, outcome), t('Case closed'))} />}
      {form?.kind === 'report' && <CaseReportModal c={c} data={data} currentUser={currentUser} templates={reportTemplates} onClose={() => setForm(null)} onDone={onToast} />}
    </div>
  );
};

const Summary: React.FC<{ c: DfirCase; own: any; data: DfirData; onOpenAlert: (id: string) => void }> = ({ c, own, data, onOpenAlert }) => {
  const t = useT();
  const html = useMemo(() => markdownToHtml(c.description || ''), [c.description]);
  const done = own.tasks.filter((x: any) => x.status === 'Done').length;
  const tiles = [
    { icon: Clock, label: t('Timeline events'), value: own.timeline.length },
    { icon: ShieldAlert, label: t('IOCs'), value: own.iocs.length },
    { icon: Server, label: t('Compromised assets'), value: `${own.assets.filter((a: any) => a.compromiseStatus === 'Compromised').length}/${own.assets.length}` },
    { icon: FileArchive, label: t('Evidence'), value: own.evidence.length },
    { icon: ListChecks, label: t('Tasks done'), value: `${done}/${own.tasks.length}` },
  ];
  const alerts = data.alerts.filter(a => c.sourceAlertIds.includes(a.id));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {tiles.map(x => <div key={x.label} className="border border-zinc-800 rounded-lg p-3"><p className="text-[11px] text-zinc-500 flex items-center gap-1.5"><x.icon className="w-3.5 h-3.5" />{x.label}</p><p className="text-lg font-bold text-zinc-100">{x.value}</p></div>)}
      </div>
      <div>
        <h4 className="text-[11px] font-bold uppercase text-zinc-500 mb-2">{t('Description')}</h4>
        <style>{MARKDOWN_CSS}</style>
        {c.description ? <div className="md text-zinc-200" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-zinc-500">{t('No description.')}</p>}
      </div>
      <div>
        <h4 className="text-[11px] font-bold uppercase text-zinc-500 mb-2">{t('Key events')}</h4>
        {own.timeline.filter((e: any) => e.inSummary).length === 0 ? <p className="text-sm text-zinc-500">{t('Flag timeline events with "Show in case summary" to list them here.')}</p> : (
          <ul className="space-y-1">{own.timeline.filter((e: any) => e.inSummary).map((e: any) => <li key={e.id} className="text-sm"><span className="font-mono text-xs text-zinc-500">{fmtDate(e.date)}</span> — <span className="text-zinc-100">{e.title}</span> <span className="text-xs text-zinc-500">({t(e.category)})</span></li>)}</ul>
        )}
      </div>
      {alerts.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase text-zinc-500 mb-2">{t('Source alerts')}</h4>
          <ul className="flex flex-wrap gap-2">{alerts.map(a => <li key={a.id}><button onClick={() => onOpenAlert(a.id)} className={btn.ghost}><Siren className="w-3.5 h-3.5" /> #{a.number} {a.title}</button></li>)}</ul>
        </div>
      )}
    </div>
  );
};

const Notes: React.FC<{ c: DfirCase; own: any; locked: boolean; currentUser: User; onToast: (m: string) => void }> = ({ c, own, locked, currentUser, onToast }) => {
  const t = useT();
  const dirs: string[] = Array.from(new Set<string>(own.notes.map((n: any) => n.directory))).sort();
  const [activeId, setActiveId] = useState<string | null>(own.notes[0]?.id ?? null);
  const active = own.notes.find((n: any) => n.id === activeId);
  const [draft, setDraft] = useState<{ title: string; content: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const html = useMemo(() => markdownToHtml(draft?.content ?? active?.content ?? ''), [draft, active]);

  const newNote = async () => {
    const dir = await uiPrompt(t('Directory for the new note'), { title: t('New note'), defaultValue: dirs[0] ?? t('Investigation') });
    if (!dir?.trim()) return;
    const n = await caseService.addObject(currentUser, c, 'notes', { directory: dir.trim(), title: t('Untitled note'), content: '' });
    setActiveId(n.id); setDraft({ title: n.title, content: '' }); setPreview(false);
  };
  const save = async () => {
    if (!active || !draft) return;
    await caseService.updateObject(currentUser, c, 'notes', active, draft);
    setDraft(null); onToast(t('Note saved'));
  };

  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-4 min-h-[320px]">
      <aside className="border border-zinc-800 rounded-lg p-2 space-y-2 min-w-0">
        {!locked && <button onClick={newNote} className={`${btn.primary} w-full justify-center`}><Plus className="w-4 h-4" /> {t('New note')}</button>}
        {dirs.length === 0 && <p className="text-xs text-zinc-500 p-2">{t('No notes yet.')}</p>}
        {dirs.map(d => (
          <div key={d}>
            <p className="text-[11px] font-bold uppercase text-zinc-500 px-2 pt-1 flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" /> {d}</p>
            {own.notes.filter((n: any) => n.directory === d).map((n: any) => (
              <button key={n.id} onClick={() => { setActiveId(n.id); setDraft(null); setPreview(true); }} className={`w-full text-left px-2 py-1.5 rounded-md text-sm truncate ${n.id === activeId ? 'bg-blue-600/10 text-blue-500 font-bold' : 'text-zinc-300 hover:bg-zinc-800/60'}`}>{n.title}</button>
            ))}
          </div>
        ))}
      </aside>
      <div className="min-w-0">
        {!active ? <Empty>{t('Select or create a note.')}</Empty> : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t('Note title')} disabled={locked} value={draft?.title ?? active.title} onChange={e => setDraft({ title: e.target.value, content: draft?.content ?? active.content })} className={`${inputCls} flex-1 font-bold`} />
              <button onClick={() => setPreview(p => !p)} className={btn.ghost}><Eye className="w-3.5 h-3.5" /> {preview ? t('Edit') : t('Preview')}</button>
              {!locked && <button disabled={!draft} onClick={save} className={btn.primary}><Save className="w-3.5 h-3.5" /> {t('Save')}</button>}
              {!locked && <button aria-label={t('Remove')} onClick={async () => { if (await uiConfirm(t('Remove "{name}" from this case?', { name: active.title }), { tone: 'danger' })) { await caseService.removeObject(currentUser, c, 'notes', active); setActiveId(null); } }} className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
            </div>
            <p className="text-[11px] text-zinc-500 flex items-center gap-1"><NotebookPen className="w-3.5 h-3.5" /> {active.directory} · {t('updated {time} by {user}', { time: fmtDate(active.updatedAt), user: active.updatedBy })}{draft ? ` · ${t('Unsaved changes')}` : ''}</p>
            {preview || locked
              ? <><style>{MARKDOWN_CSS}</style><div className="md text-zinc-200 border border-zinc-800 rounded-lg p-3 min-h-[240px]" dangerouslySetInnerHTML={{ __html: html || `<p>${t('Empty note.')}</p>` }} /></>
              : <textarea aria-label={t('Note content (Markdown)')} rows={14} value={draft?.content ?? active.content} onChange={e => setDraft({ title: draft?.title ?? active.title, content: e.target.value })} className={`${inputCls} font-mono text-xs`} placeholder={t('Markdown supported: # headings, **bold**, `code`, lists, tables')} />}
          </div>
        )}
      </div>
    </div>
  );
};

const CaseEditForm: React.FC<{ c: DfirCase; data: DfirData; users: User[]; onClose: () => void; onSave: (p: Partial<DfirCase>) => void }> = ({ c, data, users, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ name: c.name, description: c.description, severity: c.severity, classification: c.classification, customerId: c.customerId, ownerId: c.ownerId ?? '', tags: c.tags, socId: c.socId ?? '' });
  return (
    <Modal wide title={t('Edit case')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={() => onSave({ ...f, ownerName: users.find(u => u.id === f.ownerId)?.username, socId: f.socId || undefined })} className={btn.primary}>{t('Save')}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Name')} className="sm:col-span-2"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Severity')}><select value={f.severity} onChange={e => setF({ ...f, severity: e.target.value as Severity })} className={inputCls}>{SEVERITIES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></Field>
        <Field label={t('Classification')}><select value={f.classification} onChange={e => setF({ ...f, classification: e.target.value })} className={inputCls}>{CLASSIFICATIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('Customer')}><select value={f.customerId} onChange={e => setF({ ...f, customerId: e.target.value })} className={inputCls}>{data.customers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label={t('Owner')}><select value={f.ownerId} onChange={e => setF({ ...f, ownerId: e.target.value })} className={inputCls}><option value="">{t('Unassigned')}</option>{users.filter(u => !u.disabled).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select></Field>
        <Field label={t('SOC ticket ID')}><input value={f.socId} onChange={e => setF({ ...f, socId: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Tags')}><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description (Markdown)')} className="sm:col-span-2"><textarea rows={6} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
    </Modal>
  );
};

const CloseCaseForm: React.FC<{ onClose: () => void; onSave: (o: CaseOutcome) => void }> = ({ onClose, onSave }) => {
  const t = useT();
  const [outcome, setOutcome] = useState<CaseOutcome>('True positive with impact');
  return (
    <Modal title={t('Close case')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={() => onSave(outcome)} className={btn.primary}><Lock className="w-3.5 h-3.5" /> {t('Close case')}</button></>}>
      <Field label={t('Outcome')}><select value={outcome} onChange={e => setOutcome(e.target.value as CaseOutcome)} className={inputCls}>{CASE_OUTCOMES.filter(o => o !== 'Unknown').map(o => <option key={o} value={o}>{t(o)}</option>)}</select></Field>
      <p className="text-xs text-zinc-500">{t('Closed cases become read-only until reopened. Closing is recorded in the activity feed and audit trail.')}</p>
    </Modal>
  );
};

const CaseReportModal: React.FC<{ c: DfirCase; data: DfirData; currentUser: User; templates: CaseReportTemplate[]; onClose: () => void; onDone: (m: string) => void }> = ({ c, data, currentUser, templates, onClose, onDone }) => {
  const t = useT();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [classification, setClassification] = useState('TLP:AMBER');
  const tpl = templates.find(x => x.id === templateId) ?? templates[0];
  const exportNow = () => {
    const { blob, filename } = caseReportService.render(format, tpl, { case: c, customer: data.customers.find(x => x.id === c.customerId), iocs: data.iocs, assets: data.assets, timeline: data.timeline, evidence: data.evidence, notes: data.notes, tasks: data.tasks, activity: data.activity, generatedBy: currentUser.username, classification });
    downloadBlob(blob, filename);
    auditService.log(currentUser, 'CASE_REPORT_EXPORTED', { id: c.id, name: `#${c.number} ${c.name}` }, { format, template: tpl.name, classification });
    onDone(t('Exported {file}', { file: filename }));
    onClose();
  };
  return (
    <Modal title={t('Generate case report')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={exportNow} className={btn.primary}><FileDown className="w-3.5 h-3.5" /> {t('Generate')}</button></>}>
      <Field label={t('Report template')}><select value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Format')}><select value={format} onChange={e => setFormat(e.target.value as ExportFormat)} className={inputCls}><option value="pdf">PDF</option><option value="html">HTML</option><option value="md">Markdown</option><option value="json">JSON</option></select></Field>
        <Field label={t('Classification tag')}><select value={classification} onChange={e => setClassification(e.target.value)} className={inputCls}>{['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED', 'CONFIDENTIAL', 'RESTRICTED'].map(x => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <p className="text-xs text-zinc-500">{tpl?.description}</p>
    </Modal>
  );
};

export default CaseView;
