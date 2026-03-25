
import { Guideline, UserRole } from '../types';

const STORAGE_KEY = 'soc_guidelines_data';

const DEFAULT_GUIDELINES: Guideline[] = [
  {
    id: 'g1',
    title: 'Asset Onboarding Standard',
    content: '# Asset Onboarding Standard\n\nAll new hardware must follow this protocol before being added to the production network.\n\n### 1. Pre-Check\n- Verify Serial Number\n- Perform Vulnerability Scan\n- Assign Static IPv4\n\n### 2. Documentation\nInclude detailed notes about the intended use case.\n\n![SOC Shield](https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400)',
    visibleTo: ['Admin', 'L2', 'L1'],
    author: 'System',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'g2',
    title: 'Incident Response Tier 2',
    content: '# Tier 2 Escalation\n\nWhen a "Critical" incident is identified, follow these steps.\n\n1. Isolate Affected Node\n2. Notify On-Call Lead\n3. Capture Network Traffic PCAP\n\n> Warning: Do not reboot the machine as it may clear volatile forensic evidence.',
    visibleTo: ['Admin', 'L2'],
    author: 'System',
    updatedAt: new Date().toISOString()
  }
];

export const guidelineService = {
  getGuidelines: (role?: UserRole): Guideline[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    const all: Guideline[] = data ? JSON.parse(data) : DEFAULT_GUIDELINES;
    if (role && role !== 'Admin') {
      return all.filter(g => g.visibleTo.includes(role));
    }
    return all;
  },

  saveGuideline: (guideline: Omit<Guideline, 'id' | 'updatedAt'> & { id?: string }): Guideline => {
    const all = guidelineService.getGuidelines();
    const now = new Date().toISOString();
    let updatedOrNew: Guideline;
    
    if (guideline.id) {
      const idx = all.findIndex(g => g.id === guideline.id);
      if (idx !== -1) {
        updatedOrNew = {
          ...all[idx],
          ...guideline,
          updatedAt: now
        } as Guideline;
        all[idx] = updatedOrNew;
      } else {
        throw new Error('Guideline not found');
      }
    } else {
      updatedOrNew = {
        ...guideline,
        id: `guide-${crypto.randomUUID()}`,
        updatedAt: now
      } as Guideline;
      all.push(updatedOrNew);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('Storage failed', e);
      throw new Error('QUOTA_EXCEEDED: Image size too large or storage full. Try a smaller image.');
    }
    
    return updatedOrNew;
  },

  deleteGuideline: (id: string): void => {
    const all = guidelineService.getGuidelines().filter(g => g.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
};
