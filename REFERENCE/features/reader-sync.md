# Reader Sync
REFERENCE > Features > Reader Sync

How the Readwise Reader integration works - fetching articles, syncing metadata, and maintaining local copies.

## What Is This?
Integration with [Readwise Reader](https://readwise.io/read) that fetches your saved articles, stores them locally, and keeps them in sync with your Reader library.

## Core Workflow

```
1. User clicks "Sync" button (or cron triggers auto-sync)
2. Fetch unread items from Reader API (location=new, paginated)
3. Store article metadata in database
4. Create queue jobs for AI summary generation
5. Fetch recently archived items from Reader API (location=archive, updatedAfter=last sync)
6. Mark matching local items as archived (mirrors Reader archive state)
7. Poll for summary generation completion
8. Display summaries in UI
```

Steps 2–4 and 5–6 are sequential but independent failure domains — archive sync failure is non-fatal and logged without aborting the unread items sync.

## Reader API Integration

### Authentication
**Access Token** stored as secret: `READWISE_ACCESS_TOKEN`

Obtained from: https://readwise.io/access_token

**Header:**
```
Authorization: Token {READWISE_ACCESS_TOKEN}
```

### API Endpoints Used

#### List Items
```
GET https://readwise.io/api/v3/list/
```

**Parameters:**
- `page_size`: Items per page (default: 20, max: 1000)
- `pageCursor`: Pagination cursor for next page
- `location`: Filter by status (we don't filter, get all)

**Response:**
```json
{
  "count": 123,
  "nextPageCursor": "cursor_string_or_null",
  "results": [
    {
      "id": "reader-item-id",
      "url": "https://example.com/article",
      "title": "Article Title",
      "author": "Author Name",
      "word_count": 1500,
      "content": "Full article text...",
      "notes": "",
      "tags": {},
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "reading_progress": 0
    }
  ]
}
```

#### Get Full Content
```
GET https://readwise.io/api/v3/get/{id}/
```

Used by queue consumer to fetch full article content for AI summary generation.

**Why separate calls?**
- List endpoint returns truncated content
- Full content needed for quality summaries
- Fetching full content is slow - done async in queue

#### Archive Item
```
POST https://readwise.io/api/v3/save/
```

**Body:**
```json
{
  "url": "https://example.com/article",
  "saved": false,  // false = archive
  "location": "archive"
}
```

### Rate Limiting

Reader API implements rate limiting.

**Detection:**
- HTTP 429 status code
- `Retry-After` header (seconds to wait)

**Handling:**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '5';
  await new Promise(resolve =>
    setTimeout(resolve, parseInt(retryAfter) * 1000)
  );
  // Retry request
}
```

**Strategy:**
- Exponential backoff
- Max 3 retry attempts
- Log rate limit events

## Sync Flow

### 1. Manual Sync (`POST /api/reader/sync`)

**Steps:**
1. **Create sync log**:
   ```sql
   INSERT INTO sync_log (user_id, status)
   VALUES ($1, 'in_progress')
   RETURNING id;
   ```

2. **Paginate through Reader API**:
   ```typescript
   let nextPageCursor: string | null = null;
   let totalFetched = 0;

   do {
     const items = await fetchReaderPage(nextPageCursor);

     for (const item of items) {
       // Upsert reader_items (avoid duplicates)
       await upsertReaderItem(item);

       // Create job for summary generation
       await createJob(item.id);

       // Enqueue to Cloudflare Queue
       await enqueueJob(jobId);
     }

     totalFetched += items.length;
     nextPageCursor = response.nextPageCursor;
   } while (nextPageCursor);
   ```

3. **Update sync log**:
   ```sql
   UPDATE sync_log
   SET items_fetched = $1, jobs_created = $2
   WHERE id = $3;
   ```

4. **Return sync_id** for status polling:
   ```json
   { "sync_id": "uuid", "items_fetched": 42 }
   ```

### 2. Status Polling (`GET /api/reader/status?sync_id=uuid`)

Frontend polls every 2 seconds to check progress.

**Query:**
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

**Response:**
```json
{
  "status": "in_progress",
  "items_fetched": 42,
  "jobs_created": 42,
  "jobs_completed": 38,
  "jobs_failed": 1,
  "progress_percent": 92.8
}
```

**States:**
- `in_progress` - Still syncing
- `completed` - All jobs done
- `failed` - Sync error

### 3. Archive Item (`POST /api/reader/archive`)

**Steps:**
1. **Archive in Reader**:
   ```typescript
   await fetch('https://readwise.io/api/v3/save/', {
     method: 'POST',
     body: JSON.stringify({
       url: item.url,
       saved: false,
       location: 'archive',
     }),
   });
   ```

2. **Update local database**:
   ```sql
   UPDATE reader_items
   SET archived = true, archived_at = NOW()
   WHERE id = $1 AND user_id = $2;
   ```

3. **Remove from UI** (frontend filters out archived items)

## Database Schema

### reader_items Table
```sql
CREATE TABLE reader_items (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  reader_id TEXT NOT NULL,  -- Reader's item ID
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  word_count INTEGER,
  summary TEXT,              -- Generated by AI
  tags TEXT[],               -- Generated by AI
  content_truncated BOOLEAN,
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, reader_id)  -- Prevent duplicates
);
```

**Unique Constraint:** Same Reader item can't be imported twice for same user.

### Handling Duplicates

**Upsert Pattern:**
```sql
INSERT INTO reader_items (user_id, reader_id, url, title, ...)
VALUES ($1, $2, $3, $4, ...)
ON CONFLICT (user_id, reader_id)
DO UPDATE SET
  title = EXCLUDED.title,
  updated_at = NOW();
