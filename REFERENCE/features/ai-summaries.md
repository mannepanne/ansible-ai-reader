# AI Summaries
REFERENCE > Features > AI Summaries

How AI-generated summaries are created using the Perplexity API.

## What Is This?
Automatic summary generation for saved articles using Perplexity's `sonar` model. Summaries are up to 2000 characters with 3-5 AI-generated tags.

## Core Workflow

```
1. Queue consumer receives job message
2. Update job status to 'processing'
3. Fetch full article content from Reader
4. Fetch user's custom summary_prompt from DB (optional — falls back to default)
5. Truncate content if > 30k characters (smart truncation: first 80%, last 20%)
6. Call Perplexity API (custom prompt prepended if present)
7. Parse markdown response (## Summary + ## Tags sections)
8. Store results in database
9. Update job status to 'completed'
```

## Perplexity API Integration

### Model: sonar
**Why sonar?**
- Good balance of quality and cost for summarization
- Fast response times (~2-5 seconds)
- Rate limit: 50 requests/minute (enforced via PQueue)

### API Endpoint
```
POST https://api.perplexity.ai/chat/completions
```

### Request Format
```typescript
{
  model: 'sonar',
  messages: [
    {
      role: 'system',
      content: 'You are summarising content for a person who is evidence-driven and time-poor. Focus on key take aways and novel discoveries. Prioritise signal over noise.',
    },
    {
      role: 'user',
      content: `[customPrompt + "\n\n" if set]Summarize this article (max 2000 characters). Also provide 3-5 relevant tags.

Title: [title]
Author: [author]
Content: [content]

Your response must include a ## Summary section and a ## Tags section. Structure the summary however best fits the content and any additional instructions above.

## Tags should be a comma-separated list, e.g.: tag1, tag2, tag3`,
    },
  ],
  max_tokens: 1000,
  temperature: 0.2,
}
```

**Custom Prompts:** Users can add a custom prompt (10-2000 chars) in Settings. It is prepended to the user message, allowing them to focus summaries on interests or add format instructions.

See: [Settings](./settings.md)

### Response Format
```json
{
  "id": "response-id",
  "model": "sonar",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "## Summary\n- Point 1\n- Point 2\n\n## Tags\nai, tech, productivity"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1500,
    "completion_tokens": 150,
    "total_tokens": 1650
  }
}
```

### Token Tracking
We track token usage for cost monitoring:
```sql
UPDATE sync_log
SET total_tokens_used = total_tokens_used + $1
WHERE id = $2;
```

**Cost Estimation:**
- Model: sonar-pro (~$1 per 1M tokens)
- Average article: 1500-3000 tokens
- Cost per summary: ~$0.002-$0.003

## Content Handling

### Truncation (30k Character Limit)

Long articles are smart-truncated to stay within Perplexity's context window:

```typescript
// smartTruncate() in src/lib/perplexity-api.ts
// Keeps first 80% + last 20% to preserve intro and conclusion
const keepStart = Math.floor(maxChars * 0.8);  // 24,000 chars
const keepEnd = maxChars - keepStart;           // 6,000 chars
const truncated = content.substring(0, keepStart)
  + '\n\n[... content truncated for length ...]\n\n'
  + content.substring(content.length - keepEnd);
```

**Why 80/20?** Preserves the article's introduction (sets context) and conclusion (often has key takeaways), dropping the middle body which is typically less information-dense.

**UI Indicator:** Items with truncated content store `content_truncated: true` in the DB.

### Parsing Markdown Response

The parser (`parseSummaryResponse` in `src/lib/perplexity-api.ts`) anchors on the
**`## Tags` header as the stable delimiter** — not on `## Summary`:

- **Summary** = everything *before* the `## Tags` header, with an optional leading
  `## Summary` header stripped. The `## Summary` header is deliberately **not**
  required: the prompt tells the model to "structure the summary however best fits",
  so it frequently omits or varies that header. Anchoring on `## Summary` (as an
  earlier version did) dropped those summaries to `null` even though the prose was
  present — the "tags show, summary missing" bug.
