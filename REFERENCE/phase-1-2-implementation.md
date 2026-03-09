# Phase 1.2 Implementation - Supabase Database Setup

**When to read this:** Understanding the database schema, environment validation, or Supabase client usage.

**Status:** ✅ Complete (PR pending)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [phase-1-1-implementation.md](./phase-1-1-implementation.md) - Next.js scaffolding
- [environment-setup.md](./environment-setup.md) - Environment configuration guide
- [01-foundation.md](./../SPECIFICATIONS/01-foundation.md) - Full Phase 1 specification

---

## What Was Built

Phase 1.2 established the complete database schema with Row-Level Security policies and environment variable validation.

### Technology Stack

- **Supabase** - PostgreSQL database with built-in auth
- **Zod** - TypeScript-first schema validation
- **@supabase/supabase-js** - Official Supabase client library
- **Row-Level Security (RLS)** - Multi-tenant data isolation

### Database Schema

**4 tables created:**

1. **`users`** - User profiles
   - Links to Supabase Auth (`auth.uid()`)
   - Stores custom summary prompts

2. **`reader_items`** - Articles from Readwise Reader
   - Unread items, summaries, tags
   - Document notes and ratings
   - Archive status tracking

3. **`sync_log`** - Sync history and cost tracking
   - Items fetched/created/failed
   - Token usage and estimated costs

4. **`processing_jobs`** - Queue job management
   - Job status tracking (pending/processing/completed/failed)
   - Retry attempts and error messages

### Row-Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only access their own data:

**users table:**
- ✅ `SELECT` - Users can view own profile
- ✅ `INSERT` - Users can insert own profile (self-registration)
- ✅ `UPDATE` - Users can update own profile

**reader_items table:**
- ✅ `SELECT` - Users can view own items
- ✅ `INSERT` - Users can insert own items
- ✅ `UPDATE` - Users can update own items
- ✅ `DELETE` - Users can delete own items

**sync_log table:**
- ✅ `SELECT` - Users can view own sync logs
- ✅ `INSERT` - Users can insert own sync logs

**processing_jobs table:**
- ✅ `SELECT` - Users can view own processing jobs
- ✅ `INSERT` - Users can insert own processing jobs
- ✅ `UPDATE` - Queue consumers can update any job (uses service role key)

### Environment Variable Validation

**Location:** `/src/lib/env.ts`

**Validation with Zod:**
- Type-safe environment variable access
- Runtime validation on first import
- Helpful error messages for missing/invalid values

**Required variables (Phase 1.2):**
```typescript
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
RESEND_API_KEY=re_xxxxxx
```

**Validation rules:**
- `NEXT_PUBLIC_SUPABASE_URL` - Must be valid URL
- `RESEND_API_KEY` - Must start with `re_`
- All keys - Must be non-empty strings

### Supabase Client

**Location:** `/src/lib/supabase.ts`

**Two client instances:**

```typescript
import { supabase, supabaseAdmin } from '@/lib/supabase';

// Client-side (respects RLS)
const { data, error } = await supabase
  .from('reader_items')
  .select('*');

// Server-side (bypasses RLS)
const { data, error } = await supabaseAdmin
  .from('processing_jobs')
  .update({ status: 'completed' });
```

**When to use each:**
- `supabase` - Browser/client code, respects RLS policies
- `supabaseAdmin` - Server-side/queue consumers, bypasses RLS

---

## File Structure

```
ansible-ai-reader/
├── .dev.vars.example          # Template for local secrets
├── supabase/
│   └── migrations/
│       └── 20260309000001_initial_schema.sql  # Database schema + RLS
├── src/
│   └── lib/
│       ├── env.ts            # Environment validation (Zod)
│       ├── env.test.ts       # Environment validation tests (9 tests)
│       ├── supabase.ts       # Supabase client instances
│       └── supabase.test.ts  # Supabase client tests (3 tests)
```

---

## Migration File

**File:** `supabase/migrations/20260309000001_initial_schema.sql`

**Contents:**
1. Enable UUID extension
2. Create ENUMs for job_type and job_status (type-safe status fields)
3. Create 4 tables (users, reader_items, sync_log, processing_jobs)
4. Create indexes for performance
5. Enable RLS on all tables
6. Create RLS policies for multi-tenant isolation

**To apply migration:**
1. Go to Supabase Dashboard → SQL Editor
2. Paste migration SQL
3. Click "Run"

---

## Testing

**Test files:**
- `src/lib/env.test.ts` - Environment validation (9 tests)
- `src/lib/supabase.test.ts` - Supabase clients (3 tests)

**Coverage:** 100% (lines, functions, statements, branches)

**Total tests:** 20 (12 new in Phase 1.2, 8 from Phase 1.1)

**Test commands:**
```bash
npm test                  # Run all tests
npm run test:coverage     # Coverage report
```

---

## Environment Setup

### Local Development

1. **Copy template:**
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Fill in secrets:**
   - Get from Supabase Dashboard → Settings → API
   - `NEXT_PUBLIC_SUPABASE_URL` - Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Publishable/anon key
   - `SUPABASE_SECRET_KEY` - Service role key (keep secret!)
   - `RESEND_API_KEY` - From resend.com (Phase 2)

3. **Verify validation:**
   ```bash
   npm run dev
   # Should start without errors if all vars are set correctly
   ```

### Production (Cloudflare Workers)

**Set secrets with Wrangler:**
```bash
wrangler secret put SUPABASE_SECRET_KEY
# Enter secret value when prompted

wrangler secret list  # Verify secrets are set
```

---

## Database Indexes

Created for performance:

