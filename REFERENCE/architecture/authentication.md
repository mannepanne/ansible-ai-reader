# Authentication
REFERENCE > Architecture > Authentication

Authentication system using Supabase Auth with magic link email flow.

## Overview
Passwordless authentication using **magic links** sent via email. Users receive a one-time link, click it, and are automatically logged in.

## Authentication Flow

```
1. User enters email → POST /api/auth/login
2. Server calls supabase.auth.signInWithOtp()
3. Supabase generates one-time token
4. Supabase sends email via Resend SMTP
5. User receives email with magic link
6. User clicks link → GET /api/auth/callback?code=TOKEN
7. Server exchanges code for session
8. Session stored in httpOnly cookie
9. Redirect to /summaries
```

## Supabase Auth Configuration

### Email Provider
**Resend** - SMTP provider configured in Supabase dashboard

**Configuration:**
- SMTP Host: `smtp.resend.com`
- SMTP Port: 465 (SSL)
- From Email: `noreply@ansible.hultberg.org`
- Reply-To: (not set)

**Email Template:**
Supabase default magic link template (customizable in dashboard).

### Auth Settings
- **Site URL**: `https://ansible.hultberg.org`
- **Redirect URLs**: `https://ansible.hultberg.org/api/auth/callback`
- **Email Confirm**: Enabled (magic link flow)
- **Auto-confirm**: Disabled (require email verification)

**Important:** Site URL caching issue - Changes to Site URL may take ~24 hours to propagate. Clear Supabase cache if magic links redirect to wrong domain.

## Client Patterns

We use **three different Supabase client patterns** depending on context:

### 1. Browser Client (`utils/supabase/client.ts`)
For client-side JavaScript in React components.

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

**Use when:**
- Client-side data fetching
- User interactions (logout, etc.)
- Real-time subscriptions (future)

**Example:**
```typescript
const supabase = createClient();
const { data, error } = await supabase
  .from('reader_items')
  .select('*')
  .eq('archived', false);
```

### 2. Server Client (`utils/supabase/server.ts`)
For API routes and server components (cookie-based sessions).

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```

**Use when:**
- API routes need user authentication
- Server-side rendering with user data
- Reading session from cookies

**Example:**
```typescript
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### 3. Service Role Client (`utils/supabase/server.ts`)
For operations that need to bypass RLS policies.

```typescript
import { createClient } from '@supabase/supabase-js';

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

**Use when:**
- Creating/updating user records (RLS bypass needed)
- Admin operations
- Background jobs that don't have user context

**⚠️ Security:** Only use after verifying authentication at application level. Never expose to client.

**Example:**
```typescript
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Auth verified, safe to use service role
const serviceClient = createServiceRoleClient();
await serviceClient.from('users').upsert({
  id: session.user.id,
  email: session.user.email,
  ...settings,
});
```

See: [Service Role Client Pattern](../patterns/service-role-client.md)

## Middleware (`src/middleware.ts`)

Protects routes by checking for valid session.

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const supabase = createServerClient(/* ... */);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protected routes require authentication
  if (!session && request.nextUrl.pathname !== '/') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/summaries', '/settings', '/api/reader/:path*', '/api/settings'],
};
```

**Protected routes:**
- `/summaries` - Main app page
- `/settings` - User settings
- `/api/reader/*` - Reader operations
- `/api/settings` - Settings API

**Public routes:**
- `/` - Login page
- `/api/auth/*` - Auth endpoints
- `/api/cron/*` - Cron endpoints (protected by CRON_SECRET)

## Session Management

### Session Storage
Sessions stored in **httpOnly cookies** for security.

**Cookie names:**
- `sb-access-token` - JWT access token
- `sb-refresh-token` - Refresh token

**Expiration:**
- Access token: 1 hour
- Refresh token: 30 days

### Session Refresh
Supabase SSR automatically handles token refresh when:
- Access token expires
- User makes authenticated request
- Refresh token is still valid

**Middleware refreshes session** on every protected route request.

## API Route Authentication Pattern

Standard pattern for all protected API routes:

```typescript
export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Route logic with session.user.id
}
```

## Logout Flow

```
1. User clicks Logout
2. Client calls /api/auth/logout
3. Server calls supabase.auth.signOut()
4. Supabase clears session cookies
5. Redirect to /
```

## Security Considerations

### Magic Link Security
- **One-time use**: Links expire after first use
- **Time-limited**: Links expire after 60 minutes
- **HTTPS only**: Links only work over HTTPS
- **Domain validation**: Redirect only to configured Site URL

### Session Security
- **httpOnly cookies**: Not accessible via JavaScript
- **Secure flag**: Cookies only sent over HTTPS
- **SameSite**: CSRF protection
- **Short-lived tokens**: Access tokens expire after 1 hour

### RLS Security
All database tables have Row-Level Security enabled. Users can only access their own data.

**RLS Limitation:** Cookie-based SSR doesn't pass JWT to Postgres, so `auth.uid()` returns null. Use service role client when RLS check fails (after verifying auth).

## Troubleshooting

### Magic Links Not Working
- Check Site URL in Supabase dashboard
- Wait 24 hours for Site URL cache to clear
- Verify Resend SMTP configuration
- Check email spam folder

### Session Expires Too Quickly
- Default: 1 hour access token, 30 days refresh token
- Middleware automatically refreshes on protected routes
- User must log in again after 30 days

### RLS Policy Violations
- Verify `auth.uid()` is being set correctly
- Check if using cookie-based client (use service role instead)
- See: [Service Role Client Pattern](../patterns/service-role-client.md)

## Related Documentation
- [Overview](./overview.md) - System architecture
- [Database Schema](./database-schema.md) - RLS policies
- [API Design](./api-design.md) - Auth patterns in APIs
- [Service Role Pattern](../patterns/service-role-client.md) - When to bypass RLS
- [Environment Setup](../operations/environment-setup.md) - Supabase configuration
