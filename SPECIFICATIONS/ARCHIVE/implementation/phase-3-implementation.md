# Phase 3 Implementation - Reader Integration

**When to read this:** Understanding Reader API integration, sync operations, queue consumer, or status polling.

**Status:** ✅ Complete (Backend + UI)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [phase-1-2-implementation.md](./phase-1-2-implementation.md) - Database schema
- [phase-2-implementation.md](./phase-2-implementation.md) - Authentication
- [03-reader-integration.md](./../SPECIFICATIONS/03-reader-integration.md) - Full Phase 3 specification

---

## What Was Built

Phase 3 implements integration with Readwise Reader API to fetch unread items, store them in the database, and manage async processing via Cloudflare Queues.

### Technology Stack

- **Reader API Client** - Type-safe with Zod validation
- **p-queue** - Rate limiting (20 req/min for Reader API)
- **Cloudflare Queues** - Async job processing
- **Cloudflare Workers** - Separate consumer for queue processing
- **Zod** - Runtime validation and XSS prevention

---

## Architecture Overview

### Sync Flow

```
User clicks "Sync Reader" button
  ↓
POST /api/reader/sync
  ↓
1. Fetch unread items from Reader API (paginated)
2. For each item:
   - Upsert to reader_items table (prevents duplicates)
   - Create processing_job record
   - Enqueue message to PROCESSING_QUEUE
3. Return syncId to client
  ↓
Client polls GET /api/reader/status?syncId={syncId}
  ↓
Queue Consumer processes jobs asynchronously
  - Phase 3: Marks jobs as "completed"
  - Phase 4: Will generate summaries via Perplexity API
```

### Data Flow

```
Readwise Reader API
  ↓
fetchUnreadItems() [Rate Limited: 20 req/min]
  ↓
reader_items table (upsert on user_id, reader_id)
  ↓
processing_jobs table (linked to sync_log via sync_log_id)
  ↓
PROCESSING_QUEUE (Cloudflare Queue)
  ↓
Queue Consumer Worker (workers/consumer.ts)
```

---

## Component Details

### 1. Reader API Client

**Location:** `src/lib/reader-api.ts`

**Purpose:** Type-safe wrapper around Readwise Reader API with validation and rate limiting.

#### Key Functions

**fetchUnreadItems(apiToken, pageCursor?)**
- Fetches unread items from Reader API
- Handles pagination automatically
- Rate limited to 20 req/min
- Returns validated response

```typescript
const response = await fetchUnreadItems(
  process.env.READER_API_TOKEN!,
  pageCursor || undefined
);

// response.results - Array of validated ReaderItem
// response.nextPageCursor - Cursor for next page (or null)
```

**archiveItem(apiToken, readerId)**
- Archives an item in Reader
- Rate limited
- Returns void on success, throws ReaderAPIError on failure

```typescript
await archiveItem(
  process.env.READER_API_TOKEN!,
  'reader-item-id'
);
```

**getQueueStatus()**
- Returns current queue size and pending count
- Useful for monitoring rate limit compliance

#### Security Features

**URL Validation:**
```typescript
const SafeUrlSchema = z.string().url().refine(
  (url) => {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  },
  { message: 'Only HTTP and HTTPS URLs are allowed' }
);
```

**HTML Sanitization:**
```typescript
function sanitizeText(text: string): string {
  // Remove script tags and their content
  let sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  return sanitized.trim();
}
```

**Applied to:**
- URLs: Only http/https allowed (prevents javascript:, data:, file:)
- Titles: HTML stripped, max 1000 chars
- Authors: HTML stripped, max 500 chars

#### Error Handling

**ReaderAPIError class:**
```typescript
class ReaderAPIError extends Error {
  statusCode?: number;
  retryable: boolean;
}
```

**Error types:**
- `401 Unauthorized` - Invalid API token (not retryable)
- `404 Not Found` - Item doesn't exist (not retryable)
- `429 Too Many Requests` - Rate limited (retries with Retry-After delay)
- `500+ Server Error` - Reader API issues (3 retries with exponential backoff)
- `Timeout` - 30s limit exceeded (3 retries)
- `Validation` - Invalid response format (not retryable)