- **Tags** = the first non-empty line after the `## Tags` header, split on commas
  (trailing prose can't leak into the tag list).
- Heading level (`#`–`######`), surrounding spaces, and CRLF line endings are all
  tolerated.

**Fallbacks:**
- Headerless summary before `## Tags`: captured as the summary (not null).
- If there's no `## Tags` section at all: fall back to strict `## Summary`
  extraction, so a genuinely unstructured/garbage response still yields `null`.
- If `## Tags` missing: `tags` is `[]`.
- **Tags parsed but summary still `null`:** logs the raw response at error level
  (`[Perplexity] Response had tags but no parseable summary`) so the actual model
  output is visible — otherwise this state is silent.
- Validated with Zod — partial result returned on validation failure (not a crash).

**Custom prompts and format:** The prompt instructs Perplexity to "structure the
summary however best fits the content and any additional instructions above" — so
users can request different internal formats (prose, bullet points, sections) via
their custom prompt. Only the `## Tags` anchor needs to survive; the summary is
whatever precedes it.

## Queue Processing

### Consumer Worker Flow

```typescript
// workers/consumer.ts — processJob() (summary_generation branch)

// 1. Fetch article content from Reader API
const htmlContent = await fetchReaderItem(readerItem.source_url, env.READER_API_KEY);

// 2. Fetch user's custom prompt (optional — fall back to default if missing)
const { data: userSettings } = await supabase
  .from('users')
  .select('summary_prompt')
  .eq('id', job.user_id)
  .single();
const customPrompt = userSettings?.summary_prompt ?? undefined;

// 3. Generate summary (custom prompt prepended if set)
const result = await generateSummary(env.PERPLEXITY_API_KEY, {
  title, author, content, url,
}, customPrompt);

// 4. Store results
await supabase.from('reader_items').update({
  short_summary: result.summary,
  tags: result.tags,
  content_truncated: result.contentTruncated,
}).eq('id', readerItem.id);

// 5. Update job as completed
await supabase.from('processing_jobs').update({ status: 'completed' }).eq('id', job.id);
```

### Batch Processing
- **Batch size**: 10 messages
- **Timeout**: 30 seconds per batch
- **Parallel**: Process messages in parallel within batch

### Error Handling

**Retry Logic:**
1. First attempt fails → Retry automatically
2. Second attempt fails → Retry automatically
3. Third attempt fails → Move to Dead Letter Queue

**Error Types (Reader content fetch):**
- **Network / 5xx errors**: transient → retry
- **429 rate limiting**: transient → retry. Note: the consumer's content fetch is
  a *raw* fetch, not behind the rate-limited `readerQueue`, so it's the path most
  exposed to Reader 429s under sync load — it must retry, never treat 429 as fatal.
- **404 / 410 or empty results (item gone)**: `ContentUnavailableError` → permanent
  + auto-archive immediately (`reader_deleted: true`).
- **No `html_content` / content < 100 chars**: `RecoverableContentError` (a
  *transient* subclass) → retried, because Reader may still be parsing a
  freshly-saved item. Auto-archived (`reader_deleted: false`) only if still empty
  after retries are exhausted — this avoids prematurely hiding an item Reader was
  merely slow to parse.
- **Other 4xx (401/403)**: permanent, mark failed (auth/permission, not a content problem — not auto-archived).

**Failure outcomes:**
- **Content that can never be summarized** — auto-archived so it drops out of the
  unread list instead of lingering as an un-summarizable ghost. `reader_deleted` is
  `true` for gone items (404/410/empty results, archived immediately) and `false`
  for empty-but-present items (archived only after retries exhaust). Mirrors the
  manual archive route's field writes (local DB only; the Reader-side archive is
  unnecessary — the item is either gone or has no readable content). A local
  `archived_at` guard in `sync-operations` stops the next sync from re-enqueuing a
  doomed job for an auto-archived item that still sits in Reader's unread list.
- **Null/empty summary from a parseable response** — throws a plain
  `PermanentError` ("Perplexity returned no usable summary"). The job fails
  **visibly** (surfaces under "Retry Failed") but the item is **not** archived:
  Perplexity is stochastic (`temperature: 0.2`), so a manual retry may succeed. A
  null/empty summary is treated as a failure rather than stored — storing it would
  surface a tagged card reading "No summary available".

## Database Schema

### Storage
```sql
UPDATE reader_items
SET
  summary = $1,
  tags = $2,
  content_truncated = $3,
  updated_at = NOW()
WHERE id = $4;
```

### Job Status Tracking
```sql
UPDATE jobs
SET
  status = 'completed',
  updated_at = NOW()
WHERE id = $1;
```

## UI Display

### ReactMarkdown Rendering

Summaries are rendered as formatted markdown:

```typescript
import ReactMarkdown from 'react-markdown';

<ReactMarkdown>{item.summary}</ReactMarkdown>
```

