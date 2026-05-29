// ABOUT: Middleware Supabase client for authentication
// ABOUT: Uses @supabase/ssr with NextRequest/NextResponse cookie handling

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export function createClient(request: NextRequest) {
  // A single, stable response object. The caller destructures this reference
  // BEFORE supabase.auth.getSession() runs, and getSession() is what triggers the
  // cookie set/remove callbacks (on session refresh). The callbacks must therefore
  // mutate THIS object in place — reassigning `response` to a fresh NextResponse
  // would orphan the caller's reference and silently drop refreshed-session cookies,
  // leaving the browser without an updated session.
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Mutate both the request (so downstream sees the cookie this request)
          // and the stable response (so it reaches the browser as Set-Cookie).
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  return { supabase, response };
}
