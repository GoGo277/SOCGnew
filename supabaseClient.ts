import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create a dummy client if env vars are missing so the app doesn't crash
// The sync service will just fail gracefully
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      from: () => ({
        select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }), then: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }),
        upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }), then: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }),
        delete: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) })
      }),
      channel: () => ({
        on: () => ({ subscribe: () => {} })
      })
    } as any;
