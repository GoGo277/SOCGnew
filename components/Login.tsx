import React, { useState } from 'react';
import { Shield, Lock, User as UserIcon, ChevronRight, AlertCircle, Smartphone, ArrowLeft } from 'lucide-react';
import { settingsService, DEMO_MODE } from '../services/settingsService';
import { User, AppSettings } from '../types';
import { useT } from '../i18n';
import MfaEnrollPanel from './MfaEnrollPanel';

interface LoginProps {
  onLogin: (user: User) => void;
  settings: AppSettings;
}

type Stage = { kind: 'credentials' } | { kind: 'challenge' } | { kind: 'enroll'; secret: string; uri: string };

const Login: React.FC<LoginProps> = ({ onLogin, settings }) => {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'credentials' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (fn: () => ReturnType<typeof settingsService.authenticate>) => {
    setError('');
    setLoading(true);
    try {
      const res = await fn();
      if (res.status === 'ok') onLogin(res.user);
      else if (res.status === 'mfa_challenge') { setCode(''); setStage({ kind: 'challenge' }); }
      else if (res.status === 'mfa_enroll') setStage({ kind: 'enroll', secret: res.secret, uri: res.uri });
      else setError(t(res.error));
    } catch {
      setError(t('Authentication service unavailable'));
    } finally {
      setLoading(false);
    }
  };

  const back = async () => { await settingsService.cancelPendingAuth(); setStage({ kind: 'credentials' }); setPassword(''); setError(''); };
  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-zinc-700';

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600 rounded-full blur-[120px]" />
      </div>

      <main className="w-full max-w-md relative">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-col items-center mb-8 text-center">
            {settings.logoUrl ? (
              <div className="w-20 h-20 mb-4 overflow-hidden rounded-2xl shadow-2xl shadow-blue-600/10"><img src={settings.logoUrl} alt="" className="w-full h-full object-cover" /></div>
            ) : (
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/20 mb-4"><Shield className="w-8 h-8 text-white" /></div>
            )}
            <h1 className="text-2xl font-black text-white tracking-tight">{settings.appName}</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {stage.kind === 'credentials' ? t('auth_required') : stage.kind === 'challenge' ? t('Two-step verification') : t('Set up two-step verification')}
            </p>
          </div>

          {DEMO_MODE && stage.kind === 'credentials' && (
            <p role="note" className="mb-5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
              {t('Demo mode — sign in with admin / admin. Data stays in this browser. Not for production use.')}
            </p>
          )}
          {stage.kind === 'credentials' && (
            <form onSubmit={e => { e.preventDefault(); handle(() => settingsService.authenticate(username, password)); }} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="login-user" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">{t('username')}</label>
                <div className="relative group">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-500" />
                  <input id="login-user" required type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('analyst_name')} className={input} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="login-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">{t('security_code')}</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-500" />
                  <input id="login-pass" required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={input} />
                </div>
              </div>
              {error && <div role="alert" className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('connect')}<ChevronRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {stage.kind === 'challenge' && (
            <form onSubmit={e => { e.preventDefault(); handle(() => settingsService.verifyMfa(code)); }} className="space-y-5">
              <p className="text-xs text-zinc-400 flex items-start gap-2"><Smartphone className="w-4 h-4 shrink-0 text-blue-400" /> {t('Enter the 6-digit code from your authenticator app.')}</p>
              <input autoFocus aria-label={t('Authentication code')} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-lg tracking-[0.5em] text-center text-white font-mono outline-none focus:border-blue-500/60" placeholder="000000" />
              {error && <div role="alert" className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
              <button disabled={loading || code.length !== 6} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold">{loading ? t('Verifying…') : t('Verify')}</button>
              <button type="button" onClick={back} className="w-full text-xs text-zinc-500 hover:text-white flex items-center justify-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> {t('Back to sign in')}</button>
            </form>
          )}

          {stage.kind === 'enroll' && (
            <div className="space-y-4">
              <p className="text-xs text-amber-300 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">{t('Administrator accounts must use two-step verification. Set up an authenticator app to continue.')}</p>
              <MfaEnrollPanel secret={stage.secret} uri={stage.uri} busy={loading} error={error} onSubmit={c => handle(() => settingsService.confirmMfaEnrollment(c))} />
              <button type="button" onClick={back} className="w-full text-xs text-zinc-500 hover:text-white flex items-center justify-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> {t('Cancel')}</button>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">{t('auth_access_only')}</p>
            <p className="text-[10px] text-zinc-700 mt-2">{t('All access is logged and audited. Unauthorized use is prohibited.')}</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
