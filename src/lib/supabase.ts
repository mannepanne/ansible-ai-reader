// ABOUT: Supabase client initialization
// ABOUT: Provides typed client instances for browser and server contexts

import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Client-side Supabase client (uses publishable key, respects RLS)
export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// Server-side Supabase client (uses secret key, bypasses RLS)
export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY
);
