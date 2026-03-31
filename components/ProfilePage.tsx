
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, Language } from '../types';
import { settingsService } from '../services/settingsService';
import { User as UserIcon, Camera, Save, Shield, Clock, Info } from 'lucide-react';
import { getTranslator } from '../translations';

interface ProfilePageProps {
  user: User;
  onUpdate: () => void;
  language: Language;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUpdate, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [bio, setBio] = useState(user.bio || '');
  const [profilePic, setProfilePic] = useState(user.profilePic || '');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBio(user.bio || '');
    setProfilePic(user.profilePic || '');
  }, [user.id]);

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      settingsService.saveUser({ id: user.id, bio, profilePic });
      onUpdate();
      setLoading(false);
      alert('Profile updated.');
    }, 500);
  };

  const handlePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="h-48 bg-gradient-to-r from-blue-600/20 via-zinc-800 to-red-600/20 relative" />
        <div className="px-12 pb-12 relative -mt-20">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="relative group">
              <div className="w-40 h-40 rounded-[2.5rem] bg-zinc-900 border-4 border-[#09090b] shadow-2xl flex items-center justify-center overflow-hidden">
                {profilePic ? <img src={profilePic} className="w-full h-full object-cover" /> : <UserIcon className="w-16 h-16 text-zinc-700" />}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 p-3 bg-blue-600 text-white rounded-2xl shadow-lg hover:shadow-xl active:scale-90 transition-all"><Camera className="w-5 h-5" /></button>
              <input type="file" ref={fileInputRef} onChange={handlePicUpload} accept="image/*" className="hidden" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-4xl font-black text-white">{user.username}</h3>
              <div className="flex gap-3">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${user.role === 'Admin' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>{user.role} Analyst</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-12">
            <div className="md:col-span-2 space-y-8">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest"><Info className="w-3.5 h-3.5" /> {t('professional_bio')}</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={6} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-sm text-zinc-300 outline-none transition-all focus:border-blue-500/50" />
              </div>
              <button onClick={handleSave} disabled={loading} className="flex items-center gap-3 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 active:scale-95 transition-all">
                {loading ? '...' : <Save className="w-4 h-4" />} {t('save_identity')}
              </button>
            </div>
            <div className="space-y-6 bg-zinc-950/50 p-6 rounded-[2rem] border border-zinc-800/50">
              <h4 className="text-[10px] font-black text-zinc-500 uppercase mb-4">Metadata</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800"><UserIcon className="w-4 h-4 text-zinc-500" /></div>
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase tracking-tight">{t('identity_code')}</p><p className="text-xs font-bold text-zinc-400">@{user.username.toLowerCase()}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800"><Clock className="w-4 h-4 text-zinc-500" /></div>
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase tracking-tight">{t('protocol_established')}</p><p className="text-xs font-bold text-zinc-400">{new Date(user.createdAt).toLocaleDateString()}</p></div>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-zinc-800 flex items-center gap-2 text-emerald-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest">{t('connection_stable')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