#### Rate Limiting

**Configuration:**
```typescript
const readerQueue = new PQueue({
  concurrency: 1,      // One request at a time
  intervalCap: 20,     // Max 20 requests
  interval: 60 * 1000, // Per minute
});
```

**Usage:**
```typescript
return readerQueue.add(async () => {
  const response = await fetchWithRetry(url, options);
  // ... handle response
});
```

---

### 2. Sync Endpoint

**Location:** `src/app/api/reader/sync/route.ts`

**Purpose:** Fetch unread items from Reader and enqueue them for processing.

#### Request

```http
POST /api/reader/sync
Authorization: Required (session cookie)
```

#### Response

```json
{
  "syncId": "uuid",
  "totalItems": 10,
  "totalFetched": 10,
  "errors": 0  // Optional, only if errors occurred
}
```

#### Implementation Flow

1. **Authentication Check**
   ```typescript
   const supabase = await createClient();
   const { data: { session } } = await supabase.auth.getSession();
   if (!session) return 401;
   ```

2. **Create Sync Log**
   ```typescript
   const syncId = crypto.randomUUID();
   await supabase.from('sync_log').insert({
     id: syncId,
     user_id: userId,
     sync_type: 'reader_fetch',
     items_fetched: 0,
     items_created: 0,
     started_at: new Date().toISOString(),
   });
   ```

3. **Fetch and Process Items** (with pagination)
   ```typescript
   do {
     const response = await fetchUnreadItems(readerApiToken, pageCursor);

     for (const item of response.results) {
       // Upsert reader_item (metadata only - Reader API is source of truth for content)
       const { data: readerItem } = await supabase
         .from('reader_items')
         .upsert({
           user_id: userId,
           reader_id: item.id,
           title: item.title,
           url: item.url,
           author: item.author || null,
           source: item.source || null,
           word_count: item.word_count || null,
           created_at: item.created_at,
           // Note: content NOT stored - fetched from Reader API when needed
         }, {
           onConflict: 'user_id,reader_id',
           ignoreDuplicates: false,
         })
         .select()
         .single();

       // Create processing job
       const { data: job } = await supabase
         .from('processing_jobs')
         .insert({
           user_id: userId,
           reader_item_id: readerItem.id,
           sync_log_id: syncId,  // Links job to sync operation
           job_type: 'summary_generation',
           status: 'pending',
         })
         .select()
         .single();

       // Enqueue message
       // Phase 4 consumer will fetch content from Reader API using readerId
       const { env } = getCloudflareContext();
       await env.PROCESSING_QUEUE.send({
         jobId: job.id,
         userId: userId,
         readerItemId: readerItem.id,
         readerId: item.id, // Reader's ID for fetching content in Phase 4
         jobType: 'summary_generation',
       });
     }

     pageCursor = response.nextPageCursor;
   } while (pageCursor);
   ```

4. **Update Sync Log**
   ```typescript
   await supabase.from('sync_log').update({
     items_fetched: totalFetched,
     items_created: totalCreated,
     completed_at: new Date().toISOString(),
     errors: errors.length > 0 ? errors : null,
   }).eq('id', syncId);
   ```

#### Error Handling

**Item-level errors:**
- Continue processing remaining items
- Log error in `errors` array
- Track in sync_log.errors JSONB field

**Fatal errors:**
- Return 500 with syncId
- Update sync_log with error details
- Client can still poll status

---

### 3. Status Endpoint

**Location:** `src/app/api/reader/status/route.ts`

**Purpose:** Poll sync operation progress for UI updates.

#### Request

```http
GET /api/reader/status?syncId={uuid}
Authorization: Required (session cookie)
```

#### Response

```json
{
  "syncId": "uuid",
  "totalJobs": 10,
  "completedJobs": 7,
  "failedJobs": 1,
  "inProgressJobs": 1,
  "pendingJobs": 1,
  "status": "processing",
  "failedItems": [
    {
      "itemId": "uuid",
      "title": "Failed Article",
      "error": "Processing failed"
    }
  ]
}
```

#### Status Logic

