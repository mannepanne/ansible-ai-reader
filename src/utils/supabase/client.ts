// ABOUT: Browser-side Supabase client for authentication
// ABOUT: Uses @supabase/ssr for proper cookie handling in client components

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
