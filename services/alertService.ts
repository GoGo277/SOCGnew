import { Alert, AlertIoc, AlertStatus, Asset, CaseAsset, CaseIoc, CaseOutcome, CaseTemplate, DfirCase, ShiftEvent, ShiftReport, User } from '../types';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { caseService } from './caseService';
import { INTERNAL_CUSTOMER_ID } from '../lib/dfir';
import { getShift } from '../lib/shifts';

import { COL } from '../lib/collections';
export const ALERTS = COL.alerts;
const now = () => new Date().toISOString();
const label = (a: Alert) => `#${a.number} ${a.title}`;

/** Map a SOC attack type to the closest IRIS (ENISA) classification. */
export const classifyAttack = (attackType: string): string => {
  const a = attackType.toLowerCase();
  if (a.includes('brute')) return 'intrusion-attempts:brute-force';
  if (a.includes('phish')) return 'fraud:phishing';
  if (a.includes('ransom')) return 'malicious-code:ransomware';
  if (a.includes('malware') || a.includes('command')) return 'malicious-code:infected-system';
  if (a.includes('scan') || a.includes('recon')) return 'information-gathering:scanner';
  if (a.includes('ddos')) return 'availability:ddos';
  if (a.includes('dos')) return 'availability:dos';
  if (a.includes('exfil')) return 'information-content-security:data-loss';
  if (a.includes('privilege') || a.includes('unauthorized') || a.includes('lateral')) return 'intrusions:system-compromise';
  if (a.includes('sql') || a.includes('xss') || a.includes('remote code')) return 'intrusion-attempts:exploit';
  if (a.includes('policy')) return 'fraud:unauthorised-use-of-resources';
  return 'other:other';
};

