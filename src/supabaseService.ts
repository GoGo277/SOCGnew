import { supabase } from './supabaseClient';
import { Asset, Incident, User, Task, Announcement, Guideline, ApprovalRequest, Notification, Message, ChatRoom } from './types';

// Example of how to use Supabase to fetch and mutate data
// These functions can replace the localStorage-based services

export const supabaseService = {
  // Assets
  getAssets: async (): Promise<Asset[]> => {
    const { data, error } = await supabase.from('assets').select('*');
    if (error) throw error;
    return data as Asset[];
  },
  saveAsset: async (asset: Partial<Asset>): Promise<Asset> => {
    const { data, error } = await supabase.from('assets').upsert(asset).select().single();
    if (error) throw error;
    return data as Asset;
  },
  deleteAsset: async (id: string): Promise<void> => {
    const { error } = await supabase.from('assets').delete().eq('id', id);
    if (error) throw error;
  },

  // Incidents
  getIncidents: async (): Promise<Incident[]> => {
    const { data, error } = await supabase.from('incidents').select('*');
    if (error) throw error;
    return data as Incident[];
  },
  saveIncident: async (incident: Partial<Incident>): Promise<Incident> => {
    const { data, error } = await supabase.from('incidents').upsert(incident).select().single();
    if (error) throw error;
    return data as Incident;
  },
  deleteIncident: async (id: string): Promise<void> => {
    const { error } = await supabase.from('incidents').delete().eq('id', id);
    if (error) throw error;
  },

  // Users
  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return data as User[];
  },
  
  // Tasks
  getTasks: async (): Promise<Task[]> => {
    const { data, error } = await supabase.from('tasks').select('*');
    if (error) throw error;
    return data as Task[];
  },

  // Guidelines
  getGuidelines: async (): Promise<Guideline[]> => {
    const { data, error } = await supabase.from('guidelines').select('*');
    if (error) throw error;
    return data as Guideline[];
  },

  // Real-time subscriptions example
  subscribeToIncidents: (callback: (payload: any) => void) => {
    return supabase
      .channel('public:incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, callback)
      .subscribe();
  }
};
