import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard, Shield, Database, LogOut, Activity, Settings, ClipboardList, BookOpen, ChevronsLeft, ChevronsRight,
  Bell, User as UserIcon, MessageSquare, Megaphone, UserCircle, CheckSquare, ShieldCheck, RefreshCw, CalendarDays,
  FileText, BarChart3, ScrollText, KeyRound, CalendarClock, Menu, X, Siren, Briefcase, Building2, LayoutTemplate,
  Sun, Moon, Monitor, Plug,
} from 'lucide-react';
import { backendLabel } from '../lib/firebase';
import { User, AppSettings } from '../types';
import { useT } from '../i18n';
import { ThemePref, getThemePref, setThemePref } from '../lib/theme';

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
  onChangePassword?: () => void;
  onSetupMfa?: () => void;
  headerExtra?: React.ReactNode;
}

type Group = 'overview' | 'investigation' | 'operations' | 'collaboration' | 'administration';
const GROUP_LABEL: Record<Group, string> = {
  overview: 'Overview', investigation: 'Investigation', operations: 'SOC operations', collaboration: 'Collaboration', administration: 'Administration',
};

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, onTabChange, currentUser, settings, onLogout, totalAlerts, onToggleNotifCenter, isNotifCenterOpen,
  navCounts = {}, onChangePassword, onSetupMfa, headerExtra,
}) => {
  const t = useT();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const go = (id: string) => { onTabChange(id); setIsMobileNavOpen(false); };
  const permissions = settings.rolePermissions[currentUser.role];
  const isAdmin = currentUser.role === 'Admin';
  const compact = isCollapsed && !isMobileNavOpen;

  const handleRefresh = () => {
    setIsSyncing(true);
    setTimeout(() => { window.dispatchEvent(new Event('storage')); setIsSyncing(false); }, 600);
  };

  const cycleTheme = () => {
    const next: ThemePref = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(next);
    setThemePref(next);
  };
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const themeLabel = theme === 'light' ? t('Light theme') : theme === 'dark' ? t('Dark theme') : t('System theme');

  const items = useMemo(() => ([
    { id: 'dashboard', group: 'overview', label: t('dashboard'), icon: LayoutDashboard, visible: permissions.visiblePages.dashboard },
    { id: 'alerts', group: 'investigation', label: t('Alerts'), icon: Siren, visible: permissions.visiblePages.alerts !== false },
    { id: 'cases', group: 'investigation', label: t('Cases'), icon: Briefcase, visible: permissions.visiblePages.cases !== false },
    { id: 'incidents', group: 'investigation', label: t('incidents'), icon: Activity, visible: permissions.visiblePages.incidents },
    { id: 'assets', group: 'investigation', label: t('assets'), icon: Database, visible: permissions.visiblePages.assets },
    { id: 'duty', group: 'operations', label: t('duty'), icon: CalendarDays, visible: permissions.visiblePages.duty !== false },
    { id: 'shift-reports', group: 'operations', label: t('shift-reports'), icon: FileText, visible: permissions.visiblePages.shiftReports !== false },
    { id: 'executive', group: 'operations', label: t('executive'), icon: BarChart3, visible: permissions.visiblePages.executive !== false },
    { id: 'reporting', group: 'operations', label: t('Report Center'), icon: CalendarClock, visible: permissions.canExportReports !== false },
    { id: 'tasks', group: 'operations', label: t('tasks'), icon: CheckSquare, visible: permissions.visiblePages.tasks },
    { id: 'announcements', group: 'collaboration', label: t('announcements'), icon: Megaphone, visible: permissions.visiblePages.announcements },
    { id: 'messaging', group: 'collaboration', label: t('messaging'), icon: MessageSquare, visible: permissions.visiblePages.messaging },
    { id: 'guidelines', group: 'collaboration', label: t('guidelines'), icon: BookOpen, visible: true },
    { id: 'requests', group: 'collaboration', label: t('requests'), icon: ClipboardList, visible: !isAdmin },
    { id: 'admin-requests', group: 'administration', label: t('admin_requests'), icon: ShieldCheck, visible: isAdmin },
    { id: 'customers', group: 'administration', label: t('Customers'), icon: Building2, visible: permissions.visiblePages.cases !== false },
    { id: 'case-templates', group: 'administration', label: t('Case templates'), icon: LayoutTemplate, visible: permissions.visiblePages.cases !== false },
    { id: 'integrations', group: 'administration', label: t('Integrations'), icon: Plug, visible: isAdmin },
    { id: 'audit', group: 'administration', label: t('audit'), icon: ScrollText, visible: isAdmin || !!permissions.canViewAuditLog },
  ] as { id: string; group: Group; label: string; icon: React.ElementType; visible: boolean }[]).filter(i => i.visible), [t, permissions, isAdmin]);

  const grouped = useMemo(() => {
    const order = (id: string) => { const i = settings.navOrder.indexOf(id); return i === -1 ? 99 : i; };
    return (Object.keys(GROUP_LABEL) as Group[])
      .map(g => ({ group: g, items: items.filter(i => i.group === g).sort((a, b) => order(a.id) - order(b.id)) }))
      .filter(g => g.items.length);
  }, [items, settings.navOrder]);

  const pageTitle = items.find(i => i.id === activeTab)?.label
    ?? ({ profile: t('analyst_profile'), settings: t('core_systems') } as Record<string, string>)[activeTab] ?? activeTab;

  return (
    <div className="flex h-screen bg-[var(--app-bg)] text-zinc-100 overflow-hidden">
      {isMobileNavOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsMobileNavOpen(false)} aria-hidden="true" />}
      <aside aria-label={t('Main navigation')} className={`border-r border-zinc-800 flex-col transition-[width] duration-200 bg-[var(--app-sidebar)] shrink-0
        ${isMobileNavOpen ? 'fixed inset-y-0 left-0 z-50 flex w-72 shadow-2xl' : 'hidden'} md:relative md:z-30 md:flex ${isCollapsed ? 'md:w-[72px]' : 'md:w-60'}`}>
        <div className={`h-14 flex items-center gap-3 border-b border-zinc-800 ${compact ? 'justify-center' : 'px-4'}`}>
          {settings.logoUrl
            ? <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0"><img src={settings.logoUrl} alt="" className="w-full h-full object-cover" /></div>
            : <div className="bg-blue-600 p-1.5 rounded-lg shrink-0"><Shield className="w-5 h-5 text-white" /></div>}
          {!compact && <span className="font-black text-[15px] tracking-tight truncate flex-1">{settings.appName}</span>}
          {isMobileNavOpen && <button aria-label={t('Close menu')} onClick={() => setIsMobileNavOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-100 md:hidden"><X className="w-5 h-5" /></button>}
        </div>

        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {grouped.map(({ group, items: gi }) => (
            <div key={group} className="mb-3">
              {!compact
                ? <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{t(GROUP_LABEL[group])}</p>
                : <div className="mx-3 my-2 border-t border-zinc-800" />}
              {gi.map(item => {
                const count = navCounts[item.id] || 0;
                const active = activeTab === item.id;
                return (
                  <button key={item.id} onClick={() => go(item.id)} aria-label={item.label} title={compact ? item.label : ''} aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center rounded-lg relative text-[13px] transition-colors ${compact ? 'justify-center h-10' : 'px-3 py-2 gap-3'}
                      ${active ? 'bg-blue-600/10 text-blue-500 font-bold' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'}`}>
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-600" aria-hidden="true" />}
                    <span className="relative">
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      {count > 0 && compact && <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{count > 9 ? '9+' : count}</span>}
                    </span>
                    {!compact && <><span className="flex-1 text-left truncate">{item.label}</span>{count > 0 && <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center rounded-full">{count}</span>}</>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button aria-label={isCollapsed ? t('Expand sidebar') : t('Collapse sidebar')} onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex items-center gap-2 justify-center h-10 border-t border-zinc-800 text-zinc-500 hover:text-zinc-100 text-xs">
          {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4" /> {t('Collapse sidebar')}</>}
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between gap-2 px-3 sm:px-6 bg-[var(--app-surface)] z-20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button aria-label={t('Open menu')} onClick={() => setIsMobileNavOpen(true)} className="md:hidden p-2 -ml-1 rounded-lg text-zinc-400 hover:text-zinc-100"><Menu className="w-5 h-5" /></button>
            <h2 className="text-sm sm:text-base font-bold text-zinc-100 truncate">{pageTitle}</h2>
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-800 text-[10px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {t(backendLabel)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {headerExtra}
            <button aria-label={themeLabel} title={themeLabel} onClick={cycleTheme} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"><ThemeIcon className="w-[18px] h-[18px]" /></button>
            <button aria-label={t('Synchronize')} title={t('Synchronize')} onClick={handleRefresh} className={`p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 ${isSyncing ? 'animate-spin text-blue-500' : ''}`}><RefreshCw className="w-[18px] h-[18px]" /></button>
            <button aria-label={t('Notifications')} onClick={onToggleNotifCenter} className={`p-2 rounded-lg relative ${isNotifCenterOpen ? 'bg-blue-600/10 text-blue-500' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'}`}>
              <Bell className="w-[18px] h-[18px]" />
              {totalAlerts > 0 && <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{totalAlerts}</span>}
            </button>
            <div className="relative">
              <button aria-label={t('Account menu')} onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-zinc-800/60">
                <span className="hidden sm:flex flex-col items-end leading-tight"><span className="text-xs font-bold text-zinc-200">{currentUser.username}</span><span className="text-[10px] text-zinc-500">{currentUser.role}</span></span>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isAdmin ? 'bg-red-600' : 'bg-blue-600'} text-white`}>{currentUser.profilePic ? <img src={currentUser.profilePic} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4" />}</span>
              </button>
              {isAccountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAccountMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-[var(--app-surface)] border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50">
                    <div className="px-3 py-2 border-b border-zinc-800 mb-1"><p className="text-[10px] text-zinc-500">{t('Signed in as')}</p><p className="text-xs font-bold text-zinc-200 truncate">{currentUser.username}</p></div>
                    {[
                      { show: true, icon: UserCircle, label: t('profile'), on: () => onTabChange('profile') },
                      { show: isAdmin, icon: Settings, label: t('settings'), on: () => onTabChange('settings') },
                      { show: !!onChangePassword, icon: KeyRound, label: t('Change password'), on: () => onChangePassword?.() },
                      { show: !!onSetupMfa, icon: ShieldCheck, label: t('Two-step verification'), on: () => onSetupMfa?.() },
                    ].filter(x => x.show).map(x => (
                      <button key={x.label} onClick={() => { x.on(); setIsAccountMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"><x.icon className="w-4 h-4" /><span className="text-xs font-bold">{x.label}</span></button>
                    ))}
                    <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-500 hover:bg-red-500/10"><LogOut className="w-4 h-4" /><span className="text-xs font-bold">{t('logout')}</span></button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[var(--app-bg)]">
          <div key={activeTab} className="p-4 sm:p-6 w-full max-w-full page-transition">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
