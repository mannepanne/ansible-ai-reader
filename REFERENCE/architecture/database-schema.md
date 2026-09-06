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
  relay_engagement_gate_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- Relay 2.3b auto-trigger (owner's row only)
  fika_hour INTEGER CHECK (fika_hour BETWEEN 0 AND 23), -- Fika send hour, local; NULL = off
  timezone TEXT NOT NULL DEFAULT 'Europe/London', -- IANA zone for Fika and reading days
  weekly_target INTEGER NOT NULL DEFAULT 5 CHECK (weekly_target BETWEEN 1 AND 7), -- reading days per week
  drift_days INTEGER NOT NULL DEFAULT 0 CHECK (drift_days >= 0), -- river mode (slice 1b); 0 = off
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
- `relay_engagement_gate_enabled` - Relay Stage 2.3b engagement-gated auto-trigger toggle, default off. Meaningful only on the Relay owner's row (`RELAY_OWNER_USER_ID`); flipped from the admin Relay tab.
- `fika_hour`, `timezone`, `weekly_target` - Fika settings (see [fika.md](../features/fika.md)). `drift_days` is reserved for river mode (slice 1b) and is 0 (off) until that ships.

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
  short_summary TEXT, -- AI-generated summary from Perplexity
  tags TEXT[], -- AI-generated tags (3-10)
  content_truncated BOOLEAN DEFAULT FALSE, -- True if content > 30k chars
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE,
  archive_reason TEXT CHECK (archive_reason IN ('user', 'drift')), -- who archived: any user action (incl. Reader-side) or river-mode drift; NULL before 2026-09
  reader_deleted BOOLEAN NOT NULL DEFAULT FALSE, -- Item gone from Reader (deleted); set by manual archive + consumer auto-archive
  highlights_count INTEGER NOT NULL DEFAULT 0, -- Relay 2.3b: retained from archive response (filter input)
  reader_note TEXT, -- Relay 2.3b: Reader-authored note retained from archive response (filter + stimulus)
  relay_triggered_at TIMESTAMP WITH TIME ZONE, -- Relay 2.3b work-queue marker; NULL = archived-not-yet-evaluated
  relay_gate_code TEXT CHECK (relay_gate_code IN ('reacted','no_signal','vetoed')), -- Relay 2.3c gate outcome; NULL = unevaluated (incl. baselined)
  relay_gate_signals JSONB NOT NULL DEFAULT '[]'::jsonb, -- Relay 2.3c: engagement signal codes present at gate-eval (activity log)
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
-- Relay 2.3b: partial index keeping the trigger-eval standing scan cheap (indexes only pending rows)
CREATE INDEX reader_items_relay_pending_idx ON reader_items(user_id)
  WHERE archived = true AND relay_triggered_at IS NULL;
-- Relay 2.3c: partial index for the activity-log skip query + skip-count stat (indexes only skipped rows)
CREATE INDEX reader_items_relay_skip_idx ON reader_items(relay_triggered_at DESC)
  WHERE relay_gate_code IN ('no_signal', 'vetoed');
```

**RLS Policy:**
```sql
-- Users can only access their own items
CREATE POLICY "Users can manage own items" ON reader_items
  FOR ALL USING (auth.uid() = user_id);
```

### processing_jobs
Queue job tracking for async summary generation and tag regeneration.

```sql
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reader_item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  job_type job_type_enum NOT NULL, -- 'summary_generation' | 'tags_generation' | 'archive_sync'
  status job_status_enum NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  sync_log_id UUID REFERENCES sync_log(id) ON DELETE SET NULL, -- For sync operations
  regenerate_batch_id TEXT, -- For tag regeneration progress tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);
```

**Columns:**
- `job_type` - Type of job: `summary_generation` (AI summary + tags from article content), `tags_generation` (tags only, derived from existing summary), or `archive_sync` (archive in Reader)
- `status` - Current state: `pending`, `processing`, `completed`, `failed`
- `sync_log_id` - Links to sync operation (for jobs created during sync)
- `regenerate_batch_id` - Groups jobs from "Regenerate Tags" operation (enables progress tracking)
- `attempts` - Retry count (max 3)
- `max_attempts` - Maximum retries before marking as failed

**Indexes:**
```sql
CREATE INDEX idx_processing_jobs_user ON processing_jobs(user_id, status);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_sync_log_id ON processing_jobs(sync_log_id);
CREATE INDEX idx_processing_jobs_regenerate_batch_id
  ON processing_jobs(regenerate_batch_id)
  WHERE regenerate_batch_id IS NOT NULL; -- Partial index for performance
