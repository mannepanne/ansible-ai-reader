// ABOUT: Authentication middleware for protected routes
// ABOUT: Redirects unauthenticated users to /login with return URL

import { type NextRequest, type NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

// Baseline security response headers applied to every page the middleware serves.
// HSTS is intentionally NOT set here — it is injected at the Cloudflare edge, where
// it would otherwise override or duplicate any worker-set value.
// Content-Security-Policy is added separately (see security-headers spec) once tuned.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

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

  return applySecurityHeaders(response);
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
