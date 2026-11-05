/** Firestore / local-store collection names for case management (shared with Cloud Functions). */
export const COL = {
  cases: 'cases',
  alerts: 'alerts',
  customers: 'customers',
  caseTemplates: 'case_templates',
  caseActivity: 'case_activity',
  iocs: 'case_iocs',
  assets: 'case_assets',
  timeline: 'case_timeline',
  evidence: 'case_evidence',
  notes: 'case_notes',
  tasks: 'case_tasks',
  irisTombstones: 'iris_tombstones',
} as const;
