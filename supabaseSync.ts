import { supabase } from './supabaseClient';

const keyToTable: Record<string, string> = {
  'soc_assets_data': 'assets',
  'soc_incidents_data': 'incidents',
  'soc_tasks_data': 'tasks',
  'soc_guidelines_data': 'guidelines',
  'soc_announcements': 'announcements',
  'soc_audit_logs': 'audit_logs',
  'soc_chat_rooms': 'chat_rooms',
  'soc_chat_messages': 'messages',
  'soc_approval_requests': 'approval_requests',
  'soc_user_notifications': 'notifications',
  'soc_app_users': 'users',
  'soc_media_vault': 'media_vault',
};

let isSyncing = false;

// Pull all data from Supabase and populate localStorage
export const syncFromSupabase = async () => {
  if (isSyncing) return;
  isSyncing = true;
  try {
    for (const [key, table] of Object.entries(keyToTable)) {
      const { data, error } = await supabase.from(table).select('*');
      if (!error && data && data.length > 0) {
        if (table === 'media_vault') {
          const vault: Record<string, string> = {};
          data.forEach((item: any) => { vault[item.id] = item.data; });
          localStorage.setItem(key, JSON.stringify(vault));
        } else {
          localStorage.setItem(key, JSON.stringify(data));
        }
      } else if (!error && (!data || data.length === 0)) {
        // Database is empty, seed it with local data if available
        const localData = localStorage.getItem(key);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            if (table === 'media_vault') {
              const vaultArray = Object.entries(parsed).map(([id, data]) => ({ id, data }));
              if (vaultArray.length > 0) {
                await supabase.from(table).upsert(vaultArray);
              }
            } else if (Array.isArray(parsed) && parsed.length > 0) {
              await supabase.from(table).upsert(parsed);
            }
          } catch (e) {
            console.error(`Failed to seed ${table}`, e);
          }
        }
      }
    }

    // Special handling for app_settings
    const { data: settingsData, error: settingsError } = await supabase.from('app_settings').select('*').single();
    if (settingsData) {
      const { id, updatedAt, ...settings } = settingsData;
      localStorage.setItem('soc_app_settings', JSON.stringify(settings));
    } else if (settingsError && settingsError.code === 'PGRST116') {
      // PGRST116 means no rows returned
      const localSettings = localStorage.getItem('soc_app_settings');
      if (localSettings) {
        try {
          const parsed = JSON.parse(localSettings);
          await supabase.from('app_settings').upsert({ 
            id: '00000000-0000-0000-0000-000000000000', 
            ...parsed 
          });
        } catch (e) {
          console.error('Failed to seed app_settings', e);
        }
      }
    }

    // Trigger a re-render
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to sync from Supabase', error);
  } finally {
    isSyncing = false;
  }
};

// Push changes to Supabase
export const pushToSupabase = async (key: string, data: any) => {
  const table = keyToTable[key];
  
  try {
    if (table === 'media_vault') {
      const vaultArray = Object.entries(data).map(([id, val]) => ({ id, data: val }));
      if (vaultArray.length > 0) {
        await supabase.from(table).upsert(vaultArray);
      }
      
      // Handle deletions
      const { data: existing } = await supabase.from(table).select('id');
      if (existing) {
        const currentIds = new Set(vaultArray.map((item: any) => item.id));
        const toDelete = existing.filter((item: any) => !currentIds.has(item.id)).map(item => item.id);
        if (toDelete.length > 0) {
          await supabase.from(table).delete().in('id', toDelete);
        }
      }
    } else if (table) {
      if (Array.isArray(data)) {
        if (data.length > 0) {
          await supabase.from(table).upsert(data);
        }
        
        // Handle deletions
        const { data: existing } = await supabase.from(table).select('id');
        if (existing) {
          const currentIds = new Set(data.map((item: any) => item.id));
          const toDelete = existing.filter((item: any) => !currentIds.has(item.id)).map(item => item.id);
          if (toDelete.length > 0) {
            await supabase.from(table).delete().in('id', toDelete);
          }
        }
      }
    } else if (key === 'soc_app_settings') {
      await supabase.from('app_settings').upsert({ 
        id: '00000000-0000-0000-0000-000000000000', 
        ...data 
      });
    }
  } catch (error) {
    console.error(`Failed to push ${key} to Supabase`, error);
  }
};

// Intercept localStorage.setItem to automatically push to Supabase
export const initSupabaseSync = () => {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments as any);
    
    // Only push if it's one of our managed keys and we are not currently syncing from Supabase
    if (!isSyncing && (keyToTable[key] || key === 'soc_app_settings')) {
      try {
        const parsed = JSON.parse(value);
        pushToSupabase(key, parsed);
      } catch (e) {
        console.error('Error parsing localStorage value for Supabase sync', e);
      }
    }
  };

  // Initial sync on load
  syncFromSupabase();

  // Subscribe to real-time changes
  let syncTimeout: any;
  supabase
    .channel('public-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      // When a change happens remotely, sync from Supabase
      if (!isSyncing) {
        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(syncFromSupabase, 1000);
      }
    })
    .subscribe();
};
