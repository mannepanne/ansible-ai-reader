# Phase 3: Reader Integration

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: Phase 2 (Authentication)
**Estimated Effort**: Week 3

---

## Overview

Integrate with Readwise Reader API to fetch unread items, display them in a list, and sync archive state back to Reader. By the end of this phase, Magnus should be able to manually sync Reader items and archive them from Ansible.

---

## Scope & Deliverables

### Core Tasks
- [ ] Implement Reader API client (TypeScript with Zod validation)
- [ ] Define TypeScript interfaces for all API responses
- [ ] Implement rate limiting with p-queue (20 req/min)
- [ ] Create "Sync Reader" button on /summaries page
- [ ] Fetch unread items from Reader API (with pagination)
- [ ] Store items in database and enqueue processing jobs
- [ ] Implement sync status polling endpoint
- [ ] Display list of items with processing status
- [ ] Implement archive functionality with transaction-like rollback
- [ ] Add "Retry" button for failed archives and summaries
- [ ] Add loading states and progress indicators
- [ ] Handle API errors gracefully with retry logic
- [ ] Document Reader API token setup

### Out of Scope
- Summary generation (Phase 4)
- Tag generation (Phase 4)
- Document notes (Phase 5)
- Rating system (Phase 5)
- Automated background sync (future v2)

---

## User Flow

```
User visits /summaries (authenticated)
  ↓
Sees empty state: "No items yet. Click 'Sync Reader' to get started."
  ↓
Clicks "Sync Reader" button
  ↓
Sync process (returns immediately):
  1. Fetch unread items from Reader API (location=new)
  2. Handle pagination (nextPageCursor)
  3. For each item:
     - Insert into database (without summary)
     - Create processing_job (status: 'pending')
     - Enqueue message to PROCESSING_QUEUE
  4. Return sync_id to client
  ↓
Client polls /api/sync-status?syncId=<sync_id>
  - Shows: "Processing X of Y items..."
  - Updates every 2 seconds
  ↓
Queue consumer (background):
  - Processes jobs asynchronously
  - Generates summaries (Phase 4)
  - Updates processing_jobs.status
  ↓
When all jobs complete:
  List view shows items:
  - Title
  - Short summary (or "Summary generation failed" with Retry button)
  - Tags
  - Author, Source, Created date
  - "Archive" button
  ↓
User clicks "Archive" on an item
  ↓
  1. PATCH to Reader API (location=archive) [transaction-like approach]
  2. If Reader archive succeeds, mark as archived in Ansible database
  3. If Reader archive fails, show error and don't update local state
  4. Remove from list view on success
```

---

## Input Validation Strategy

