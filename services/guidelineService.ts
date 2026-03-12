import { Guideline } from '../types';

const STORAGE_KEY = 'guidelines';

const getStoredGuidelines = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredGuidelines = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const guidelineService = {
  getGuidelines: async (): Promise<Guideline[]> => {
    const guidelines = getStoredGuidelines();
    return guidelines.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },
  saveGuideline: async (guideline: Omit<Guideline, 'id' | 'updatedAt'> & { id?: string }): Promise<Guideline | null> => {
    const guidelines = getStoredGuidelines();
    const now = new Date().toISOString();
    
    if (guideline.id) {
      const index = guidelines.findIndex(g => g.id === guideline.id);
      if (index !== -1) {
        guidelines[index] = { ...guidelines[index], ...guideline, updatedAt: now };
        setStoredGuidelines(guidelines);
        return guidelines[index];
      }
      return null;
    }

    const newGuideline = { ...guideline, id: crypto.randomUUID(), updatedAt: now };
    guidelines.push(newGuideline);
    setStoredGuidelines(guidelines);
    return newGuideline as Guideline;
  },
  deleteGuideline: async (id: string): Promise<void> => {
    const guidelines = getStoredGuidelines();
    setStoredGuidelines(guidelines.filter(g => g.id !== id));
  }
};
