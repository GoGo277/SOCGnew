import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check } from 'lucide-react';
import { useT } from '../i18n';

/** QR code + manual key + code entry for TOTP authenticator enrolment. */
const MfaEnrollPanel: React.FC<{ secret: string; uri: string; busy: boolean; onSubmit: (code: string) => void; error?: string }> = ({ secret, uri, busy, onSubmit, error }) => {
  const t = useT();
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(uri, { margin: 1, width: 200 }).then(setQr).catch(() => setQr('')); }, [uri]);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(code); }} className="space-y-4">
      <ol className="text-xs text-zinc-400 space-y-1 list-decimal pl-4">
        <li>{t('Install an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…).')}</li>
        <li>{t('Scan the QR code, or enter the key manually.')}</li>
        <li>{t('Enter the 6-digit code shown in the app.')}</li>
      </ol>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {qr ? <img src={qr} alt={t('Authenticator QR code')} className="w-40 h-40 rounded-xl bg-[#ffffff] p-1" /> : <div className="w-40 h-40 rounded-xl bg-zinc-800" />}
        <div className="flex-1 min-w-0 space-y-2 w-full">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Setup key')}</p>
          <div className="flex items-center gap-2">
            <code data-testid="mfa-secret" className="flex-1 min-w-0 break-all text-xs text-zinc-200 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5">{secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            <button type="button" aria-label={t('Copy key')} onClick={() => { navigator.clipboard?.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
          </div>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Authentication code')}</span>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-lg tracking-[0.5em] text-center text-white font-mono outline-none focus:border-blue-500/60" placeholder="000000" />
      </label>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      <button disabled={busy || code.length !== 6} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold">{busy ? t('Verifying…') : t('Activate & continue')}</button>
    </form>
  );
};

export default MfaEnrollPanel;
