# Service Role Client Pattern
REFERENCE > Patterns > Service Role Client

How and when to safely bypass Row Level Security (RLS) in Supabase.

## When to Read This
- Implementing server-side operations
- Debugging RLS policy violations
- Understanding authentication patterns
- Working with user settings or admin operations
- Encountering "new row violates row-level security policy" errors

## Related Documentation
- [Architecture - Authentication](../architecture/authentication.md) - 3 client types overview
- [Architecture - Database](../architecture/database-schema.md) - RLS policies
- [Features - Settings](../features/settings.md) - Settings API example
- [Troubleshooting - RLS](../operations/troubleshooting.md) - RLS error debugging

---

## The Problem

### Cookie-Based Auth Doesn't Pass JWT to Postgres

When using Supabase with cookie-based authentication (SSR):
1. User authenticates → Supabase Auth creates session
2. Session stored in HTTP-only cookie
3. Server-side code validates session
4. **BUT:** Cookie JWT is NOT automatically passed to Postgres
5. **Result:** RLS policies fail because `auth.uid()` returns NULL

### Example Failure

```typescript
// API route with RLS-enabled client
export async function POST(req: NextRequest) {
  const supabase = createServerClient(req);
  const session = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // This FAILS with RLS error!
  const { error } = await supabase
    .from('users')
    .upsert({
      id: session.user.id,
      sync_interval: 2,
    });

  // Error: new row violates row-level security policy for table "users"
}
```

**Why it fails:**
- RLS policy expects `auth.uid()` to match `user_id`
- Cookie auth doesn't pass JWT to Postgres
- `auth.uid()` returns NULL
- Policy check fails

---

## The Solution: Service Role Client

### What It Is

A Supabase client that uses the **service role key** instead of the user's JWT:
- Bypasses ALL RLS policies
- Has full database access
- Should only be used on the server
- NEVER exposed to clients

### When to Use It

**✅ Safe to use when:**
1. **Already verified auth at API level** - Session validated before using service client
2. **Trusted server operation** - Running in server-side code, not client
3. **User-scoped operation** - Only affecting the authenticated user's data
4. **No alternative exists** - Cookie auth prevents normal RLS

**❌ Never use when:**
1. Client-side code
2. Without session validation first
3. Accessing other users' data without explicit authorization
4. Could use normal client with proper JWT

### How It Works

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';

export async function POST(req: NextRequest) {
  // 1. Verify session with normal client
  const supabase = createServerClient(req);
  const { data: { session }, error } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Use service role client for database operation
  const serviceClient = createServiceRoleClient();

  // 3. Explicitly scope to authenticated user
  const { error: updateError } = await serviceClient
    .from('users')
    .upsert({
      id: session.user.id,  // ← Explicitly use session user ID
      sync_interval: 2,
    });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

---

## Implementation

### Service Role Client Factory

```typescript
// src/lib/supabase/service-role-client.ts

import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with service role access (bypasses RLS).
 *
 * ⚠️ SECURITY: Only use after verifying user session at API level.
 * This client has full database access and bypasses all RLS policies.
 *
 * @returns Supabase client with service role access
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role credentials');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

### Example: Settings API

```typescript
// src/app/api/settings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';

const settingsSchema = z.object({
  sync_interval: z.number().int().min(0).max(24).optional(),
  summary_prompt: z.string().min(10).max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  // 1. Verify authentication
  const supabase = createServerClient(req);
  const { data: { session }, error: authError } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate input
  const body = await req.json();
  const validated = settingsSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.message },
      { status: 400 }
    );
  }

  // 3. Use service role client to bypass RLS
  const serviceClient = createServiceRoleClient();

  // 4. Update user settings (explicitly scoped to session user)
  const { error: updateError } = await serviceClient
    .from('users')
    .upsert({
      id: session.user.id,  // ← User from verified session
      email: session.user.email,
      ...validated.data,
    });

  if (updateError) {
    console.error('[Settings] Update failed:', updateError);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

---

## Security Considerations

### Why This Is Safe

1. **Session verified first** - User authenticated before service client used
2. **Explicitly scoped** - Only affecting `session.user.id` (authenticated user)
3. **Server-side only** - Service role key never exposed to client
4. **Minimal scope** - Only used for specific, necessary operations

### Why This Would Be Unsafe

**❌ Bad: No session verification**
```typescript
export async function POST(req: NextRequest) {
  const serviceClient = createServiceRoleClient();
  const { userId } = await req.json();  // ← User-provided!

  // DANGEROUS: No verification that requester owns this user ID
  await serviceClient.from('users').update({ ... }).eq('id', userId);
}
```

**❌ Bad: Client-side usage**
```typescript
// In React component - NEVER DO THIS
const serviceClient = createServiceRoleClient();  // ← Secret key exposed!
```

**❌ Bad: Accessing other users' data**
```typescript
export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  const serviceClient = createServiceRoleClient();

  // DANGEROUS: Accessing all users, not just authenticated user
  const { data } = await serviceClient.from('users').select('*');
}
```

### Security Checklist

Before using service role client:
- [ ] Session verified with normal Supabase client
- [ ] Running in server-side code (API route, server action, worker)
- [ ] Operation scoped to `session.user.id`
- [ ] No user-provided IDs used without verification
- [ ] Service role key never exposed to client
- [ ] Alternative using normal client considered and rejected

---

## Alternative Solutions

### When You DON'T Need Service Role Client

**1. Client-side operations:**
```typescript
// Browser code - use normal client
const supabase = createBrowserClient();
const { data } = await supabase
  .from('reader_items')
  .select('*')
  .eq('user_id', session.user.id);  // RLS handles this automatically
```

**2. JWT-based auth:**
```typescript
// If using JWT auth (not cookies), normal client works
const supabase = createClient(url, anonKey, {
  global: {
    headers: {
      Authorization: `Bearer ${userJWT}`,
    },
  },
});
```

**3. RLS policy adjustment:**
Sometimes you can fix the RLS policy instead:
```sql
-- Allow users to update their own settings
CREATE POLICY "Users can update own settings"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

### When You MUST Use Service Role Client

1. **Cookie-based SSR auth** - Cookie doesn't pass to Postgres
2. **User record creation** - User doesn't exist yet, can't use RLS
3. **Admin operations** - Legitimate cross-user operations
4. **Background workers** - No user session available

---

## Common Pitfalls

### 1. Forgetting Session Verification

```typescript
// BAD: Using service client without auth check
export async function POST(req: NextRequest) {
  const serviceClient = createServiceRoleClient();
  // ... no session verification!
}

// GOOD: Always verify first
export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return unauthorized();

  const serviceClient = createServiceRoleClient();
  // ... safe to use now
}
```

### 2. Using User-Provided IDs

```typescript
// BAD: Trusting user input
const { userId } = await req.json();
await serviceClient.from('users').update(...).eq('id', userId);

