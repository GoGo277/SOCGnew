import React, { useMemo, useState } from 'react';
import { KeyRound, ShieldAlert, Check, X, LogOut, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { settingsService } from '../services/settingsService';
import { checkPasswordPolicy } from '../lib/crypto';
import { useT } from '../i18n';

interface Props {
  user: User;
  /** forced = intercept on login (cannot be dismissed) */
  forced?: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

const ForceChangePassword: React.FC<Props> = ({ user, forced = true, onComplete, onCancel }) => {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const policy = useMemo(() => checkPasswordPolicy(next, user.username), [next, user.username]);
  const rules = ['At least 10 characters', 'A lowercase letter', 'An uppercase letter', 'A digit', 'A symbol', 'Must not contain the username'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError(t('New passwords do not match')); return; }
    if (!policy.ok) { setError(t('Password does not meet the policy')); return; }
    setBusy(true);
    try {
      await settingsService.changePassword(user.id, current, next);
      onComplete();
    } catch (err: any) {
      setError(t(err.message || 'Password change failed'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500/60';

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="fcp-title">
      <form onSubmit={submit} className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl ${forced ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
            {forced ? <ShieldAlert className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <div>
            <h2 id="fcp-title" className="text-lg font-black text-white">{forced ? t('Password change required') : t('Change password')}</h2>
            <p className="text-xs text-zinc-500 mt-1">
              {forced
                ? t('Welcome, {name}. Your account was issued a temporary credential. You must set a new password before accessing the platform.', { name: user.username })
                : t('Update the credential used to sign in to the platform.')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{forced ? t('Temporary password') : t('Current password')}</span>
            <input required type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('New password')}</span>
            <input required type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('Confirm new password')}</span>
            <input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={input} />
          </label>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {rules.map(r => {
            const ok = next.length > 0 && !policy.errors.includes(r);
            return (
              <li key={r} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {t(r)}
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2">
            {forced ? <><LogOut className="w-4 h-4" /> {t('Sign out')}</> : t('Cancel')}
          </button>
          <button disabled={busy} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold">
            {busy ? t('Updating…') : t('Update password')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ForceChangePassword;
