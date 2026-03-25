
export type AssetType = 'Server' | 'Virtual' | 'Endpoint' | 'Network' | 'IoT' | 'Cloud' | 'Workstation' | 'Storage' | 'Security';
export type Language = 'en' | 'zh';

export interface Note {
  id: string;
  analyst: string;
  content: string;
  timestamp: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  identity: string;
  ipv4: string;
  ipv6: string;
  rackNumber: string;
  location: string;
  description: string;
  notes: Note[];
  criticality: Severity;
  createdAt: string;
  updatedAt: string;
}

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type IncidentStatus = 'New' | 'Active' | 'Mitigated' | 'Resolved';
export type TaskStatus = 'Todo' | 'In Progress' | 'Review' | 'Done';

export interface Incident {
  id: string;
  eventName: string;
  sourceIp: string;
  destinationIp: string;
  sourceAssetName: string;
  destinationAssetName: string;
  description: string;
  response: string;
  tags: string[];
  notes: Note[];
  severity: Severity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // User ID
  creatorId: string;
  dueDate: string;
  severity: Severity;
  status: TaskStatus;
  createdAt: string;
}

export type UserRole = 'Admin' | 'L1' | 'L2';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  role: UserRole;
  createdAt: string;
  profilePic?: string;
  bio?: string;
  lastSeen?: string;
}

export interface Guideline {
  id: string;
  title: string;
  content: string;
  visibleTo: UserRole[];
  author: string;
  updatedAt: string;
}

export type RequestAction = 
  | 'ADD_ASSET' | 'EDIT_ASSET' | 'REMOVE_ASSET'
  | 'ADD_INCIDENT' | 'EDIT_INCIDENT' | 'REMOVE_INCIDENT'
  | 'ADD_ANNOUNCEMENT' | 'EDIT_ANNOUNCEMENT' | 'REMOVE_ANNOUNCEMENT'
  | 'ADD_GUIDELINE' | 'EDIT_GUIDELINE' | 'REMOVE_GUIDELINE';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  action: RequestAction;
  data: any;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'REQUEST';
  read: boolean;
  requestId?: string;
  createdAt: string;
}

export interface RolePermissions {
  canCreateAsset: boolean;
  canEditAsset: boolean;
  canDeleteAsset: boolean;
  canCreateIncident: boolean;
  canEditIncident: boolean;
  canDeleteIncident: boolean;
  canCreateGuideline: boolean;
  canEditGuideline: boolean;
  canDeleteGuideline: boolean;
  canManageUsers: boolean;
  canApproveRequests: boolean;
  canManageTasks: boolean;
  canImportExport: boolean;
  canDeleteNotes: boolean;
  visiblePages: {
    dashboard: boolean;
    assets: boolean;
    incidents: boolean;
    guidelines: boolean;
    messaging: boolean;
    announcements: boolean;
    tasks: boolean;
  };
}

export interface AppSettings {
  appName: string;
  logoUrl?: string;
  rolePermissions: Record<UserRole, RolePermissions>;
  language: Language;
  navOrder: string[];
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'file';
  timestamp: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'general' | 'group' | 'direct';
  participants: string[]; // User IDs
  lastMessage?: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  severity: Severity;
  createdAt: string;
}
