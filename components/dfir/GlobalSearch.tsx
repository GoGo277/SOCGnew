import React, { useMemo, useRef, useState } from 'react';
import { Search, Briefcase, Siren, Fingerprint } from 'lucide-react';
import { DfirData } from '../../hooks/useDfirData';
import { useT } from '../../i18n';

/** Header search across cases, alerts and IOCs (IRIS global search). */
const GlobalSearch: React.FC<{ data: DfirData; onOpenCase: (id: string) => void; onOpenAlert: (id: string) => void }> = ({ data, onOpenCase, onOpenAlert }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql.length < 2) return [];
    const num = ql.replace(/^#/, '');
    const out: { key: string; icon: React.ElementType; label: string; sub: string; go: () => void }[] = [];
    data.cases.filter(c => String(c.number) === num || c.name.toLowerCase().includes(ql) || c.tags.some(x => x.toLowerCase().includes(ql))).slice(0, 5)
      .forEach(c => out.push({ key: `c${c.id}`, icon: Briefcase, label: `#${c.number} ${c.name}`, sub: t(c.state), go: () => onOpenCase(c.id) }));
    data.alerts.filter(a => String(a.number) === num || a.title.toLowerCase().includes(ql) || a.iocs.some(i => i.value.toLowerCase().includes(ql))).slice(0, 5)
      .forEach(a => out.push({ key: `a${a.id}`, icon: Siren, label: `${t('Alert')} #${a.number} ${a.title}`, sub: t(a.status), go: () => onOpenAlert(a.id) }));
    data.iocs.filter(i => i.value.toLowerCase().includes(ql)).slice(0, 5)
      .forEach(i => { const c = data.cases.find(x => x.id === i.caseId); if (c) out.push({ key: `i${i.id}`, icon: Fingerprint, label: i.value, sub: `${i.type} · ${t('Case')} #${c.number}`, go: () => onOpenCase(c.id) }); });
    return out;
  }, [q, data, t, onOpenCase, onOpenAlert]);

  return (
    <div ref={ref} className="relative hidden md:block" onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-[var(--app-bg)] w-64 lg:w-80">
        <Search className="w-4 h-4 text-zinc-500" />
        <input role="combobox" aria-expanded={open && results.length > 0} aria-controls="global-search-results" aria-label={t('Search cases, alerts and IOCs')}
          value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) { results[0].go(); setOpen(false); setQ(''); } if (e.key === 'Escape') setOpen(false); }}
          placeholder={t('Search cases, alerts, IOCs…')} className="bg-transparent outline-none text-sm w-full" />
      </div>
      {open && q.trim().length >= 2 && (
        <ul id="global-search-results" role="listbox" className="absolute right-0 mt-1 w-[26rem] max-w-[90vw] bg-[var(--app-surface)] border border-zinc-800 rounded-xl shadow-2xl p-1 z-50">
          {results.length === 0 ? <li className="px-3 py-2 text-xs text-zinc-500">{t('No matches.')}</li> : results.map(r => (
            <li key={r.key} role="option" aria-selected="false">
              <button onClick={() => { r.go(); setOpen(false); setQ(''); }} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/60">
                <r.icon className="w-4 h-4 text-zinc-500 shrink-0" /><span className="truncate text-sm text-zinc-100 flex-1">{r.label}</span><span className="text-[11px] text-zinc-500 shrink-0">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GlobalSearch;
