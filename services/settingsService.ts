import { AppSettings, User } from '../types';

const STORAGE_KEY = 'app_settings';
const USERS_STORAGE_KEY = 'app_users';
const SESSION_STORAGE_KEY = 'app_session';

const defaultSettings: AppSettings = {
  appName: 'SOC Asset Guardian',
  language: 'en',
  navOrder: ['dashboard', 'assets', 'incidents', 'guidelines', 'messaging', 'announcements', 'tasks'],
  rolePermissions: {
    Admin: {
      canCreateAsset: true, canEditAsset: true, canDeleteAsset: true,
      canCreateIncident: true, canEditIncident: true, canDeleteIncident: true,
      canCreateGuideline: true, canEditGuideline: true, canDeleteGuideline: true,
      canManageUsers: true, canApproveRequests: true, canManageTasks: true,
      canImportExport: true, canDeleteNotes: true,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    },
    L1: {
      canCreateAsset: false, canEditAsset: false, canDeleteAsset: false,
      canCreateIncident: false, canEditIncident: false, canDeleteIncident: false,
      canCreateGuideline: false, canEditGuideline: false, canDeleteGuideline: false,
      canManageUsers: false, canApproveRequests: false, canManageTasks: false,
      canImportExport: false, canDeleteNotes: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    },
    L2: {
      canCreateAsset: true, canEditAsset: true, canDeleteAsset: false,
      canCreateIncident: true, canEditIncident: true, canDeleteIncident: false,
      canCreateGuideline: false, canEditGuideline: false, canDeleteGuideline: false,
      canManageUsers: false, canApproveRequests: false, canManageTasks: true,
      canImportExport: true, canDeleteNotes: false,
      visiblePages: { dashboard: true, assets: true, incidents: true, guidelines: true, messaging: true, announcements: true, tasks: true }
    }
  }
};

const defaultUsers: User[] = [
  {
    id: 'admin-1',
    username: 'admin',
    email: 'admin@example.com',
    password: 'password', // In a real app, this would be hashed
    role: 'Admin',
    createdAt: new Date().toISOString()
  }
];

const getStoredSettings = (): AppSettings => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : defaultSettings;
};

const setStoredSettings = (data: AppSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const getStoredUsers = (): User[] => {
  const data = localStorage.getItem(USERS_STORAGE_KEY);
  return data ? JSON.parse(data) : defaultUsers;
};

const setStoredUsers = (data: User[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(data));
};

export const settingsService = {
  getSettings: async (): Promise<AppSettings> => {
    return getStoredSettings();
  },
  saveSettings: async (settings: AppSettings): Promise<AppSettings | null> => {
    setStoredSettings(settings);
    return settings;
  },
  getUsers: async (): Promise<User[]> => {
    return getStoredUsers();
  },
  saveUser: async (user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> => {
    const users = getStoredUsers();
    if (user.id) {
      const index = users.findIndex(u => u.id === user.id);
      if (index !== -1) {
        users[index] = { ...users[index], ...user };
        setStoredUsers(users);
        return users[index];
      }
    }
    const newUser: User = {
      ...user,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    setStoredUsers(users);
    return newUser;
  },
  deleteUser: async (id: string): Promise<void> => {
    const users = getStoredUsers();
    setStoredUsers(users.filter(u => u.id !== id));
  },
  authenticate: async (email: string, password?: string): Promise<{ user: User | null, error: string | null }> => {
    const users = getStoredUsers();
    const user = users.find(u => u.email === email && (!password || u.password === password));
    if (user) {
      const sessionUser = { ...user };
      delete sessionUser.password;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
      return { user: sessionUser, error: null };
    }
    return { user: null, error: 'Invalid credentials' };
  },
  getActiveSession: async (): Promise<User | null> => {
    const data = localStorage.getItem(SESSION_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },
  logout: async (): Promise<void> => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },
  exportFullSystem: async (): Promise<string> => {
    const data = {
      settings: getStoredSettings(),
      users: getStoredUsers(),
      assets: JSON.parse(localStorage.getItem('assets') || '[]'),
      incidents: JSON.parse(localStorage.getItem('incidents') || '[]'),
      guidelines: JSON.parse(localStorage.getItem('guidelines') || '[]'),
      announcements: JSON.parse(localStorage.getItem('announcements') || '[]'),
      tasks: JSON.parse(localStorage.getItem('tasks') || '[]'),
      chat_rooms: JSON.parse(localStorage.getItem('chat_rooms') || '[]'),
      messages: JSON.parse(localStorage.getItem('messages') || '[]'),
      audit_logs: JSON.parse(localStorage.getItem('audit_logs') || '[]'),
      approval_requests: JSON.parse(localStorage.getItem('approval_requests') || '[]')
    };
    return JSON.stringify(data, null, 2);
  },
  importFullSystem: async (jsonData: string): Promise<void> => {
    try {
      const data = JSON.parse(jsonData);
      if (data.settings) setStoredSettings(data.settings);
      if (data.users) setStoredUsers(data.users);
      if (data.assets) localStorage.setItem('assets', JSON.stringify(data.assets));
      if (data.incidents) localStorage.setItem('incidents', JSON.stringify(data.incidents));
      if (data.guidelines) localStorage.setItem('guidelines', JSON.stringify(data.guidelines));
      if (data.announcements) localStorage.setItem('announcements', JSON.stringify(data.announcements));
      if (data.tasks) localStorage.setItem('tasks', JSON.stringify(data.tasks));
      if (data.chat_rooms) localStorage.setItem('chat_rooms', JSON.stringify(data.chat_rooms));
      if (data.messages) localStorage.setItem('messages', JSON.stringify(data.messages));
      if (data.audit_logs) localStorage.setItem('audit_logs', JSON.stringify(data.audit_logs));
      if (data.approval_requests) localStorage.setItem('approval_requests', JSON.stringify(data.approval_requests));
    } catch (e) {
      throw new Error('Invalid backup file format');
    }
  }
};