```

**RLS Policy:**
```sql
-- Users can view own jobs
CREATE POLICY "Users can view own processing jobs" ON processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert own jobs
CREATE POLICY "Users can insert own processing jobs" ON processing_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Queue consumers can update jobs
CREATE POLICY "Queue consumers can update jobs" ON processing_jobs
  FOR UPDATE USING (true); -- Queue consumer uses service role key
```

**Job Lifecycle:**
1. **pending** - Job created, waiting in queue
2. **processing** - Consumer worker picked up the job
3. **completed** - Summary generated successfully
4. **failed** - All retry attempts exhausted (moved to DLQ)

**Batch Tracking:**
- `sync_log_id` - Used for sync operations (track all jobs in a sync)
- `regenerate_batch_id` - Used for tag regeneration (track all jobs in a regeneration)

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

### item_signals
Append-only engagement event log. Each user action that signals interest in an item generates a row. Never updated or deleted — full history is preserved.

```sql
CREATE TABLE item_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'click_through',
    'note_added',
    'rated_interesting',
    'rated_not_interesting'
  )),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'fika')), -- surface the action came from
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Source:** `web` for the summaries page, `fika` for the daily email's buttons. Fika-sourced signals are the trial's success measure ([fika.md](../features/fika.md#measuring-the-trial)).

**Signal types (Phase 1):**
- `click_through` — User clicked "Open in Reader" (every click recorded, no deduplication)
- `note_added` — User saved a note for the first time on this item (not on edits)
- `rated_interesting` — User rated the item 💡 (recorded for every rating change, including toggles)
- `rated_not_interesting` — User rated the item 🤷 (same)

**Phase 2 signal types** (pending #26 archive sync): `reader_highlights`, `reader_inline_notes`

**Indexes:**
```sql
CREATE INDEX item_signals_item_id_idx ON item_signals(item_id);
CREATE INDEX item_signals_user_id_idx ON item_signals(user_id);
CREATE INDEX item_signals_signal_type_idx ON item_signals(signal_type);
CREATE INDEX item_signals_created_at_idx ON item_signals(created_at);
```

**RLS Policy:**
```sql
-- Append-only: users can insert and read own signals, no update or delete
CREATE POLICY "Users can insert own signals" ON item_signals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own signals" ON item_signals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
```

**Design rationale:** Append-only event log (not current-state). Enables future pattern analysis of `signals × tags` to surface which topics consistently trigger engagement. `reader_items.rating` remains the authoritative current rating state; `item_signals` records the full history.

---

### fika_batches / fika_batch_items
Today's Fika for a user: one batch per user per local date, with up to two items in slots.

```sql
CREATE TABLE fika_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_date DATE NOT NULL,             -- the user's local date
  sent_at TIMESTAMPTZ,                  -- set only after Resend accepts the email
  send_attempts INTEGER NOT NULL DEFAULT 0,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, batch_date)
);

CREATE TABLE fika_batch_items (
  batch_id UUID NOT NULL REFERENCES fika_batches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),  -- 1 = oldest eligible, 2 = freshest
  carried_from UUID REFERENCES fika_batches(id) ON DELETE SET NULL,
  PRIMARY KEY (batch_id, item_id),
  UNIQUE (batch_id, slot)
);
```

**RLS:** owner read; all writes come from the service-role client (cron, action endpoint). Rows cascade from `users`, so account deletion covers them. See [fika.md](../features/fika.md).

---

## Relationships

```
users (1) ──── (many) reader_items
users (1) ──── (many) processing_jobs
users (1) ──── (many) sync_log
users (1) ──── (many) item_signals

reader_items (1) ──── (many) processing_jobs
reader_items (1) ──── (many) item_signals

sync_log (1) ──── (many) processing_jobs
```

**Cascade Behavior:**
- Deleting a user deletes all their data (CASCADE)
- Deleting a reader_item deletes associated processing_jobs and item_signals (CASCADE)
- Deleting a sync_log sets processing_jobs.sync_log_id to NULL (SET NULL)

## Row-Level Security (RLS)

**All user-scoped tables have RLS enabled** with policies ensuring users can only access their own data.

**Policy Pattern:**
```sql
CREATE POLICY "policy_name" ON table_name
  FOR ALL USING (auth.uid() = user_id);
```

**Security Note:** RLS checks `auth.uid()` which reads from the JWT in the database connection. Server-side code using cookie-based auth must use service role client to bypass RLS (after verifying auth at the application level).

**Exception — the `relay_*` tables** (`relay_pieces`, `relay_references`, `relay_decisions`): these belong to the Relay subsystem and are **not user-scoped** (Relay is a single-narrator namespace, not per-user data). They have **RLS enabled with ZERO policies** — so the publishable anon/authenticated key is denied *everything*, and only the service-role Relay bridge worker (which bypasses RLS) can read or write them. This deliberately keeps pending/rejected pieces and the whole namespace invisible to any browser client; *disabling* RLS would instead expose them via PostgREST. See `SPECIFICATIONS/relay/stage-1-technical-spec.md` §4.

## Migrations

Migrations are in `supabase/migrations/` and applied via:
```bash
supabase db push
```

**Key Migrations:**
- `20260309000001_initial_schema.sql` - Initial tables (users, reader_items, processing_jobs)
- `20260312_add_sync_log_id.sql` - Add sync_log_id to processing_jobs for sync tracking
- `20260321_add_reader_deleted.sql` - Add reader_deleted flag to reader_items (item gone from Reader)
- `20260324_add_auto_sync_settings.sql` - Add sync_interval, last_auto_sync_at to users
- `20260401_add_regenerate_batch_id.sql` - Add regenerate_batch_id to processing_jobs for tag regeneration tracking
- `20260411_add_item_signals.sql` - Add item_signals engagement event log table
- `20260621_add_relay_tables.sql` - Relay subsystem: pgvector + relay_pieces / relay_references / relay_decisions (RLS enabled, zero policies; service-role-only)
- `20260622_add_relay_recall_fn.sql` - `relay_recall()` ANN function (cosine UNION over references + approved pieces; service-role EXECUTE only)
- `20260707_add_agent_session_runs.sql` - Relay orchestrator run ledger (`agent_session_runs`; RLS enabled, zero policies)
- `20260709_add_relay_decision_sources.sql` - Stage 2.1 fact-grounding: `relay_decisions.sources` (jsonb) — research provenance captured on every decision, writes AND declines. Pairs with `relay_pieces.verification_status` (`unverified` \| `sourced`; `verified` reserved for the deferred re-verification pass) and `relay_pieces.links` (`[{type:'recall'|'source', ref, title?}]`)
- `20260709_add_relay_piece_review_capture.sql` - Stage 2.2a voice/editorial loop: `relay_pieces.review_note` (text) — the reviewer's "why" captured at decision time — and `relay_pieces.original_body` (text, **write-once**) — the piece as Relay first wrote it, set the first time a human edits the body on approval (the edit delta = `original_body` vs `body`). Both are Channel-2 taste signal for Magnus/curation only; **never** read on the writing-session path (recall / `relay_recall` / system-prompt assembly) — gate-blindness (`stage-1-technical-spec.md` §7/A4).
- `20260710_add_relay_engagement_columns.sql` - Stage 2.3b engagement-gated archive-hook: `reader_items.relay_triggered_at` (work-queue marker), `highlights_count` + `reader_note` (retained from the archive response, filter inputs), a partial index for the trigger-eval standing scan, and `users.relay_engagement_gate_enabled` (default-off toggle). Baselines existing archived rows on the same predicate the scan uses (`archived = true`). **Run exactly once** — the baseline UPDATE is not re-run-safe (see the file header + the [single-owner ADR](../decisions/2026-07-10-relay-single-owner-engagement-gate.md)).
- `20260712_add_relay_gate_columns.sql` - Stage 2.3c gate activity log: `reader_items.relay_gate_code` (`reacted`\|`no_signal`\|`vetoed`, NULL = unevaluated) + `relay_gate_signals` (jsonb) record the engagement gate's per-item outcome, written in the same UPDATE that stamps `relay_triggered_at`. Feeds the admin "Activity log" (gate skips shown alongside session decisions). Additive columns, re-run-safe, **no baseline UPDATE** — pre-existing rows keep `relay_gate_code` NULL so history is neither a pass nor a skip. See [stage-2.3c spec](../../SPECIFICATIONS/relay/stage-2.3c-gate-activity-log-spec.md).
- `20260725_add_relay_run_token_usage.sql` - Per-session token telemetry on the run ledger: `agent_session_runs.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (all `integer`, nullable). Server-computed session totals from `GET /v1/sessions/{id}` `.usage` (the two `cache_creation` TTL buckets collapsed into one), captured on the **idle-finalize** path only. NULL = "not measured" — failure paths (terminated / poll-cap / stale-release) leave them NULL. `cache_read_input_tokens` is the signal for whether the prompt cache was warm within a session. Additive, re-run-safe, no baseline UPDATE.

> **Note:** the `relay_*` migrations are applied via the Supabase dashboard SQL editor, not `supabase db push` — the CLI migration history is out of sync (the initial schema was created directly).

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
