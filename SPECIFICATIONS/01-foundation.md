# Phase 1: Foundation

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: None
**Estimated Effort**: Week 1-2

---

## Overview

Set up the basic Next.js application structure with Cloudflare Workers deployment, Tailwind CSS styling, and Supabase database. By the end of this phase, we should have a "hello world" deployed to ansible.hultberg.org with database schema in place.

---

## Scope & Deliverables

### Core Tasks
- [ ] Initialize Next.js 14+ project with App Router
- [ ] Configure `@cloudflare/next-on-pages` adapter
- [ ] Set up Tailwind CSS (copy base styles from hultberg.org/updates)
- [ ] Create Supabase project
- [ ] Implement database schema (users, reader_items, sync_log, processing_jobs)
- [ ] Configure Row-Level Security (RLS) policies
- [ ] Set up Cloudflare Queues for async processing
- [ ] Set up Resend for email delivery
- [ ] Deploy basic "hello world" to ansible.hultberg.org
- [ ] Configure environment variables (local + production)
- [ ] Implement environment variable validation on startup

### Out of Scope
- Authentication implementation (Phase 2)
- Any API integrations (Phases 3-4)
- UI components beyond basic layout

---

## Database Schema

### Table: `users`
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  summary_prompt text
);
```

### Table: `reader_items`
```sql
CREATE TABLE reader_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reader_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  author text,
  source text,
  content_type text,
  content text,

  short_summary text,
  long_summary text,
  tags text[],
  perplexity_model text,

  document_note text,
  rating integer,
  archived boolean DEFAULT false,
  archived_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  UNIQUE(user_id, reader_id)
);

CREATE INDEX idx_user_archived ON reader_items(user_id, archived, created_at DESC);
CREATE INDEX idx_user_tags ON reader_items USING GIN(tags);
```

### Table: `sync_log`
```sql
CREATE TABLE sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  sync_type text,
  items_fetched integer,
  items_created integer,
  items_failed integer DEFAULT 0,
  errors jsonb,
  token_usage jsonb,
  estimated_cost decimal(10, 4),
  created_at timestamp with time zone DEFAULT now()
);
```

### Table: `processing_jobs`
```sql
CREATE TABLE processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reader_item_id uuid REFERENCES reader_items(id) ON DELETE CASCADE,
  job_type text NOT NULL,  -- 'summary_generation', 'archive_sync', etc.
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_user ON processing_jobs(user_id, status);
```

### Row-Level Security (RLS)

**reader_items table:**
```sql
ALTER TABLE reader_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items"
  ON reader_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON reader_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON reader_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON reader_items FOR DELETE
  USING (auth.uid() = user_id);
```

**users table:**
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

**sync_log table:**
```sql
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
  ON sync_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs"
  ON sync_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**processing_jobs table:**
```sql
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own processing jobs"
  ON processing_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processing jobs"
  ON processing_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Queue consumers can update jobs"
  ON processing_jobs FOR UPDATE
  USING (true);  -- Queue consumer uses service role
```

---

## Cloudflare Queues Setup

### Why Queues?

**Problem**: Cloudflare Workers have CPU time limits (10-50ms free tier, 50ms+ paid). Synchronous summary generation during sync will timeout for even 5-10 items.

**Solution**: Use Cloudflare Queues for async processing:
1. **Sync endpoint**: Fetch items from Reader → enqueue for processing → return immediately
2. **Queue consumer**: Process items in background, generate summaries
3. **Polling endpoint**: Check processing status

### Queue Configuration

**Create queue via Cloudflare CLI**:
```bash
wrangler queues create ansible-processing-queue
```

**Bind queue to Worker in `wrangler.toml`**:
```toml
[[queues.producers]]
queue = "ansible-processing-queue"
binding = "PROCESSING_QUEUE"

[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 10
max_batch_timeout = 30
```

### Queue Message Schema

