
import React, { useState, useMemo } from 'react';
import { 
  LayoutDashboard, Shield, Database, LogOut, Activity, 
  Settings, ClipboardList, BookOpen, ChevronLeft, 
  ChevronRight, Bell, User as UserIcon, ShieldAlert,
  MessageSquare, Megaphone, UserCircle, CheckSquare,
  ShieldCheck, RefreshCw, Zap
} from 'lucide-react';
import { User, AppSettings } from '../types';
import { getTranslator } from '../translations';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: any) => void;
  currentUser: User;
  settings: AppSettings;
  onLogout: () => void;
  totalAlerts: number;
  onToggleNotifCenter: () => void;
  isNotifCenterOpen: boolean;
  navCounts?: Record<string, number>;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange, 
  currentUser, 
  settings, 
  onLogout,
  totalAlerts,
  onToggleNotifCenter,
  isNotifCenterOpen,
  navCounts = {}
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const t = useMemo(() => getTranslator(settings.language), [settings.language]);
  const permissions = settings.rolePermissions[currentUser.role];

  const handleRefresh = () => {
    setIsSyncing(true);
    setTimeout(() => {
      window.dispatchEvent(new Event('storage'));
      setIsSyncing(false);
    }, 600);
  };

  const allNavItems = useMemo(() => ([
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard, color: 'text-blue-400', visible: permissions.visiblePages.dashboard },
    { id: 'assets', label: t('assets'), icon: Database, color: 'text-blue-400', visible: permissions.visiblePages.assets },
    { id: 'incidents', label: t('incidents'), icon: Activity, color: 'text-red-400', visible: permissions.visiblePages.incidents },
    { id: 'tasks', label: t('tasks'), icon: CheckSquare, color: 'text-cyan-400', visible: permissions.visiblePages.tasks },
    { id: 'announcements', label: t('announcements'), icon: Megaphone, color: 'text-orange-400', visible: permissions.visiblePages.announcements },
    { id: 'messaging', label: t('messaging'), icon: MessageSquare, color: 'text-purple-400', visible: permissions.visiblePages.messaging },
    { id: 'guidelines', label: t('guidelines'), icon: BookOpen, color: 'text-emerald-400', visible: true },
    { id: 'admin-requests', label: t('admin_requests'), icon: ShieldCheck, color: 'text-amber-400', visible: currentUser.role === 'Admin' },
    { id: 'requests', label: t('requests'), icon: ClipboardList, color: 'text-amber-400', visible: currentUser.role !== 'Admin' },
  ]), [t, permissions, currentUser.role]);

  const sortedNavItems = useMemo(() => {
    return [...allNavItems].sort((a, b) => {
      const indexA = settings.navOrder.indexOf(a.id);
      const indexB = settings.navOrder.indexOf(b.id);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
  }, [allNavItems, settings.navOrder]);

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return t('soc_hub');
      case 'assets': return t('assets');
      case 'incidents': return t('incidents');
      case 'tasks': return t('mission_control');
      case 'announcements': return t('intel_feed');
      case 'messaging': return t('messaging');
      case 'guidelines': return t('sop_intel');
      case 'requests': return t('command_history');
      case 'admin-requests': return t('admin_requests');
      case 'profile': return t('analyst_profile');
      case 'settings': return t('core_systems');
      default: return activeTab;
    }
  };

  return (
    <div className={`flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden ${settings.language === 'zh' ? 'font-sans' : ''}`}>
      <aside className={`relative border-r border-zinc-800 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'} bg-[#0c0c0e] z-30 shrink-0`}>
        <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'px-6 gap-3'} border-b border-zinc-800/50`}>
          {settings.logoUrl ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-800 shrink-0"><img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" /></div>
          ) : (
            <div className="bg-blue-600 p-1.5 rounded-lg shrink-0"><Shield className="w-5 h-5 text-white" /></div>
          )}
          {!isCollapsed && <h1 className="font-black text-sm uppercase tracking-widest truncate">{settings.appName}</h1>}
        </div>
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {sortedNavItems.filter(item => item.visible).map((item) => {
            const count = navCounts[item.id] || 0;
            return (
              <button key={item.id} onClick={() => onTabChange(item.id)} title={isCollapsed ? item.label : ''} className={`w-full flex items-center transition-all duration-200 group rounded-xl relative ${activeTab === item.id ? 'bg-zinc-800/50 text-white border border-white/5' : 'text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-200'} ${isCollapsed ? 'justify-center h-12' : 'px-4 py-3 gap-3'}`}>
                <div className="relative"><item.icon className={`w-5 h-5 shrink-0 ${activeTab === item.id ? item.color : 'group-hover:text-zinc-300'}`} />{count > 0 && isCollapsed && (<span className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#0c0c0e]">{count > 9 ? '9+' : count}</span>)}</div>
                {!isCollapsed && (<><span className="text-sm font-bold tracking-tight flex-1 text-left">{item.label}</span>{count > 0 && (<span className="bg-red-600/20 text-red-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-500/20">{count}</span>)}</>)}
                {isCollapsed && activeTab === item.id && (<div className="absolute left-0 w-1 h-6 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />)}
              </button>
            );
          })}
        </nav>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3 top-20 w-6 h-6 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all z-40">{isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-between px-8 bg-[#09090b]/80 backdrop-blur-md z-20 sticky top-0">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-black tracking-tight text-white uppercase flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />{getPageTitle()}</h2>
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-full">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
               <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Real-time Sync Active</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={handleRefresh} className={`p-2.5 rounded-xl border border-zinc-800 text-zinc-500 hover:text-white transition-all active:scale-90 shadow-sm hover:shadow-md ${isSyncing ? 'animate-spin border-blue-500/50 text-blue-400' : ''}`} title="Synchronize State"><RefreshCw className="w-5 h-5" /></button>
            <button onClick={onToggleNotifCenter} className={`p-2.5 rounded-xl transition-all relative border active:scale-90 shadow-sm hover:shadow-md ${isNotifCenterOpen ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700'}`}><Bell className="w-5 h-5" />{totalAlerts > 0 && (<span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#09090b] shadow-lg">{totalAlerts}</span>)}</button>

            <div className="relative">
              <button onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)} className={`flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-xl border transition-all active:scale-95 shadow-sm hover:shadow-md ${isAccountMenuOpen ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                <div className="flex flex-col items-end"><span className="text-xs font-black tracking-tight leading-none text-zinc-200">{currentUser.username}</span><span className="text-[8px] font-black uppercase text-zinc-600 tracking-widest">{currentUser.role}</span></div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] overflow-hidden ${currentUser.role === 'Admin' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>{currentUser.profilePic ? (<img src={currentUser.profilePic} alt="" className="w-full h-full object-cover" />) : (<UserIcon className="w-4 h-4" />)}</div>
              </button>

              {isAccountMenuOpen && (<><div className="fixed inset-0 z-40" onClick={() => setIsAccountMenuOpen(false)} /><div className="absolute right-0 mt-3 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200"><div className="px-3 py-3 border-b border-zinc-800/50 mb-1"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Session Protocol</p><p className="text-xs font-bold text-zinc-300 truncate">@{currentUser.username.toLowerCase()}</p></div><button onClick={() => { onTabChange('profile'); setIsAccountMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}><UserCircle className="w-4 h-4" /><span className="text-xs font-bold">{t('profile')}</span></button>{currentUser.role === 'Admin' && (<button onClick={() => { onTabChange('settings'); setIsAccountMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}><Settings className="w-4 h-4" /><span className="text-xs font-bold">{t('settings')}</span></button>)}<button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"><LogOut className="w-4 h-4" /><span className="text-xs font-bold">{t('logout')}</span></button></div></>)}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[#09090b] custom-scrollbar">
          <div key={activeTab} className="p-8 w-full max-w-full page-transition">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
