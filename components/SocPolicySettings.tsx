import React, { useState } from 'react';
import { Timer, Save, ShieldCheck, RotateCcw } from 'lucide-react';
import { AppSettings, Severity, SlaPolicy, User } from '../types';
import { DEFAULT_SLA, formatMinutes } from '../lib/sla';
import { SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import { settingsService } from '../services/settingsService';
import { auditService } from '../services/auditService';
import { useT } from '../i18n';

interface Props { settings: AppSettings; currentUser: User; onSaved: (s: AppSettings) => void }

/** Admin: SLA targets & security policy. */
const SocPolicySettings: React.FC<Props> = ({ settings, currentUser, onSaved }) => {
  const t = useT();
  const [sla, setSla] = useState<SlaPolicy>(() => JSON.parse(JSON.stringify(settings.sla ?? DEFAULT_SLA)));
  const [requireMfa, setRequireMfa] = useState(settings.requireAdminMfa !== false);
  const [error, setError] = useState('');

  const setVal = (sev: Severity, key: 'containMinutes' | 'resolveMinutes', hours: string) => {
    const minutes = Math.round(parseFloat(hours) * 60);
    setSla(p => ({ ...p, [sev]: { ...p[sev], [key]: isNaN(minutes) ? 0 : minutes } }));
  };

  const save = () => {
    setError('');
    for (const s of SEVERITIES) {
      const v = sla[s];
      if (v.containMinutes <= 0 || v.resolveMinutes <= 0) { setError(t('All targets must be greater than zero')); return; }
      if (v.resolveMinutes < v.containMinutes) { setError(t('{sev}: resolve target must not be shorter than contain target', { sev: t(s) })); return; }
    }
    const updated: AppSettings = { ...settings, sla, requireAdminMfa: requireMfa };
    settingsService.saveSettings(updated);
    auditService.log(currentUser, 'SETTINGS_CHANGED', { id: 'soc-policy', name: 'SOC policy' }, {
      before: { sla: settings.sla, requireAdminMfa: settings.requireAdminMfa }, after: { sla, requireAdminMfa: requireMfa },
    });
    onSaved(updated);
  };

  const input = 'w-28 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white text-right outline-none focus:border-blue-500/50';

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h4 className="text-xl font-black text-white flex items-center gap-2"><Timer className="w-5 h-5 text-sky-400" /> {t('Response-time SLA targets')}</h4>
          <p className="text-xs text-zinc-500 mt-1">{t('Measured from detection. Used for SLA compliance, breach alerts and executive metrics.')}</p>
        </div>
        <div className="overflow-x-auto border border-zinc-800 rounded-2xl">
          <table className="w-full text-left min-w-[560px]">
            <thead><tr className="bg-zinc-900/60 border-b border-zinc-800 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
              <th className="p-4">{t('Severity')}</th><th className="p-4">{t('Contain within (hours)')}</th><th className="p-4">{t('Resolve within (hours)')}</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {SEVERITIES.map(s => (
                <tr key={s}>
                  <td className="p-4"><span className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase ${SEVERITY_STYLE[s].badge}`}>{t(s)}</span></td>
                  <td className="p-4"><input aria-label={`${s} contain hours`} type="number" min="0.25" step="0.25" value={sla[s].containMinutes / 60} onChange={e => setVal(s, 'containMinutes', e.target.value)} className={input} /> <span className="text-xs text-zinc-500 ml-2">{formatMinutes(sla[s].containMinutes)}</span></td>
                  <td className="p-4"><input aria-label={`${s} resolve hours`} type="number" min="0.25" step="0.25" value={sla[s].resolveMinutes / 60} onChange={e => setVal(s, 'resolveMinutes', e.target.value)} className={input} /> <span className="text-xs text-zinc-500 ml-2">{formatMinutes(sla[s].resolveMinutes)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setSla(JSON.parse(JSON.stringify(DEFAULT_SLA)))} className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> {t('Restore defaults')}</button>
      </section>

      <section className="space-y-3">
        <h4 className="text-xl font-black text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> {t('Security policy')}</h4>
        <label className="flex items-start gap-3 p-4 rounded-2xl border border-zinc-800 cursor-pointer">
          <input type="checkbox" className="accent-blue-500 mt-1" checked={requireMfa} onChange={e => setRequireMfa(e.target.checked)} />
          <span>
            <span className="block text-sm font-bold text-white">{t('Require multi-factor authentication for administrators')}</span>
            <span className="text-xs text-zinc-500">{t('Administrators must enrol an authenticator app (TOTP) and enter a one-time code at every sign-in.')}</span>
          </span>
        </label>
      </section>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end pt-4 border-t border-zinc-800">
        <button onClick={save} className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest"><Save className="w-5 h-5" /> {t('Save policy')}</button>
      </div>
    </div>
  );
};

export default SocPolicySettings;
