
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
  /** PBKDF2-SHA256 credential hash (never stored in the session) */
  passwordHash?: string;
  passwordSalt?: string;
  /** When true the user is intercepted by the ForceChangePassword modal on login */
  forcePasswordChange?: boolean;
  passwordChangedAt?: string;
  failedLoginAttempts?: number;
  lockedUntil?: string;
  disabled?: boolean;
  lastLoginAt?: string;
  createdBy?: string;
  /** TOTP multi-factor (local mode stores the secret; cloud mode uses Firebase MFA). */
  mfaSecret?: string;
  mfaEnrolledAt?: string;
  mfaLastStep?: number;
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
    duty?: boolean;
    shiftReports?: boolean;
    executive?: boolean;
    alerts?: boolean;
    cases?: boolean;
  };
  /** G-Eyes SR operational permissions (undefined => role default) */
  canManageSchedules?: boolean;
  canLogShiftEvents?: boolean;
  canFinalizeReports?: boolean;
  canDeleteReports?: boolean;
  canExportReports?: boolean;
  canViewAuditLog?: boolean;
}

export interface AppSettings {
  appName: string;
  logoUrl?: string;
  rolePermissions: Record<UserRole, RolePermissions>;
  language: Language;
  navOrder: string[];
  /** Response-time targets per severity (minutes from detection). */
  sla?: SlaPolicy;
  /** Admin accounts must enrol TOTP multi-factor authentication. */
  requireAdminMfa?: boolean;
}

export interface SlaTarget { containMinutes: number; resolveMinutes: number }
export type SlaPolicy = Record<Severity, SlaTarget>;

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

// ---------------------------------------------------------------------------
// G-Eyes SR — Shift operations & intelligence reporting
// ---------------------------------------------------------------------------
import type { ShiftId } from './lib/shifts';
export type { ShiftId } from './lib/shifts';