**Supported Formatting:**
- **Bold text**: `**bold**`
- Bullet lists: `- item`
- Links: `[text](url)`
- Inline code: `` `code` ``

### Tags Display
Tags shown as clickable badges (future: filter by tag).

```typescript
{item.tags.map(tag => (
  <span key={tag} className="tag-badge">{tag}</span>
))}
```

### Truncation Warning
If `content_truncated = true`:
```
⚠️ Content was truncated (>30k chars) - summary may be incomplete
```

## Performance

### Average Timing
- Fetch content from Reader: ~500ms
- Call Perplexity API: ~2-5 seconds
- Parse + store: ~100ms
- **Total: ~3-6 seconds per item**

### Optimization Strategies
- **Parallel processing**: 10 concurrent jobs
- **Batching**: Process multiple items together
- **Caching**: Don't regenerate existing summaries
- **Content truncation**: Stay within API limits

## Regeneration

Two regeneration paths exist — on-demand (single item, synchronous) and batch (all items, queue-based).

### On-Demand Refresh (single item)

**Use Case:** User wants to immediately refresh a specific item's summary and tags, e.g. after changing their custom prompt.

**Trigger:** ↺ Refresh button on the Summary tab in the card UI.

**Endpoint:**
```
POST /api/reader/regenerate-summary
Body: { "itemId": "uuid" }
Response: { "summary": string | null, "tags": string[], "contentTruncated": boolean }
```

**Process:**
1. Auth + ownership check (`.eq('user_id', user.id)`)
2. Fetch user's custom prompt from `users.summary_prompt` (falls back to default)
3. Fetch full article content from Reader (`fetchArticleContent`)
4. Call Perplexity (`generateSummary`) with custom prompt
5. Write `short_summary`, `tags`, `content_truncated`, `updated_at` to DB
6. Log token usage to `sync_log` (non-fatal)
7. Return new summary + tags — card updates in-place without page reload

**Implementation:** `src/app/api/reader/regenerate-summary/route.ts`

### Retrying Failed Summary Jobs (batch, queue-based)

**Use Case:** A previous sync or regeneration left some items with failed `summary_generation` jobs (Reader API hiccup, Perplexity rate limit, etc.) and the user wants to re-run them without re-syncing the whole inbox.

**Endpoint:**
```
POST /api/reader/retry
Body: { "syncId": "uuid" }   // OR { "regenerateId": "uuid" } — exactly one
Response: { "retriedCount": number }
```

**Process:**
1. Auth check (`syncId`/`regenerateId` must belong to the calling user)
2. Look up failed `processing_jobs` rows for that operation
3. Reset their status to `pending` and re-enqueue to `PROCESSING_QUEUE`
4. Consumer picks them up and runs the same path as the original job (`summary_generation` re-fetches Reader content; `tags_generation` reads existing summary)

**Note:** This is a *retry* of failed jobs, not a "regenerate all summaries" operation. There is no batch endpoint for re-running every summary after a prompt change — use the on-demand single-item refresh above for that, item-by-item. For tag-only refresh of items with summaries-but-no-tags, see [Tags → Tag Regeneration](./tags.md#tag-regeneration).

## Cost Monitoring

### Tracking
```sql
SELECT SUM(total_tokens_used) as total_tokens
FROM sync_log
WHERE user_id = $1;
```

**Dashboard (future):**
- Tokens used per sync
- Total tokens per user
- Estimated cost

### Optimization
- Use efficient prompts (shorter = fewer tokens)
- Don't regenerate unnecessarily
- Monitor for anomalies (sudden spikes)

## Troubleshooting

### Summaries Not Generating
- Check Perplexity API key is valid
- Verify queue consumer is running
- Check job status in database

### Poor Quality Summaries
- Check prompt is clear and specific
- Verify content isn't truncated
- Consider using longer prompt for better results

### High Token Usage
- Check for long articles (truncate earlier?)
- Verify prompt isn't unnecessarily long
- Look for repeated regenerations

### Parsing Errors
- Check Perplexity response format
- Verify markdown parsing logic
- Fallback to raw content if parsing fails

## Related Documentation
- [Reader Sync](./reader-sync.md) - How content is fetched
- [Tags](./tags.md) - Tag generation and regeneration
- [Settings](./settings.md) - Custom prompts
- [Workers](../architecture/workers.md) - Queue consumer implementation
- [Queue Processing Pattern](../patterns/queue-processing.md)
