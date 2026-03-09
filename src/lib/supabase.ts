// ABOUT: Supabase client initialization
// ABOUT: Provides typed client instances for browser and server contexts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Lazy client initialization to avoid build-time errors
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

// Client-side Supabase client (uses publishable key, respects RLS)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      );
    }
    return (_supabase as any)[prop];
  },
});

// Server-side Supabase client (uses secret key, bypasses RLS)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SECRET_KEY
      );
    }
    return (_supabaseAdmin as any)[prop];
  },
});
