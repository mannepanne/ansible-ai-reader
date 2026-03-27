# Automated Sync Implementation

**When to read this:** Understanding automated scheduled syncing, cron triggers, sync intervals, or settings management.

**Status:** ✅ Complete (Parts 1-3)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [phase-3-implementation.md](./phase-3-implementation.md) - Reader sync operations
- [architecture.md](./architecture.md) - System architecture overview

---

## What Was Built

Automated scheduled syncing allows users to configure Ansible to automatically fetch new items from Readwise Reader at specified intervals (1-24 hours) without manual intervention.

### Implementation Parts

This feature was built in three coordinated pull requests:

**Part 1: Database Schema** (PR #33)
- Added `sync_interval` column to `users` table (0-24 hours, 0 = disabled)
- Added `last_auto_sync_at` column to track when auto-sync last ran
- Updated database types and RLS policies

**Part 2: Cron Handler** (PR #34)
- Implemented `/api/cron/auto-sync` endpoint with secret-based auth
- Fetches users with auto-sync enabled and due for sync
- Triggers sync for each eligible user
- Configured Cloudflare Cron Trigger (hourly execution)

**Part 3: Settings UI** (PR #35)
- Settings API (`/api/settings`) with GET/PATCH operations
- Settings page (`/app/settings`) for users to configure sync interval
- Prompt injection prevention (HTML stripping, dangerous keyword detection)
- Settings link in header with responsive design

### Technology Stack

- **Cloudflare Cron Triggers** - Hourly scheduled execution
- **Zod** - Input validation with security transforms
- **Next.js App Router** - Server/client component pattern
- **Supabase** - User settings storage with RLS

---

## Architecture Overview

### Auto-Sync Flow

```
Cloudflare Cron Trigger (every hour)
  ↓
GET /api/cron/auto-sync (with CRON_SECRET header)
  ↓
1. Query users WHERE sync_interval > 0
   AND (last_auto_sync_at IS NULL OR now() - last_auto_sync_at >= sync_interval hours)
2. For each eligible user:
   - Call existing /api/reader/sync endpoint
   - Update user.last_auto_sync_at = now()
   - Log success/failure
3. Return summary: { total: N, successful: M, failed: K }
  ↓
User's items automatically synced without manual intervention
```

### Sync Interval Logic

The system uses two fields to determine when auto-sync should run:

- **sync_interval** (0-24): Hours between syncs (0 = disabled)
- **last_auto_sync_at** (timestamp): When auto-sync last ran successfully

**Eligibility criteria:**
```typescript
WHERE sync_interval > 0
  AND (
    last_auto_sync_at IS NULL                                    // Never synced
    OR EXTRACT(EPOCH FROM (NOW() - last_auto_sync_at)) / 3600   // Hours since last sync
       >= sync_interval                                          // Meets interval threshold
  )
```

### Settings Management Flow

```
User visits /settings
  ↓
GET /api/settings
  - Returns current sync_interval and summary_prompt
  - Defaults: sync_interval=0, summary_prompt=null
  ↓
User changes dropdown and clicks "Save Settings"
  ↓
PATCH /api/settings { sync_interval: 2 }
  - Validates input (0-24 range)
  - Strips HTML tags if summary_prompt provided
  - Checks for prompt injection keywords
  - Upserts to users table (creates record if not exists)
  ↓
Success message shown to user
  ↓
Auto-sync will run within next hour if sync_interval > 0
```

---

## Component Details

### 1. Cron Handler

**Location:** `src/app/api/cron/auto-sync/route.ts`

**Purpose:** Hourly cron job that triggers syncs for eligible users.

#### Authentication

Uses secret-based authentication to prevent unauthorized access:

```typescript
const cronSecret = request.headers.get('x-cron-secret');
if (cronSecret !== env.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Security:** `CRON_SECRET` is stored in Wrangler secrets and environment variables.

#### User Selection Query

Fetches users due for auto-sync:

```typescript
const { data: users } = await supabase
  .from('users')
  .select('id, email, sync_interval, last_auto_sync_at, reader_token')
  .gt('sync_interval', 0)
  .or(`last_auto_sync_at.is.null,last_auto_sync_at.lt.${sinceTimestamp}`);
```

**Key points:**
- Only users with `sync_interval > 0` (auto-sync enabled)
- Users who never synced (`last_auto_sync_at IS NULL`)
- Users whose last sync was longer than their interval ago

#### Sync Execution

For each eligible user:
1. Calls `/api/reader/sync` with user's Reader token
2. Updates `last_auto_sync_at` timestamp on success
3. Logs errors but continues processing other users

#### Cloudflare Configuration

**wrangler.toml:**
```toml
[triggers]
crons = ["0 * * * *"]  # Every hour at minute 0
```

**Production deployment:**
```bash
wrangler secret put CRON_SECRET  # Set secret in production
wrangler deploy                   # Deploy with cron trigger enabled
```

---

### 2. Settings API

**Location:** `src/app/api/settings/route.ts`

**Purpose:** CRUD operations for user settings (sync interval, summary prompt).

#### GET /api/settings

Fetches current user settings:

```typescript
// Returns defaults if user doesn't exist yet
{
  sync_interval: user?.sync_interval ?? 0,
  summary_prompt: user?.summary_prompt ?? null
}
```

**Error handling:**
- `PGRST116` error code (no rows) returns defaults gracefully
- Other database errors return 500

#### PATCH /api/settings

Updates user settings with validation:

```typescript
const SummaryPromptSchema = z
  .string()
  .min(10, 'Prompt must be at least 10 characters')
  .max(2000, 'Prompt must be under 2000 characters')
  .transform((prompt) => {
    // Strip HTML tags
    return prompt.replace(/<[^>]*>/g, '');
  })
  .refine(
    (prompt) => {
      // Prevent prompt injection
      const dangerous = ['ignore previous', 'ignore all', 'system:', 'assistant:'];
      return !dangerous.some((phrase) => prompt.toLowerCase().includes(phrase));
    },
    { message: 'Prompt contains potentially dangerous instructions' }
  );

const settingsSchema = z.object({
  sync_interval: z.number().int().min(0).max(24).optional(),
  summary_prompt: SummaryPromptSchema.optional(),
});
```

**Security features:**
- HTML tag stripping (prevents XSS)
- Prompt injection keyword detection
- Range validation (0-24 hours)
- Length validation (10-2000 chars)

**Upsert behavior:**
```typescript
await supabase.from('users').upsert(
  {
    id: session.user.id,
    email: session.user.email,
    ...validated.data,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'id' }
);
```

Creates user record if it doesn't exist, updates if it does.

---

### 3. Settings UI

**Location:** `src/app/settings/`

**Purpose:** User interface for configuring auto-sync preferences.

#### Server Component (page.tsx)

- Authenticates user (redirects to `/` if not logged in)
- Passes `userEmail` to client component
- Uses Next.js 15 App Router patterns

#### Client Component (SettingsContent.tsx)

**State management:**
```typescript
const [syncInterval, setSyncInterval] = useState<number>(0);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
```

**Sync interval options:**
- Disabled (0 hours)
- 1, 2, 3, 4, 6, 8, 12, 24 hours

**User feedback:**
- Descriptive text updates based on selected interval
- Success messages auto-dismiss after 3 seconds
- Loading states prevent double-submissions
- Error messages persist until next action

#### Header Integration

Settings link added to `Header.tsx`:

```tsx
<Link href="/settings" title="Settings">
  <span>⚙️</span>
  {!isMobile && <span>Settings</span>}
</Link>
```

**Responsive design:**
- Mobile: Gear icon only (⚙️)
- Desktop: Icon + "Settings" text

---

## Testing Strategy

### Part 1: Database Schema
- Migration file included (sync_interval, last_auto_sync_at columns)
- Types updated in database.types.ts
- No behavioral tests required (DDL changes)

### Part 2: Cron Handler (30 tests)
- Authentication (valid/invalid/missing secret)
- User selection logic (due/not due/never synced)
- Sync execution (success/failure cases)
- Error handling (missing tokens, sync failures)
- Timestamp update verification

### Part 3: Settings API (22 tests)
- GET operations (success, defaults, auth, errors)
- PATCH operations (success, validation, auth, errors)
- Boundary testing (sync_interval: 0, 24, -1, 25)
- Prompt validation (length, HTML stripping, injection keywords)
- Error handling (malformed JSON, exceptions)

**Coverage achieved:**
- `route.ts`: 100% lines, 100% branches, 100% functions
- `route.test.ts`: 100% coverage

### UI Components
- Client components (SettingsContent.tsx) follow 0% coverage pattern
- Manual testing via test plan in PR description
- Browser testing for responsive design

---

## Security Considerations

### 1. Cron Endpoint Protection
- Secret-based authentication (`x-cron-secret` header)
- Only Cloudflare cron triggers have access to secret
- Returns 401 without valid secret

### 2. Prompt Injection Prevention
- HTML tag stripping (prevents script injection)
- Keyword detection for common injection patterns
- Validation happens before database save
- User-friendly error messages (no implementation details leaked)

### 3. Rate Limiting
- Auto-sync respects existing Reader API rate limits (20 req/min)
- Cron runs hourly (not too frequent to overwhelm API)
- Users can disable auto-sync (set interval to 0)

---

## Configuration

### Environment Variables

**Required for production:**
```bash
CRON_SECRET=<random-string>  # Secret for cron endpoint authentication
```

**Setting secrets in Cloudflare:**
```bash
wrangler secret put CRON_SECRET
# Enter value when prompted
```

### Enabling Cron Trigger

**In wrangler.toml:**
```toml
[triggers]
crons = ["0 * * * *"]  # Runs every hour at minute 0
```

**Cron syntax:**
- `0 * * * *` = Every hour at minute 0
- First field: Minute (0-59)
- Second field: Hour (0-23)
- Third field: Day of month (1-31)
- Fourth field: Month (1-12)
- Fifth field: Day of week (0-7, 0 and 7 are Sunday)

---

## Future Enhancements

### Considered but deferred:
1. **More granular intervals** (15min, 30min) - May increase cron costs
2. **User-specific schedules** (sync at 9am daily) - Adds complexity
3. **Retry logic for failed syncs** - Current implementation continues on failure
4. **Email notifications** - Notify users of sync failures
5. **Sync history dashboard** - Show past sync runs and results

### Technical debt:
- Cron handler makes internal API calls (could optimize by using shared logic)
- No backoff strategy if Reader API is down
- Settings UI doesn't show next scheduled sync time

---

## Key Learnings

### 1. Cloudflare Cron Triggers
- Crons execute in production only (not in local development)
- Must use `wrangler secret` for sensitive values
- Hourly trigger is sufficient for most use cases

### 2. Prompt Injection Prevention
- HTML stripping is essential when user input goes to LLMs
- Keyword detection is first line of defense (not foolproof)
- Transform happens before refine in Zod (order matters)

### 3. Upsert Pattern
- Using `{ onConflict: 'id' }` creates record if not exists
- Essential for settings where user record may not exist yet
- Avoids race conditions with separate INSERT/UPDATE logic

### 4. Responsive Settings Link
- Icon-only on mobile saves header space
- `title` attribute provides accessibility label
- Consistent with existing header patterns (Sync button)

---

## Metrics

**Pull Requests:**
- PR #33 (Part 1): Database schema - 0 tests (DDL only)
- PR #34 (Part 2): Cron handler - 30 tests, 100% coverage
- PR #35 (Part 3): Settings UI - 22 tests, 100% coverage

**Total:**
- 52 new tests
- 344 total tests passing (292 before + 52 new)
- 100% coverage on all new route handlers
- 3 PRs merged (sequential dependencies)

**Lines of code:**
- Part 1: ~50 lines (migration + types)
- Part 2: ~170 lines implementation + ~405 lines tests
- Part 3: ~270 lines implementation + ~512 lines tests
- Total: ~1,407 lines

---

## Related Files

**Implementation:**
- `src/app/api/cron/auto-sync/route.ts` - Cron handler
- `src/app/api/settings/route.ts` - Settings API
- `src/app/settings/page.tsx` - Settings page (server)
- `src/app/settings/SettingsContent.tsx` - Settings form (client)
- `src/components/Header.tsx` - Settings link

**Tests:**
- `src/app/api/cron/auto-sync/route.test.ts` - Cron handler tests
- `src/app/api/settings/route.test.ts` - Settings API tests

**Database:**
- `supabase/migrations/20260316000000_add_auto_sync_fields.sql` - Schema migration

**Configuration:**
- `wrangler.toml` - Cron trigger configuration
- `.env.local` / `.dev.vars` - Local CRON_SECRET