/** Firestore `duty_schedules/{YYYY-MM-DD}` */
export interface DutySchedule {
  id: string; // YYYY-MM-DD
  date: string;
  morning: string[]; // user ids
  evening: string[];
  night: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface ShiftEvent {
  id: string;
  timestamp: string; // ISO
  eventName: string;
  attackType: string;
  sourceIp: string;
  destinationIp: string;
  port: string;
  protocol: string;
  severity: Severity;
  investigation: string;
  remediation: string;
  conclusion: string;
  loggedBy: string;
  loggedById: string;
  createdAt: string;
  updatedAt: string;
  /** Lifecycle — `timestamp` is the detection time. */
  status?: EventStatus;
  /** First observed malicious activity (for time-to-detect). */
  occurredAt?: string;
  containedAt?: string;
  resolvedAt?: string;
  /** Stable id across shift carry-overs (original event id). */
  rootEventId?: string;
  carriedFromReportId?: string;
  carriedFromEventId?: string;
  escalatedIncidentId?: string;
  /** Alert created from this event (alert triage queue). */
  escalatedAlertId?: string;
  escalatedAt?: string;
  escalatedBy?: string;
}

export type EventStatus = 'Open' | 'Contained' | 'Resolved' | 'False Positive';

/** Firestore `handover_acks/{reportId}` — incoming shift sign-off of the previous report. */
export interface HandoverAck {
  id: string; // = acknowledged report id
  reportId: string;
  acknowledgedBy: string;
  acknowledgedById: string;
  acknowledgedAt: string;
  incomingDate: string;
  incomingShift: ShiftId;
  comment: string;
  reportIntegrityHash?: string;
}

export type SwapStatus = 'pending_peer' | 'pending_admin' | 'approved' | 'rejected' | 'declined' | 'cancelled';

/** Firestore `shift_swaps/{id}` */
export interface ShiftSwapRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  date: string;
  shift: ShiftId;
  /** Colleague who takes over the shift. */
  peerId: string;
  peerName: string;
  /** Optional shift the requester takes in return. */
  returnDate?: string;
  returnShift?: ShiftId;
  reason: string;
  status: SwapStatus;
  createdAt: string;
  peerRespondedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

/** Firestore `report_templates/{id}` — saved customizer presets. */
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  options: ReportExportOptions;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Firestore `report_schedules/{id}` */
export interface ReportSchedule {
  id: string;
  name: string;
  kind: 'executive_brief' | 'shift_digest';
  frequency: ScheduleFrequency;
  /** weekly: 0-6 (Sun-Sat); monthly: 1-28 */
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number; // local hour 0-23
  recipients: string[];
  templateId?: string;
  includeDrafts: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}

/** Firestore `report_archive/{id}` — generated scheduled report runs. */
export interface ArchivedReport {
  id: string;
  scheduleId: string;
  scheduleName: string;
  kind: ReportSchedule['kind'];
  periodFrom: string;
  periodTo: string;
  generatedAt: string;
  generatedBy: string; // 'scheduler' | 'cloud-scheduler' | username
  markdown: string;
  sha256: string;
  recipients: string[];
  delivery: 'queued' | 'archived_only';
}

export type ShiftReportStatus = 'draft' | 'finalized';

/** Firestore `shift_reports/{YYYY-MM-DD}_{shift}` */
export interface ShiftReport {
  id: string;
  date: string;
  shift: ShiftId;
  title: string;
  status: ShiftReportStatus;
  events: ShiftEvent[];
  summary: string;
  handoverNotes: string;
  contributors: string[]; // usernames that edited the draft
  createdBy: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  revision: number;
  finalizedAt?: string;
  finalizedBy?: string;
  /** SHA-256 over the canonical sealed content */
  integrityHash?: string;
}

export type ExportFormat = 'pdf' | 'html' | 'md' | 'json';

export interface CustomSection {
  id: string;
  position: 'header' | 'body' | 'footer';
  heading: string;
  content: string;
}

export interface ReportExportOptions {
  title: string;
  subtitle: string;
  classification: string;
  preparedBy: string;
  organization: string;
  includePageNumbers: boolean;
  includeEventDetails: boolean;
  includeAnalytics: boolean;
  includeIntegrity: boolean;
  customSections: CustomSection[];
}

// ---------------------------------------------------------------------------
// Case management (DFIR-IRIS compatible model)
// ---------------------------------------------------------------------------

/** Link between a local record and its DFIR-IRIS counterpart. */
export interface IrisLink {
  remoteId?: number;
  syncedAt?: string;
  /** Hash of the last pushed payload — avoids redundant writes. */
  pushedHash?: string;
  /** Remote modification marker seen at the last pull. */
  remoteVersion?: string;
  error?: string;
  /** Where the record was created. */
  origin?: 'geyes' | 'iris';
}

export interface Customer {
  id: string;
  name: string;
  description: string;
  contacts: string;
  createdAt: string;
  createdBy: string;
  iris?: IrisLink;
}

export type CaseState = 'Open' | 'In progress' | 'Containment' | 'Eradication' | 'Recovery' | 'Post-incident' | 'Reporting' | 'Closed';
export type CaseOutcome = 'Unknown' | 'False positive' | 'True positive with impact' | 'True positive without impact' | 'Not applicable' | 'Legitimate';

export interface DfirCase {
  id: string;
  number: number;
  name: string;
  description: string;
  customerId: string;
  state: CaseState;
  severity: Severity;
  classification: string;
  outcome: CaseOutcome;
  ownerId?: string;
  ownerName?: string;
  tags: string[];
  socId?: string;
  openedAt: string;
  openedBy: string;
  closedAt?: string;
  closedBy?: string;
  updatedAt: string;
  updatedBy: string;
  sourceAlertIds: string[];
  templateId?: string;
  iris?: IrisLink;
}

interface CaseObjectBase {
  id: string;
  caseId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  iris?: IrisLink;
}

export type IocType = 'ip-src' | 'ip-dst' | 'domain' | 'hostname' | 'url' | 'md5' | 'sha1' | 'sha256' | 'filename' | 'email-src' | 'account' | 'user-agent' | 'other';
export type Tlp = 'TLP:CLEAR' | 'TLP:GREEN' | 'TLP:AMBER' | 'TLP:RED';

export interface CaseIoc extends CaseObjectBase {
  type: IocType;
  value: string;
  description: string;
  tlp: Tlp;
  tags: string[];
}

export type CompromiseStatus = 'To be determined' | 'Compromised' | 'Not compromised' | 'Unknown';
export type AnalysisStatus = 'Unspecified' | 'To be done' | 'Started' | 'Pending' | 'Done';

export interface CaseAsset extends CaseObjectBase {
  name: string;
  type: string;
  ip: string;
  domain: string;
  description: string;
  compromiseStatus: CompromiseStatus;
  analysisStatus: AnalysisStatus;
  tags: string[];
}

export interface CaseTimelineEvent extends CaseObjectBase {
  title: string;
  date: string; // ISO
  category: string;
  content: string;
  raw: string;
  source: string;
  assetIds: string[];
  iocIds: string[];
  inSummary: boolean;
  tags: string[];
}

export interface CustodyEntry { at: string; by: string; action: string }

export interface CaseEvidence extends CaseObjectBase {
  filename: string;
  size: number;
  sha256: string;
  type: string;
  description: string;
  custody: CustodyEntry[];
}

export interface CaseNote extends CaseObjectBase {
  directory: string;
  title: string;
  content: string; // markdown
}

export type CaseTaskStatus = 'To do' | 'In progress' | 'On hold' | 'Done' | 'Canceled';

export interface CaseTask extends CaseObjectBase {
  title: string;
  description: string;
  status: CaseTaskStatus;
  assigneeIds: string[];
  dueDate?: string;
  tags: string[];
}

export interface CaseActivity {
  id: string;
  caseId: string;
  at: string;
  by: string;
  action: string;
  detail: string;
}

export type CaseObjectKind = 'iocs' | 'assets' | 'timeline' | 'evidence' | 'notes' | 'tasks';
export interface CaseObjectMap {
  iocs: CaseIoc;
  assets: CaseAsset;
  timeline: CaseTimelineEvent;
  evidence: CaseEvidence;
  notes: CaseNote;
  tasks: CaseTask;
}

export type AlertStatus = 'New' | 'Assigned' | 'In progress' | 'Pending' | 'Closed' | 'Merged' | 'Escalated';

export interface AlertIoc { type: IocType; value: string; description: string; tlp: Tlp }
export interface AlertAsset { name: string; type: string; ip: string; description: string }

export interface Alert {
  id: string;
  number: number;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  resolution?: CaseOutcome;
  source: string;
  sourceRef: string;
  sourceLink?: string;
  eventTime: string;
  customerId: string;
  classification: string;
  ownerId?: string;
  ownerName?: string;
  tags: string[];
  iocs: AlertIoc[];
  assets: AlertAsset[];
  note: string;
  caseId?: string;
  shiftRef?: { reportId: string; eventId: string; rootEventId: string };
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  iris?: IrisLink;
}

export interface CaseTemplate {
  id: string;
  name: string;
  description: string;
  classification: string;
  severity: Severity;
  tags: string[];
  tasks: { title: string; description: string }[];
  notes: { directory: string; title: string; content: string }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
