import { ApprovalRequest, Notification, User } from '../types';

const STORAGE_KEY = 'approval_requests';
const NOTIFICATIONS_STORAGE_KEY = 'notifications';

const getStoredRequests = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredRequests = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const getStoredNotifications = (): Notification[] => {
  const data = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredNotifications = (data: Notification[]) => {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(data));
};

export const requestService = {
  getRequests: async (): Promise<ApprovalRequest[]> => {
    const requests = getStoredRequests();
    return requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  getPendingRequestsCount: async (): Promise<number> => {
    const requests = getStoredRequests();
    return requests.filter(r => r.status === 'PENDING').length;
  },
  createRequest: async (request: Omit<ApprovalRequest, 'id' | 'createdAt' | 'status'>): Promise<ApprovalRequest | null> => {
    const requests = getStoredRequests();
    const now = new Date().toISOString();
    const newRequest = { ...request, id: crypto.randomUUID(), status: 'PENDING', createdAt: now };
    requests.push(newRequest);
    setStoredRequests(requests);
    return newRequest as ApprovalRequest;
  },
  updateRequestStatus: async (id: string, status: 'APPROVED' | 'REJECTED', resolvedBy: string): Promise<void> => {
    const requests = getStoredRequests();
    const index = requests.findIndex(r => r.id === id);
    if (index !== -1) {
      requests[index] = { ...requests[index], status, resolvedBy, resolvedAt: new Date().toISOString() };
      setStoredRequests(requests);
    }
  },
  resolveRequest: async (id: string, currentUser: User, status: 'APPROVED' | 'REJECTED'): Promise<void> => {
    const requests = getStoredRequests();
    const index = requests.findIndex(r => r.id === id);
    if (index !== -1) {
      requests[index] = { ...requests[index], status, resolvedBy: currentUser.id, resolvedAt: new Date().toISOString() };
      setStoredRequests(requests);
      
      // Notify requester
      const notifications = getStoredNotifications();
      notifications.push({
        id: crypto.randomUUID(),
        userId: requests[index].requesterId,
        title: `Request ${status}`,
        message: `Your request for ${requests[index].action} has been ${status.toLowerCase()}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR',
        read: false,
        requestId: id,
        createdAt: new Date().toISOString()
      });
      setStoredNotifications(notifications);
    }
  },
  deleteRequest: async (id: string): Promise<void> => {
    const requests = getStoredRequests();
    setStoredRequests(requests.filter(r => r.id !== id));
  },
  getNotifications: async (userId: string): Promise<Notification[]> => {
    const notifications = getStoredNotifications();
    return notifications.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  markAsRead: async (id: string): Promise<void> => {
    const notifications = getStoredNotifications();
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications[index].read = true;
      setStoredNotifications(notifications);
    }
  },
  markAllAsRead: async (userId: string): Promise<void> => {
    const notifications = getStoredNotifications();
    const updated = notifications.map(n => n.userId === userId ? { ...n, read: true } : n);
    setStoredNotifications(updated);
  }
};
