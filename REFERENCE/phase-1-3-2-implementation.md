# Phase 1.3.2 Implementation - Cloudflare Queues Infrastructure

**When to read this:** Understanding Cloudflare Queues setup, queue producer API, or async job processing.

**Status:** ✅ Complete (Queue producer implemented, consumer deferred to Phase 3/4)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [phase-1-3-1-implementation.md](./phase-1-3-1-implementation.md) - Cloudflare deployment
- [01-foundation.md](./../SPECIFICATIONS/01-foundation.md) - Full Phase 1 specification

---

## What Was Built

Phase 1.3.2 implements the **queue producer** (API endpoint) for async job processing with Cloudflare Queues. The **queue consumer** is intentionally deferred to Phase 3/4 when we integrate Readwise Reader API and actually have jobs to process.

### Technology Stack

- **Cloudflare Queues** - Message queue for async processing
- **Zod** - Request validation
- **Next.js API Routes** - RESTful endpoint
- **Supabase** - Job tracking in `processing_jobs` table

---

## Queue Configuration

### wrangler.toml

```toml
[[queues.producers]]
queue = "ansible-processing-queue"
binding = "PROCESSING_QUEUE"

[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 10
max_batch_timeout = 30
```

**Note:** Consumer configuration is present but not implemented yet (Phase 3/4).

---

## API Endpoint: POST /api/jobs

### Purpose
Creates a job in the database and sends a message to Cloudflare Queue for async processing.

### Request

**URL:** `POST /api/jobs`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "jobType": "summary_generation",
  "readerItemId": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "title": "Article Title",
    "content": "Article content...",
    "url": "https://example.com/article"
  }
}
```

**Fields:**
- `userId` (UUID) - User who created the job
- `jobType` (enum) - `summary_generation` or `archive_sync`
- `readerItemId` (UUID) - reader_items table ID
- `payload` (object) - Job-specific data

### Response

**Success (201):**
```json
{
  "jobId": "660e8400-e29b-41d4-a716-446655440099",
  "status": "pending",
  "createdAt": "2026-03-09T20:00:00.000Z"
}
```

**Validation Error (400):**
```json
{
  "error": "Invalid request data",
  "details": [...]
}
```

**Queue Unavailable (405):**
```json
{
  "error": "Queue functionality not available in local development..."
}
```

**Server Error (500):**
```json
{
  "error": "Failed to send message to queue"
}
```

---

## How It Works

1. **Validate Request** - Zod schema validates userId, jobType, readerItemId, payload
2. **Check Queue Binding** - Returns 405 if PROCESSING_QUEUE not available (local dev)
3. **Create Database Record** - Inserts job into `processing_jobs` table (status: pending)
4. **Send Queue Message** - Sends message to Cloudflare Queue with job details
5. **Handle Errors** - Marks job as failed if queue send fails
6. **Return Response** - Returns jobId and status to caller

---

## Manual Setup Steps

### 1. Create the Queue

```bash
npx wrangler queues create ansible-processing-queue
```

**Expected output:**
```
Created queue ansible-processing-queue
```

### 2. Verify Queue

```bash
npx wrangler queues list
```

**Should show:**
```
┌──────────────────────────────┐
│ Queue Name                   │
├──────────────────────────────┤
│ ansible-processing-queue     │
└──────────────────────────────┘
```

### 3. Deploy Updated Worker

```bash
npx wrangler deploy
```

### 4. Test the Endpoint

```bash
curl -X POST https://ansible.hultberg.org/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "jobType": "summary_generation",
    "readerItemId": "550e8400-e29b-41d4-a716-446655440001",
    "payload": {
      "title": "Test Article"
    }
  }'
```

**Expected:** 201 response with jobId

---

## Testing

**Tests written:** 5 tests for queue producer
**Total tests:** 25 (5 new + 20 existing)
**Coverage:** 100%

**Test scenarios:**
1. Returns 405 without queue binding (local dev)
2. Validates required fields
3. Validates jobType enum
4. Creates job and sends queue message
5. Handles queue send errors gracefully

---

## What's NOT Included

- ❌ Queue consumer implementation (deferred to Phase 3/4)
- ❌ Actual summary generation (Phase 4 - Perplexity integration)
- ❌ Readwise Reader API integration (Phase 3)

**Why defer consumer:** No point processing jobs until we have Readwise integration (Phase 3) and Perplexity integration (Phase 4). The infrastructure is ready, we'll implement the consumer when we have real work to do.

---

## Next Steps

**Phase 1.3.3:** Domain configuration & production polish (already done - ansible.hultberg.org responding)

**After Phase 1 complete:**
- **Phase 2:** Authentication (magic links with Supabase Auth + Resend)
- **Phase 3:** Readwise Reader integration (fetch articles, create jobs)
- **Phase 4:** Queue consumer + Perplexity integration (process jobs, generate summaries)

---

## Commands Reference

**Queue Management:**
```bash
npx wrangler queues create <name>     # Create queue
npx wrangler queues list               # List queues
npx wrangler queues delete <name>      # Delete queue
```

**Deployment:**
```bash
npx wrangler deploy                    # Deploy with queue bindings
```

**Testing:**
```bash
npm test -- src/app/api/jobs/route.test.ts    # Run queue tests
npm test                                       # Run all tests
```
