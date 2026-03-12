# Phase 2: Authentication Implementation

**Status**: ✅ Implemented
**Completed**: March 12, 2026
**PR**: #8

---

## Overview

Phase 2 implements passwordless authentication using magic links sent via Supabase Auth and Resend SMTP. Users log in by entering their email address and clicking a link sent to their inbox.

**Key features:**
- Magic link authentication (no passwords)
- Protected route middleware
- Session management with 7-day expiry
- Logout functionality
- Single-user application (signups disabled)

---

## Authentication Flow

```
1. User visits ansible.hultberg.org
   ↓
2. Middleware checks session → redirects to /login if not authenticated
   ↓
3. User enters email on /login
   ↓
4. POST /api/auth/login → Supabase Auth sends magic link via Resend
   ↓
5. User clicks link in email
   ↓
6. GET /api/auth/callback?code=xxx&returnTo=/summaries
   ↓
7. Callback exchanges code for session → sets httpOnly cookies
   ↓
8. Redirect to returnTo URL (default: /summaries)
   ↓
9. Session persists for 7 days (auto-refreshed by middleware)
```

---

## Supabase Client Implementations

We use **three different Supabase clients** depending on the context. This is required because of Next.js's different execution environments (browser, server, middleware).

### 1. Browser Client (`src/utils/supabase/client.ts`)

**When to use:** Client-side code in React components

```typescript
import { createClient } from '@/utils/supabase/client';

// Inside a client component
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
```

**How it works:**
- Uses `createBrowserClient` from `@supabase/ssr`
- Accesses cookies via `document.cookie` (browser only)
- Synchronous client creation
- Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

**Use cases:**
- Auth state management in UI
- Real-time subscriptions (future)
- Client-side data fetching (future)

### 2. Server Client (`src/utils/supabase/server.ts`)

**When to use:** Server Components and API routes

```typescript
import { createClient } from '@/utils/supabase/server';

// Inside an API route or Server Component
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
```