```sql
-- reader_items table
CREATE INDEX idx_user_archived ON reader_items(user_id, archived, created_at DESC);
CREATE INDEX idx_user_tags ON reader_items USING GIN(tags);

-- processing_jobs table
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_user ON processing_jobs(user_id, status);
```

**Why these indexes:**
- `idx_user_archived` - Fast filtering by user and archive status
- `idx_user_tags` - Fast tag-based search (GIN index for arrays)
- `idx_processing_jobs_status` - Queue consumers query by status
- `idx_processing_jobs_user` - Users view their own job history

---

## Key Decisions

### 1. Updated Environment Variable Names

**Old names (spec):**
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**New names (implemented):**
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Clearer, matches Supabase dashboard
- `SUPABASE_SECRET_KEY` - Clearer intention (must be kept secret)

**Why:** Aligns with Supabase's updated terminology (they recommend new names).

### 2. Lazy Environment Validation

Environment validation runs on **first access** (via Proxy), not on import or app startup.

**Implementation:**
```typescript
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    if (!cachedEnv) {
      cachedEnv = validateEnv();  // Validates on first property access
    }
    return cachedEnv[prop as keyof Env];
  },
});
```

**Benefits:**
- **Test-friendly**: Tests can mock `process.env` before validation runs
- **No import side effects**: Importing the module doesn't throw errors
- **Cleaner error messages**: Validation happens when env is actually used
- **Single validation**: Cached result reused for all subsequent accesses

**Trade-off:** Validation doesn't happen at app startup, so errors appear during first use rather than immediately. This is acceptable because:
1. Most Next.js apps access env vars during initial render/startup anyway
2. The error messages clearly point to the missing variables
3. The test-friendliness benefit outweighs the delayed error timing

**Alternative considered:** Explicit `ensureEnvValidated()` call in app startup. Rejected because it adds boilerplate and doesn't provide significant benefit given typical Next.js usage patterns.

### 3. Single Migration File

All schema changes in one migration file for atomic application. Future migrations will be numbered sequentially (20260309000002, etc.).

### 4. PostgreSQL ENUMs for Status Fields

Used PostgreSQL ENUM types for `job_type` and `job_status` columns instead of plain text:

```sql
CREATE TYPE job_type_enum AS ENUM ('summary_generation', 'archive_sync');
CREATE TYPE job_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
```

**Benefits:**
- Database enforces valid values (prevents typos like `'complted'`)
- Self-documenting schema
- Better error messages at database level
- Type safety without application-level validation

**Trade-off:** Harder to add new enum values (requires `ALTER TYPE`), but acceptable since job types are relatively stable.

---

## What's NOT Included (Phase 1.3)

Phase 1.2 is **database setup only**. Still needed:

- ❌ Cloudflare Queues configuration (Phase 1.3)
- ❌ Queue consumer implementation (Phase 1.3)
- ❌ Resend email setup (Phase 2)
- ❌ Production deployment to ansible.hultberg.org (Phase 1.3)
- ❌ Readwise Reader API integration (Phase 3)
- ❌ Perplexity API integration (Phase 4)

**Next:** See [Issue #4](https://github.com/mannepanne/ansible-ai-reader/issues/4) for Phase 1.3

---

## Common Issues

### Issue: "Missing required environment variables"

**Cause:** `.dev.vars` file missing or incomplete

**Fix:**
1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in all required values from Supabase dashboard
3. Restart dev server

### Issue: "Cannot read properties of undefined"

**Cause:** Trying to access `env` before validation runs

**Fix:** Import from `@/lib/env` and access properties directly:
```typescript
import { env } from '@/lib/env';
console.log(env.NEXT_PUBLIC_SUPABASE_URL);  // ✓ Correct
```

### Issue: "Row Level Security policy violation"

**Cause:** Using client (`supabase`) for operations that need admin access

**Fix:** Use `supabaseAdmin` for server-side operations:
```typescript
import { supabaseAdmin } from '@/lib/supabase';
// Queue consumer updating job status
await supabaseAdmin
  .from('processing_jobs')
  .update({ status: 'completed' });
```

---

## Next Steps

**Phase 1.3** (next): Cloudflare Queues and Production Deployment
- Configure Cloudflare Queues
- Implement queue consumer
- Set up Resend email (for Phase 2)
- Deploy to ansible.hultberg.org
- Production smoke tests
- See [Issue #4](https://github.com/mannepanne/ansible-ai-reader/issues/4)

---

## Git Workflow

**Branch:** `phase-1-2-database`
**PR:** Pending creation
**Commits:** TBD

**Files added:**
- `.dev.vars.example` - Secret template
- `supabase/migrations/20260309000001_initial_schema.sql` - Database schema
- `src/lib/env.ts` - Environment validation
- `src/lib/env.test.ts` - Environment tests
- `src/lib/supabase.ts` - Supabase clients
- `src/lib/supabase.test.ts` - Supabase client tests

**Files modified:**
- `package.json` - Added zod, @supabase/supabase-js dependencies

---

## Coverage Report

**Phase 1.2 coverage:**
```
File               | % Stmts | % Branch | % Funcs | % Lines
-------------------|---------|----------|---------|--------
All files          |     100 |      100 |     100 |     100
 src/lib           |     100 |      100 |     100 |     100
  env.ts           |     100 |      100 |     100 |     100
  env.test.ts      |     100 |      100 |     100 |     100
  supabase.ts      |     100 |      100 |     100 |     100
  supabase.test.ts |     100 |      100 |     100 |     100
```

**Total project coverage (Phase 1.1 + 1.2):** 100% ✅
