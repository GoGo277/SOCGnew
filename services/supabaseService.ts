import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Asset, Incident } from '../types';

// Helper to map DB asset to frontend Asset
const mapDbAssetToAsset = (dbAsset: any): Asset => ({
  id: dbAsset.id,
  name: dbAsset.name,
  type: dbAsset.type,
  identity: dbAsset.mac || '',
  ipv4: dbAsset.ipv4 || '',
  ipv6: dbAsset.ipv6 || '',
  rackNumber: dbAsset.owner || '',
  location: dbAsset.location || '',
  description: dbAsset.os || '',
  notes: dbAsset.notes || [],
  criticality: dbAsset.criticality || 'Medium',
  createdAt: dbAsset.created_at,
  updatedAt: dbAsset.updated_at
});

// Helper to map frontend Asset to DB asset
const mapAssetToDbAsset = (asset: Partial<Asset>): any => {
  const dbAsset: any = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ipv4: asset.ipv4,
    ipv6: asset.ipv6,
    mac: asset.identity,
    os: asset.description,
    location: asset.location,
    owner: asset.rackNumber,
    criticality: asset.criticality,
    notes: asset.notes,
  };
  if (asset.createdAt) dbAsset.created_at = asset.createdAt;
  if (asset.updatedAt) dbAsset.updated_at = asset.updatedAt;
  return dbAsset;
};

// Helper to map DB incident to frontend Incident
const mapDbIncidentToIncident = (dbIncident: any): Incident => ({
  id: dbIncident.id,
  eventName: dbIncident.event_name,
  sourceIp: dbIncident.source_ip || '',
  destinationIp: dbIncident.destination_ip || '',
  sourceAssetName: dbIncident.source_asset_name || '',
  destinationAssetName: dbIncident.destination_asset_name || '',
  description: dbIncident.description || '',
  response: dbIncident.response || '',
  tags: dbIncident.tags || [],
  notes: dbIncident.notes || [],
  severity: dbIncident.severity || 'Medium',
  status: dbIncident.status || 'New',
  createdAt: dbIncident.created_at,
  updatedAt: dbIncident.updated_at
});

// Helper to map frontend Incident to DB incident
const mapIncidentToDbIncident = (incident: Partial<Incident>): any => {
  const dbIncident: any = {
    id: incident.id,
    event_name: incident.eventName,
    severity: incident.severity,
    status: incident.status,
    source_ip: incident.sourceIp,
    destination_ip: incident.destinationIp,
    source_asset_name: incident.sourceAssetName,
    destination_asset_name: incident.destinationAssetName,
    description: incident.description,
    response: incident.response,
    notes: incident.notes,
    tags: incident.tags,
  };
  if (incident.createdAt) dbIncident.created_at = incident.createdAt;
  if (incident.updatedAt) dbIncident.updated_at = incident.updatedAt;
  return dbIncident;
};

export const supabaseService = {
  async getAssets(): Promise<Asset[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*');
      
      if (error) {
        console.error('Error fetching assets:', error);
        return [];
      }
      return (data || []).map(mapDbAssetToAsset);
    } catch (err) {
      console.error('Network error fetching assets:', err);
      return [];
    }
  },

  async saveAsset(asset: Partial<Asset>): Promise<Asset | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase
        .from('assets')
        .upsert(mapAssetToDbAsset(asset))
        .select()
        .single();

      if (error) {
        console.error('Error saving asset:', error);
        return null;
      }
      return mapDbAssetToAsset(data);
    } catch (err) {
      console.error('Network error saving asset:', err);
      return null;
    }
  },

  async getIncidents(): Promise<Incident[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*');
      
      if (error) {
        console.error('Error fetching incidents:', error);
        return [];
      }
      return (data || []).map(mapDbIncidentToIncident);
    } catch (err) {
      console.error('Network error fetching incidents:', err);
      return [];
    }
  },

  async saveIncident(incident: Partial<Incident>): Promise<Incident | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase
        .from('incidents')
        .upsert(mapIncidentToDbIncident(incident))
        .select()
        .single();

      if (error) {
        console.error('Error saving incident:', error);
        return null;
      }
      return mapDbIncidentToIncident(data);
    } catch (err) {
      console.error('Network error saving incident:', err);
      return null;
    }
  },

  async deleteAsset(id: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting asset:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Network error deleting asset:', err);
      return false;
    }
  },

  async deleteIncident(id: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase
        .from('incidents')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting incident:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Network error deleting incident:', err);
      return false;
    }
  },

  async getAuditLogs(): Promise<any[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (error) {
        console.error('Error fetching audit logs:', error);
        return [];
      }
      return (data || []).map(dbLog => ({
        id: dbLog.id,
        userId: dbLog.user_id,
        username: dbLog.username,
        action: dbLog.action,
        targetId: dbLog.target_id,
        targetName: dbLog.target_name,
        metadata: dbLog.metadata,
        timestamp: dbLog.created_at
      }));
    } catch (err) {
      console.error('Network error fetching audit logs:', err);
      return [];
    }
  }
};
