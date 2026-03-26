# AI Summaries
REFERENCE > Features > AI Summaries

How AI-generated summaries are created using the Perplexity API.

## What Is This?
Automatic summary generation for saved articles using Perplexity's sonar-pro model. Summaries are 100-2000 characters with 3-10 AI-generated tags.

## Core Workflow

```
1. Queue consumer receives job message
2. Fetch full article content from Reader
3. Truncate if > 30k characters
4. Call Perplexity API with custom prompt
5. Parse markdown response (summary + tags)
6. Store results in database
7. Update job status
```

## Perplexity API Integration

### Model: sonar-pro
**Why sonar-pro?**
- Optimized for summarization
- Good balance of quality and cost
- Fast response times (~2-5 seconds)

### API Endpoint
```
POST https://api.perplexity.ai/chat/completions
```

### Request Format
```typescript
{
  model: 'sonar-pro',
  messages: [
    {
      role: 'system',
      content: systemPrompt,  // Can be customized by user
    },
    {
      role: 'user',
      content: articleContent,  // Max 30k chars
    },
  ],
}
```

### Default System Prompt
```
Create a concise summary (100-2000 characters) of this article with key takeaways as bullet points. Then suggest 3-10 relevant tags. Format as:

**Summary:**
- Key point 1
- Key point 2

**Tags:** tag1, tag2, tag3
```

**Custom Prompts:** Users can customize via Settings page (10-2000 chars).

See: [Settings](./settings.md)

### Response Format
```json
{
  "id": "response-id",
  "model": "sonar-pro",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "**Summary:**\n- Point 1\n- Point 2\n\n**Tags:** ai, tech, productivity"
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

Perplexity has a context window limit. We truncate long articles:

```typescript
const MAX_CONTENT_LENGTH = 30000;

let content = fullArticleContent;
let contentTruncated = false;

if (content.length > MAX_CONTENT_LENGTH) {
  content = content.substring(0, MAX_CONTENT_LENGTH);
  contentTruncated = true;
}

// Store flag
await supabase
  .from('reader_items')
  .update({ content_truncated: contentTruncated })
  .eq('id', itemId);
```

**UI Indicator:** Items with truncated content show a warning.

### Parsing Markdown Response

```typescript
function parsePerplexityResponse(markdown: string) {
  // Extract summary
  const summaryMatch = markdown.match(
    /\*\*Summary:\*\*\s*\n([\s\S]*?)(?=\*\*Tags:\*\*|$)/
  );
  const summary = summaryMatch?.[1]?.trim() || '';

  // Extract tags
  const tagsMatch = markdown.match(/\*\*Tags:\*\*\s*(.+)/);
  const tags = tagsMatch?.[1]?.split(',').map(t => t.trim()) || [];

  return { summary, tags };
}
```

**Fallbacks:**
- If parsing fails: Use full response as summary, empty tags array
- If summary empty: Log error, mark job as failed
- If tags empty: Store empty array (not critical)

## Queue Processing

### Consumer Worker Flow

```typescript
export default {
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        // 1. Update job status
        await updateJob(message.body.jobId, 'processing');

        // 2. Fetch full content from Reader
        const content = await fetchReaderContent(message.body.readerItemId);

        // 3. Truncate if needed
        const { content: truncated, wasTruncated } = truncateContent(content);

        // 4. Call Perplexity
        const response = await callPerplexity(truncated, env.PERPLEXITY_API_KEY);

        // 5. Parse response
        const { summary, tags } = parsePerplexityResponse(response.content);

        // 6. Store results
        await supabase
          .from('reader_items')
          .update({
            summary,
            tags,
            content_truncated: wasTruncated,
          })
          .eq('id', message.body.readerItemId);

        // 7. Update job as completed
        await updateJob(message.body.jobId, 'completed');

        // 8. Track tokens
        await trackTokenUsage(message.body.syncLogId, response.usage.total_tokens);

        // 9. Acknowledge message
        message.ack();
      } catch (error) {
        // Handle error
        await handleJobError(message, error);
      }
    }
  },
};
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