```typescript
let status: 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';

if (totalJobs === 0) {
  status = 'pending';
} else if (completedJobs === totalJobs) {
  status = 'completed';
} else if (failedJobs === totalJobs) {
  status = 'failed';
} else if (failedJobs > 0 && completedJobs + failedJobs === totalJobs) {
  status = 'partial_failure';
} else if (inProgressJobs > 0 || completedJobs > 0) {
  status = 'processing';
} else {
  status = 'pending';
}
```

#### Failed Items

When jobs fail, the endpoint includes details:

```typescript
const { data: items } = await supabase
  .from('reader_items')
  .select('id, title')
  .in('id', failedJobIds);

for (const job of failedJobs) {
  failedItems.push({
    itemId: item.id,
    title: item.title,
    error: job.error_message || 'Unknown error',
  });
}
```

#### Client Polling Pattern

```typescript
const pollSyncStatus = async (syncId: string) => {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/reader/status?syncId=${syncId}`);
    const status = await response.json();

    updateUI(status);  // Show "Processing X of Y..."

    if (status.status === 'completed' || status.status === 'partial_failure') {
      clearInterval(interval);
      showResults(status);
    }
  }, 2000);  // Poll every 2 seconds
};
```

---

### 4. Queue Consumer

**Location:** `workers/consumer.ts`

**Purpose:** Process jobs asynchronously from PROCESSING_QUEUE.

#### Configuration

**wrangler-consumer.toml:**
```toml
name = "ansible-queue-consumer"
main = "workers/consumer.ts"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "ansible-processing-dlq"
```

#### Implementation

**Phase 3 (Current):**
```typescript
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

    for (const message of batch.messages) {
      try {
        const { jobId } = message.body;

        // Phase 3: Mark as completed without processing
        await supabase
          .from('processing_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        message.ack();
      } catch (error) {
        console.error('[Queue Consumer] Error:', error);
        message.retry();
      }
    }
  },
};
```

**Phase 4 (Future):**
- Fetch article content from Reader API using `readerId`
- Call Perplexity API to generate summary from content
- Extract tags from summary
- Update reader_items with summary and tags
- Handle errors and retry logic

**Why fetch content in Phase 4:**
- Content not stored in DB (Reader API is source of truth)
- Only fetch when actually generating summary
- Saves storage costs and queue message size

#### Deployment

```bash
# Deploy consumer worker
npm run deploy:consumer

# Local development
npm run dev:consumer
```

#### Error Handling

- **Database errors:** Retry message (up to 3 times)
- **Unexpected errors:** Retry message
- **Max retries exceeded:** Message sent to dead letter queue
- **Individual message failures:** Don't block batch processing

---

### 5. Database Migration

**Location:** `supabase/migrations/20260312_add_sync_log_id.sql`

**Purpose:** Link processing jobs to sync operations for status tracking.

```sql
-- Add sync_log_id column
ALTER TABLE processing_jobs
ADD COLUMN sync_log_id UUID REFERENCES sync_log(id) ON DELETE SET NULL;

-- Create index for faster sync status queries
CREATE INDEX idx_processing_jobs_sync_log_id ON processing_jobs(sync_log_id);

-- Add documentation
COMMENT ON COLUMN processing_jobs.sync_log_id IS
  'Links job to the sync operation that created it (for status polling)';
