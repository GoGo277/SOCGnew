import React, { useState } from 'react';
import { LayoutTemplate, Plus, Edit3, Trash2, Copy, FileText, Sparkles } from 'lucide-react';
import { CaseTemplate, Severity, User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { caseService } from '../../services/caseService';
import { BUILTIN_TEMPLATE, CaseReportTemplate, PLACEHOLDERS, caseReportService } from '../../services/caseReport';
import { CLASSIFICATIONS } from '../../lib/dfir';
import { SEVERITIES } from '../../services/analytics';
import { uiConfirm } from '../../lib/dialogs';
import { Empty, Field, Modal, SeverityBadge, Tabs, TagInput, btn, card, inputCls } from './ui';
import { useT } from '../../i18n';

/** Widely used incident-response playbooks offered as optional starting points. */
const STARTERS: Omit<CaseTemplate, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Ransomware response', description: 'Containment-first playbook for suspected ransomware activity.', classification: 'malicious-code:ransomware', severity: 'Critical', tags: ['ransomware'],
    tasks: [
      { title: 'Isolate affected hosts from the network', description: 'EDR network containment or switch-port shutdown. Do not power off.' },
      { title: 'Identify patient zero and initial access vector', description: 'Review EDR, VPN, RDP and email telemetry around first encryption.' },
      { title: 'Preserve volatile evidence', description: 'Memory capture of at least one encrypted host before remediation.' },
      { title: 'Determine scope of encryption and exfiltration', description: 'Check file servers, backups and egress volumes.' },
      { title: 'Validate backup integrity', description: 'Confirm offline backups are clean before restore.' },
      { title: 'Reset compromised credentials', description: 'Domain admin, service accounts and KRBTGT (twice).' },
      { title: 'Notify legal, management and regulators as required', description: '' },
    ],
    notes: [{ directory: 'Investigation', title: 'Ransom note & IOCs', content: '## Ransom note\n\n## Encryptor hash\n\n## Extension / family\n' }, { directory: 'Communication', title: 'Stakeholder log', content: '| Time | Who | What |\n|---|---|---|\n' }],
  },
  {
    name: 'Phishing investigation', description: 'Reported or detected phishing email triage and response.', classification: 'fraud:phishing', severity: 'Medium', tags: ['phishing'],
    tasks: [
      { title: 'Collect the original email (EML) and headers', description: '' },
      { title: 'Analyse links and attachments in a sandbox', description: '' },
      { title: 'Search mailboxes for the same campaign', description: 'Sender, subject, URLs and attachment hashes.' },
      { title: 'Purge messages and block sender / URLs', description: '' },
      { title: 'Identify users who clicked or submitted credentials', description: 'Proxy and IdP sign-in logs.' },
      { title: 'Reset credentials and revoke sessions for affected users', description: '' },
    ],
    notes: [{ directory: 'Investigation', title: 'Email analysis', content: '## Headers\n\n## Links\n\n## Attachments\n' }],
  },
  {
    name: 'Compromised account', description: 'Suspicious sign-in or confirmed account takeover.', classification: 'intrusions:unprivileged-account-compromise', severity: 'High', tags: ['identity'],
    tasks: [
      { title: 'Disable the account and revoke active sessions', description: '' },
      { title: 'Review sign-in history and MFA events', description: 'Impossible travel, new devices, MFA fatigue.' },
      { title: 'Review mailbox rules, OAuth grants and recent changes', description: '' },
      { title: 'Determine data accessed', description: '' },
      { title: 'Reset password, re-register MFA and restore access', description: '' },
    ],
    notes: [{ directory: 'Investigation', title: 'Sign-in analysis', content: '| Time | IP | Location | Result |\n|---|---|---|---|\n' }],
  },
];

