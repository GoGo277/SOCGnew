import { AuditLog, User } from '../types';

const STORAGE_KEY = 'audit_logs';

const getStoredLogs = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredLogs = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const auditService = {
  getLogs: async (): Promise<AuditLog[]> => {
    const logs = getStoredLogs();
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  logAction: async (userId: string, userName: string, action: string, details: string): Promise<void> => {
    const logs = getStoredLogs();
    const now = new Date().toISOString();
    logs.push({ id: crypto.randomUUID(), userId, userName, action, details, timestamp: now });
    setStoredLogs(logs);
  },
  log: async (user: User, action: string, target?: any, extra?: any): Promise<void> => {
    const logs = getStoredLogs();
    const now = new Date().toISOString();
    let details = '';
    if (target) details += `Target: ${target.name || target.id || JSON.stringify(target)}. `;
    if (extra) details += `Details: ${JSON.stringify(extra)}`;
    logs.push({ id: crypto.randomUUID(), userId: user.id, userName: user.username, action, details: details.trim(), timestamp: now });
    setStoredLogs(logs);
  }
};
