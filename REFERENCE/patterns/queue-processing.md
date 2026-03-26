# Queue Processing Pattern
REFERENCE > Patterns > Queue Processing

Resilient async job processing with Cloudflare Queues.

## When to Read This
- Implementing async background jobs
- Understanding summary generation flow
- Debugging job failures
- Handling retries and dead letter queues
- Scaling queue processing

## Related Documentation
- [Features - AI Summaries](../features/ai-summaries.md) - Summary generation workflow
- [Architecture - Workers](../architecture/workers.md) - 3-worker system
- [Operations - Monitoring](../operations/monitoring.md) - Queue metrics
- [Operations - Troubleshooting](../operations/troubleshooting.md) - Queue issues

---

## The Problem

### Why Async Processing?

Some operations are too slow for synchronous API responses:
- **Fetching full article content** from Reader API (~500ms)
- **Generating AI summaries** via Perplexity (~2-5 seconds)
- **Processing batches** of items (could be 100+ items)

**Without queues:**
- API timeout (30s limit on Cloudflare Workers)
- Poor UX (user waits for slow operations)
- No retry mechanism (one failure = complete failure)
- Resource waste (concurrent requests block)

**With queues:**
- ✅ Immediate API response (job created)
- ✅ Background processing (user can continue)
- ✅ Automatic retries (3 attempts)
- ✅ Dead letter queue (track persistent failures)
- ✅ Parallel processing (10+ concurrent jobs)

---

## Architecture

### Producer-Consumer Pattern

```
┌─────────────────┐
│   Main App      │
│   (Producer)    │
└────────┬────────┘
         │
         │ 1. Create job in DB
         │ 2. Enqueue message
         ▼
┌─────────────────┐
│ Cloudflare Queue│
│  (Message Bus)  │
└────────┬────────┘
         │
         │ 3. Deliver to consumer
         │
         ▼
┌─────────────────┐
│ Queue Consumer  │
│   (Worker)      │
└─────────────────┘
         │
         │ 4. Process job
         │ 5. Update DB
         │ 6. Acknowledge
         └─────────────┘
```

### Components

1. **Main App (Producer)**
   - Creates job records in database
   - Enqueues messages to Cloudflare Queue
   - Returns immediately to user

2. **Cloudflare Queue**
   - Message delivery and retry logic
   - Batching (up to N messages per delivery)
   - Dead letter queue for failed messages

3. **Consumer Worker**
   - Processes messages in batches
   - Fetches content, generates summaries
   - Updates job status in database
   - Acknowledges successful processing

---

## Implementation

### 1. Producer: Creating Jobs

```typescript
// src/app/api/reader/sync/route.ts

export async function POST(req: NextRequest, context: { env: Env }) {
  // ... authentication and Reader API fetch ...

  for (const item of readerItems) {
    // 1. Create job in database
    const { data: job } = await supabase
      .from('jobs')
      .insert({
        user_id: session.user.id,
        reader_item_id: item.id,
        sync_log_id: syncLogId,
        status: 'pending',
      })
      .select()
      .single();

    // 2. Enqueue message
    await context.env.PROCESSING_QUEUE.send({
      jobId: job.id,
      userId: job.user_id,
      readerItemId: job.reader_item_id,
      syncLogId: job.sync_log_id,
    });
  }

  // 3. Return immediately (jobs processing in background)
  return NextResponse.json({
    sync_id: syncLogId,
    items_fetched: readerItems.length,
  });
}
```

### 2. Consumer: Processing Jobs

```typescript
// workers/consumer.ts

export default {
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const { jobId, userId, readerItemId } = message.body;

        // 1. Update job status
        await updateJobStatus(jobId, 'processing');

        // 2. Fetch full content from Reader
        const content = await fetchReaderContent(readerItemId, env.READER_API_TOKEN);

        // 3. Truncate if needed
        const { content: truncated, wasTruncated } = truncateContent(content);

        // 4. Generate AI summary
        const response = await generateSummary(
          truncated,
          env.PERPLEXITY_API_KEY
        );

        // 5. Parse response (summary + tags)
        const { summary, tags } = parsePerplexityResponse(response.content);

        // 6. Store results
        await supabase
          .from('reader_items')
          .update({
            summary,
            tags,
            content_truncated: wasTruncated,
          })
          .eq('id', readerItemId);

        // 7. Mark job completed
        await updateJobStatus(jobId, 'completed');

        // 8. Track token usage
        await trackTokenUsage(message.body.syncLogId, response.usage.total_tokens);

        // 9. Acknowledge message (success!)
        message.ack();

      } catch (error) {
        console.error('[Consumer] Job failed:', error);

        // Handle error (retry or fail)
        await handleJobError(message, error);
      }
    }
  },
};
```