```

**Why needed:**
- Status endpoint needs to query jobs by sync_log_id
- Index speeds up polling queries (every 2 seconds)
- Foreign key maintains referential integrity

---

### 6. Items Endpoint

**Location:** `src/app/api/reader/items/route.ts`

**Purpose:** Fetch user's synced Reader items for display in UI.

#### Request

```
GET /api/reader/items
```

#### Response

```typescript
{
  items: ReaderItem[]  // Ordered by created_at DESC (newest first)
}
```

#### Implementation

```typescript
const { data: items } = await supabase
  .from('reader_items')
  .select('id, reader_id, title, author, source, url, word_count, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

---

### 7. Archive Endpoint

**Location:** `src/app/api/reader/archive/route.ts`

**Purpose:** Archive an item in Reader and mark as archived locally.

#### Request

```typescript
POST /api/reader/archive
{
  itemId: string  // UUID of reader_item
}
```

#### Response

```typescript
{
  success: true,
  readerDeleted?: boolean  // True if item was already deleted in Reader
}
```

#### Implementation Flow

**Transaction-like pattern:**
1. Fetch item from database (verify ownership)
2. Archive in Reader API first
3. Only if Reader succeeds, update local database with `archived_at`
4. If Reader fails, don't update local DB (rollback)

```typescript
// Archive in Reader first
let readerDeleted = false;
try {
  await archiveItem(readerApiToken, item.reader_id);
} catch (error) {
  // Special case: If item was deleted in Reader (404), still archive locally
  if (error instanceof ReaderAPIError && error.statusCode === 404) {
    console.log('[Archive] Item already deleted in Reader:', item.reader_id);
    readerDeleted = true;
  } else {
    // For other errors, fail the request
    throw error;
  }
}

// Update DB (includes reader_deleted flag if applicable)
await supabase
  .from('reader_items')
  .update({
    archived: true,
    archived_at: new Date().toISOString(),
    reader_deleted: readerDeleted,
  })
  .eq('id', itemId);
```

**Why this order:**
- If Reader API fails, item stays in local DB
- If DB update fails after Reader archives, item won't appear in Reader anymore (acceptable)
- No orphaned archived items in Reader that still show locally

**Special handling for deleted Reader items:**
- If the item was already deleted in Reader (404 error), the archive operation still succeeds locally
- The `reader_deleted` flag is set to `true` to track orphaned items
- This prevents errors when users try to archive items that were deleted directly in Reader
- Future features can filter out these items: `WHERE reader_deleted = false`
- UI shows console feedback: "Item was already deleted in Reader but archived locally"

---

### 8. Retry Endpoint

**Location:** `src/app/api/reader/retry/route.ts`

**Purpose:** Retry failed processing jobs from a sync operation.

#### Request

```typescript
POST /api/reader/retry
{
  syncId: string  // UUID of sync_log
}
```

#### Response

```typescript
{
  retriedCount: number  // Number of jobs successfully retried
}
```

#### Implementation Flow

1. Fetch all failed jobs for the sync
2. For each failed job:
   - Reset status to 'pending'
   - Clear error_message
   - Re-enqueue to PROCESSING_QUEUE
3. Return count of retried jobs

```typescript
// Reset job to pending
await supabase
  .from('processing_jobs')
  .update({ status: 'pending', error_message: null })
  .eq('id', jobId);

// Re-enqueue
await env.PROCESSING_QUEUE.send({
  jobId,
  userId,
  readerItemId,
  jobType: 'summary_generation',
  payload: { title, author, content, url }
});
```

---

### 9. Summaries UI

**Location:** `src/app/summaries/SummariesContent.tsx` (client component)

**Purpose:** Interactive UI for syncing Reader items, viewing list, and managing items.

#### Key Features

**Sync Button:**
- Triggers POST /api/reader/sync
- Shows loading spinner during sync
- Displays progress bar with polling

**Progress Indicator:**
- Polls GET /api/reader/status every 2 seconds
- Shows completed/failed/pending job counts
- Progress bar updates in real-time
- Auto-stops polling when sync complete

**Items List:**
- Displays title, author, source, word count
- Links to original URL (opens in new tab)
- Archive button per item with loading state
- Removes from list after successful archive

**Retry Button:**
- Appears when sync has failed jobs
- Shows count of failed jobs
- Triggers POST /api/reader/retry
- Resumes polling after retry

#### State Management

```typescript
const [items, setItems] = useState<ReaderItem[]>([]);
const [syncing, setSyncing] = useState(false);
const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());
```

#### Status Polling

```typescript
useEffect(() => {
  if (!syncing || !syncStatus) return;

  const pollInterval = setInterval(async () => {
    const status = await fetch(`/api/reader/status?syncId=${syncStatus.syncId}`);
    setSyncStatus(await status.json());

    if (status.status === 'completed' || status.status === 'failed') {
      setSyncing(false);
      loadItems(); // Refresh items list
    }
  }, 2000);

  return () => clearInterval(pollInterval);
}, [syncing, syncStatus]);
```

---

## Testing Strategy

### Test Coverage

**Total tests:** 120 (up from 64)
- p-queue compatibility: 6 tests
- Queue consumer: 5 tests
- Items endpoint: 4 tests
- Archive endpoint: 7 tests
- Retry endpoint: 6 tests
- Reader API client: 13 tests
- Sync endpoint: 6 tests
- Status endpoint: 9 tests

### Key Test Scenarios

**Reader API Client:**
- ✅ Successful fetch with pagination
- ✅ HTML sanitization (XSS prevention)
- ✅ URL validation (protocol filtering)
- ✅ Rate limit retry with Retry-After
- ✅ Server error retry with exponential backoff
- ✅ Timeout retry
- ✅ Validation error handling

**Sync Endpoint:**
- ✅ Successful sync with multiple items
- ✅ Pagination across multiple pages
- ✅ Authentication enforcement
- ✅ Missing API token error
- ✅ Database error handling
- ✅ Partial success (some items fail)

**Status Endpoint:**
- ✅ Pending status (no jobs started)
- ✅ Processing status (jobs in progress)
- ✅ Completed status (all jobs done)
- ✅ Partial failure (some jobs failed)
- ✅ Complete failure (all jobs failed)
- ✅ Failed items with error details
- ✅ Authentication and authorization

**Queue Consumer:**
- ✅ Batch processing
- ✅ Individual message retry on error
- ✅ Continue processing after error
- ✅ Database update errors
- ✅ Unexpected errors

---

## Environment Variables

### Required for Phase 3

```bash
# Readwise Reader API
READER_API_TOKEN=your_reader_api_token

# Existing from Phase 1/2
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
RESEND_API_KEY=re_xxx
```

### Setting Up READER_API_TOKEN

1. Go to https://readwise.io/access_token
2. Copy your API token
3. Set in Cloudflare Workers:
   ```bash
   # For Next.js worker
   npx wrangler secret put READER_API_TOKEN

   # For queue consumer worker
   npx wrangler secret put READER_API_TOKEN --config wrangler-consumer.toml
   ```

---

## Implementation Gotchas

### 1. Async Server Client Pattern

**Issue:** Next.js 15+ requires `await cookies()`

```typescript
// ❌ Wrong
export function createClient() {
  const cookieStore = cookies();  // Error in Next.js 15+

// ✅ Correct
export async function createClient() {
  const cookieStore = await cookies();
```

### 2. Queue Message Schema

**Lean queue messages - Reader API as source of truth:**

```typescript
interface QueueMessage {
  jobId: string;
  userId: string;
  readerItemId: string; // Local DB ID
  readerId: string;     // Reader API ID for fetching content
  jobType: 'summary_generation';
}
```

**Why important:**
- Consumer expects this exact format
- TypeScript types provide compile-time safety
- Phase 4 consumer will fetch content from Reader API using readerId
- Avoids storing 100KB-1MB of content per article in queue messages

**Storage savings:**
- Before: ~100KB-1MB per article × thousands = GBs of queue bloat
- After: Just IDs (~100 bytes per message)

### 3. Upsert Conflict Handling

**Prevent duplicate items:**

```typescript
await supabase
  .from('reader_items')
  .upsert(data, {
    onConflict: 'user_id,reader_id',  // UNIQUE constraint
    ignoreDuplicates: false,           // Update existing
  })
  .select()
  .single();
```

**Why important:**
- Same item could be synced multiple times
- UNIQUE constraint prevents duplicates
- `ignoreDuplicates: false` updates existing records

### 4. Rate Limiting

**Critical for Reader API compliance:**

```typescript
const readerQueue = new PQueue({
  concurrency: 1,
  intervalCap: 20,     // Max 20 requests
  interval: 60 * 1000, // Per minute
});
```

**Reader API limits:**
- Fetch: 20 requests/minute
- Update: 600 requests/hour

**Exceeding limits:**
- 429 Too Many Requests response
- Automatic retry with Retry-After header

### 5. Pagination Memory

**Issue:** Fetching thousands of items could cause memory issues

**Solution:** Process items immediately, don't accumulate:

```typescript
do {
  const response = await fetchUnreadItems(token, pageCursor);

  for (const item of response.results) {
    // ✅ Process immediately
    await processItem(item);
  }

  // ❌ Don't do this:
  // allItems.push(...response.results);

  pageCursor = response.nextPageCursor;
} while (pageCursor);
```

### 6. Error Array Accumulation

**Track errors without failing sync:**

```typescript
const errors: any[] = [];

for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    errors.push({
      reader_id: item.id,
      title: item.title,
      error: error.message,
    });
    // Continue processing remaining items
  }
}

// Save errors to sync_log
await supabase.from('sync_log').update({
  errors: errors.length > 0 ? errors : null,
}).eq('id', syncId);
```

---

## Performance Considerations

### Database Queries

**Optimizations:**
- Index on `processing_jobs.sync_log_id` for fast status queries
- Upsert prevents duplicate checks
- Batch operations where possible

**Polling frequency:**
- 2 seconds recommended
- Too fast: unnecessary database load
- Too slow: poor UX

### Queue Processing

**Batch size:** 10 messages
- Balances throughput and latency
- Small enough for quick processing
- Large enough to reduce overhead

**Timeout:** 30 seconds
- Allows time for summary generation (Phase 4)
- Prevents jobs from blocking queue

### Memory Usage

**Pagination strategy:**
- Process items immediately
- Don't accumulate large arrays
- Stream data through system

---

## Phase 3 Completion Summary

### What Was Delivered

**Backend (Complete):**
- ✅ Reader API client with Zod validation and rate limiting
- ✅ Sync endpoint with pagination support
- ✅ Status polling endpoint with real-time progress
- ✅ Queue consumer worker (marks jobs complete, ready for Phase 4)
- ✅ Archive endpoint with transaction-like rollback
- ✅ Retry endpoint for failed job recovery
- ✅ Database migration for sync_log_id tracking

**UI (Complete):**
- ✅ Sync Reader button with loading states
- ✅ Progress indicator with 2-second polling
- ✅ Items list view showing titles, authors, sources, word counts
- ✅ Archive button per item with optimistic updates
- ✅ Retry button for failed jobs
- ✅ Error handling and user feedback

**Testing:**
- ✅ 120 tests passing (56 new tests added)
- ✅ 95%+ coverage maintained
- ✅ TypeScript compilation with no errors

**Next Phase:** Phase 4 - Perplexity Integration for AI summaries

---

## File Structure

```
src/
├── lib/
│   ├── reader-api.ts              # Reader API client
│   └── reader-api.test.ts         # 13 tests
├── app/
│   ├── summaries/
│   │   ├── page.tsx               # Server component (auth)
│   │   ├── page.test.tsx          # 6 tests
│   │   └── SummariesContent.tsx   # Client component (UI logic)
│   └── api/
│       └── reader/
│           ├── sync/
│           │   ├── route.ts       # Sync endpoint
│           │   └── route.test.ts  # 6 tests
│           ├── status/
│           │   ├── route.ts       # Status polling endpoint
│           │   └── route.test.ts  # 9 tests
│           ├── items/
│           │   ├── route.ts       # Items list endpoint
│           │   └── route.test.ts  # 4 tests
│           ├── archive/
│           │   ├── route.ts       # Archive endpoint
│           │   └── route.test.ts  # 7 tests
│           └── retry/
│               ├── route.ts       # Retry endpoint
│               └── route.test.ts  # 6 tests
├── utils/
│   └── queue.test.ts              # p-queue compatibility (6 tests)
└── workers/
    ├── consumer.ts                # Queue consumer
    └── consumer.test.ts           # 5 tests

supabase/
└── migrations/
    ├── 20260312_add_sync_log_id.sql
    └── README.md

wrangler-consumer.toml             # Consumer worker config
```

---

## Related Documentation

- **Phase 1.3.2:** Queue producer setup - [phase-1-3-2-implementation.md](./phase-1-3-2-implementation.md)
- **Phase 2:** Authentication patterns - [phase-2-implementation.md](./phase-2-implementation.md)
- **Testing Strategy:** - [testing-strategy.md](./testing-strategy.md)
- **Environment Setup:** - [environment-setup.md](./environment-setup.md)
