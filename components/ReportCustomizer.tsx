import React, { useMemo, useState } from 'react';
import { useEscape } from '../lib/useEscape';
import { X, FileDown, FileText, FileCode, FileJson, File as FileIcon, Plus, Trash2, Archive, Eye, EyeOff, BookmarkPlus, LayoutTemplate } from 'lucide-react';
import { CustomSection, ExportFormat, HandoverAck, ReportExportOptions, ReportTemplate, ShiftReport, SlaPolicy, User } from '../types';
import { templateService } from '../services/templateService';
import { useT } from '../i18n';
import { defaultExportOptions, renderReport, downloadBlob, exportZip, reportToHtml } from '../services/reportExport';
import { auditService } from '../services/auditService';

interface Props {
  reports: ShiftReport[];
  acks?: HandoverAck[];
  templates?: ReportTemplate[];
  sla?: SlaPolicy;
  currentUser: User;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const FORMATS: { id: ExportFormat; label: string; desc: string; icon: React.ElementType }[] = [
  { id: 'pdf', label: 'PDF document', desc: 'Vector jsPDF, copyable text', icon: FileIcon },
  { id: 'html', label: 'HTML report', desc: 'Standalone, embedded CSS', icon: FileCode },
  { id: 'md', label: 'Markdown', desc: 'Developer-friendly .md', icon: FileText },
  { id: 'json', label: 'JSON data', desc: 'SIEM integration / backup', icon: FileJson },
];

const ReportCustomizer: React.FC<Props> = ({ reports, acks = [], templates = [], sla, currentUser, onClose, onDone }) => {
  const t = useT();
  useEscape(onClose);
  const single = reports.length === 1;
  const ctxFor = (r: ShiftReport) => ({ sla, ack: acks.find(a => a.reportId === r.id) });
  const [templateId, setTemplateId] = useState('');
  const selectedTemplate = templates.find(x => x.id === templateId);
  const [opts, setOpts] = useState<ReportExportOptions>(() => defaultExportOptions(currentUser, single ? reports[0].title : ''));
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf']);
  const [withComparison, setWithComparison] = useState(true);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof ReportExportOptions>(k: K, v: ReportExportOptions[K]) => setOpts(o => ({ ...o, [k]: v }));
  const addSection = (position: CustomSection['position']) =>
    set('customSections', [...opts.customSections, { id: crypto.randomUUID(), position, heading: '', content: '' }]);
  const updSection = (id: string, patch: Partial<CustomSection>) =>
    set('customSections', opts.customSections.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const rmSection = (id: string) => set('customSections', opts.customSections.filter(s => s.id !== id));

  const toggleFormat = (f: ExportFormat) => {
    if (single) setFormats([f]);
    else setFormats(cur => (cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f]));
  };

  const previewHtml = useMemo(() => (preview && single ? reportToHtml(reports[0], opts, ctxFor(reports[0])) : ''), [preview, single, reports, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(x => x.id === id);
    if (tpl) setOpts(o => templateService.apply(tpl, o));
  };

  const saveTemplate = async () => {
    const name = prompt(t('Template name'), selectedTemplate?.name ?? '');
    if (!name) return;
    const overwrite = selectedTemplate && selectedTemplate.name === name.trim() ? selectedTemplate : undefined;
    try {
      const tpl = await templateService.save(currentUser, name, overwrite?.description ?? '', opts, overwrite);
      setTemplateId(tpl.id);
      onDone(t('Template "{name}" saved', { name: tpl.name }));
    } catch (e: any) { setError(e.message); }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplate || !confirm(t('Delete template "{name}"?', { name: selectedTemplate.name }))) return;
    await templateService.remove(currentUser, selectedTemplate);
    setTemplateId('');
  };

  const run = async () => {
    setError('');
    if (!formats.length) { setError(t('Select at least one format')); return; }
    setBusy(true);
    try {
      if (single && formats.length === 1) {
        const { blob, filename } = renderReport(reports[0], formats[0], opts, ctxFor(reports[0]));
        downloadBlob(blob, filename);
        auditService.log(currentUser, 'REPORT_EXPORTED', { id: reports[0].id, name: reports[0].title }, { format: formats[0], classification: opts.classification, template: selectedTemplate?.name });
        onDone(t('Exported {file}', { file: filename }));
      } else {
        const blob = await exportZip(reports, formats, opts, withComparison, { acks, sla });
        const filename = `GEYES_reports_${new Date().toISOString().slice(0, 10)}_${reports.length}x.zip`;
        downloadBlob(blob, filename);
        auditService.log(currentUser, 'REPORT_BATCH_EXPORTED', { id: 'batch', name: filename }, { reports: reports.map(r => r.id), formats, classification: opts.classification });
        onDone(t('Exported {n} report(s) as ZIP', { n: reports.length }));
      }
      onClose();
    } catch (e: any) {
      setError(e.message || t('Export failed'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50';
  const label = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest';

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className={`modal-entrance w-full ${preview ? 'max-w-7xl' : 'max-w-3xl'} bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[94vh]`}>
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2"><FileDown className="w-5 h-5 text-blue-400" /> {t('Report customizer & export')}</h3>
            <p className="text-xs text-zinc-500">{single ? reports[0].title : t('{n} reports selected — batch ZIP export', { n: reports.length })}</p>
          </div>
          <div className="flex items-center gap-2">
            {single && <button onClick={() => setPreview(p => !p)} className="px-3 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:text-white flex items-center gap-2">{preview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {t('Preview')}</button>}
            <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className={`flex-1 overflow-hidden grid ${preview ? 'lg:grid-cols-2' : ''}`}>
          <div className="p-6 overflow-y-auto space-y-6">
            <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
              <label className="flex-1 min-w-[200px] space-y-1"><span className={label}><LayoutTemplate className="w-3 h-3 inline mr-1" />{t('Template')}</span>
                <select aria-label={t('Template')} value={templateId} onChange={e => applyTemplate(e.target.value)} className={input}>
                  <option value="">{t('— No template —')}</option>
                  {templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select></label>
              <button type="button" onClick={saveTemplate} className="px-3 py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1.5"><BookmarkPlus className="w-4 h-4" /> {t('Save as template')}</button>
              {selectedTemplate && (currentUser.role === 'Admin' || selectedTemplate.createdBy === currentUser.username) && (
                <button type="button" aria-label={t('Delete template')} onClick={deleteTemplate} className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <div>
              <p className={`${label} mb-2`}>{single ? t('Format') : t('Formats')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FORMATS.map(f => (
                  <button key={f.id} type="button" onClick={() => toggleFormat(f.id)} className={`text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${formats.includes(f.id) ? 'border-blue-500/60 bg-blue-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    <f.icon className={`w-5 h-5 mt-0.5 ${formats.includes(f.id) ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <span><span className="block text-sm font-bold text-white">{t(f.label)}</span><span className="text-[11px] text-zinc-500">{t(f.desc)}</span></span>
                  </button>
                ))}
              </div>
              {!single && (
                <label className="flex items-center gap-2 text-xs text-zinc-400 mt-3"><input type="checkbox" className="accent-blue-500" checked={withComparison} onChange={e => setWithComparison(e.target.checked)} /> {t('Include comparative multi-report analysis in the ZIP')}</label>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {single && <label className="space-y-1 md:col-span-2"><span className={label}>{t('Custom title')}</span><input value={opts.title} onChange={e => set('title', e.target.value)} className={input} /></label>}
              <label className="space-y-1"><span className={label}>{t('Subtitle')}</span><input value={opts.subtitle} onChange={e => set('subtitle', e.target.value)} className={input} /></label>
              <label className="space-y-1"><span className={label}>{t('Organization')}</span><input value={opts.organization} onChange={e => set('organization', e.target.value)} className={input} /></label>
              <label className="space-y-1"><span className={label}>{t('Classification tag')}</span>
                <select value={opts.classification} onChange={e => set('classification', e.target.value)} className={input}>
                  {['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED'].map(c => <option key={c}>{c}</option>)}
                </select></label>
              <label className="space-y-1"><span className={label}>{t('Prepared by')}</span><input value={opts.preparedBy} onChange={e => set('preparedBy', e.target.value)} className={input} /></label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-300">
              {([
                ['includePageNumbers', 'Page numbering (PDF)'],
                ['includeEventDetails', 'Investigation & remediation details'],
                ['includeAnalytics', 'Threat metrics summary'],
                ['includeIntegrity', 'Integrity hash / seal'],
              ] as [keyof ReportExportOptions, string][]).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 p-2 rounded-lg border border-zinc-800 cursor-pointer">
                  <input type="checkbox" className="accent-blue-500" checked={!!opts[k]} onChange={e => set(k, e.target.checked as any)} /> {t(l)}
                </label>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={label}>{t('Custom sections & paragraphs')}</p>
                <div className="flex gap-1">
                  {(['header', 'body', 'footer'] as const).map(p => (
                    <button key={p} type="button" onClick={() => addSection(p)} className="px-2 py-1 rounded-lg border border-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 capitalize"><Plus className="w-3 h-3" /> {t(p.charAt(0).toUpperCase() + p.slice(1))}</button>
                  ))}
                </div>
              </div>
              {opts.customSections.length === 0 && <p className="text-xs text-zinc-600">{t('No custom sections. Add a header note, executive paragraph, or footer disclaimer.')}</p>}
              <div className="space-y-3">
                {opts.customSections.map(s => (
                  <div key={s.id} className="rounded-xl border border-zinc-800 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={s.position} onChange={e => updSection(s.id, { position: e.target.value as CustomSection['position'] })} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 text-xs text-zinc-300">
                        <option value="header">{t('Header')}</option><option value="body">{t('Body')}</option><option value="footer">{t('Footer')}</option>
                      </select>
                      <input value={s.heading} onChange={e => updSection(s.id, { heading: e.target.value })} placeholder={t('Section heading')} className={input} />
                      <button type="button" aria-label={t('Remove section')} onClick={() => rmSection(s.id)} className="p-2 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea rows={3} value={s.content} onChange={e => updSection(s.id, { content: e.target.value })} placeholder={t('Paragraph text…')} className={input} />
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
          {preview && single && (
            <div className="border-l border-zinc-800 bg-zinc-100 hidden lg:block">
              <iframe title={t('Report preview')} sandbox="" srcDoc={previewHtml} className="w-full h-full min-h-[60vh]" />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 flex justify-between items-center">
          <p className="text-[11px] text-zinc-500">{t('Exports are recorded in the audit trail.')}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-bold">{t('Cancel')}</button>
            <button onClick={run} disabled={busy} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2">
              {single && formats.length === 1 ? <FileDown className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {busy ? t('Generating…') : single && formats.length === 1 ? t('Export {fmt}', { fmt: formats[0].toUpperCase() }) : t('Export ZIP')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCustomizer;