// GOOD: Use session user ID
const { user } = session;
await serviceClient.from('users').update(...).eq('id', user.id);
```

### 3. Over-Using Service Client

```typescript
// BAD: Using service client for everything
const serviceClient = createServiceRoleClient();
const items = await serviceClient.from('reader_items').select('*');

// GOOD: Use normal client when possible
const supabase = createServerClient(req);
const items = await supabase  // RLS automatically filters
  .from('reader_items')
  .select('*');
```

---

## Debugging RLS Issues

### Error: "new row violates row-level security policy"

**Check:**
1. Is this a cookie-based auth scenario? → Use service role client
2. Does RLS policy exist for this operation? → Check database policies
3. Is `auth.uid()` returning NULL? → Enable logging to verify
4. Is operation actually allowed? → Review policy conditions

**Enable RLS debugging:**
```sql
-- Check current auth.uid()
SELECT auth.uid();

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'users';

-- Test policy conditions
SELECT * FROM users WHERE auth.uid() = id;
```

### When Service Client Isn't Working

**Check:**
1. Service role key configured? → `npx wrangler secret list`
2. Key valid? → Test in Supabase dashboard
3. Table exists? → Check schema
4. Column names correct? → Check spelling

---

## Real-World Examples

### Example 1: Settings Save (Issue #41)

**Problem:** Settings API returning RLS error

**Root cause:** Cookie auth + RLS policy expecting `auth.uid()`

**Solution:**
```typescript
// src/app/api/settings/route.ts
export async function PATCH(req: NextRequest) {
  // Verify session
  const session = await verifySession(req);
  if (!session) return unauthorized();

  // Use service role client
  const serviceClient = createServiceRoleClient();
  await serviceClient.from('users').upsert({
    id: session.user.id,  // ← Session user only
    ...settings,
  });
}
```

### Example 2: Auto-Sync Endpoint

**Problem:** Cron worker needs to update `last_auto_sync_at` for users

**Solution:**
```typescript
// src/app/api/cron/auto-sync/route.ts
export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  if (!isValidCronSecret(req)) return unauthorized();

  // Service client needed: No user session in cron context
  const serviceClient = createServiceRoleClient();

  // Update all users due for sync
  await serviceClient
    .from('users')
    .update({ last_auto_sync_at: new Date() })
    .in('id', userIds);  // ← Explicitly specified user IDs
}
```

---

## Related Documentation

- [Architecture - Authentication](../architecture/authentication.md) - 3 client types
- [Architecture - Database](../architecture/database-schema.md) - RLS policies
- [Features - Settings](../features/settings.md) - Settings API implementation
- [Troubleshooting - RLS](../operations/troubleshooting.md) - RLS error solutions
- [API Validation Pattern](./api-validation.md) - Input validation with Zod
