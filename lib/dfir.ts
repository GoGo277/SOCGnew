import { AlertStatus, AnalysisStatus, CaseOutcome, CaseState, CaseTaskStatus, CompromiseStatus, IocType, Tlp } from '../types';

/** Vocabularies aligned with DFIR-IRIS defaults (names map to IRIS lookup ids at sync time). */

export const CASE_STATES: CaseState[] = ['Open', 'In progress', 'Containment', 'Eradication', 'Recovery', 'Post-incident', 'Reporting', 'Closed'];
export const CASE_OUTCOMES: CaseOutcome[] = ['Unknown', 'False positive', 'True positive with impact', 'True positive without impact', 'Not applicable', 'Legitimate'];

/** IRIS default case classifications (ENISA reference taxonomy). */
export const CLASSIFICATIONS = [
  'abusive-content:spam', 'abusive-content:harmful-speech', 'malicious-code:infected-system', 'malicious-code:c2-server',
  'malicious-code:malware-distribution', 'malicious-code:ransomware', 'information-gathering:scanner', 'information-gathering:sniffing',
  'information-gathering:social-engineering', 'intrusion-attempts:ids-alert', 'intrusion-attempts:brute-force', 'intrusion-attempts:exploit',
  'intrusions:privileged-account-compromise', 'intrusions:unprivileged-account-compromise', 'intrusions:application-compromise',
  'intrusions:system-compromise', 'intrusions:burglary', 'availability:dos', 'availability:ddos', 'availability:outage', 'availability:sabotage',
  'information-content-security:unauthorised-information-access', 'information-content-security:unauthorised-information-modification',
  'information-content-security:data-loss', 'information-content-security:data-leak', 'fraud:unauthorised-use-of-resources',
  'fraud:copyright', 'fraud:masquerade', 'fraud:phishing', 'vulnerable:vulnerable-system', 'other:other', 'test:test',
];

export const IOC_TYPES: IocType[] = ['ip-src', 'ip-dst', 'domain', 'hostname', 'url', 'md5', 'sha1', 'sha256', 'filename', 'email-src', 'account', 'user-agent', 'other'];
export const TLPS: Tlp[] = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:RED'];
export const TLP_STYLE: Record<Tlp, string> = {
  'TLP:CLEAR': 'border-zinc-600 text-zinc-300',
  'TLP:GREEN': 'border-emerald-500/40 text-emerald-500',
  'TLP:AMBER': 'border-amber-500/40 text-amber-500',
  'TLP:RED': 'border-red-500/40 text-red-500',
};

export const ASSET_TYPES = [
  'Account', 'Firewall', 'Linux - Server', 'Linux - Computer', 'Linux - VM', 'Mac - Computer', 'Phone - Android', 'Phone - IOS',
  'Router', 'Switch', 'VPN', 'WAF', 'Windows - Computer', 'Windows - DC', 'Windows - Server', 'Windows - VM', 'Cloud resource', 'Other',
];
export const COMPROMISE_STATUSES: CompromiseStatus[] = ['To be determined', 'Compromised', 'Not compromised', 'Unknown'];
export const ANALYSIS_STATUSES: AnalysisStatus[] = ['Unspecified', 'To be done', 'Started', 'Pending', 'Done'];

/** IRIS timeline event categories (MITRE ATT&CK tactics + DFIR outcomes). */
export const EVENT_CATEGORIES = [
  'Unspecified', 'Legitimate', 'Remediation', 'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion',
  'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact',
];

export const EVIDENCE_TYPES = ['Disk image', 'Memory dump', 'Log export', 'Network capture (PCAP)', 'Malware sample', 'Email (EML)', 'Document', 'Screenshot', 'Other'];

export const TASK_STATUSES: CaseTaskStatus[] = ['To do', 'In progress', 'On hold', 'Done', 'Canceled'];
export const TASK_STATUS_STYLE: Record<CaseTaskStatus, string> = {
  'To do': 'bg-zinc-800 text-zinc-300 border-zinc-700',
  'In progress': 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  'On hold': 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  Done: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  Canceled: 'bg-zinc-800 text-zinc-500 border-zinc-700 line-through',
};

export const ALERT_STATUSES: AlertStatus[] = ['New', 'Assigned', 'In progress', 'Pending', 'Closed', 'Merged', 'Escalated'];
export const ALERT_STATUS_STYLE: Record<AlertStatus, string> = {
  New: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  Assigned: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
  'In progress': 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  Pending: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  Closed: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  Merged: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  Escalated: 'bg-red-500/10 text-red-500 border-red-500/30',
};
export const isAlertOpen = (s: AlertStatus) => s === 'New' || s === 'Assigned' || s === 'In progress' || s === 'Pending';

export const CASE_STATE_STYLE: Record<CaseState, string> = {
  Open: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  'In progress': 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  Containment: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  Eradication: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  Recovery: 'bg-teal-500/10 text-teal-500 border-teal-500/30',
  'Post-incident': 'bg-violet-500/10 text-violet-500 border-violet-500/30',
  Reporting: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
  Closed: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

export const INTERNAL_CUSTOMER_ID = 'internal';

/** Guess an IOC type from a raw value (used when importing from shift events / alerts). */
export const guessIocType = (value: string): IocType => {
  const v = value.trim();
  if (/^[a-f0-9]{64}$/i.test(v)) return 'sha256';
  if (/^[a-f0-9]{40}$/i.test(v)) return 'sha1';
  if (/^[a-f0-9]{32}$/i.test(v)) return 'md5';
  if (/^https?:\/\//i.test(v)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email-src';
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(v) || v.includes(':')) return 'ip-src';
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return 'domain';
  return 'other';
};
