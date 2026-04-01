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

The parser (`parseSummaryResponse` in `src/lib/perplexity-api.ts`) looks for `## Summary` and `## Tags` headings:

```typescript
// Extract summary: everything between "## Summary" and "## Tags" (or end)
const summaryMatch = text.match(/## Summary\n([\s\S]*?)(?=\n## Tags|$)/);

// Extract tags: comma-separated list on line after "## Tags"
const tagsMatch = text.match(/## Tags\n(.*)/);
const tags = tagsString.split(',').map(tag => tag.trim()).filter(Boolean);
```

**Fallbacks:**
- If `## Summary` missing: `summary` is `null`
- If `## Tags` missing: `tags` is `[]`
- Validated with Zod — partial result returned on validation failure (not a crash)

**Custom prompts and format:** The prompt instructs Perplexity to "structure the summary however best fits the content and any additional instructions above" — so users can request different internal formats (prose, bullet points, sections) via their custom prompt, as long as the `## Summary` and `## Tags` anchors remain.

## Queue Processing

### Consumer Worker Flow

```typescript
// workers/consumer.ts — processSummaryGeneration()

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
await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id);
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

**Error Types:**
- **Network errors**: Retry
- **API errors (4xx)**: Don't retry, mark failed
- **Rate limiting (429)**: Retry with backoff
- **Parsing errors**: Don't retry, log error

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

### Use Case
User wants updated summary with different prompt or tags.

### Trigger
```
POST /api/reader/regenerate-tags
```

**Body:**
```json
{
  "itemIds": ["uuid1", "uuid2"]
}
```

**Process:**
1. Create new jobs for specified items
2. Enqueue to processing queue
3. Consumer re-fetches content and regenerates
4. Overwrites existing summary/tags

**Note:** Full content is re-fetched from Reader (not stored locally).

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
