import React, { useEffect, useMemo, useState } from 'react';
import { Siren, Plus, Search, ChevronDown, CheckSquare, Square, UserCheck, ArrowUpRight, GitMerge, XCircle, Briefcase, Link2, Trash2 } from 'lucide-react';
import { Alert, AlertIoc, AlertStatus, CaseOutcome, Severity, User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { alertService } from '../../services/alertService';
import { ALERT_STATUSES, ALERT_STATUS_STYLE, CASE_OUTCOMES, CLASSIFICATIONS, INTERNAL_CUSTOMER_ID, IOC_TYPES, TLPS, isAlertOpen } from '../../lib/dfir';
import { SEVERITIES, SEVERITY_STYLE } from '../../services/analytics';
import { Badge, Empty, Field, Modal, SeverityBadge, TagInput, btn, card, fmtDate, inputCls, toLocalInput } from './ui';
import { useT } from '../../i18n';

interface Props {
  data: DfirData;
  users: User[];
  currentUser: User;
  focusAlertId?: string | null;
  onFocusConsumed?: () => void;
  onOpenCase: (id: string) => void;
  onOpenReport?: (reportId: string) => void;
  onToast: (m: string) => void;
}

type View = 'open' | 'mine' | 'unassigned' | 'all';

const AlertsPage: React.FC<Props> = ({ data, users, currentUser, focusAlertId, onFocusConsumed, onOpenCase, onOpenReport, onToast }) => {
  const t = useT();
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [sev, setSev] = useState<'all' | Severity>('all');
  const [cust, setCust] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'new' | 'escalate' | 'merge' | 'close'>(null);
  const [busy, setBusy] = useState(false);
  const customerName = (id: string) => data.customers.find(c => c.id === id)?.name ?? id;

  useEffect(() => {
    if (focusAlertId) { setView('all'); setExpanded(focusAlertId); onFocusConsumed?.(); setTimeout(() => document.getElementById(`alert-${focusAlertId}`)?.scrollIntoView({ block: 'center' }), 50); }
  }, [focusAlertId]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return data.alerts.filter(a =>
      (view === 'all' || (view === 'open' && isAlertOpen(a.status)) || (view === 'mine' && a.ownerId === currentUser.id && isAlertOpen(a.status)) || (view === 'unassigned' && !a.ownerId && isAlertOpen(a.status))) &&
      (sev === 'all' || a.severity === sev) && (cust === 'all' || a.customerId === cust) &&
      (!ql || `#${a.number} ${a.title} ${a.source} ${a.tags.join(' ')} ${a.iocs.map(i => i.value).join(' ')}`.toLowerCase().includes(ql)));
  }, [data.alerts, view, sev, cust, q, currentUser.id]);

  const counts = useMemo(() => ({
    open: data.alerts.filter(a => isAlertOpen(a.status)).length,
    mine: data.alerts.filter(a => a.ownerId === currentUser.id && isAlertOpen(a.status)).length,
    unassigned: data.alerts.filter(a => !a.ownerId && isAlertOpen(a.status)).length,
    all: data.alerts.length,
  }), [data.alerts, currentUser.id]);

  const sel = data.alerts.filter(a => selected.includes(a.id));
  const selOpen = sel.filter(a => isAlertOpen(a.status));
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); onToast(ok); setSelected([]); setModal(null); } catch (e: any) { onToast(t(e.message)); } finally { setBusy(false); }
  };

  const assignToMe = () => run(async () => { for (const a of selOpen) await alertService.update(currentUser, a, { ownerId: currentUser.id, ownerName: currentUser.username }); }, t('Assigned to you'));
  const setStatus = (status: AlertStatus) => run(async () => { for (const a of selOpen) await alertService.update(currentUser, a, { status }); }, t('Status set to {s}', { s: t(status) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-zinc-100 flex items-center gap-2"><Siren className="w-6 h-6 text-red-500" /> {t('Alerts')}</h3>
          <p className="text-sm text-zinc-500">{t('Triage queue: assign, escalate into cases, merge or close')}</p>
        </div>
        <button onClick={() => setModal('new')} className={btn.primary}><Plus className="w-4 h-4" /> {t('New alert')}</button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-zinc-800">
          <div role="tablist" aria-label={t('Alert views')} className="flex flex-wrap gap-1">
            {(['open', 'mine', 'unassigned', 'all'] as View[]).map(v => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === v ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800/60'}`}>
                {t(({ open: 'Open', mine: 'Assigned to me', unassigned: 'Unassigned', all: 'All' } as const)[v])} <span className="opacity-70">{counts[v]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-zinc-800 bg-[var(--app-bg)]">
            <Search className="w-4 h-4 text-zinc-500" />
            <input aria-label={t('Search')} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search title, IOC, source, tag…')} className="bg-transparent outline-none text-sm w-full" />
          </div>
          <select aria-label={t('Severity')} value={sev} onChange={e => setSev(e.target.value as any)} className={`${inputCls} w-auto`}><option value="all">{t('All severities')}</option>{SEVERITIES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select>
          <select aria-label={t('Customer')} value={cust} onChange={e => setCust(e.target.value)} className={`${inputCls} w-auto`}><option value="all">{t('All customers')}</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-600/5 border-b border-blue-600/20">
            <span className="text-xs font-bold text-blue-500">{t('{n} selected', { n: selected.length })}</span>
            <button disabled={busy || !selOpen.length} onClick={assignToMe} className={btn.ghost}><UserCheck className="w-3.5 h-3.5" /> {t('Assign to me')}</button>
            <select aria-label={t('Set status')} disabled={busy || !selOpen.length} value="" onChange={e => e.target.value && setStatus(e.target.value as AlertStatus)} className={`${inputCls} w-auto py-1.5 text-xs`}>
              <option value="">{t('Set status…')}</option>{(['New', 'Assigned', 'In progress', 'Pending'] as AlertStatus[]).map(s => <option key={s} value={s}>{t(s)}</option>)}
            </select>
            <button disabled={busy || !selOpen.length} onClick={() => setModal('escalate')} className={btn.primary}><ArrowUpRight className="w-3.5 h-3.5" /> {t('Escalate to case')}</button>
            <button disabled={busy || !selOpen.length} onClick={() => setModal('merge')} className={btn.ghost}><GitMerge className="w-3.5 h-3.5" /> {t('Merge into case')}</button>
            <button disabled={busy || !selOpen.length} onClick={() => setModal('close')} className={btn.ghost}><XCircle className="w-3.5 h-3.5" /> {t('Close')}</button>
            <button onClick={() => setSelected([])} className="text-xs text-zinc-500 hover:text-zinc-100 ml-auto">{t('Clear')}</button>
          </div>
        )}

        {list.length === 0 ? <Empty>{t('No alerts in this view.')}</Empty> : (
          <ul className="divide-y divide-zinc-800">
            {list.map(a => {
              const open = expanded === a.id;
              const linked = a.caseId ? data.cases.find(c => c.id === a.caseId) : undefined;
              return (
                <li key={a.id} id={`alert-${a.id}`} className="relative">
                  <span className="absolute left-0 inset-y-0 w-1" style={{ background: SEVERITY_STYLE[a.severity].hex }} aria-hidden="true" />
                  <div className="flex items-start gap-3 pl-4 pr-3 py-3">
                    <button aria-label={t('Select alert #{n}', { n: a.number })} onClick={() => toggle(a.id)} className="pt-0.5 text-zinc-500">{selected.includes(a.id) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}</button>
                    <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(open ? null : a.id)} aria-expanded={open}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500">#{a.number}</span>
                        <span className="text-sm font-bold text-zinc-100 break-words">{a.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <SeverityBadge s={a.severity} />
                        <Badge className={ALERT_STATUS_STYLE[a.status]}>{t(a.status)}</Badge>
                        {linked && <Badge className="border-zinc-700 text-zinc-300"><Briefcase className="w-3 h-3" /> {t('Case')} #{linked.number}</Badge>}
                        <span className="text-[11px] text-zinc-500">{customerName(a.customerId)} · {a.source} · {fmtDate(a.eventTime)} · {t('{n} IOCs', { n: a.iocs.length })}{a.ownerName ? ` · ${a.ownerName}` : ` · ${t('Unassigned')}`}</span>
                        {a.iris?.remoteId && <Badge className="border-sky-500/30 text-sky-500">IRIS #{a.iris.remoteId}</Badge>}
                      </div>
                    </button>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 mt-1 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                  {open && (
                    <div className="pl-11 pr-4 pb-4 space-y-3 text-sm">
                      {a.description && <p className="text-zinc-300 whitespace-pre-wrap">{a.description}</p>}
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1">{t('IOCs')}</p>
                          {a.iocs.length === 0 ? <p className="text-xs text-zinc-500">—</p> : (
                            <ul className="space-y-1">{a.iocs.map((i, n) => <li key={n} className="text-xs flex flex-wrap gap-2"><span className="text-zinc-500 w-16 shrink-0">{i.type}</span><code className="text-zinc-200 break-all">{i.value}</code><span className="text-zinc-500">{i.tlp}</span></li>)}</ul>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1">{t('Assets')}</p>
                          {a.assets.length === 0 ? <p className="text-xs text-zinc-500">—</p> : <ul className="space-y-1">{a.assets.map((x, n) => <li key={n} className="text-xs text-zinc-300">{x.name} <span className="text-zinc-500">{x.type} {x.ip}</span></li>)}</ul>}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500">{t('Classification')}: {a.classification} · {t('Tags')}: {a.tags.join(', ') || '—'}{a.resolution ? ` · ${t('Resolution')}: ${t(a.resolution)}` : ''}</p>
                      {a.note && <p className="text-xs text-zinc-400 whitespace-pre-wrap">{a.note}</p>}
                      <div className="flex flex-wrap gap-2">
                        {linked && <button onClick={() => onOpenCase(linked.id)} className={btn.ghost}><Briefcase className="w-3.5 h-3.5" /> {t('Open case #{n}', { n: linked.number })}</button>}
                        {a.shiftRef && onOpenReport && <button onClick={() => onOpenReport(a.shiftRef!.reportId)} className={btn.ghost}><Link2 className="w-3.5 h-3.5" /> {t('Source shift report')}</button>}
                        {isAlertOpen(a.status) && !a.ownerId && <button onClick={() => run(() => alertService.update(currentUser, a, { ownerId: currentUser.id, ownerName: currentUser.username }), t('Assigned to you'))} className={btn.ghost}><UserCheck className="w-3.5 h-3.5" /> {t('Assign to me')}</button>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modal === 'new' && <NewAlertModal data={data} users={users} currentUser={currentUser} onClose={() => setModal(null)} onSaved={n => { setModal(null); onToast(t('Alert #{n} created', { n })); }} />}
      {modal === 'escalate' && <EscalateModal alerts={selOpen} data={data} busy={busy} onClose={() => setModal(null)}
        onSubmit={(name, description, templateId) => run(async () => { const c = await alertService.escalateToCase(currentUser, selOpen, { name, description, templateId }, { templates: data.templates, iocs: data.iocs, assets: data.assets }); onOpenCase(c.id); }, t('Case opened from {n} alert(s)', { n: selOpen.length }))} />}
      {modal === 'merge' && <MergeModal alerts={selOpen} data={data} busy={busy} onClose={() => setModal(null)}
        onSubmit={caseId => run(() => alertService.mergeIntoCase(currentUser, selOpen, data.cases.find(c => c.id === caseId)!, { iocs: data.iocs, assets: data.assets }), t('Merged into case'))} />}
      {modal === 'close' && <CloseModal count={selOpen.length} busy={busy} onClose={() => setModal(null)}
        onSubmit={(resolution, note) => run(async () => { for (const a of selOpen) await alertService.close(currentUser, a, resolution, note); }, t('{n} alert(s) closed', { n: selOpen.length }))} />}
    </div>
  );
};

const NewAlertModal: React.FC<{ data: DfirData; users: User[]; currentUser: User; onClose: () => void; onSaved: (n: number) => void }> = ({ data, users, currentUser, onClose, onSaved }) => {
  const t = useT();
  const [f, setF] = useState({ title: '', description: '', severity: 'Medium' as Severity, customerId: INTERNAL_CUSTOMER_ID, classification: 'other:other', source: 'Manual', sourceRef: '', eventTime: toLocalInput(), ownerId: '', tags: [] as string[], note: '' });
  const [iocs, setIocs] = useState<AlertIoc[]>([]);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    setError('');
    try {
      const owner = users.find(u => u.id === f.ownerId);
      const a = await alertService.create(currentUser, {
        ...f, eventTime: new Date(f.eventTime).toISOString(), ownerId: owner?.id, ownerName: owner?.username,
        iocs: iocs.filter(i => i.value.trim()), assets: [],
      });
      onSaved(a.number);
    } catch (e: any) { setError(t(e.message)); }
  };
  return (
    <Modal title={t('New alert')} onClose={onClose} wide footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={save} className={btn.primary}>{t('Create alert')}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Title')} className="sm:col-span-2"><input value={f.title} onChange={e => set('title', e.target.value)} className={inputCls} /></Field>
        <Field label={t('Severity')}><select value={f.severity} onChange={e => set('severity', e.target.value as Severity)} className={inputCls}>{SEVERITIES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></Field>
        <Field label={t('Customer')}><select value={f.customerId} onChange={e => set('customerId', e.target.value)} className={inputCls}>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label={t('Classification')}><select value={f.classification} onChange={e => set('classification', e.target.value)} className={inputCls}>{CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label={t('Event time')}><input type="datetime-local" value={f.eventTime} onChange={e => set('eventTime', e.target.value)} className={inputCls} /></Field>
        <Field label={t('Source')}><input value={f.source} onChange={e => set('source', e.target.value)} className={inputCls} /></Field>
        <Field label={t('Source reference')}><input value={f.sourceRef} onChange={e => set('sourceRef', e.target.value)} className={inputCls} placeholder="SIEM rule / ticket id" /></Field>
        <Field label={t('Owner')}><select value={f.ownerId} onChange={e => set('ownerId', e.target.value)} className={inputCls}><option value="">{t('Unassigned')}</option>{users.filter(u => !u.disabled).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select></Field>
        <Field label={t('Tags')}><TagInput value={f.tags} onChange={v => set('tags', v)} placeholder={t('Add tag…')} /></Field>
        <Field label={t('Description')} className="sm:col-span-2"><textarea rows={3} value={f.description} onChange={e => set('description', e.target.value)} className={inputCls} /></Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold text-zinc-500 uppercase">{t('IOCs')}</span>
          <button type="button" onClick={() => setIocs(x => [...x, { type: 'ip-src', value: '', description: '', tlp: 'TLP:AMBER' }])} className={btn.ghost}><Plus className="w-3.5 h-3.5" /> {t('Add IOC')}</button></div>
        <div className="space-y-2">
          {iocs.map((i, n) => (
            <div key={n} className="grid grid-cols-[110px_1fr_110px_auto] gap-2">
              <select aria-label={t('IOC type')} value={i.type} onChange={e => setIocs(x => x.map((y, k) => k === n ? { ...y, type: e.target.value as any } : y))} className={inputCls}>{IOC_TYPES.map(v => <option key={v}>{v}</option>)}</select>
              <input aria-label={t('IOC value')} value={i.value} onChange={e => setIocs(x => x.map((y, k) => k === n ? { ...y, value: e.target.value } : y))} className={`${inputCls} font-mono`} />
              <select aria-label="TLP" value={i.tlp} onChange={e => setIocs(x => x.map((y, k) => k === n ? { ...y, tlp: e.target.value as any } : y))} className={inputCls}>{TLPS.map(v => <option key={v}>{v}</option>)}</select>
              <button type="button" aria-label={t('Remove')} onClick={() => setIocs(x => x.filter((_, k) => k !== n))} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
    </Modal>
  );
};

const EscalateModal: React.FC<{ alerts: Alert[]; data: DfirData; busy: boolean; onClose: () => void; onSubmit: (name: string, description: string, templateId?: string) => void }> = ({ alerts, data, busy, onClose, onSubmit }) => {
  const t = useT();
  const [name, setName] = useState(alerts[0]?.title ?? '');
  const [description, setDescription] = useState(alerts.map(a => `- Alert #${a.number}: ${a.title}`).join('\n'));
  const [templateId, setTemplateId] = useState('');
  return (
    <Modal title={t('Escalate {n} alert(s) to a new case', { n: alerts.length })} onClose={onClose}
      footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button disabled={busy || !name.trim()} onClick={() => onSubmit(name, description, templateId || undefined)} className={btn.primary}>{t('Open case')}</button></>}>
      <Field label={t('Case name')}><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Field>
      <Field label={t('Case template')}><select value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}><option value="">{t('— No template —')}</option>{data.templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label={t('Description')}><textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} className={inputCls} /></Field>
      <p className="text-xs text-zinc-500">{t('IOCs and assets from the alerts are copied into the case (duplicates skipped) and each alert becomes a timeline event.')}</p>
    </Modal>
  );
};

const MergeModal: React.FC<{ alerts: Alert[]; data: DfirData; busy: boolean; onClose: () => void; onSubmit: (caseId: string) => void }> = ({ alerts, data, busy, onClose, onSubmit }) => {
  const t = useT();
  const candidates = data.cases.filter(c => c.state !== 'Closed' && c.customerId === alerts[0]?.customerId);
  const [caseId, setCaseId] = useState(candidates[0]?.id ?? '');
  return (
    <Modal title={t('Merge {n} alert(s) into a case', { n: alerts.length })} onClose={onClose}
      footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button disabled={busy || !caseId} onClick={() => onSubmit(caseId)} className={btn.primary}>{t('Merge')}</button></>}>
      {candidates.length === 0 ? <p className="text-sm text-zinc-400">{t('No open case for this customer. Escalate to a new case instead.')}</p> : (
        <Field label={t('Case')}><select value={caseId} onChange={e => setCaseId(e.target.value)} className={inputCls}>{candidates.map(c => <option key={c.id} value={c.id}>#{c.number} {c.name}</option>)}</select></Field>
      )}
    </Modal>
  );
};

const CloseModal: React.FC<{ count: number; busy: boolean; onClose: () => void; onSubmit: (r: CaseOutcome, note: string) => void }> = ({ count, busy, onClose, onSubmit }) => {
  const t = useT();
  const [resolution, setResolution] = useState<CaseOutcome>('False positive');
  const [note, setNote] = useState('');
  return (
    <Modal title={t('Close {n} alert(s)', { n: count })} onClose={onClose}
      footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button disabled={busy} onClick={() => onSubmit(resolution, note)} className={btn.primary}>{t('Close alerts')}</button></>}>
      <Field label={t('Resolution')}><select value={resolution} onChange={e => setResolution(e.target.value as CaseOutcome)} className={inputCls}>{CASE_OUTCOMES.filter(o => o !== 'Unknown').map(o => <option key={o} value={o}>{t(o)}</option>)}</select></Field>
      <Field label={t('Closing note')}><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} className={inputCls} /></Field>
    </Modal>
  );
};

export default AlertsPage;
