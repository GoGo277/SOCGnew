import React, { useEffect, useState } from 'react';
import { Plug, CheckCircle2, XCircle, RefreshCw, KeyRound, Server, Unplug, AlertTriangle } from 'lucide-react';
import { User } from '../../types';
import { DEFAULT_IRIS_OPTIONS, IrisOptions, IrisStatus, irisService } from '../../services/irisService';
import { uiConfirm } from '../../lib/dialogs';
import { Badge, Field, btn, card, fmtDate, inputCls } from './ui';
import { useT } from '../../i18n';

const IntegrationsPage: React.FC<{ currentUser: User; onToast: (m: string) => void }> = ({ currentUser, onToast }) => {
  const t = useT();
  const cloud = irisService.isCloud();
  const [status, setStatus] = useState<IrisStatus | null>(null);
  const local = irisService.getLocalConfig();
  const [url, setUrl] = useState(local?.url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [opts, setOpts] = useState<IrisOptions>(local ?? DEFAULT_IRIS_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => irisService.status().then(s => { setStatus(s); if (cloud) setOpts(s.options); });
  useEffect(() => { refresh(); return irisService.onChange(refresh); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guard = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { onToast(t(e.message)); } finally { setBusy(null); refresh(); }
  };

  const test = () => guard('test', async () => {
    setTestResult(null);
    try {
      const v = await irisService.testConnection(!cloud && (url || apiKey) ? { url, apiKey: apiKey || local?.apiKey || '' } : undefined);
      setTestResult({ ok: true, text: t('Connected to {v}', { v }) });
    } catch (e: any) { setTestResult({ ok: false, text: e.message }); }
  });

  const save = () => guard('save', async () => {
    if (cloud) await irisService.saveCloudOptions(currentUser, opts);
    else await irisService.saveLocalConfig(currentUser, { ...opts, url, apiKey: apiKey || local?.apiKey || '' });
    setApiKey('');
    onToast(t('Integration settings saved'));
  });

  const sync = () => guard('sync', async () => { const r = await irisService.syncNow(currentUser); onToast(irisService.summarize(r)); });

  const toggle = (k: keyof IrisOptions) => setOpts(o => ({ ...o, [k]: !o[k] }));
  const last = status?.lastResult;

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-zinc-100 flex items-center gap-2"><Plug className="w-6 h-6 text-blue-500" /> {t('Integrations')}</h3>
        <p className="text-sm text-zinc-500">{t('Connect G-Eyes SR to external platforms')}</p>
      </div>

      <section className={`${card} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-zinc-100">DFIR-IRIS</h4>
            <p className="text-xs text-zinc-500">{t('Two-way sync of cases (with timeline, IOCs, assets, evidence, notes, tasks), alerts and customers. Targets the IRIS v2.4 API.')}</p>
          </div>
          {status && (status.configured
            ? <Badge className="border-emerald-500/40 text-emerald-500"><CheckCircle2 className="w-3 h-3" /> {t('Configured')}</Badge>
            : <Badge className="border-zinc-700 text-zinc-400"><XCircle className="w-3 h-3" /> {t('Not configured')}</Badge>)}
        </div>

        {cloud ? (
          <div className="rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400 space-y-2">
            <p className="flex items-center gap-1.5 text-zinc-200 font-bold"><Server className="w-4 h-4" /> {t('Server-managed connection')}</p>
            <p>{t('In cloud mode the IRIS URL and API key are stored on the server (Secret Manager), never in browsers. An administrator sets them with the Firebase CLI:')}</p>
            <pre className="bg-[var(--app-bg)] border border-zinc-800 rounded p-2 overflow-x-auto text-[11px] text-zinc-300">{`firebase functions:secrets:set IRIS_API_KEY\necho "IRIS_URL=https://iris.example.com" >> functions/.env\nnpm run deploy`}</pre>
            {status?.url && <p>{t('Current IRIS URL')}: <code className="text-zinc-200">{status.url}</code></p>}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t('IRIS URL')}><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://iris.example.com" className={inputCls} /></Field>
            <Field label={t('API key')} hint={local?.apiKey ? t('A key is saved in this browser. Leave empty to keep it.') : t('From your IRIS user profile (My settings → API key).')}>
              <input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={local?.apiKey ? '••••••••••••' : ''} className={inputCls} />
            </Field>
            <p className="sm:col-span-2 text-[11px] text-amber-500 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {t('Local mode: the browser calls IRIS directly, so IRIS must allow this site via CORS (or be reached through a reverse proxy). The key is stored only in this browser. Use cloud mode for production.')}</p>
          </div>
        )}

        <fieldset className="grid sm:grid-cols-2 gap-2">
          <legend className="text-[11px] font-bold uppercase text-zinc-500 mb-1">{t('Sync scope')}</legend>
          {([['pushCases', t('Push G-Eyes cases and their objects to IRIS')], ['pushAlerts', t('Push G-Eyes alerts to IRIS')], ['importRemote', t('Import cases, alerts and objects created in IRIS')]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" className="accent-blue-600" checked={!!opts[k]} onChange={() => toggle(k)} /> {l}</label>
          ))}
          <label className="flex items-center gap-2 text-sm text-zinc-300">{t('Automatic sync')}
            <select value={opts.autoSyncMinutes} onChange={e => setOpts(o => ({ ...o, autoSyncMinutes: Number(e.target.value) as IrisOptions['autoSyncMinutes'] }))} className={`${inputCls} w-auto py-1`}>
              <option value={0}>{t('Off')}</option><option value={5}>{t('Every 5 minutes')}</option><option value={15}>{t('Every 15 minutes')}</option><option value={60}>{t('Hourly')}</option>
            </select>
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} onClick={save} className={btn.primary}><KeyRound className="w-3.5 h-3.5" /> {t('Save settings')}</button>
          <button disabled={!!busy} onClick={test} className={btn.ghost}>{busy === 'test' ? t('Testing…') : t('Test connection')}</button>
          <button disabled={!!busy || !status?.configured} onClick={sync} className={btn.ghost}><RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> {t('Sync now')}</button>
          {!cloud && local && <button disabled={!!busy} onClick={async () => { if (await uiConfirm(t('Remove the IRIS connection from this browser? Linked records keep their IRIS ids.'), { tone: 'danger' })) guard('disc', () => irisService.disconnect(currentUser)); }} className={btn.ghost}><Unplug className="w-3.5 h-3.5" /> {t('Disconnect')}</button>}
        </div>
        {testResult && <p role="status" className={`text-xs flex items-center gap-1.5 ${testResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>{testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {testResult.text}</p>}
      </section>

      <section className={`${card} p-4 sm:p-5 space-y-2`}>
        <h4 className="text-sm font-bold text-zinc-100">{t('Last synchronisation')}</h4>
        {!status?.lastRunAt ? <p className="text-xs text-zinc-500">{t('No sync has run yet.')}</p> : (
          <>
            <p className="text-xs text-zinc-400">{fmtDate(status.lastRunAt)}{last?.irisVersion ? ` · IRIS ${last.irisVersion}` : ''}</p>
            {last && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[[t('Cases pushed'), last.pushed.cases], [t('Objects pushed'), last.pushed.objects], [t('Alerts pushed'), last.pushed.alerts], [t('Deletions sent'), last.pushed.deleted],
                  [t('Cases imported'), last.pulled.cases], [t('Objects imported'), last.pulled.objects], [t('Updates applied'), last.pulled.updated], [t('Removed (deleted in IRIS)'), last.pulled.removed]].map(([k, v]) => (
                  <div key={String(k)} className="border border-zinc-800 rounded-lg p-2"><p className="text-[10px] text-zinc-500">{k}</p><p className="text-lg font-bold text-zinc-100">{v}</p></div>
                ))}
              </div>
            )}
            {(last?.errors.length || status.lastError) ? (
              <ul className="text-xs text-red-500 space-y-0.5">{(last?.errors.length ? last.errors : [status.lastError]).slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
            ) : <p className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {t('Completed without errors')}</p>}
          </>
        )}
      </section>

      <section className={`${card} p-4 sm:p-5 text-xs text-zinc-400 space-y-1.5`}>
        <h4 className="text-sm font-bold text-zinc-100">{t('How the sync works')}</h4>
        <p>{t('Each run first pushes local changes (only records whose content changed), including deletions, then pulls changes made in IRIS. If a record changed on both sides since the last run, the IRIS version wins and the change is noted in the case activity.')}</p>
        <p>{t('IRIS ids for severities, states, IOC types and other lookups are resolved by name from your IRIS server, so custom IRIS lookups keep working.')}</p>
        <p>{t('Not synchronised: user assignments (IRIS and G-Eyes accounts are separate), evidence file contents (only metadata and hashes), and IRIS modules or enrichment.')}</p>
      </section>
    </div>
  );
};

export default IntegrationsPage;
