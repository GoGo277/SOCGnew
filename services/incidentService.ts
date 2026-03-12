import { Incident } from '../types';

const STORAGE_KEY = 'incidents';

const getStoredIncidents = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredIncidents = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const incidentService = {
  getIncidents: async (): Promise<Incident[]> => {
    const incidents = getStoredIncidents();
    return incidents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  saveIncident: async (incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Incident | null> => {
    const incidents = getStoredIncidents();
    const now = new Date().toISOString();
    
    if (incident.id) {
      const index = incidents.findIndex(i => i.id === incident.id);
      if (index !== -1) {
        incidents[index] = { ...incidents[index], ...incident, updatedAt: now };
        setStoredIncidents(incidents);
        return incidents[index];
      }
      return null;
    }

    const newIncident = { ...incident, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    incidents.push(newIncident);
    setStoredIncidents(incidents);
    return newIncident as Incident;
  },
  deleteIncident: async (id: string): Promise<void> => {
    const incidents = getStoredIncidents();
    setStoredIncidents(incidents.filter(i => i.id !== id));
  },
  exportIncidents: async (): Promise<string> => {
    const incidents = getStoredIncidents();
    return JSON.stringify(incidents, null, 2);
  },
  importIncidents: async (jsonData: string): Promise<void> => {
    try {
      const data = JSON.parse(jsonData);
      if (Array.isArray(data)) {
        const incidents = getStoredIncidents();
        const newIncidents = [...incidents, ...data];
        setStoredIncidents(newIncidents);
      } else {
        throw new Error('Invalid format');
      }
    } catch (e) {
      throw new Error('Failed to import incidents');
    }
  }
};
