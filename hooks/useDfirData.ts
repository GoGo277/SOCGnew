import { useEffect, useState } from 'react';
import { Alert, CaseActivity, CaseAsset, CaseEvidence, CaseIoc, CaseNote, CaseTask, CaseTemplate, CaseTimelineEvent, Customer, DfirCase } from '../types';
import { caseService, DEFAULT_CUSTOMER } from '../services/caseService';
import { alertService } from '../services/alertService';

export interface DfirData {
  cases: DfirCase[];
  alerts: Alert[];
  customers: Customer[];
  templates: CaseTemplate[];
  activity: CaseActivity[];
  iocs: CaseIoc[];
  assets: CaseAsset[];
  timeline: CaseTimelineEvent[];
  evidence: CaseEvidence[];
  notes: CaseNote[];
  tasks: CaseTask[];
}

const EMPTY: DfirData = { cases: [], alerts: [], customers: [DEFAULT_CUSTOMER], templates: [], activity: [], iocs: [], assets: [], timeline: [], evidence: [], notes: [], tasks: [] };

/** Real-time case-management collections (Firestore in cloud mode, local store otherwise). */
export const useDfirData = (enabled: boolean): DfirData => {
  const [data, setData] = useState<DfirData>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    const set = <K extends keyof DfirData>(k: K) => (v: DfirData[K]) => setData(d => ({ ...d, [k]: v }));
    const unsubs = [
      caseService.subscribeCases(set('cases')),
      alertService.subscribe(set('alerts')),
      caseService.subscribeCustomers(set('customers')),
      caseService.subscribeTemplates(set('templates')),
      caseService.subscribeActivity(set('activity')),
      caseService.subscribeObjects('iocs', set('iocs')),
      caseService.subscribeObjects('assets', set('assets')),
      caseService.subscribeObjects('timeline', set('timeline')),
      caseService.subscribeObjects('evidence', set('evidence')),
      caseService.subscribeObjects('notes', set('notes')),
      caseService.subscribeObjects('tasks', set('tasks')),
    ];
    return () => unsubs.forEach(u => u());
  }, [enabled]);
  return data;
};