---

## Message Lifecycle

### 1. Message Created

```typescript
await queue.send({
  jobId: 'uuid-123',
  userId: 'user-456',
  readerItemId: 'item-789',
  syncLogId: 'sync-abc',
});
```

**Queue state:** Message pending delivery

### 2. Message Delivered

Consumer receives message in batch:
```typescript
async queue(batch: MessageBatch) {
  for (const message of batch.messages) {
    // Process message.body
  }
}
```

**Queue state:** Message in-flight (waiting for ack)

### 3. Processing Success

```typescript
// Process successfully
await generateSummary(content);

// Acknowledge message
message.ack();
```

**Queue state:** Message removed (success!)

### 4. Processing Failure

```typescript
try {
  await generateSummary(content);
  message.ack();
} catch (error) {
  // Don't ack - message will retry
  console.error('Failed:', error);
  // message.retry();  // Optional: explicit retry
}
```

**Queue state:**
- Attempt 1 fails → Retry automatically
- Attempt 2 fails → Retry automatically
- Attempt 3 fails → Move to Dead Letter Queue

---

## Retry Strategy

### Automatic Retries

Cloudflare Queues retries messages up to 3 times:
1. **First attempt** - Immediate
2. **Second attempt** - After ~10 seconds
3. **Third attempt** - After ~30 seconds
4. **Dead letter queue** - After 3 failures

### Exponential Backoff

Built-in backoff between retries:
- Short delay for transient errors (network blips)
- Longer delay for persistent issues (API rate limits)

### Retry Configuration

```toml
# wrangler-consumer.toml
[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 1
max_batch_timeout = 30
max_retries = 3         # Default: 3
retry_delay = 10        # Seconds between retries
```

---

## Error Handling

### Transient vs Permanent Errors

**Transient errors (SHOULD retry):**
- Network timeouts
- API rate limiting (429)
- Temporary service outages
- Database connection issues

