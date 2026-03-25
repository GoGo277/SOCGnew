
import { AppSettings, User, UserRole, RolePermissions, Language } from '../types';

const SETTINGS_KEY = 'soc_app_settings';
const USERS_KEY = 'soc_app_users';
const SESSION_KEY = 'soc_active_session';

const DEFAULT_NAV_ORDER = ['dashboard', 'assets', 'incidents', 'tasks', 'announcements', 'messaging', 'guidelines', 'requests'];

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Guardian SOC',
  logoUrl: '',
  language: 'en',
  navOrder: [...DEFAULT_NAV_ORDER],
  rolePermissions: {
    Admin: {
      canCreateAsset: true,
      canEditAsset: true,
      canDeleteAsset: true,
      canCreateIncident: true,
      canEditIncident: true,
      canDeleteIncident: true,
      canCreateGuideline: true,
      canEditGuideline: true,
      canDeleteGuideline: true,
      canManageUsers: true,
      canApproveRequests: true,
      canManageTasks: true,
      canImportExport: true,
      canDeleteNotes: true,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    },
    L2: {
      canCreateAsset: true,
      canEditAsset: false,
      canDeleteAsset: false,
      canCreateIncident: true,
      canEditIncident: true,
      canDeleteIncident: false,
      canCreateGuideline: true,
      canEditGuideline: true,
      canDeleteGuideline: false,
      canManageUsers: false,
      canApproveRequests: false,
      canManageTasks: true,
      canImportExport: false,
      canDeleteNotes: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    },
    L1: {
      canCreateAsset: false,
      canEditAsset: false,
      canDeleteAsset: false,
      canCreateIncident: true,
      canEditIncident: false,
      canDeleteIncident: false,
      canCreateGuideline: false,
      canEditGuideline: false,
      canDeleteGuideline: false,
      canManageUsers: false,
      canApproveRequests: false,
      canManageTasks: false,
      canImportExport: false,
      canDeleteNotes: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    }
  }
};

const DEFAULT_USERS: User[] = [
  {
    id: 'u1',
    username: 'Admin',
    email: 'admin@guardian.sec',
    password: 'admin',
    role: 'Admin',
    createdAt: new Date().toISOString(),
    bio: 'Security Operations Center Lead. Managing global asset perimeter.',
    profilePic: ''
  }
];

export const settingsService = {
  getSettings: (): AppSettings => {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const parsed = data ? JSON.parse(data) : { ...DEFAULT_SETTINGS };
      if (!parsed.language) parsed.language = 'en';
      if (!parsed.navOrder) parsed.navOrder = [...DEFAULT_NAV_ORDER];
      return parsed;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings: (settings: AppSettings): void => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('storage'));
  },

  getUsers: (): User[] => {
    try {
      const data = localStorage.getItem(USERS_KEY);
      if (!data) {
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
      }
      return JSON.parse(data);
    } catch (e) {
      return DEFAULT_USERS;
    }
  },

  saveUser: (user: Partial<User> & { id?: string }): User => {
    const users = settingsService.getUsers();
    const activeSession = settingsService.getActiveSession();
    let savedUser: User;
    
    if (user.id) {
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        const existingUser = users[idx];
        savedUser = { ...existingUser, ...user } as User;
        users[idx] = savedUser;
      } else {
        return settingsService.saveUser({ ...user, id: undefined });
      }
    } else {
      savedUser = {
        id: `user-${crypto.randomUUID()}`,
        username: user.username || 'Analyst',
        email: user.email || '',
        role: user.role || 'L1',
        password: user.password || 'password123',
        createdAt: new Date().toISOString(),
        bio: user.bio || '',
        profilePic: user.profilePic || ''
      };
      users.push(savedUser);
    }

    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    if (activeSession && savedUser.id === activeSession.id) {
      const { password, ...sessionData } = savedUser;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    }
    window.dispatchEvent(new Event('storage'));
    return savedUser;
  },

  deleteUser: (id: string): void => {
    const users = settingsService.getUsers().filter(u => u.id !== id);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const activeSession = settingsService.getActiveSession();
    if (activeSession && id === activeSession.id) {
      settingsService.logout();
    }
    window.dispatchEvent(new Event('storage'));
  },

  authenticate: (username: string, pass: string): User | null => {
    const users = settingsService.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === pass);
    if (user) {
      const { password, ...sessionUser } = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
      return sessionUser as User;
    }
    return null;
  },

  getActiveSession: (): User | null => {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  logout: (): void => {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event('storage'));
  },

  exportFullSystem: (): string => {
    const keys = [
      'soc_assets_data', 'soc_incidents_data', 'soc_app_settings', 
      'soc_app_users', 'soc_guidelines_data', 'soc_announcements', 
      'soc_tasks_data', 'soc_approval_requests', 'soc_audit_logs'
    ];
    const archive: Record<string, any> = {
      archive_timestamp: new Date().toISOString(),
      archive_version: '3.0'
    };
    keys.forEach(key => {
      const val = localStorage.getItem(key);
      if (val) archive[key] = JSON.parse(val);
    });
    return JSON.stringify(archive, null, 2);
  },

  importFullSystem: (archive: any): void => {
    Object.entries(archive).forEach(([key, val]) => {
      if (key.startsWith('soc_')) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    });
    window.dispatchEvent(new Event('storage'));
  }
};
