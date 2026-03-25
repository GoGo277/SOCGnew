
import { Incident } from '../types';

const STORAGE_KEY = 'soc_incidents_data';

const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'inc-1',
    eventName: 'Brute Force Attempt',
    sourceIp: '185.220.101.44',
    destinationIp: '10.0.1.10',
    sourceAssetName: 'Unknown (Tor Exit Node)',
    destinationAssetName: 'DC-PRIMARY-01',
    description: 'Multiple failed SSH login attempts detected from a known malicious IP.',
    response: 'IP address blocked at the edge firewall. Increased monitoring on DC-PRIMARY-01.',
    tags: ['Unauthorized Access', 'External', 'SSH'],
    notes: [],
    severity: 'High',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export const incidentService = {
  getIncidents: (): Incident[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_INCIDENTS));
      return INITIAL_INCIDENTS;
    }
    const parsed = JSON.parse(data);
    // Ensure notes array exists for older records
    return parsed.map((inc: Incident) => ({ ...inc, notes: inc.notes || [] }));
  },

  saveIncident: (incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Incident => {
    const incidents = incidentService.getIncidents();
    const now = new Date().toISOString();
    
    if (incident.id) {
      const index = incidents.findIndex(i => i.id === incident.id);
      if (index !== -1) {
        const updatedIncident: Incident = {
          ...incidents[index],
          ...incident,
          id: incident.id,
          updatedAt: now
        };
        incidents[index] = updatedIncident;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
        return updatedIncident;
      }
    }

    const newIncident: Incident = {
      ...incident,
      id: `inc-${crypto.randomUUID()}`,
      notes: incident.notes || [],
      createdAt: now,
      updatedAt: now,
    } as Incident;

    incidents.push(newIncident);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
    return newIncident;
  },

  deleteIncident: (id: string): void => {
    const incidents = incidentService.getIncidents();
    const filtered = incidents.filter(i => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  importIncidents: (newIncidents: Incident[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newIncidents));
  },

  exportIncidents: (): string => {
    const incidents = incidentService.getIncidents();
    return JSON.stringify(incidents, null, 2);
  }
};