```

**Why upsert?**
- User might sync multiple times
- Article metadata might change in Reader
- Avoid duplicate entries

## Queue Integration

### Job Creation

For each synced item, create a job:
```typescript
const { data: job } = await supabase
  .from('jobs')
  .insert({
    user_id: userId,
    reader_item_id: itemId,
    sync_log_id: syncLogId,
    status: 'pending',
  })
  .select()
  .single();
```

### Queue Message

Enqueue to Cloudflare Queues:
```typescript
await env.PROCESSING_QUEUE.send({
  jobId: job.id,
  userId: job.user_id,
  readerItemId: job.reader_item_id,
  syncLogId: job.sync_log_id,
});
```

**Queue Consumer** (separate worker) picks up jobs and generates summaries.

See: [AI Summaries](./ai-summaries.md)

## Error Handling

### Reader API Errors

**Network Errors:**
```typescript
try {
  const response = await fetch(readerUrl, options);
} catch (error) {
  console.error('[Reader] Network error:', error);
  // Return error to user, don't retry automatically
}
```

**Rate Limiting:**
- Detected via 429 status
- Automatic retry with exponential backoff
- Max 3 attempts

**Not Found:**
- 404 when item deleted in Reader
- Handle gracefully (mark as deleted, don't fail sync)

### Database Errors

**Unique Constraint Violation:**
- Means item already exists
- This is expected (use upsert)
- Don't treat as error

**Foreign Key Violation:**
- User doesn't exist
- Should never happen (auth middleware ensures user exists)
- Log as critical error

## UI Integration

### Sync Button
Located in header, triggers manual sync.

**Flow:**
```typescript
const handleSync = async () => {
  setLoading(true);

  const response = await fetch('/api/reader/sync', { method: 'POST' });
  const { sync_id } = await response.json();

  // Poll for completion
  const pollInterval = setInterval(async () => {
    const status = await fetch(`/api/reader/status?sync_id=${sync_id}`);
    const data = await status.json();

    if (data.status === 'completed' || data.status === 'failed') {
      clearInterval(pollInterval);
      setLoading(false);
      // Refresh items list
    }
  }, 2000);
};
```

### Progress Display
Shows: "Syncing... 38/42 items processed (92.8%)"

**Calculation:**
```typescript
const progress = (jobs_completed / jobs_created) * 100;
```

## Performance Considerations

### Pagination
- Fetch 20 items per page (balance between speed and API load)
- Could increase to 50-100 for faster syncs
- Reader API max: 1000 items per page

### Parallel Processing
- Fetching from Reader: Sequential (avoid rate limiting)
- Queue processing: Parallel (up to 10 concurrent jobs)
- Balance between speed and API limits

### Database Optimization
- Indexes on `user_id`, `reader_id`, `archived`
- Unique constraint prevents duplicates
- RLS policies ensure data isolation

## Troubleshooting

### Items Not Syncing
- Check Reader access token is valid
- Verify Reader API is accessible
- Check Cloudflare logs for errors

### Duplicate Items
- Unique constraint should prevent this
- If happening: Check upsert logic
- Verify reader_id is consistent

### Slow Syncs
- Reader API might be rate limiting
- Check `Retry-After` headers in logs
- Consider reducing page size

### Items Not Appearing
- Check `archived = false` filter in query
- Verify RLS policies allow access
- Check jobs completed successfully

## Archive Sync

Items archived directly in Readwise Reader (rather than via Ansible) are automatically mirrored during each sync.

### How It Works

After the unread items fetch completes, `performSyncForUser()` runs a second step:

```
1. Query last completed sync timestamp for this user
   → First-time users: 30-day fallback window
2. GET /api/v3/list/?location=archive&updatedAfter={timestamp}
3. Batch SELECT local reader_items matching the returned reader_ids
   (only items where archived_at IS NULL)
4. Per-item UPDATE: archived=true, archived_at=Reader's updated_at timestamp
```

The Reader's `updated_at` timestamp is used for `archived_at` rather than the sync time, preserving the actual moment the item was archived in Reader.

### Signal Data (Future)

The archive API response also carries `highlights_count` and `notes` per item. These are captured in `ArchivedReaderItemSchema` for future interest-signal tracking (issue #58) without requiring a separate API integration.

### Error Handling

Archive sync is wrapped in an isolated try/catch. Any failure is logged and appended to the sync's error count but does not abort or fail the unread items sync.

**Implementation:** `src/lib/sync-operations.ts` — `performSyncForUser()`, archive sync step
**API client:** `src/lib/reader-api.ts` — `fetchRecentlyArchivedItems()`

## Related Documentation
- [AI Summaries](./ai-summaries.md) - How summaries are generated
- [Automated Sync](./automated-sync.md) - Scheduled syncing
- [Workers](../architecture/workers.md) - Queue consumer details
- [API Design](../architecture/api-design.md) - API patterns
- [Issue #26](https://github.com/mannepanne/ansible-ai-reader/issues/26) - Archive sync feature request
- [Issue #58](https://github.com/mannepanne/ansible-ai-reader/issues/58) - Interest signals (future extension)
