import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';
import { DialogRequest, settleDialog, subscribeDialogs } from '../lib/dialogs';
import { makeTranslator } from '../i18n';
import { settingsService } from '../services/settingsService';
import { useEscape } from '../lib/useEscape';

/** Renders the in-app alert / confirm / prompt dialogs (one at a time, FIFO). */
const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);
  const current = queue[0];
  return current ? <Dialog key={current.id} req={current} /> : null;
};

const Dialog: React.FC<{ req: DialogRequest }> = ({ req }) => {
  const t = makeTranslator(settingsService.getSettings().language);
  const [value, setValue] = useState(req.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelValue = req.kind === 'confirm' ? false : req.kind === 'prompt' ? null : undefined;
  const cancel = () => settleDialog(req.id, cancelValue);
  const ok = () => settleDialog(req.id, req.kind === 'confirm' ? true : req.kind === 'prompt' ? value : undefined);
  useEscape(cancel);
  useEffect(() => { (req.kind === 'prompt' ? inputRef.current : okRef.current)?.focus(); }, [req.kind]);

  const Icon = req.tone === 'danger' ? AlertTriangle : req.kind === 'alert' ? Info : HelpCircle;
  const danger = req.tone === 'danger';
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby={`dlg-${req.id}`} aria-describedby={`dlg-msg-${req.id}`}>
      <form onSubmit={e => { e.preventDefault(); ok(); }} className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${danger ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}><Icon className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h3 id={`dlg-${req.id}`} className="text-base font-black text-white">{req.title ?? (req.kind === 'alert' ? t('Notice') : t('Please confirm'))}</h3>
            <p id={`dlg-msg-${req.id}`} className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words">{req.message}</p>
          </div>
        </div>
        {req.kind === 'prompt' && (
          <input ref={inputRef} aria-label={req.title ?? req.message} value={value} placeholder={req.placeholder} onChange={e => setValue(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/60" />
        )}
        <div className="flex justify-end gap-2">
          {req.kind !== 'alert' && <button type="button" onClick={cancel} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-300 font-bold">{t('Cancel')}</button>}
          <button ref={okRef} type="submit" className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {req.confirmLabel ?? (req.kind === 'alert' ? t('OK') : t('Confirm'))}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DialogHost;