**Validation Library**: [Zod](https://zod.dev/) for TypeScript-first schema validation

**Security Principles**:
1. **Validate at boundaries**: User input, external APIs, database queries
2. **Sanitize dangerous content**: XSS prevention for HTML/JavaScript
3. **Enforce constraints**: Length limits, format requirements, allowed values
4. **Fail securely**: Reject invalid input, don't attempt to "fix" it

### Reader API Response Validation

**What we validate**:
- URLs are valid HTTP/HTTPS (prevent javascript:, data:, file: protocols)
- Titles and content are strings (not objects or arrays)
- IDs are non-empty strings
- Dates are valid ISO 8601 format

**Implementation** (see TypeScript Interfaces section below for full schemas):
```typescript
import { z } from 'zod';

// Sanitize URLs - only allow http/https
const SafeUrlSchema = z.string().url().refine((url) => {
  const protocol = new URL(url).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, {
  message: 'Only HTTP and HTTPS URLs are allowed'
});

// Sanitize text content - strip HTML tags for titles/authors
function sanitizeText(text: string): string {
  return text.replace(/<[^>]*>/g, '');  // Remove HTML tags
}

// Reader API response validation (already defined in TypeScript Interfaces)
const ReaderItemSchema = z.object({
  id: z.string().min(1),
  url: SafeUrlSchema,
  title: z.string().min(1).max(1000).transform(sanitizeText),
  author: z.string().max(500).optional().transform(val => val ? sanitizeText(val) : undefined),
  source: z.string().max(200).optional(),
  content: z.string().optional(),  // Content validated separately for length
  created_at: z.string().datetime(),
  content_type: z.string().optional(),
});
```

**What happens on validation failure**:
- Log error to `sync_log.errors` with full details
- Skip invalid item (don't store in database)
- Continue processing remaining items
- Show user: "X items skipped due to invalid data"

### XSS Prevention

**User-generated content** (document notes, Phase 5):
- **Sanitize before storage**: Strip dangerous HTML/JavaScript
- **Sanitize before display**: Use React's built-in XSS protection (JSX escaping)
- **No `dangerouslySetInnerHTML`**: Never render user content as HTML

**Library**: [DOMPurify](https://github.com/cure53/DOMPurify) for HTML sanitization
```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeUserNote(note: string): string {
  // Allow some basic formatting but strip scripts
  return DOMPurify.sanitize(note, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
  });
}
```

### Validation Rules Summary

**Phase 3 (Reader Integration)**:
- ✅ URLs: http/https only, max 2000 chars
- ✅ Titles: 1-1000 chars, HTML stripped
- ✅ Authors: 0-500 chars, HTML stripped
- ✅ Content: No length limit here (validated in Phase 4)
- ✅ Dates: Valid ISO 8601

**Phase 4 (Perplexity Integration)**:
- ✅ Content length: Max 30k chars (see Phase 4)
- ✅ Prompt injection prevention: Don't allow user to modify system prompt (yet)
- ✅ Response validation: Summary and tags format checked

**Phase 5 (Notes & Rating)**:
- ✅ Notes: 0-10,000 chars, HTML sanitized with DOMPurify
- ✅ Rating: Integer 0-5 only
- ✅ Summary prompt: 0-2000 chars, HTML stripped

---

## API Integration Details

### Reader API Endpoints

**1. Fetch Unread Items**
```
GET https://readwise.io/api/v3/list/
Headers:
  Authorization: Token <READER_API_TOKEN>
Query:
  location=new  // Unread items only
  pageCursor=<cursor>  // For pagination
```

**Response** (simplified):
```json
{
  "results": [
    {
      "id": "reader_item_id",
      "url": "https://example.com/article",
      "title": "Article Title",
      "author": "Author Name",
      "source": "blog",
      "content": "Full article text...",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "nextPageCursor": "cursor_string"
}
```

**TypeScript Interface**:
```typescript
interface ReaderItem {
  id: string;
  url: string;
  title: string;
  author?: string;
  source?: string;
  content?: string;
  created_at: string;
  content_type?: string;
}

interface ReaderListResponse {
  results: ReaderItem[];
  nextPageCursor?: string | null;
}

// Runtime validation with Zod
import { z } from 'zod';

const ReaderItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  author: z.string().optional(),
  source: z.string().optional(),
  content: z.string().optional(),
  created_at: z.string().datetime(),
  content_type: z.string().optional(),
});

const ReaderListResponseSchema = z.object({
  results: z.array(ReaderItemSchema),
  nextPageCursor: z.string().nullable().optional(),
});

// Use in API client:
const response = await fetch(/* ... */);
const data = await response.json();
const validated = ReaderListResponseSchema.parse(data);  // Throws if invalid
```

**2. Archive Item**
```
PATCH https://readwise.io/api/v3/update/<reader_id>/
Headers:
  Authorization: Token <READER_API_TOKEN>
Body:
  {
    "location": "archive"
  }
```

### Rate Limiting & Error Handling

**Reader API Rate Limits** (from API docs):
- **Fetch**: 20 requests/minute (supports pagination)
- **Update**: 600 requests/hour

**Rate Limiting Strategy**:
1. Use `p-queue` library for request throttling
2. Configure queue: `concurrency: 1, intervalCap: 20, interval: 60000` (20 req/min)
3. Automatic retry with exponential backoff (via p-queue)

**Implementation**:
```typescript
import PQueue from 'p-queue';

const readerQueue = new PQueue({
  concurrency: 1,
  intervalCap: 20,       // Max 20 requests
  interval: 60 * 1000,   // Per minute
});

async function fetchUnreadItems(pageCursor?: string) {
  return readerQueue.add(() =>
    fetch('https://readwise.io/api/v3/list/', {
      headers: { 'Authorization': `Token ${READER_API_TOKEN}` },
      // ... rest of config
    })
  );
}
```

**Error Handling**:
- **401 Unauthorized**: Invalid token → show error to user, stop sync
- **429 Too Many Requests**: Rate limit hit → automatic retry with backoff
- **500 Server Error**: Reader API issues → retry up to 3 times, then log to sync_log
- **Network timeout**: Set 30s timeout, retry on timeout

**Retry Logic**:
```typescript
const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(Math.pow(2, attempt) * 1000);  // Exponential backoff
    }
  }
};
```

**Logging Errors**:
- All errors logged to `sync_log.errors` (JSONB field)
- Format: `{ timestamp, error_type, message, stack_trace, context }`

---

## Database Operations

### Storing Items and Enqueueing Jobs

```typescript
// Pseudocode for sync operation (returns immediately)
async function syncReaderItems(userId: string) {
  const syncId = crypto.randomUUID();
  let pageCursor = null;
  let totalFetched = 0;
  let jobIds: string[] = [];

  // Create sync_log entry
  await db.sync_log.insert({
    id: syncId,
    user_id: userId,
    sync_type: 'reader_fetch',
    items_fetched: 0,  // Updated later
    items_created: 0,
  });

  do {
    const response = await readerAPI.fetchUnreadItems(pageCursor);
    const validated = ReaderListResponseSchema.parse(response);  // Runtime validation

    for (const item of validated.results) {
      // 1. Store item in database
      const readerItem = await db.reader_items.upsert({
        user_id: userId,
        reader_id: item.id,
        title: item.title,
        url: item.url,
        author: item.author,
        source: item.source,
        content_type: item.content_type,
        created_at: item.created_at,
        // short_summary, tags added by queue consumer in Phase 4
      });

      // 2. Create processing job
      const job = await db.processing_jobs.insert({
        user_id: userId,
        reader_item_id: readerItem.id,
        job_type: 'summary_generation',
        status: 'pending',
      });

      // 3. Enqueue message (Phase 1 pattern: use getCloudflareContext)
      const { env } = getCloudflareContext();
      await env.PROCESSING_QUEUE.send({
        jobId: job.id,
        userId: userId,
        readerItemId: readerItem.id,
        jobType: 'summary_generation',
        payload: {
          title: item.title,
          author: item.author,
          content: item.content,
          url: item.url,
        },
      });

      jobIds.push(job.id);
    }

    totalFetched += validated.results.length;
    pageCursor = validated.nextPageCursor;
  } while (pageCursor);

  // Update sync_log with totals
  await db.sync_log.update({
    where: { id: syncId },
    data: {
      items_fetched: totalFetched,
      items_created: jobIds.length,
    },
  });

  return { syncId, totalJobs: jobIds.length };
}
```

### Archiving Items (Transaction-Like Approach)

**Rollback Strategy**: Archive in Reader first, then update local DB. If Reader archive fails, don't update local state.

```typescript
async function archiveItem(itemId: string, readerId: string, userId: string) {
  try {
    // 1. Archive in Reader FIRST (remote source of truth)
    const readerResponse = await readerAPI.archiveItem(readerId);

    if (!readerResponse.ok) {
      throw new Error(`Reader API archive failed: ${readerResponse.status}`);
    }

    // 2. Only if Reader succeeds, mark as archived locally
    await db.reader_items.update({
      where: { id: itemId, user_id: userId },
      data: {
        archived: true,
        archived_at: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    // Log error but don't update local state
    await db.sync_log.insert({
      user_id: userId,
      sync_type: 'archive_failed',
      errors: {
        reader_item_id: itemId,
        reader_id: readerId,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: false,
      error: 'Failed to archive in Reader. Item unchanged in Ansible.',
      canRetry: true,
    };
  }
}
```

**UI Handling**:
- Show error toast: "Archive failed in Reader. Item not archived. [Retry]"
- Item remains in unread list
- User can retry archive operation

**Retry Failed Archives**:
- Add "Retry Archive" button on failed items
- Uses same `archiveItem()` function
- Success clears error state

---

## Sync Status Polling Endpoint

**Purpose**: Allow client to check processing progress for a sync operation.

**Endpoint**: `GET /api/sync-status?syncId=<sync_id>`

**Response**:
```typescript
interface SyncStatusResponse {
  syncId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  status: 'pending' | 'processing' | 'completed' | 'partial_failure';
  failedItems?: Array<{
    itemId: string;
    title: string;
    error: string;
  }>;
}
```

**Implementation**:
```typescript
async function getSyncStatus(syncId: string) {
  const jobs = await db.processing_jobs.findMany({
    where: {
      sync_log_id: syncId,  // Assumes we add sync_log_id to processing_jobs
    },
  });

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const inProgressJobs = jobs.filter(j => j.status === 'processing').length;

  let status: string;
  if (completedJobs === totalJobs) status = 'completed';
  else if (failedJobs > 0 && (completedJobs + failedJobs) === totalJobs) status = 'partial_failure';
  else if (inProgressJobs > 0 || completedJobs > 0) status = 'processing';
  else status = 'pending';

  const failedItems = jobs
    .filter(j => j.status === 'failed')
    .map(j => ({
      itemId: j.reader_item_id,
      title: j.title,  // Denormalize or join with reader_items
      error: j.error_message,
    }));

  return {
    syncId,
    totalJobs,
    completedJobs,
    failedJobs,
    inProgressJobs,
    status,
    failedItems,
  };
}
```

**Client Polling**:
```typescript
// Poll every 2 seconds until complete
const pollSyncStatus = async (syncId: string) => {
  const interval = setInterval(async () => {
    const status = await fetch(`/api/sync-status?syncId=${syncId}`).then(r => r.json());

    updateUI(status);  // Show "Processing X of Y..."

    if (status.status === 'completed' || status.status === 'partial_failure') {
      clearInterval(interval);
      showResults(status);
    }
  }, 2000);
};
```

---

## Retry Failed Summaries

**UI**: Show "Retry" button for items with failed summary generation.

**Endpoint**: `POST /api/retry-summary`

**Request**:
```json
{
  "itemId": "uuid"
}
```

**Implementation**:
```typescript
async function retrySummaryGeneration(itemId: string, userId: string) {
  const item = await db.reader_items.findUnique({
    where: { id: itemId, user_id: userId },
  });

  // Create new processing job
  const job = await db.processing_jobs.insert({
    user_id: userId,
    reader_item_id: item.id,
    job_type: 'summary_generation',
    status: 'pending',
  });

  // Enqueue
  await env.PROCESSING_QUEUE.send({
    jobId: job.id,
    userId: userId,
    readerItemId: item.id,
    jobType: 'summary_generation',
    payload: {
      title: item.title,
      author: item.author,
      content: item.content,  // Stored from initial sync
      url: item.url,
    },
  });

  return { jobId: job.id };
}
```

---

## Testing Strategy

### Required Tests

**1. Reader API Client Tests**
- [ ] Fetch unread items successfully
- [ ] TypeScript interfaces validated with Zod
- [ ] Runtime validation catches malformed responses
- [ ] Handle pagination correctly
- [ ] Rate limiting enforced (20 req/min via p-queue)
- [ ] Archive item via API
- [ ] Handle invalid API token (401 error)
- [ ] Handle rate limiting (429 error)
- [ ] Retry logic works with exponential backoff (up to 3 attempts)
- [ ] Request timeout after 30s

**2. Database Operations Tests**
- [ ] Items stored correctly (upsert prevents duplicates)
- [ ] UNIQUE constraint (user_id, reader_id) enforced
- [ ] Processing jobs created for each item
- [ ] Archive updates database only after Reader success
- [ ] Archive failure doesn't update local state
- [ ] Timestamps set properly

**3. Queue Operations Tests**
- [ ] Messages enqueued for each synced item
- [ ] Queue message schema correct
- [ ] Sync returns syncId immediately (doesn't wait for processing)
- [ ] Polling endpoint returns correct status
- [ ] Failed jobs can be retried

**4. Integration Tests**
- [ ] Full sync operation works end-to-end
- [ ] Pagination fetches all items (test with 50+ items)
- [ ] Archive rollback works (Reader fail = local unchanged)
- [ ] Error states handled gracefully
- [ ] Retry failed operations succeeds

**5. UI Tests**
- [ ] "Sync Reader" button shows loading state
- [ ] Progress indicator updates via polling ("Processing X of Y...")
- [ ] Items displayed in list view with status
- [ ] "Archive" button removes item on success
- [ ] "Archive" shows error and retry button on failure
- [ ] "Retry Summary" button works for failed summaries
- [ ] Error messages shown on failure

### Test Commands
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode during development
npm run test:coverage     # Coverage report (target: 95%+)
npx tsc --noEmit          # Type checking
```

**Coverage Target**: 100% for new code (enforced minimums: 95% lines/functions/statements, 90% branches)

---

## Pre-Commit Checklist

Before creating a PR for this phase:

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Manual testing: sync fetches real Reader items and enqueues jobs
- [ ] Manual testing: polling endpoint shows progress correctly
- [ ] Manual testing: archive rollback works (test Reader API failure)
- [ ] Manual testing: retry failed archive succeeds
- [ ] Manual testing: rate limiting works (doesn't exceed 20 req/min)
- [ ] Reader API token documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] TypeScript interfaces defined and Zod validation working
- [ ] Error handling tested (invalid token, rate limits, timeouts)
- [ ] No secrets committed to repository
- [ ] Pagination tested with large item counts (50+)

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 3: Reader Integration - Fetch and sync unread items`

**PR Description Template**:
```markdown
## Summary
Completes Phase 3: Reader API integration for fetching and archiving items.

## What's Included
- Reader API client with TypeScript types
- Fetch unread items (with pagination support)
- Store items in database
- Archive functionality (syncs to Reader)
- Error handling and retry logic
- UI: list view and sync button

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: synced XX items from Reader
- [x] Manual testing: archived items sync back to Reader

## Environment Variables Added
- `READER_API_TOKEN` (documented in environment-setup.md)

## Next Steps
Phase 4: Perplexity Integration (generate summaries and tags)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 3 is complete when:

1. ✅ "Sync Reader" button fetches items and enqueues processing jobs
2. ✅ Sync returns immediately (doesn't wait for summary generation)
3. ✅ Polling endpoint provides real-time progress updates
4. ✅ Pagination handles large item counts (50+ items tested)
5. ✅ Items stored in database correctly
6. ✅ TypeScript interfaces defined with Zod validation
7. ✅ Rate limiting enforced (20 req/min for Reader API)
8. ✅ Archive uses transaction-like rollback (Reader first, then local)
9. ✅ Failed archives and summaries can be retried
10. ✅ Error handling works with retry logic (exponential backoff)
11. ✅ All tests passing with 95%+ coverage
12. ✅ No secrets in repository
13. ✅ PR merged to main branch

---

## Technical Considerations

### Cloudflare Queues (Phase 1 Pattern)

**Accessing queue binding** (established in Phase 1.3.2):
```typescript
import { getCloudflareContext } from '@opennextjs/cloudflare';

// In API route or server component
const { env } = getCloudflareContext();
await env.PROCESSING_QUEUE.send(queueMessage);
```

**TypeScript types:**
- Run `npx wrangler types --env-interface CloudflareEnv` to generate types
- Adds `worker-configuration.d.ts` (already in .gitignore)
- Provides type safety for `env.PROCESSING_QUEUE`

**Testing pattern:**
```typescript
// Mock getCloudflareContext in tests
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      PROCESSING_QUEUE: mockQueue,
    },
  })),
}));
```

**Reference:** See [phase-1-3-2-implementation.md](../REFERENCE/phase-1-3-2-implementation.md) for complete queue producer patterns and testing examples.

### API Performance
- **Pagination**: Handle potentially hundreds of items (tested with 50+)
- **Workers time limits**: Sync endpoint returns immediately, processing happens async
- **Rate limiting**: 20 req/min for Reader API (enforced via p-queue)
- **Timeouts**: 30s per request with automatic retry
- **Solution**: Async queue processing, polling for status updates

### Data Consistency
- **Duplicate prevention**: UNIQUE constraint on (user_id, reader_id)
- **Upsert strategy**: Update if exists, insert if new
- **Archive rollback**: Transaction-like approach (Reader first, then local)
- **Processing jobs**: Track status for each item (pending → processing → completed/failed)
- **Error recovery**: Failed jobs can be retried up to 3 times

### User Experience
- **Loading states**: Clear progress indicator via polling ("Processing X of Y...")
- **Error messages**: User-friendly explanations with retry buttons
- **Empty states**: Helpful guidance when no items exist
- **Retry functionality**: One-click retry for failed operations
- **Archive safety**: Errors don't leave data in inconsistent state

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Reader API**: https://readwise.io/reader_api
