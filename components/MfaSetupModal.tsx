import React, { useEffect, useState } from 'react';
import { useEscape } from '../lib/useEscape';
import { ShieldCheck, X } from 'lucide-react';
import { User } from '../types';
import { settingsService } from '../services/settingsService';
import MfaEnrollPanel from './MfaEnrollPanel';
import { useT } from '../i18n';

/** Voluntary authenticator enrolment for a signed-in user. */
const MfaSetupModal: React.FC<{ user: User; onClose: () => void; onDone: () => void }> = ({ user, onClose, onDone }) => {
  const t = useT();
  useEscape(onClose);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.mfaEnrolledAt) return;
    settingsService.beginSelfEnrollment(user).then(setSetup).catch(e => setError(e.message));
    return () => { settingsService.cancelPendingAuth(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (code: string) => {
    setBusy(true); setError('');
    const res = await settingsService.confirmMfaEnrollment(code);
    setBusy(false);
    if (res.status === 'ok') onDone(); else if (res.status === 'error') setError(t(res.error));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
      <div className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="mfa-title" className="text-lg font-black text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> {t('Two-step verification')}</h2>
          <button aria-label={t('Close')} onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {user.mfaEnrolledAt ? (
          <p className="text-sm text-emerald-300">{t('Two-step verification is active on your account since {date}. Ask an administrator to reset it if you lose your device.', { date: new Date(user.mfaEnrolledAt).toLocaleDateString() })}</p>
        ) : setup ? (
          <MfaEnrollPanel secret={setup.secret} uri={setup.uri} busy={busy} error={error} onSubmit={submit} />
        ) : error ? <p className="text-xs text-red-400">{error}</p> : <p className="text-xs text-zinc-500">{t('Preparing…')}</p>}
      </div>
    </div>
  );
};

export default MfaSetupModal;
