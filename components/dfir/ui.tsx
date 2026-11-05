import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Severity } from '../../types';
import { SEVERITY_STYLE } from '../../services/analytics';
import { useEscape } from '../../lib/useEscape';
import { useT } from '../../i18n';

/** Shared building blocks for the IRIS-style investigation screens. */

export const inputCls = 'w-full bg-[var(--app-bg)] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 placeholder:text-zinc-600';
export const labelCls = 'text-[11px] font-bold text-zinc-500 uppercase tracking-wide';
export const btn = {
  primary: 'px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50',
  danger: 'px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50',
  ghost: 'px-3 py-2 rounded-lg border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50',
  icon: 'p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/60',
};
export const card = 'bg-[var(--app-surface)] border border-zinc-800 rounded-xl';

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => {
  const t = useT();
  const id = useId();
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className={`modal-entrance w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} ${card} shadow-2xl flex flex-col max-h-[92vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 id={id} className="text-base font-bold text-zinc-100">{title}</h3>
          <button aria-label={t('Close')} onClick={onClose} className={btn.icon}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-zinc-800 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string; hint?: string }> = ({ label, children, className = '', hint }) => (
  <label className={`block space-y-1 ${className}`}>
    <span className={labelCls}>{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
  </label>
);

export const Badge: React.FC<{ className: string; children: React.ReactNode; title?: string }> = ({ className, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-bold whitespace-nowrap ${className}`}>{children}</span>
);

export const SeverityBadge: React.FC<{ s: Severity }> = ({ s }) => {
  const t = useT();
  return <Badge className={SEVERITY_STYLE[s].badge}>{t(s)}</Badge>;
};

export const Tabs = <K extends string>({ tabs, active, onChange, label }: { tabs: { id: K; label: string; count?: number }[]; active: K; onChange: (k: K) => void; label: string }) => (
  <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-zinc-800 -mb-px">
    {tabs.map(tb => (
      <button key={tb.id} role="tab" aria-selected={active === tb.id} onClick={() => onChange(tb.id)}
        className={`px-3 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px ${active === tb.id ? 'border-blue-600 text-blue-500 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-100'}`}>
        {tb.label}{tb.count !== undefined && <span className="ml-1.5 text-[10px] px-1.5 rounded-full bg-zinc-800 text-zinc-400">{tb.count}</span>}
      </button>
    ))}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-10 text-center text-sm text-zinc-500">{children}</p>
);

export const TagInput: React.FC<{ value: string[]; onChange: (v: string[]) => void; placeholder?: string; label?: string }> = ({ value, onChange, placeholder, label }) => {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setDraft('');
  };
  return (
    <div className={`${inputCls} flex flex-wrap gap-1.5 items-center`}>
      {value.map(tag => (
        <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 inline-flex items-center gap-1">
          {tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter(x => x !== tag))} className="text-zinc-500 hover:text-red-500">×</button>
        </span>
      ))}
      <input aria-label={label ?? placeholder ?? 'Tags'} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
        placeholder={placeholder} className="flex-1 min-w-[80px] bg-transparent outline-none text-sm" />
    </div>
  );
};

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const toLocalInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
