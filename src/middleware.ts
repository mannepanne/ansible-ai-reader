// ABOUT: Authentication middleware for protected routes
// ABOUT: Redirects unauthenticated users to /login with return URL

import { type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  // Refresh session if expired - required for Server Components
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protect routes that start with /summaries or /settings
  if (
    !session &&
    (request.nextUrl.pathname.startsWith('/summaries') ||
      request.nextUrl.pathname.startsWith('/settings'))
  ) {
    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  // If user is authenticated and tries to access /login, redirect to /summaries
  if (session && request.nextUrl.pathname === '/login') {
    const summariesUrl = new URL('/summaries', request.url);
    return Response.redirect(summariesUrl);
  }

  return response;
}

// Configure which routes use middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/auth/* (auth callback routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
