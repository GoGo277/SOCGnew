// Lists translation keys used via t('…') that have no zh entry (exit 1 if any are missing).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['components', 'App.tsx', 'lib', 'services', 'i18n'];
const files = [];
const walk = p => statSync(p).isDirectory() ? readdirSync(p).forEach(f => walk(join(p, f))) : /\.(tsx?|mjs)$/.test(p) && files.push(p);
roots.forEach(walk);

const keys = new Set();
const re = /\bt\(\s*'((?:[^'\\]|\\.)+)'/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) keys.add(m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
}
// Dynamic keys rendered through t(variable): shift/severity/status/state labels, weekdays, etc.
const dynamic = [
  'Morning Shift', 'Evening Shift', 'Night Shift', 'Critical', 'High', 'Medium', 'Low',
  'Open', 'Contained', 'Resolved', 'False Positive', 'met', 'breached', 'on_track', 'at_risk', 'n/a',
  'Contain', 'Resolve', 'draft', 'finalized', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  'Today', '7 days', '30 days', 'Custom', 'All', 'Header', 'Body', 'Footer',
  'Morning vulnerability scans', 'Daily log triage', 'Initial threat hunting', 'Peak traffic monitoring',
  'Active intrusion detection alerts', 'Incident escalation', 'Quiet-hour anomaly detection',
  'Automated SIEM alert review', 'Shift handover summaries',
  'At least 10 characters', 'A lowercase letter', 'An uppercase letter', 'A digit', 'A symbol', 'Must not contain the username',
  'PDF document', 'HTML report', 'Markdown', 'JSON data', 'Vector jsPDF, copyable text', 'Standalone, embedded CSS',
  'Developer-friendly .md', 'SIEM integration / backup', 'Page numbering (PDF)', 'Investigation & remediation details',
  'Threat metrics summary', 'Integrity hash / seal', 'Awaiting colleague', 'Awaiting approval', 'Approved', 'Rejected',
  'Declined by colleague', 'Cancelled', 'Executive brief', 'Shift digest',
  'Active breach, RCE or severe privilege escalation — immediate remediation.',
  'Exploitation attempt, malware telemetry or unauthorized access vector.',
  'Suspicious lateral movement, policy violation or anomalous port scan.',
  'Informational alert, benign probe or low-risk firewall drop.',
  'Invalid security credentials provided', 'Account disabled. Contact an administrator.', 'Invalid authentication code',
  'Sign-in session expired. Start again.', 'Too many failed attempts. Try again later or contact an administrator.',
  // case management (IRIS-style) labels rendered from data
  "Overview", "SOC operations", "Collaboration", "Administration", "Open", "In progress", "Containment", "Eradication", "Recovery", "Post-incident", "Reporting", "Closed", "Unknown", "False Positive", "True positive with impact", "True positive without impact", "Not applicable", "Legitimate", "New", "Assigned", "Pending", "Merged", "Escalated", "To be determined", "Compromised", "Not compromised", "Unspecified", "To be done", "Started", "Done", "To do", "On hold", "Canceled", "Remediation", "Initial Access", "Execution", "Persistence", "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection", "Command and Control", "Exfiltration", "Impact", "Disk image", "Memory dump", "Log export", "Network capture (PCAP)", "Malware sample", "Email (EML)", "Document", "Screenshot", "Other", "Firestore Cloud Sync", "Local Sync (offline mode)", "Case opened", "Case updated", "Case closed", "Case reopened", "Updated from IRIS", "Pushed to IRIS", "Imported from IRIS", "Added IOC", "Updated IOC", "Removed IOC", "Added asset", "Updated asset", "Removed asset", "Added timeline event", "Updated timeline event", "Removed timeline event", "Added evidence", "Updated evidence", "Removed evidence", "Added note", "Updated note", "Removed note", "Added task", "Updated task", "Removed task",
];
dynamic.forEach(k => keys.add(k));

const zhSrc = readFileSync('i18n/zh.ts', 'utf8');
const legacy = readFileSync('translations.ts', 'utf8');
const missing = [...keys].filter(k => !zhSrc.includes(JSON.stringify(k) + ':') && !new RegExp(`^\\s*"?${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?:`, 'm').test(legacy)).sort();
if (process.argv.includes('--json')) console.log(JSON.stringify(missing, null, 1));
else console.log(`${keys.size} keys, ${missing.length} missing zh translations`);
process.exit(missing.length && process.argv.includes('--check') ? 1 : 0);
