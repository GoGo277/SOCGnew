import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATE, renderCaseReport } from '../../services/caseReport';
import { alertService, classifyAttack } from '../../services/alertService';
import { guessIocType } from '../../lib/dfir';

const T = '2026-11-05T09:00:00.000Z';
const base = { createdAt: T, createdBy: 'a', updatedAt: T, updatedBy: 'a' };
const kase: any = { id: 'c1', number: 7, name: 'Phish', description: 'Desc', customerId: 'internal', state: 'Closed', severity: 'High', classification: 'fraud:phishing', outcome: 'True positive with impact', ownerName: 'alice', tags: ['x'], openedAt: T, closedAt: T, sourceAlertIds: [] };

describe('case report templates', () => {
  it('fills placeholders and renders only this case’s objects', () => {
    const md = renderCaseReport(BUILTIN_TEMPLATE, {
      case: kase, customer: { id: 'internal', name: 'ACME' } as any, generatedBy: 'alice', classification: 'TLP:AMBER', activity: [], notes: [],
      iocs: [{ id: 'i', caseId: 'c1', type: 'domain', value: 'evil.example', tlp: 'TLP:RED', description: 'C2|host', tags: [], ...base }, { id: 'j', caseId: 'other', type: 'domain', value: 'not-mine', tlp: 'TLP:RED', description: '', tags: [], ...base }] as any,
      assets: [], evidence: [], tasks: [{ id: 't', caseId: 'c1', title: 'Purge', status: 'Done', description: '', assigneeIds: [], tags: [], ...base }] as any,
      timeline: [{ id: 'e', caseId: 'c1', title: 'Clicked link', date: T, category: 'Initial Access', inSummary: true, content: '', raw: '', source: 'Proxy', assetIds: [], iocIds: [], tags: [], ...base }] as any,
    });
    expect(md).toContain('# Case #7 — Phish');
    expect(md).toContain('| Customer | ACME |');
    expect(md).toContain('`evil.example`');
    expect(md).toContain('C2\\|host');
    expect(md).not.toContain('not-mine');
    expect(md).toContain('**1/1** done');
    expect(md).toContain('Clicked link');
    expect(md).not.toMatch(/\{\{[a-z_.]+\}\}/);
  });
});

describe('alert mapping', () => {
  it('classifies attack types into IRIS (ENISA) classifications', () => {
    expect(classifyAttack('Brute Force')).toBe('intrusion-attempts:brute-force');
    expect(classifyAttack('Ransomware')).toBe('malicious-code:ransomware');
    expect(classifyAttack('Port Scan')).toBe('information-gathering:scanner');
    expect(classifyAttack('something new')).toBe('other:other');
  });
  it('builds an alert from a shift event with IOCs, assets and provenance', () => {
    const report: any = { id: '2026-11-05_morning', date: '2026-11-05', shift: 'morning' };
    const ev: any = { id: 'e1', rootEventId: 'r1', eventName: 'SSH brute force', attackType: 'Brute Force', sourceIp: '203.0.113.5', destinationIp: '10.0.0.5', port: '22', protocol: 'TCP', severity: 'High', timestamp: T, investigation: 'Many failures', remediation: 'Blocked', conclusion: '', loggedBy: 'alice' };
    const a = alertService.fromShiftEvent(report, ev, [{ id: 'x', name: 'BASTION', type: 'Server', ipv4: '10.0.0.5', description: 'Jump host' } as any]);
    expect(a.iocs).toEqual([
      { type: 'ip-src', value: '203.0.113.5', description: 'Source of "SSH brute force"', tlp: 'TLP:AMBER' },
      { type: 'ip-dst', value: '10.0.0.5', description: 'Target of "SSH brute force"', tlp: 'TLP:AMBER' },
    ]);
    expect(a.assets[0]).toMatchObject({ name: 'BASTION', ip: '10.0.0.5' });
    expect(a.shiftRef).toEqual({ reportId: '2026-11-05_morning', eventId: 'e1', rootEventId: 'r1' });
    expect(a.classification).toBe('intrusion-attempts:brute-force');
    expect(a.description).toContain('Remediation: Blocked');
  });
  it('guesses IOC types from values', () => {
    expect(['10.1.2.3', 'evil.example', 'https://x.y/z', 'a@b.co', 'd41d8cd98f00b204e9800998ecf8427e', 'hello'].map(guessIocType))
      .toEqual(['ip-src', 'domain', 'url', 'email-src', 'md5', 'other']);
  });
});
