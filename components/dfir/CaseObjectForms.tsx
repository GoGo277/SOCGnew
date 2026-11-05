import React, { useState } from 'react';
import { CaseAsset, CaseEvidence, CaseIoc, CaseNote, CaseTask, CaseTimelineEvent, User } from '../../types';
import { ANALYSIS_STATUSES, ASSET_TYPES, COMPROMISE_STATUSES, EVENT_CATEGORIES, EVIDENCE_TYPES, IOC_TYPES, TASK_STATUSES, TLPS, guessIocType } from '../../lib/dfir';
import { Field, Modal, TagInput, btn, inputCls, toLocalInput } from './ui';
import { useT } from '../../i18n';

/** Add / edit forms for each case object kind (IRIS case tabs). */

type Save<T> = (data: T) => Promise<void> | void;
const Footer: React.FC<{ onClose: () => void; onSave: () => void; busy?: boolean; label: string }> = ({ onClose, onSave, busy, label }) => {
  const t = useT();
  return <><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button disabled={busy} onClick={onSave} className={btn.primary}>{label}</button></>;
};

const useSubmit = <T,>(onSave: Save<T>) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (data: T, validate?: () => string | null) => {
    const v = validate?.();
    if (v) { setError(v); return; }
    setBusy(true); setError('');
    try { await onSave(data); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return { busy, error, submit };
};

export const IocForm: React.FC<{ value?: CaseIoc; onClose: () => void; onSave: Save<Pick<CaseIoc, 'type' | 'value' | 'description' | 'tlp' | 'tags'>> }> = ({ value, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ type: value?.type ?? 'ip-src', value: value?.value ?? '', description: value?.description ?? '', tlp: value?.tlp ?? 'TLP:AMBER', tags: value?.tags ?? [] } as Pick<CaseIoc, 'type' | 'value' | 'description' | 'tlp' | 'tags'>);
  const { busy, error, submit } = useSubmit(onSave);
  return (
    <Modal title={value ? t('Edit IOC') : t('Add IOC')} onClose={onClose} footer={<Footer onClose={onClose} busy={busy} label={value ? t('Save') : t('Add IOC')} onSave={() => submit(f, () => (f.value.trim() ? null : t('A value is required')))} />}>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={t('Value')} className="sm:col-span-2"><input autoFocus value={f.value} onChange={e => setF({ ...f, value: e.target.value, type: value ? f.type : guessIocType(e.target.value) })} className={`${inputCls} font-mono`} /></Field>
        <Field label={t('Type')}><select value={f.type} onChange={e => setF({ ...f, type: e.target.value as any })} className={inputCls}>{IOC_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="TLP"><select value={f.tlp} onChange={e => setF({ ...f, tlp: e.target.value as any })} className={inputCls}>{TLPS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('Tags')} className="sm:col-span-2"><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description')} className="sm:col-span-3"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

type AssetData = Pick<CaseAsset, 'name' | 'type' | 'ip' | 'domain' | 'description' | 'compromiseStatus' | 'analysisStatus' | 'tags'>;
export const AssetForm: React.FC<{ value?: CaseAsset; onClose: () => void; onSave: Save<AssetData> }> = ({ value, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState<AssetData>({ name: value?.name ?? '', type: value?.type ?? 'Windows - Computer', ip: value?.ip ?? '', domain: value?.domain ?? '', description: value?.description ?? '', compromiseStatus: value?.compromiseStatus ?? 'To be determined', analysisStatus: value?.analysisStatus ?? 'To be done', tags: value?.tags ?? [] });
  const { busy, error, submit } = useSubmit(onSave);
  return (
    <Modal title={value ? t('Edit asset') : t('Add asset')} onClose={onClose} footer={<Footer onClose={onClose} busy={busy} label={value ? t('Save') : t('Add asset')} onSave={() => submit(f, () => (f.name.trim() ? null : t('A name is required')))} />}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Name')}><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Type')}><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={inputCls}>{ASSET_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('IP address')}><input value={f.ip} onChange={e => setF({ ...f, ip: e.target.value })} className={`${inputCls} font-mono`} /></Field>
        <Field label={t('Domain')}><input value={f.domain} onChange={e => setF({ ...f, domain: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Compromise status')}><select value={f.compromiseStatus} onChange={e => setF({ ...f, compromiseStatus: e.target.value as any })} className={inputCls}>{COMPROMISE_STATUSES.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Analysis status')}><select value={f.analysisStatus} onChange={e => setF({ ...f, analysisStatus: e.target.value as any })} className={inputCls}>{ANALYSIS_STATUSES.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Tags')} className="sm:col-span-2"><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description')} className="sm:col-span-2"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

type TimelineData = Pick<CaseTimelineEvent, 'title' | 'date' | 'category' | 'content' | 'raw' | 'source' | 'assetIds' | 'iocIds' | 'inSummary' | 'tags'>;
export const TimelineForm: React.FC<{ value?: CaseTimelineEvent; assets: CaseAsset[]; iocs: CaseIoc[]; onClose: () => void; onSave: Save<TimelineData> }> = ({ value, assets, iocs, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState<TimelineData>({ title: value?.title ?? '', date: toLocalInput(value?.date), category: value?.category ?? 'Unspecified', content: value?.content ?? '', raw: value?.raw ?? '', source: value?.source ?? '', assetIds: value?.assetIds ?? [], iocIds: value?.iocIds ?? [], inSummary: value?.inSummary ?? false, tags: value?.tags ?? [] });
  const { busy, error, submit } = useSubmit(onSave);
  const toggle = (k: 'assetIds' | 'iocIds', id: string) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] });
  return (
    <Modal wide title={value ? t('Edit timeline event') : t('Add timeline event')} onClose={onClose}
      footer={<Footer onClose={onClose} busy={busy} label={value ? t('Save') : t('Add event')} onSave={() => submit({ ...f, date: new Date(f.date).toISOString() }, () => (f.title.trim() ? null : t('A title is required')))} />}>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={t('Title')} className="sm:col-span-2"><input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Date & time')}><input type="datetime-local" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Category')}><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className={inputCls}>{EVENT_CATEGORIES.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Source')}><input value={f.source} onChange={e => setF({ ...f, source: e.target.value })} className={inputCls} placeholder="EDR, firewall, Sysmon…" /></Field>
        <Field label={t('Tags')}><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description')} className="sm:col-span-3"><textarea rows={3} value={f.content} onChange={e => setF({ ...f, content: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Raw event')} className="sm:col-span-3"><textarea rows={3} value={f.raw} onChange={e => setF({ ...f, raw: e.target.value })} className={`${inputCls} font-mono text-xs`} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {[['assetIds', t('Linked assets'), assets.map(a => ({ id: a.id, label: a.name }))], ['iocIds', t('Linked IOCs'), iocs.map(i => ({ id: i.id, label: i.value }))]].map(([k, l, opts]: any) => (
          <fieldset key={k} className="border border-zinc-800 rounded-lg p-2 max-h-32 overflow-y-auto">
            <legend className="text-[11px] font-bold text-zinc-500 uppercase px-1">{l}</legend>
            {opts.length === 0 ? <p className="text-xs text-zinc-500 px-1">—</p> : opts.map((o: any) => (
              <label key={o.id} className="flex items-center gap-2 text-xs text-zinc-300 px-1 py-0.5"><input type="checkbox" className="accent-blue-600" checked={(f as any)[k].includes(o.id)} onChange={() => toggle(k, o.id)} /> <span className="truncate font-mono">{o.label}</span></label>
            ))}
          </fieldset>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" className="accent-blue-600" checked={f.inSummary} onChange={e => setF({ ...f, inSummary: e.target.checked })} /> {t('Show in case summary')}</label>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

type EvidenceData = Pick<CaseEvidence, 'filename' | 'size' | 'sha256' | 'type' | 'description' | 'custody'>;
export const EvidenceForm: React.FC<{ currentUser: User; onClose: () => void; onSave: Save<EvidenceData> }> = ({ currentUser, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ filename: '', size: 0, sha256: '', type: 'Log export', description: '', location: '' });
  const [hashing, setHashing] = useState(false);
  const { busy, error, submit } = useSubmit(onSave);
  const onFile = async (file?: File) => {
    if (!file) return;
    setHashing(true);
    const buf = await file.arrayBuffer();
    const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map(b => b.toString(16).padStart(2, '0')).join('');
    setF(x => ({ ...x, filename: file.name, size: file.size, sha256: hex }));
    setHashing(false);
  };
  return (
    <Modal title={t('Register evidence')} onClose={onClose}
      footer={<Footer onClose={onClose} busy={busy || hashing} label={t('Register')} onSave={() => submit({
        filename: f.filename, size: Number(f.size) || 0, sha256: f.sha256.toLowerCase(), type: f.type, description: f.description,
        custody: [{ at: new Date().toISOString(), by: currentUser.username, action: `Registered${f.location ? ` — stored at ${f.location}` : ''}` }],
      }, () => (!f.filename.trim() ? t('A file name is required') : !/^[a-f0-9]{64}$/i.test(f.sha256) ? t('A valid SHA-256 hash is required') : null))} />}>
      <Field label={t('Compute hash from a local file')} hint={t('The file is hashed in your browser and is not uploaded.')}>
        <input type="file" onChange={e => onFile(e.target.files?.[0])} className="block text-xs text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200" />
      </Field>
      {hashing && <p className="text-xs text-blue-500">{t('Hashing…')}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('File name')}><input value={f.filename} onChange={e => setF({ ...f, filename: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Type')}><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={inputCls}>{EVIDENCE_TYPES.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Size (bytes)')}><input type="number" min={0} value={f.size} onChange={e => setF({ ...f, size: Number(e.target.value) })} className={inputCls} /></Field>
        <Field label={t('Storage location')}><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={inputCls} placeholder="Evidence locker / bucket path" /></Field>
        <Field label="SHA-256" className="sm:col-span-2"><input value={f.sha256} onChange={e => setF({ ...f, sha256: e.target.value.trim() })} className={`${inputCls} font-mono text-xs`} /></Field>
        <Field label={t('Description')} className="sm:col-span-2"><textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

type TaskData = Pick<CaseTask, 'title' | 'description' | 'status' | 'assigneeIds' | 'dueDate' | 'tags'>;
export const TaskForm: React.FC<{ value?: CaseTask; users: User[]; onClose: () => void; onSave: Save<TaskData> }> = ({ value, users, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState<TaskData>({ title: value?.title ?? '', description: value?.description ?? '', status: value?.status ?? 'To do', assigneeIds: value?.assigneeIds ?? [], dueDate: value?.dueDate, tags: value?.tags ?? [] });
  const { busy, error, submit } = useSubmit(onSave);
  return (
    <Modal title={value ? t('Edit task') : t('Add task')} onClose={onClose} footer={<Footer onClose={onClose} busy={busy} label={value ? t('Save') : t('Add task')} onSave={() => submit(f, () => (f.title.trim() ? null : t('A title is required')))} />}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Title')} className="sm:col-span-2"><input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Status')}><select value={f.status} onChange={e => setF({ ...f, status: e.target.value as any })} className={inputCls}>{TASK_STATUSES.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Due date')}><input type="date" value={f.dueDate ?? ''} onChange={e => setF({ ...f, dueDate: e.target.value || undefined })} className={inputCls} /></Field>
        <fieldset className="sm:col-span-2 border border-zinc-800 rounded-lg p-2">
          <legend className="text-[11px] font-bold text-zinc-500 uppercase px-1">{t('Assignees')}</legend>
          <div className="flex flex-wrap gap-3 px-1">
            {users.filter(u => !u.disabled).map(u => (
              <label key={u.id} className="flex items-center gap-1.5 text-xs text-zinc-300"><input type="checkbox" className="accent-blue-600" checked={f.assigneeIds.includes(u.id)} onChange={() => setF({ ...f, assigneeIds: f.assigneeIds.includes(u.id) ? f.assigneeIds.filter(x => x !== u.id) : [...f.assigneeIds, u.id] })} /> {u.username}</label>
            ))}
          </div>
        </fieldset>
        <Field label={t('Tags')} className="sm:col-span-2"><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description')} className="sm:col-span-2"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

export type { AssetData, TimelineData, EvidenceData, TaskData };
export type NoteData = Pick<CaseNote, 'directory' | 'title' | 'content'>;
