
import { ApprovalRequest, Notification, RequestAction, RequestStatus, User } from '../types';
import { assetService } from './assetService';
import { incidentService } from './incidentService';
import { guidelineService } from './guidelineService';
import { announcementService } from './announcementService';

const REQUESTS_KEY = 'soc_approval_requests';
const NOTIFICATIONS_KEY = 'soc_user_notifications';

export const requestService = {
  getRequests: (): ApprovalRequest[] => {
    const data = localStorage.getItem(REQUESTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  getNotifications: (userId: string): Notification[] => {
    const data = localStorage.getItem(NOTIFICATIONS_KEY);
    const all: Notification[] = data ? JSON.parse(data) : [];
    return all.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createRequest: (requester: User, action: RequestAction, data: any, reason: string): ApprovalRequest => {
    const requests = requestService.getRequests();
    const newRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      requesterId: requester.id,
      requesterName: requester.username,
      action,
      data,
      reason,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    requests.push(newRequest);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));

    // Notify Admins and L2s
    const USERS_KEY = 'soc_app_users';
    const usersData = localStorage.getItem(USERS_KEY);
    const users: User[] = usersData ? JSON.parse(usersData) : [];
    
    users.filter(u => u.role === 'Admin' || u.role === 'L2').forEach(u => {
      requestService.addNotification({
        userId: u.id,
        title: 'New Approval Request',
        message: `${requester.username} requested ${action.toLowerCase().replace('_', ' ')}`,
        type: 'REQUEST',
        requestId: newRequest.id
      });
    });

    return newRequest;
  },

  resolveRequest: (requestId: string, resolver: User, status: RequestStatus): void => {
    const requests = requestService.getRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) return;

    const request = requests[idx];
    request.status = status;
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = resolver.username;

    if (status === 'APPROVED') {
      const { action, data } = request;
      
      // Execute based on resource type
      if (action.endsWith('_ASSET')) {
        if (action.startsWith('ADD') || action.startsWith('EDIT')) assetService.saveAsset(data);
        else if (action.startsWith('REMOVE')) assetService.deleteAsset(data.id);
      } else if (action.endsWith('_INCIDENT')) {
        if (action.startsWith('ADD') || action.startsWith('EDIT')) incidentService.saveIncident(data);
        else if (action.startsWith('REMOVE')) incidentService.deleteIncident(data.id);
      } else if (action.endsWith('_ANNOUNCEMENT')) {
        if (action.startsWith('ADD') || action.startsWith('EDIT')) announcementService.saveAnnouncement(data);
        else if (action.startsWith('REMOVE')) announcementService.deleteAnnouncement(data.id);
      } else if (action.endsWith('_GUIDELINE')) {
        if (action.startsWith('ADD') || action.startsWith('EDIT')) guidelineService.saveGuideline(data);
        else if (action.startsWith('REMOVE')) guidelineService.deleteGuideline(data.id);
      }
    }

    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));

    // Notify requester
    requestService.addNotification({
      userId: request.requesterId,
      title: `Request ${status.toLowerCase()}`,
      message: `Your request to ${request.action.toLowerCase().replace('_', ' ')} was ${status.toLowerCase()} by ${resolver.username}.`,
      type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR'
    });
  },

  addNotification: (params: Omit<Notification, 'id' | 'createdAt' | 'read'>): void => {
    const data = localStorage.getItem(NOTIFICATIONS_KEY);
    const all: Notification[] = data ? JSON.parse(data) : [];
    const newNotif: Notification = {
      ...params,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      read: false
    };
    all.push(newNotif);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
  },

  markAsRead: (notificationId: string): void => {
    const data = localStorage.getItem(NOTIFICATIONS_KEY);
    const all: Notification[] = data ? JSON.parse(data) : [];
    const idx = all.findIndex(n => n.id === notificationId);
    if (idx !== -1) {
      all[idx].read = true;
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
    }
  },

  markAllAsRead: (userId: string): void => {
    const data = localStorage.getItem(NOTIFICATIONS_KEY);
    const all: Notification[] = data ? JSON.parse(data) : [];
    all.forEach(n => {
      if (n.userId === userId) n.read = true;
    });
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
  }
};