**Message sent to queue**:
```typescript
interface QueueMessage {
  jobId: string;           // UUID from processing_jobs table
  userId: string;          // User ID
  readerItemId: string;    // reader_items.id
  jobType: 'summary_generation' | 'archive_sync';
  payload: {
    // For summary_generation:
    title?: string;
    author?: string;
    content?: string;
    url?: string;

    // For archive_sync:
    readerId?: string;
  };
}
```

### Queue Consumer Implementation

**Location**: `/src/queue-consumer.ts`

**Responsibilities**:
1. Receive batch of messages from queue
2. Process each job (generate summary, sync archive, etc.)
3. Update `processing_jobs` table with status
4. Retry failed jobs (up to `max_attempts`)
5. Log errors to `sync_log`

**Pseudo-code**:
```typescript
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { jobId, userId, readerItemId, jobType, payload } = message.body;

      try {
        // Update status to 'processing'
        await updateJob(jobId, { status: 'processing', started_at: new Date() });

        // Process based on job type
        if (jobType === 'summary_generation') {
          const summary = await generateSummary(payload);
          await storeSummary(readerItemId, summary);
        }

        // Mark as completed
        await updateJob(jobId, { status: 'completed', completed_at: new Date() });
        message.ack();
      } catch (error) {
        // Increment attempts
        const job = await getJob(jobId);
        if (job.attempts >= job.max_attempts) {
          await updateJob(jobId, { status: 'failed', error_message: error.message });
          message.ack();  // Don't retry
        } else {
          await updateJob(jobId, { attempts: job.attempts + 1 });
          message.retry();  // Retry with exponential backoff
        }
      }
    }
  }
}
```

### Environment Variables

Add to `.dev.vars` (local) and Cloudflare Workers secrets (production):
```bash
PROCESSING_QUEUE=ansible-processing-queue
```

---

## Database Migration Strategy

### Migration Files

Use Supabase migrations to track schema changes:

**Create migration**:
```bash
supabase migration new initial_schema
```

**Migration file** (`supabase/migrations/20260308_initial_schema.sql`):
```sql
-- All CREATE TABLE statements
-- All CREATE INDEX statements
-- All ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- All CREATE POLICY statements
```

### Rollback Strategy

- Keep migrations in version control
- Test migrations locally before production
- Document rollback steps for each migration
- Use Supabase dashboard to rollback if needed

### Testing Migrations

```bash
# Apply migrations locally
supabase migration up

# Rollback migration
supabase migration down

# Reset database (WARNING: destructive)
supabase db reset
```

---

## Environment Variable Validation

### Startup Validation

**Location**: `/src/lib/env.ts`

**Required environment variables**:
```typescript
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',  // Changed from ANON_KEY
  'SUPABASE_SECRET_KEY',                   // Changed from SERVICE_ROLE_KEY
  'RESEND_API_KEY',
  'READER_API_TOKEN',      // Phase 3
  'PERPLEXITY_API_KEY',    // Phase 4
  'PROCESSING_QUEUE',      // Queue binding
] as const;
```

**Note on Supabase key naming:** Using `PUBLISHABLE_KEY` and `SECRET_KEY` instead of Supabase's older `ANON_KEY` and `SERVICE_ROLE_KEY` terminology to align with their 2025+ dashboard naming conventions. These are functionally equivalent - the publishable key is client-safe, while the secret key bypasses Row-Level Security and must be kept server-side only.

```typescript
function validateEnv() {
  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `See REFERENCE/environment-setup.md for configuration details.`
    );
  }
}

// Call on app startup
validateEnv();
```

### Phase-Specific Variables

- **Phase 1**: Supabase, Resend
- **Phase 3**: Add `READER_API_TOKEN`
- **Phase 4**: Add `PERPLEXITY_API_KEY`

Update validation function as new variables are added.

---

## Testing Strategy

**Philosophy**: Tests provide validation AND directional context for development. See [testing-strategy.md](../REFERENCE/testing-strategy.md) for full details.

### Required Tests

**1. Database Schema Tests**
- [ ] Tables created successfully (users, reader_items, sync_log, processing_jobs)
- [ ] Indexes exist and are performant
- [ ] RLS policies enforce user isolation for all tables
- [ ] Unique constraints work as expected
- [ ] Migration can be applied and rolled back

