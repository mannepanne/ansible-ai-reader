# Database Schema
REFERENCE > Architecture > Database Schema

Complete database schema with tables, relationships, indexes, and RLS policies.

## Database Platform
**Supabase** (PostgreSQL) with Row-Level Security (RLS) enabled on all tables.

## Tables

### users
Managed by Supabase Auth with custom columns for user settings.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  sync_interval INTEGER DEFAULT 0, -- Hours between auto-syncs (0 = disabled)
  summary_prompt TEXT, -- Custom AI summary prompt (10-2000 chars)
  last_auto_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Columns:**
- `id` - User UUID from Supabase Auth
- `email` - User email (required for upsert operations)
- `sync_interval` - Hours between automated syncs (0-24, 0 = disabled)
- `summary_prompt` - Custom prompt for AI summaries (optional, 10-2000 chars)
- `last_auto_sync_at` - Timestamp of last automated sync (updated by cron)

**RLS Policy:**
```sql
-- Users can read/update their own record
CREATE POLICY "Users can manage own record" ON users
  FOR ALL USING (auth.uid() = id);
```

**Note:** Settings API uses service role client to bypass RLS because cookie-based auth doesn't pass JWT to Postgres. Auth is verified at API level first.

### reader_items
Articles synced from Readwise Reader with AI-generated summaries and tags.

```sql
CREATE TABLE reader_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reader_id TEXT NOT NULL, -- Readwise item ID
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  word_count INTEGER,
  summary TEXT, -- AI-generated summary from Perplexity
  tags TEXT[], -- AI-generated tags (3-10)
  content_truncated BOOLEAN DEFAULT FALSE, -- True if content > 30k chars
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, reader_id) -- Prevent duplicate items
);
```

**Indexes:**
```sql
CREATE INDEX idx_reader_items_user_id ON reader_items(user_id);
CREATE INDEX idx_reader_items_user_archived ON reader_items(user_id, archived);
CREATE INDEX idx_reader_items_reader_id ON reader_items(reader_id);
```

**RLS Policy:**
```sql
-- Users can only access their own items
CREATE POLICY "Users can manage own items" ON reader_items
  FOR ALL USING (auth.uid() = user_id);
```

### jobs
Queue job tracking for async summary generation.

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reader_item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  sync_log_id UUID REFERENCES sync_log(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_sync_log_id ON jobs(sync_log_id);
```

**RLS Policy:**
```sql
-- Users can only access their own jobs
CREATE POLICY "Users can manage own jobs" ON jobs
  FOR ALL USING (auth.uid() = user_id);
```

**Job Lifecycle:**
1. **pending** - Job created, waiting in queue
2. **processing** - Consumer worker picked up the job
3. **completed** - Summary generated successfully
4. **failed** - All retry attempts exhausted (moved to DLQ)

### sync_log
History of sync operations for progress tracking and analytics.

```sql
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  items_fetched INTEGER DEFAULT 0,
  jobs_created INTEGER DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0, -- Perplexity API token usage
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX idx_sync_log_user_id ON sync_log(user_id);
CREATE INDEX idx_sync_log_status ON sync_log(status);
```

**RLS Policy:**
```sql
-- Users can only access their own sync logs
CREATE POLICY "Users can manage own sync logs" ON sync_log
  FOR ALL USING (auth.uid() = user_id);
```

## Relationships

```
users (1) ──── (many) reader_items
users (1) ──── (many) jobs
users (1) ──── (many) sync_log

reader_items (1) ──── (many) jobs

sync_log (1) ──── (many) jobs
```

**Cascade Behavior:**
- Deleting a user deletes all their data (CASCADE)
- Deleting a reader_item deletes associated jobs (CASCADE)
- Deleting a sync_log sets jobs.sync_log_id to NULL (SET NULL)

## Row-Level Security (RLS)

**All tables have RLS enabled** with policies ensuring users can only access their own data.

**Policy Pattern:**
```sql
CREATE POLICY "policy_name" ON table_name
  FOR ALL USING (auth.uid() = user_id);
```

**Security Note:** RLS checks `auth.uid()` which reads from the JWT in the database connection. Server-side code using cookie-based auth must use service role client to bypass RLS (after verifying auth at the application level).

## Migrations

Migrations are in `supabase/migrations/` and applied via:
```bash
supabase db push
```

**Key Migrations:**
- `20260309_initial_schema.sql` - Initial tables (users, reader_items, jobs)
- `20260313_add_sync_log.sql` - Add sync_log table and sync_log_id to jobs
- `20260324_add_auto_sync_settings.sql` - Add sync_interval, last_auto_sync_at to users

## Query Patterns

### Get User's Unarchived Items
```sql
SELECT * FROM reader_items
WHERE user_id = $1 AND archived = FALSE
ORDER BY created_at DESC;
```

### Get Sync Progress
```sql
SELECT
  sl.status,
  sl.items_fetched,
  sl.jobs_created,
  COUNT(CASE WHEN j.status = 'completed' THEN 1 END) as jobs_completed,
  COUNT(CASE WHEN j.status = 'failed' THEN 1 END) as jobs_failed
FROM sync_log sl
LEFT JOIN jobs j ON j.sync_log_id = sl.id
WHERE sl.id = $1
GROUP BY sl.id;
```

### Get Users Due for Auto-Sync
```sql
SELECT id, email, sync_interval
FROM users
WHERE sync_interval > 0
  AND (last_auto_sync_at IS NULL
       OR last_auto_sync_at < NOW() - (sync_interval || ' hours')::INTERVAL);
```

## Related Documentation
- [Overview](./overview.md) - System architecture
- [Workers](./workers.md) - How workers interact with database
- [Authentication](./authentication.md) - Auth and RLS
- [Service Role Client Pattern](../patterns/service-role-client.md) - When to bypass RLS