**Permanent errors (DON'T retry):**
- Invalid API keys (401)
- Malformed requests (400)
- Content not found (404)
- Parsing errors

### Implementing Smart Retries

```typescript
async function handleJobError(message: Message, error: any) {
  // Classify error
  if (isTransientError(error)) {
    // Let queue retry automatically
    console.log('[Consumer] Transient error, will retry:', error.message);
    return; // Don't ack, queue will retry
  }

  // Permanent error: Mark job as failed
  await updateJobStatus(message.body.jobId, 'failed', error.message);

  // Acknowledge to prevent further retries
  message.ack();
}

function isTransientError(error: any): boolean {
  // Network errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    return true;
  }

  // Rate limiting
  if (error.status === 429) {
    return true;
  }

  // Service unavailable
  if (error.status === 503) {
    return true;
  }

  return false;
}
```

---

## Dead Letter Queue (DLQ)

### What Is It?

Messages that fail after all retry attempts move to a separate "dead letter queue" for inspection and manual intervention.

### When Messages Go to DLQ

- 3 failed attempts
- Persistent errors (API key invalid, content malformed)
- Bugs in consumer code

### Inspecting DLQ

```bash
# List queues
npx wrangler queues list

# Check DLQ (if configured)
npx wrangler queues consumer ansible-processing-queue
```

### Handling DLQ Messages

**Manual intervention required:**
1. Inspect failed messages in Cloudflare dashboard
2. Identify root cause (API error, bug, invalid data)
3. Fix issue (update code, fix data, rotate keys)
4. Re-enqueue messages manually or create new jobs

---

## Batch Processing

### Batch Configuration

```toml
[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 1       # Process 1 message at a time
max_batch_timeout = 30   # Wait max 30s for batch to fill
```

**Why batch_size = 1?**
- AI summary generation is slow (~2-5 seconds)
- Processing serially avoids overwhelming Perplexity API
- Simplifies error handling (one job = one message)

**When to increase batch_size:**
- Fast operations (<100ms each)
- Can process in parallel safely
- Want higher throughput

### Processing Batches

```typescript
async queue(batch: MessageBatch) {
  console.log(`[Consumer] Processing batch of ${batch.messages.length} messages`);

  // Serial processing (one at a time)
  for (const message of batch.messages) {
    await processMessage(message);
  }

  // Parallel processing (all at once)
  await Promise.all(
    batch.messages.map(message => processMessage(message))
  );
}
```

---

## Monitoring

### Key Metrics

**Queue depth:**
- How many messages waiting
- Should be near 0 (spike during syncs is normal)
- Persistent depth = consumer not keeping up

**Processing time:**
- Time from enqueue to completion
- Should be 2-5 seconds per job
- Higher = API slowness or resource contention

**Failure rate:**
- Percentage of jobs that fail
- Should be <2%
- Higher = API issues, bugs, or data problems

**DLQ size:**
- Messages in dead letter queue
- Should be 0
- >0 = persistent failures needing attention

### Logging

```typescript
// Consumer worker
console.log('[Consumer] Processing job', jobId);
console.log('[Consumer] Fetching content for item', readerItemId);
console.log('[Perplexity] Generating summary');
console.log('[Perplexity] Token usage:', tokens);
console.log('[Consumer] Job completed:', jobId);
```

**View logs:**
```bash
npx wrangler tail --config wrangler-consumer.toml
```

---

## Testing

### Unit Tests

```typescript
// tests/workers/consumer.test.ts

describe('Queue Consumer', () => {
  it('processes job successfully', async () => {
    const message = createMockMessage({
      jobId: 'job-123',
      readerItemId: 'item-456',
    });

    await processMessage(message);

    expect(message.ack).toHaveBeenCalled();
    expect(await getJobStatus('job-123')).toBe('completed');
  });

  it('retries on transient error', async () => {
    const message = createMockMessage({ jobId: 'job-123' });

    // Mock transient error
    mockPerplexityAPI.mockRejectedValueOnce(new NetworkError());

    await processMessage(message);

    // Should NOT ack (will retry)
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('fails permanently on invalid data', async () => {
    const message = createMockMessage({ jobId: 'job-123' });

    // Mock permanent error
    mockReaderAPI.mockRejectedValueOnce(new NotFoundError());

    await processMessage(message);

    // Should ack (prevent retry)
    expect(message.ack).toHaveBeenCalled();
    expect(await getJobStatus('job-123')).toBe('failed');
  });
});
```

### Integration Tests

```typescript
it('processes queue end-to-end', async () => {
  // 1. Enqueue job
  await queue.send({ jobId: 'job-123', ... });

  // 2. Trigger consumer
  await consumer.queue(batch);

  // 3. Verify results
  const item = await supabase
    .from('reader_items')
    .select('summary, tags')
    .eq('id', 'item-456')
    .single();

  expect(item.summary).toBeDefined();
  expect(item.tags).toHaveLength.greaterThan(0);
});
```

---

## Best Practices

### 1. Idempotent Processing

Design jobs to be safely retried:

```typescript
// Good: Idempotent (safe to run multiple times)
await supabase
  .from('reader_items')
  .update({ summary: newSummary })
  .eq('id', itemId);

// Bad: Not idempotent (duplicates data)
await supabase
  .from('summaries')
  .insert({ item_id: itemId, text: newSummary });
```

### 2. Update Status Immediately

```typescript
// Good: Update status before processing
await updateJobStatus(jobId, 'processing');
await generateSummary(content);
await updateJobStatus(jobId, 'completed');

// Bad: Status stays 'pending' during processing
await generateSummary(content);
await updateJobStatus(jobId, 'completed');
```

### 3. Acknowledge After Success

```typescript
// Good: Ack only after all work done
await processJob(message);
await saveResults();
message.ack();

// Bad: Ack before work complete
message.ack();
await processJob(message);  // If this fails, message is lost!
```

### 4. Log Generously

```typescript
console.log('[Consumer] Job started:', jobId);
console.log('[Consumer] Fetched content:', contentLength, 'chars');
console.log('[Perplexity] API call successful:', tokens, 'tokens');
console.log('[Consumer] Job completed:', jobId);
```

---

## Common Pitfalls

### 1. Acking Before Processing

```typescript
// Bad: Lose message if processing fails
message.ack();
await processJob(message);

// Good: Ack after success
await processJob(message);
message.ack();
```

### 2. Not Handling Errors

```typescript
// Bad: Unhandled error causes retry loop
await generateSummary(content);

// Good: Classify and handle errors
try {
  await generateSummary(content);
} catch (error) {
  await handleJobError(message, error);
}
```

### 3. Blocking Consumer

```typescript
// Bad: Serial processing blocks queue
for (const message of batch.messages) {
  await slowOperation(message);  // 5s each = 50s for 10 messages!
}

// Good: Parallel when possible
await Promise.all(
  batch.messages.map(msg => fastOperation(msg))  // All at once!
);
```

---

## Related Documentation

- [Features - AI Summaries](../features/ai-summaries.md) - Summary generation workflow
- [Architecture - Workers](../architecture/workers.md) - 3-worker architecture
- [Operations - Monitoring](../operations/monitoring.md) - Queue metrics and debugging
- [Operations - Troubleshooting](../operations/troubleshooting.md) - Queue issues
- [Error Handling](./error-handling.md) - Consistent error patterns