**2. Deployment Tests**
- [ ] Next.js builds successfully with Cloudflare adapter
- [ ] Build output fits within Workers size limits
- [ ] Basic route renders at ansible.hultberg.org
- [ ] Environment variables accessible in Workers runtime

**3. Integration Tests**
- [ ] Supabase client connects successfully
- [ ] Database queries work from Workers environment
- [ ] Tailwind CSS loads and renders correctly
- [ ] Environment variable validation fails on missing vars
- [ ] Environment variable validation passes with all vars set

**4. Queue Tests**
- [ ] Queue binding accessible in Workers environment
- [ ] Messages can be sent to queue
- [ ] Queue consumer receives and processes messages
- [ ] Failed jobs retry correctly (up to max_attempts)
- [ ] Processing jobs table updates correctly

### Test Commands
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode during development
npm run test:coverage     # Coverage report (target: 95%+ lines/functions/statements)
npx tsc --noEmit          # Type checking (must pass before commit)
```

**Coverage Target**: 100% for new code (enforced minimums: 95% lines/functions/statements, 90% branches)

---

## Pre-Commit Checklist

Before creating a PR for this phase:

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Database migrations applied successfully
- [ ] Migration rollback tested
- [ ] RLS policies tested and working for all tables
- [ ] Cloudflare Queue created and bound to Worker
- [ ] Queue consumer tested with sample messages
- [ ] Environment variable validation tested (missing vars fail, complete vars pass)
- [ ] Environment variables documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] "Hello world" deployed and accessible at ansible.hultberg.org
- [ ] No secrets committed to repository

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 1: Foundation - Next.js + Cloudflare + Supabase setup`

**PR Description Template**:
```markdown
## Summary
Completes Phase 1: Foundation setup for Ansible project.

## What's Included
- Next.js 14+ with App Router
- Cloudflare Workers adapter configured
- Tailwind CSS setup (base styles from hultberg.org/updates)
- Supabase database with schema and RLS policies
- Resend email configuration
- Deployed to ansible.hultberg.org

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: deployment accessible

## Environment Variables Required
See [environment-setup.md](../REFERENCE/environment-setup.md) for configuration details.

## Next Steps
Phase 2: Authentication (magic link implementation)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 1 is complete when:

1. ✅ Next.js app builds and deploys to Cloudflare Workers
2. ✅ ansible.hultberg.org shows a basic "hello world" page
3. ✅ Database schema created in Supabase with RLS enabled for all tables
4. ✅ Database migrations working (apply and rollback)
5. ✅ Cloudflare Queue created and bound to Worker
6. ✅ Queue consumer deployed and tested
7. ✅ Environment variable validation working
8. ✅ All tests passing with 95%+ coverage
9. ✅ Environment variables documented
10. ✅ No secrets in repository
11. ✅ PR merged to main branch

---

## Technical Considerations

### Cloudflare Workers Constraints
- **Build size**: Monitor bundle size (Workers have size limits)
- **Runtime compatibility**: Test database connections work in Workers environment
- **Cold starts**: Acceptable for MVP, optimize later if needed
- **CPU time limits**: 10-50ms (free), 50ms+ (paid) - reason for async queue architecture
- **Queue processing**: Consumers have higher time limits (30s+ batch timeout)

### Cloudflare Queues
- **Message retention**: 4 days (standard tier)
- **Batch processing**: Configure `max_batch_size` and `max_batch_timeout`
- **Retries**: Automatic with exponential backoff (up to max_attempts)
- **Dead letter queue**: Not configured initially, add if needed
- **Cost**: $0.40 per million operations (very low for single-user app)

### Supabase Configuration
- Use free tier initially (500MB database, 2GB bandwidth)
- Configure connection pooling if needed
- Document backup/restore strategy

### Security
- Store all API keys/secrets in environment variables
- Never commit `.env` files
- Use Cloudflare Workers secrets for production

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Next.js on Pages**: https://github.com/cloudflare/next-on-pages
- **Supabase Docs**: https://supabase.com/docs