export const alertService = {
  subscribe: (l: (a: Alert[]) => void) => realtimeStore.subscribe<Alert>(ALERTS, d => l([...d].sort((a, b) => b.number - a.number))),

  async create(actor: User, input: Omit<Alert, 'id' | 'number' | 'status' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> & { status?: AlertStatus }): Promise<Alert> {
    if (!input.title.trim()) throw new Error('Alert title is required');
    const t = now();
    const alert: Alert = {
      ...input,
      title: input.title.trim(),
      id: crypto.randomUUID(),
      number: await realtimeStore.nextSequence('alert'),
      status: input.status ?? (input.ownerId ? 'Assigned' : 'New'),
      customerId: input.customerId || INTERNAL_CUSTOMER_ID,
      createdAt: t, createdBy: actor.username, updatedAt: t, updatedBy: actor.username,
      iris: input.iris ?? { origin: 'geyes' },
    };
    await realtimeStore.set(ALERTS, alert);
    auditService.log(actor, 'ALERT_CREATED', { id: alert.id, name: label(alert) }, { severity: alert.severity, source: alert.source, iocs: alert.iocs.length });
    return alert;
  },

  async update(actor: User, alert: Alert, patch: Partial<Alert>): Promise<Alert> {
    const next: Alert = { ...alert, ...patch, updatedAt: now(), updatedBy: actor.username };
    if (patch.ownerId && alert.status === 'New' && !patch.status) next.status = 'Assigned';
    await realtimeStore.set(ALERTS, next);
    const changes = Object.keys(patch).filter(k => JSON.stringify((alert as any)[k]) !== JSON.stringify((patch as any)[k]));
    if (changes.length) auditService.log(actor, 'ALERT_UPDATED', { id: alert.id, name: label(alert) }, { changes, status: next.status });
    return next;
  },

  async close(actor: User, alert: Alert, resolution: CaseOutcome, note: string): Promise<Alert> {
    if (resolution === 'Unknown') throw new Error('Choose a resolution before closing');
    const next = await alertService.update(actor, alert, { status: 'Closed', resolution, note: note ? `${alert.note ? alert.note + '\n' : ''}${note}` : alert.note });
    auditService.log(actor, 'ALERT_CLOSED', { id: alert.id, name: label(alert) }, { resolution });
    return next;
  },

  /** Copy alert observables into a case (de-duplicated against what the case already has). */
  async importIntoCase(actor: User, c: DfirCase, alerts: Alert[], existing: { iocs: CaseIoc[]; assets: CaseAsset[] }) {
    const iocKeys = new Set(existing.iocs.filter(i => i.caseId === c.id).map(i => `${i.type}|${i.value.toLowerCase()}`));
    const assetKeys = new Set(existing.assets.filter(a => a.caseId === c.id).map(a => a.name.toLowerCase()));
    for (const a of alerts) {
      for (const ioc of a.iocs) {
        const key = `${ioc.type}|${ioc.value.toLowerCase()}`;
        if (!ioc.value || iocKeys.has(key)) continue;
        iocKeys.add(key);
        await caseService.addObject(actor, c, 'iocs', { type: ioc.type, value: ioc.value, description: ioc.description || `From alert #${a.number}`, tlp: ioc.tlp, tags: [`alert:${a.number}`] }, true);
      }
      for (const asset of a.assets) {
        if (!asset.name || assetKeys.has(asset.name.toLowerCase())) continue;
        assetKeys.add(asset.name.toLowerCase());
        await caseService.addObject(actor, c, 'assets', { name: asset.name, type: asset.type || 'Other', ip: asset.ip, domain: '', description: asset.description, compromiseStatus: 'To be determined', analysisStatus: 'To be done', tags: [`alert:${a.number}`] }, true);
      }
      await caseService.addObject(actor, c, 'timeline', {
        title: a.title, date: a.eventTime, category: 'Unspecified', content: a.description, raw: '', source: `${a.source} (alert #${a.number})`,
        assetIds: [], iocIds: [], inSummary: true, tags: a.tags,
      }, true);
    }
  },

  /** Escalate one or more alerts into a new case (IRIS "escalate"). */
  async escalateToCase(actor: User, alerts: Alert[], input: { name: string; description: string; templateId?: string }, ctx: { templates: CaseTemplate[]; iocs: CaseIoc[]; assets: CaseAsset[] }): Promise<DfirCase> {
    if (!alerts.length) throw new Error('Select at least one alert');
    const customers = new Set(alerts.map(a => a.customerId));
    if (customers.size > 1) throw new Error('Alerts from different customers cannot be escalated into one case');
    const order = ['Low', 'Medium', 'High', 'Critical'];
    const severity = alerts.map(a => a.severity).sort((x, y) => order.indexOf(y) - order.indexOf(x))[0];
    const c = await caseService.createCase(actor, {
      name: input.name || alerts[0].title,
      description: input.description || alerts.map(a => `- Alert #${a.number}: ${a.title}`).join('\n'),
      customerId: alerts[0].customerId,
      severity,
      classification: alerts[0].classification,
      tags: Array.from(new Set(alerts.flatMap(a => a.tags))),
      templateId: input.templateId,
      sourceAlertIds: alerts.map(a => a.id),
    }, ctx.templates);
    await alertService.importIntoCase(actor, c, alerts, ctx);
    for (const a of alerts) {
      await realtimeStore.set(ALERTS, { ...a, status: 'Escalated', caseId: c.id, updatedAt: now(), updatedBy: actor.username });
      auditService.log(actor, 'ALERT_ESCALATED', { id: a.id, name: label(a) }, { caseId: c.id, caseNumber: c.number });
    }
    return c;
  },

  /** Merge alerts into an existing case (IRIS "merge"). */
  async mergeIntoCase(actor: User, alerts: Alert[], c: DfirCase, ctx: { iocs: CaseIoc[]; assets: CaseAsset[] }): Promise<void> {
    if (c.state === 'Closed') throw new Error('Reopen the case before merging alerts into it');
    if (alerts.some(a => a.customerId !== c.customerId)) throw new Error('Alerts must belong to the same customer as the case');
    await alertService.importIntoCase(actor, c, alerts, ctx);
    await caseService.updateCase(actor, c, { sourceAlertIds: Array.from(new Set([...c.sourceAlertIds, ...alerts.map(a => a.id)])) });
    for (const a of alerts) {
      await realtimeStore.set(ALERTS, { ...a, status: 'Merged', caseId: c.id, updatedAt: now(), updatedBy: actor.username });
      auditService.log(actor, 'ALERT_MERGED', { id: a.id, name: label(a) }, { caseId: c.id, caseNumber: c.number });
    }
  },

  /** Build an alert from a shift-report event (observables, inventory assets, shift provenance). */
  fromShiftEvent(report: ShiftReport, ev: ShiftEvent, assets: Asset[], customerId = INTERNAL_CUSTOMER_ID): Omit<Alert, 'id' | 'number' | 'status' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> {
    const byIp = (ip: string) => assets.find(a => ip && (a.ipv4 === ip || a.ipv6 === ip));
    const iocs: AlertIoc[] = [];
    if (ev.sourceIp) iocs.push({ type: 'ip-src', value: ev.sourceIp, description: `Source of "${ev.eventName}"`, tlp: 'TLP:AMBER' });
    if (ev.destinationIp) iocs.push({ type: 'ip-dst', value: ev.destinationIp, description: `Target of "${ev.eventName}"`, tlp: 'TLP:AMBER' });
    const linked = [byIp(ev.sourceIp), byIp(ev.destinationIp)].filter(Boolean) as Asset[];
    return {
      title: ev.eventName,
      description: [ev.investigation, ev.remediation && `Remediation: ${ev.remediation}`, ev.conclusion && `Conclusion: ${ev.conclusion}`].filter(Boolean).join('\n\n'),
      severity: ev.severity,
      source: 'G-Eyes SR shift report',
      sourceRef: `${report.id}/${ev.rootEventId || ev.id}`,
      eventTime: ev.timestamp,
      customerId,
      classification: classifyAttack(ev.attackType || ev.eventName),
      tags: ['shift-escalation', ev.attackType].filter(Boolean) as string[],
      iocs,
      assets: linked.map(a => ({ name: a.name, type: a.type === 'Server' ? 'Windows - Server' : a.type === 'Network' ? 'Router' : 'Other', ip: a.ipv4, description: a.description })),
      note: `${getShift(report.shift).label} ${report.date} — logged by ${ev.loggedBy}${ev.port ? `; target port ${ev.port}${ev.protocol ? '/' + ev.protocol : ''}` : ''}`,
      shiftRef: { reportId: report.id, eventId: ev.id, rootEventId: ev.rootEventId || ev.id },
    };
  },
};