**How it works:**
- Uses `createServerClient` from `@supabase/ssr`
- Accesses cookies via Next.js `cookies()` helper (must await in Next.js 15+)
- **Returns a Promise** - must use `await createClient()`
- Handles cookie get/set/remove operations
- Catches errors when called from Server Components (cookies can't be set during render)

**Use cases:**
- API routes (login, logout, callback)
- Server Components checking auth status
- Server-side data fetching

### 3. Middleware Client (`src/utils/supabase/middleware.ts`)

**When to use:** Next.js middleware only

```typescript
import { createClient } from '@/utils/supabase/middleware';

// Inside middleware.ts
const { supabase, response } = createClient(request);
const { data: { session } } = await supabase.auth.getSession();
```

**How it works:**
- Uses `createServerClient` from `@supabase/ssr`
- Manages cookies on both request and response objects
- Returns both `supabase` client and modified `response`
- Critical for session refresh on every request

**Use cases:**
- Route protection in middleware
- Session refresh
- Cookie management during request processing

**Important:** Always return the `response` object from middleware to ensure cookies are properly set.

---

## Middleware Route Protection

**File:** `src/middleware.ts`

The middleware runs on every request (except static files, images, and auth callback routes).

### Protected Routes

Routes that require authentication:
- `/summaries` - Main application page
- `/summaries/:id` - Individual summary pages (Phase 3+)
- `/settings` - User settings (Phase 5+)

### Public Routes

Routes accessible without authentication:
- `/` - Home page
- `/login` - Login page
- `/api/auth/*` - Auth endpoints
- `/_next/*` - Next.js internal routes
- Static files (favicon, images, etc.)

### Route Protection Logic

```typescript
// 1. Refresh session (critical for maintaining auth state)
const { data: { session } } = await supabase.auth.getSession();

// 2. Protect routes - redirect to login if no session
if (!session && isProtectedRoute(request.nextUrl.pathname)) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
  return Response.redirect(loginUrl);
}

// 3. Redirect authenticated users away from login
if (session && request.nextUrl.pathname === '/login') {
  return Response.redirect(new URL('/summaries', request.url));
}

// 4. Return response with updated cookies
return response;
```

**Key points:**
- Session refresh happens on **every request** (keeps sessions alive)
- Return URL preserved in `returnTo` query parameter
- 302 redirect used (temporary redirect)
- Response object from `createClient()` must be returned

---

## Session Management

### Session Configuration

**Settings in Supabase dashboard:**
- **JWT Expiry**: 604800 seconds (7 days)
- **Site URL**: https://ansible.hultberg.org
- **Redirect URLs**: https://ansible.hultberg.org/api/auth/callback

### Session Storage

Sessions are stored in **httpOnly cookies** managed by Supabase:
- Cookie name: `sb-{project-ref}-auth-token`
- Attributes: `httpOnly`, `secure`, `sameSite=lax`
- Prevents XSS attacks (JavaScript cannot access)
- Automatically sent with every request

### Session Refresh

Middleware calls `getSession()` on every request, which:
1. Checks if session is still valid
2. Refreshes access token if needed
3. Updates cookies with new token
4. Extends session lifetime

**Result:** Sessions stay alive as long as user is active.

### Session Timeout

If user is inactive for 7 days:
1. Session expires
2. Next request triggers middleware check
3. User redirected to `/login` with return URL
4. User can log in again and return to intended page

---

## Email Configuration

### Resend SMTP Setup

**Provider:** Resend (resend.com)
**Sender email:** ansible@hultberg.org
**Domain:** hultberg.org (verified in Resend dashboard)

### Supabase SMTP Settings

**Configuration in Supabase dashboard:**
```
Authentication → Email → SMTP Settings

Host: smtp.resend.com
Port: 465
Username: resend
Password: <RESEND_API_KEY>
Sender email: ansible@hultberg.org
```

### Magic Link Email Template

**Template in Supabase dashboard:**
```
Subject: Sign in to Ansible

Click here to sign in to Ansible:
{{ .ConfirmationURL }}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
```

**Template variables:**
- `{{ .ConfirmationURL }}` - Magic link URL
- `{{ .Token }}` - Auth token (not used in our template)
- `{{ .SiteURL }}` - Configured site URL

### Single-User Configuration

**Email signups disabled** via Supabase dashboard:
- Authentication → Providers → Email → "Enable email signup" = OFF
- Only existing users (magnus.hultberg@gmail.com) can log in
- New signups rejected automatically

**To add users in the future:**
- Re-enable email signup temporarily, OR
- Manually invite via Supabase dashboard: Authentication → Users → Invite User

---

## API Endpoints

### POST /api/auth/login

**Purpose:** Send magic link email

**Request:**
```json
{
  "email": "user@example.com",
  "returnTo": "/summaries"  // optional, defaults to /summaries
}
```

**Success Response (200):**
```json
{
  "message": "Magic link sent successfully"
}
```

**Error Responses:**
- `400` - Invalid email or missing required fields
- `500` - Supabase error or SMTP failure

**Implementation notes:**
- Uses Zod schema for validation
- Calls `supabase.auth.signInWithOtp()`
- emailRedirectTo includes returnTo parameter
- Server client used (must await createClient())

### GET /api/auth/callback

**Purpose:** Verify magic link and create session

**Query Parameters:**
- `code` - Auth code from magic link (required)
- `returnTo` - URL to redirect after auth (optional)

**Success:** 307 redirect to returnTo URL (or /summaries)
**Error:** 307 redirect to /login?error=Authentication%20failed

**Implementation notes:**
- Exchanges code for session via `exchangeCodeForSession()`
- Sets httpOnly cookies automatically
- Handles expired/invalid codes gracefully

### POST /api/auth/logout

**Purpose:** Sign out user

**Success:** 307 redirect to /login

**Error Response (500):**
```json
{
  "error": "Failed to logout"
}
```

**Implementation notes:**
- Calls `supabase.auth.signOut()`
- Clears session cookies automatically
- No request body required

### GET /api/auth/logout

**Purpose:** Show logout confirmation page

**Response:** HTML page with logout button

**Implementation notes:**
- Added for better UX when visiting URL directly
- Shows confirmation page instead of 405 error
- Form submits to POST endpoint

---

## Testing Strategy

### Automated Tests

**Coverage:** 22 new tests across 4 test files

**Test files:**
1. `src/app/api/auth/login/route.test.ts` (6 tests)
   - Valid email handling
   - Custom returnTo URL
   - Invalid email rejection
   - Missing email rejection
   - Supabase error handling
   - Unexpected error handling

2. `src/app/api/auth/callback/route.test.ts` (5 tests)
   - Code exchange and redirect
   - Default returnTo handling
   - Custom returnTo handling
   - Failed code exchange
   - Missing code handling

3. `src/app/api/auth/logout/route.test.ts` (2 tests)
   - Successful logout and redirect
   - Logout error handling

4. `src/middleware.test.ts` (9 tests)
   - Protected route redirects (unauthenticated)
   - Authenticated user access
   - Login page redirect (authenticated)
   - Public route access
   - Session refresh on every request

### Mock Strategy

**Supabase clients mocked using Vitest:**
```typescript
const mockSignInWithOtp = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}));
```

**Why this works:**
- Avoids actual Supabase calls in tests
- Allows testing error scenarios
- Fast test execution
- No external dependencies

### Manual Testing Checklist

**Login flow:**
- ✅ Magic link email arrives in inbox
- ✅ Email sender is ansible@hultberg.org
- ✅ Link clicks redirect to /summaries
- ✅ Session persists across page reloads

**Protected routes:**
- ✅ Unauthenticated users redirected to /login
- ✅ Return URL preserved in redirect
- ✅ After login, user returns to intended page

**Logout:**
- ✅ Logout button clears session
- ✅ Redirects to /login
- ✅ Cannot access /summaries after logout

**Error handling:**
- ✅ Expired links show error message
- ✅ Invalid codes handled gracefully

---

## Implementation Gotchas

### 1. Async Server Client

**Issue:** In Next.js 15+, `cookies()` returns a Promise

**Solution:** Make `createClient()` async and await it:
```typescript
// ❌ Wrong
const supabase = createClient();

// ✅ Correct
const supabase = await createClient();
```

**Affected files:** All API routes using server client

### 2. Suspense Boundary Required

**Issue:** `useSearchParams()` requires Suspense in Next.js App Router

**Error:** "useSearchParams() should be wrapped in a suspense boundary"

**Solution:** Wrap component using `useSearchParams` in `<Suspense>`:
```typescript
export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />  {/* Uses useSearchParams */}
    </Suspense>
  );
}
```

### 3. Middleware Response Must Be Returned

**Issue:** Middleware creates a response object that must be returned

**Wrong:**
```typescript
const { supabase } = createClient(request);
// Lost cookie updates!
return NextResponse.next();
```

**Correct:**
```typescript
const { supabase, response } = createClient(request);
// Cookie updates preserved
return response;
```

### 4. Environment Variables in Build Phase

**Issue:** Cloudflare secrets not available during Next.js build

**Solution:** Already handled in Phase 1 with build-time skip:
```typescript
if (process.env.NEXT_PHASE === 'phase-production-build') {
  return { /* empty values */ } as Env;
}
```

### 5. Middleware Matcher Configuration

**Issue:** Middleware runs on ALL routes by default (including static files)

**Solution:** Configure matcher to exclude static assets:
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
```

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       │   ├── route.ts          # Magic link sender
│   │       │   └── route.test.ts
│   │       ├── callback/
│   │       │   ├── route.ts          # Link verifier
│   │       │   └── route.test.ts
│   │       └── logout/
│   │           ├── route.ts          # Logout handler
│   │           └── route.test.ts
│   ├── login/
│   │   └── page.tsx                  # Login UI
│   └── summaries/
│       └── page.tsx                  # Placeholder (Phase 3)
├── middleware.ts                     # Route protection
├── middleware.test.ts
└── utils/
    └── supabase/
        ├── client.ts                 # Browser client
        ├── server.ts                 # Server client
        └── middleware.ts             # Middleware client
```

---

## Next Steps (Phase 3)

Phase 3 (Reader Integration) will:
1. Replace `/summaries` placeholder with actual summaries list
2. Integrate Readwise Reader API
3. Fetch and display unread items
4. Use authenticated user session for data access

**Authentication considerations for Phase 3:**
- Use server client in Server Components
- Access session in API routes
- User ID available via `session.user.id`
- All data queries will be user-scoped (even though single-user app)

---

## Related Documentation

- **Phase 2 Specification**: [SPECIFICATIONS/ARCHIVE/02-authentication.md](../SPECIFICATIONS/ARCHIVE/02-authentication.md)
- **Environment Setup**: [environment-setup.md](./environment-setup.md)
- **Testing Strategy**: [testing-strategy.md](./testing-strategy.md)
- **Phase 1 Implementation**: [phase-1-completion-summary.md](./phase-1-completion-summary.md)
