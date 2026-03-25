import { supabase } from '../lib/supabase';
import { Asset, Incident } from '../types';

export const supabaseService = {
  async getAssets(): Promise<Asset[]> {
    const { data, error } = await supabase
      .from('assets')
      .select('*');
    
    if (error) {
      console.error('Error fetching assets:', error);
      return [];
    }
    return data || [];
  },

  async saveAsset(asset: Partial<Asset>): Promise<Asset | null> {
    const { data, error } = await supabase
      .from('assets')
      .upsert(asset)
      .select()
      .single();

    if (error) {
      console.error('Error saving asset:', error);
      return null;
    }
    return data;
  },

  async getIncidents(): Promise<Incident[]> {
    const { data, error } = await supabase
      .from('incidents')
      .select('*');
    
    if (error) {
      console.error('Error fetching incidents:', error);
      return [];
    }
    return data || [];
  },

  async saveIncident(incident: Partial<Incident>): Promise<Incident | null> {
    const { data, error } = await supabase
      .from('incidents')
      .upsert(incident)
      .select()
      .single();

    if (error) {
      console.error('Error saving incident:', error);
      return null;
    }
    return data;
  }
};