const CaseTemplatesPage: React.FC<{ data: DfirData; reportTemplates: CaseReportTemplate[]; currentUser: User; onToast: (m: string) => void }> = ({ data, reportTemplates, currentUser, onToast }) => {
  const t = useT();
  const isAdmin = currentUser.role === 'Admin';
  const [tab, setTab] = useState<'case' | 'report'>('case');
  const [editCase, setEditCase] = useState<CaseTemplate | 'new' | null>(null);
  const [editReport, setEditReport] = useState<CaseReportTemplate | 'new' | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); onToast(ok); } catch (e: any) { onToast(t(e.message)); } };
  const missingStarters = STARTERS.filter(s => !data.templates.some(x => x.name === s.name));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-zinc-100 flex items-center gap-2"><LayoutTemplate className="w-6 h-6 text-blue-500" /> {t('Case templates')}</h3>
        <p className="text-sm text-zinc-500">{t('Reusable case playbooks and investigation report layouts')}</p>
      </div>
      <div className={card}>
        <div className="px-4 pt-2"><Tabs<'case' | 'report'> label={t('Template types')} active={tab} onChange={setTab} tabs={[{ id: 'case', label: t('Case templates'), count: data.templates.length }, { id: 'report', label: t('Report templates'), count: reportTemplates.length }]} /></div>
        <div className="p-4 space-y-3">
          {tab === 'case' && (
            <>
              {isAdmin && (
                <div className="flex flex-wrap justify-end gap-2">
                  {missingStarters.length > 0 && <button onClick={() => run(async () => { for (const s of missingStarters) await caseService.saveTemplate(currentUser, s); }, t('{n} starter template(s) added', { n: missingStarters.length }))} className={btn.ghost}><Sparkles className="w-4 h-4" /> {t('Add starter playbooks')}</button>}
                  <button onClick={() => setEditCase('new')} className={btn.primary}><Plus className="w-4 h-4" /> {t('New case template')}</button>
                </div>
              )}
              {data.templates.length === 0 ? <Empty>{t('No case templates yet.')}</Empty> : (
                <ul className="divide-y divide-zinc-800">
                  {data.templates.map(x => (
                    <li key={x.id} className="py-3 flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <p className="font-bold text-zinc-100 flex items-center gap-2">{x.name} <SeverityBadge s={x.severity} /></p>
                        <p className="text-xs text-zinc-400">{x.description}</p>
                        <p className="text-[11px] text-zinc-500">{x.classification} · {t('{n} tasks', { n: x.tasks.length })} · {t('{n} notes', { n: x.notes.length })}</p>
                      </div>
                      {isAdmin && <div className="flex gap-1">
                        <button aria-label={t('Edit')} onClick={() => setEditCase(x)} className={btn.icon}><Edit3 className="w-4 h-4" /></button>
                        <button aria-label={t('Delete')} onClick={async () => { if (await uiConfirm(t('Delete template "{name}"?', { name: x.name }), { tone: 'danger' })) run(() => caseService.deleteTemplate(currentUser, x), t('Template deleted')); }} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
                      </div>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {tab === 'report' && (
            <>
              {isAdmin && <div className="flex justify-end"><button onClick={() => setEditReport('new')} className={btn.primary}><Plus className="w-4 h-4" /> {t('New report template')}</button></div>}
              <ul className="divide-y divide-zinc-800">
                {reportTemplates.map(x => (
                  <li key={x.id} className="py-3 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="font-bold text-zinc-100 flex items-center gap-2"><FileText className="w-4 h-4 text-zinc-500" /> {x.name}{x.id === BUILTIN_TEMPLATE.id && <span className="text-[10px] text-zinc-500 font-normal">{t('built-in')}</span>}</p>
                      <p className="text-xs text-zinc-400">{x.description}</p>
                    </div>
                    {isAdmin && <div className="flex gap-1">
                      <button aria-label={t('Duplicate')} title={t('Duplicate')} onClick={() => run(() => caseReportService.saveTemplate(currentUser, { name: `${x.name} (copy)`, description: x.description, content: x.content }), t('Template duplicated'))} className={btn.icon}><Copy className="w-4 h-4" /></button>
                      {x.id !== BUILTIN_TEMPLATE.id && <>
                        <button aria-label={t('Edit')} onClick={() => setEditReport(x)} className={btn.icon}><Edit3 className="w-4 h-4" /></button>
                        <button aria-label={t('Delete')} onClick={async () => { if (await uiConfirm(t('Delete template "{name}"?', { name: x.name }), { tone: 'danger' })) run(() => caseReportService.deleteTemplate(currentUser, x), t('Template deleted')); }} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
                      </>}
                    </div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {editCase && <CaseTemplateForm value={editCase === 'new' ? undefined : editCase} onClose={() => setEditCase(null)} onSave={async d => { await caseService.saveTemplate(currentUser, d, editCase === 'new' ? undefined : editCase); setEditCase(null); onToast(t('Template saved')); }} />}
      {editReport && <ReportTemplateForm value={editReport === 'new' ? undefined : editReport} onClose={() => setEditReport(null)} onSave={async d => { await caseReportService.saveTemplate(currentUser, d, editReport === 'new' ? undefined : editReport); setEditReport(null); onToast(t('Template saved')); }} />}
    </div>
  );
};

const CaseTemplateForm: React.FC<{ value?: CaseTemplate; onClose: () => void; onSave: (d: Omit<CaseTemplate, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => Promise<void> }> = ({ value, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ name: value?.name ?? '', description: value?.description ?? '', classification: value?.classification ?? 'other:other', severity: value?.severity ?? 'Medium' as Severity, tags: value?.tags ?? [], tasks: value?.tasks ?? [], notes: value?.notes ?? [] });
  const [error, setError] = useState('');
  return (
    <Modal wide title={value ? t('Edit case template') : t('New case template')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={() => onSave({ ...f, tasks: f.tasks.filter(x => x.title.trim()), notes: f.notes.filter(x => x.title.trim()) }).catch(e => setError(t(e.message)))} className={btn.primary}>{t('Save')}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Name')}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Severity')}><select value={f.severity} onChange={e => setF({ ...f, severity: e.target.value as Severity })} className={inputCls}>{SEVERITIES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></Field>
        <Field label={t('Classification')}><select value={f.classification} onChange={e => setF({ ...f, classification: e.target.value })} className={inputCls}>{CLASSIFICATIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('Tags')}><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description')} className="sm:col-span-2"><textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold uppercase text-zinc-500">{t('Tasks')}</span><button type="button" onClick={() => setF({ ...f, tasks: [...f.tasks, { title: '', description: '' }] })} className={btn.ghost}><Plus className="w-3.5 h-3.5" /> {t('Add task')}</button></div>
        <div className="space-y-2">{f.tasks.map((x, n) => (
          <div key={n} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label={t('Task title')} value={x.title} placeholder={t('Title')} onChange={e => setF({ ...f, tasks: f.tasks.map((y, k) => k === n ? { ...y, title: e.target.value } : y) })} className={inputCls} />
            <input aria-label={t('Task description')} value={x.description} placeholder={t('Description')} onChange={e => setF({ ...f, tasks: f.tasks.map((y, k) => k === n ? { ...y, description: e.target.value } : y) })} className={inputCls} />
            <button type="button" aria-label={t('Remove')} onClick={() => setF({ ...f, tasks: f.tasks.filter((_, k) => k !== n) })} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}</div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold uppercase text-zinc-500">{t('Notes')}</span><button type="button" onClick={() => setF({ ...f, notes: [...f.notes, { directory: 'Investigation', title: '', content: '' }] })} className={btn.ghost}><Plus className="w-3.5 h-3.5" /> {t('Add note')}</button></div>
        <div className="space-y-2">{f.notes.map((x, n) => (
          <div key={n} className="border border-zinc-800 rounded-lg p-2 space-y-2">
            <div className="grid sm:grid-cols-[160px_1fr_auto] gap-2">
              <input aria-label={t('Directory')} value={x.directory} placeholder={t('Directory')} onChange={e => setF({ ...f, notes: f.notes.map((y, k) => k === n ? { ...y, directory: e.target.value } : y) })} className={inputCls} />
              <input aria-label={t('Note title')} value={x.title} placeholder={t('Title')} onChange={e => setF({ ...f, notes: f.notes.map((y, k) => k === n ? { ...y, title: e.target.value } : y) })} className={inputCls} />
              <button type="button" aria-label={t('Remove')} onClick={() => setF({ ...f, notes: f.notes.filter((_, k) => k !== n) })} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
            </div>
            <textarea aria-label={t('Note content (Markdown)')} rows={3} value={x.content} onChange={e => setF({ ...f, notes: f.notes.map((y, k) => k === n ? { ...y, content: e.target.value } : y) })} className={`${inputCls} font-mono text-xs`} />
          </div>
        ))}</div>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

const ReportTemplateForm: React.FC<{ value?: CaseReportTemplate; onClose: () => void; onSave: (d: Pick<CaseReportTemplate, 'name' | 'description' | 'content'>) => Promise<void> }> = ({ value, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ name: value?.name ?? '', description: value?.description ?? '', content: value?.content ?? BUILTIN_TEMPLATE.content });
  const [error, setError] = useState('');
  return (
    <Modal wide title={value ? t('Edit report template') : t('New report template')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={() => onSave(f).catch(e => setError(t(e.message)))} className={btn.primary}>{t('Save')}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Name')}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Description')}><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      <div className="grid lg:grid-cols-[1fr_240px] gap-3">
        <Field label={t('Template (Markdown with placeholders)')}><textarea rows={18} value={f.content} onChange={e => setF({ ...f, content: e.target.value })} className={`${inputCls} font-mono text-xs`} /></Field>
        <div className="border border-zinc-800 rounded-lg p-2 max-h-[420px] overflow-y-auto">
          <p className="text-[11px] font-bold uppercase text-zinc-500 mb-1">{t('Placeholders')}</p>
          <ul className="space-y-1">{PLACEHOLDERS.map(p => (
            <li key={p.key}><button type="button" onClick={() => setF({ ...f, content: `${f.content}{{${p.key}}}` })} className="text-left w-full hover:bg-zinc-800/60 rounded px-1">
              <code className="text-[11px] text-blue-500">{`{{${p.key}}}`}</code><span className="block text-[10px] text-zinc-500">{t(p.description)}</span>
            </button></li>
          ))}</ul>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

export default CaseTemplatesPage;
