# Tags
REFERENCE > Features > Tags

AI-generated tags for categorizing and filtering articles.

## What Is This?
Perplexity generates 3-10 relevant tags for each article. Tags can be regenerated if needed.

## Tag Generation

### During Summary Generation
Tags generated automatically as part of AI summary process.

**Prompt Format:**
```
**Tags:** tag1, tag2, tag3
```

**Parsing:**
```typescript
const tagsMatch = markdown.match(/\*\*Tags:\*\*\s*(.+)/);
const tags = tagsMatch?.[1]?.split(',').map(t => t.trim()) || [];
```

See: [AI Summaries](./ai-summaries.md)

## Tag Regeneration

### Use Case
User wants different tags (e.g., more specific, different categories) for items that have summaries but no tags.

### Endpoint
```typescript
POST /api/reader/regenerate-tags

Response: {
  regenerateId: "uuid",  // Batch ID for tracking this regeneration operation
  totalItems: 2,         // Number of items queued for regeneration
  errors?: Array<{       // Optional: items that failed to queue
    item_id: string,
    title: string,
    error: string
  }>
}
```

**Note:** Automatically finds all items with summaries but missing tags. No request body needed.

### Progress Tracking

**Status Endpoint:**
```typescript
GET /api/reader/regenerate-tags-status?regenerateId=<uuid>

Response: {
  regenerateId: "uuid",
  totalJobs: 10,
  completedJobs: 7,
  failedJobs: 1,
  inProgressJobs: 1,
  pendingJobs: 1,
  status: 'processing',  // 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed'
  failedItems?: Array<{
    itemId: string,
    title: string,
    error: string
  }>
}
```

**Frontend polls status every 2 seconds** to update progress bar.

### Process
1. Endpoint finds items with summaries but `tags` is `null` or `[]`
2. Creates jobs with `regenerate_batch_id` for tracking
3. Enqueues to processing queue
4. Frontend polls status endpoint for progress updates
5. Consumer re-fetches content from Reader API
6. Perplexity generates new summary + tags
7. Overwrites existing summary and tags in database
8. Progress bar shows "X / Y items" with visual indicator
9. Completion message shown (green/yellow/red based on status)

**Database Tracking:**
- Each job gets `regenerate_batch_id` (TEXT, indexed)
- Enables querying progress for specific regeneration operation
- Independent from sync operations (uses `sync_log_id` for sync)

**Note:** Regenerates both summary AND tags (can't regenerate tags alone). This is a known limitation tracked in technical debt (TD-002).

### UX Flow
1. User clicks "Regenerate Tags" button in header
2. Progress bar appears: "Tag Regeneration Progress: 0 / 10"
3. Bar updates every 2 seconds as jobs complete
4. Completion message: "✅ Successfully regenerated tags for 10 items"
5. Items list refreshes automatically with new tags

**No confirmation popup** - operation starts immediately with silent background processing.

## UI Display

### Tag Badges
```typescript
{item.tags.map(tag => (
  <span key={tag} className="tag-badge">
    {tag}
  </span>
))}
```

### Regenerate Tags Button
- **Location:** Header (orange button, before Sync)
- **Label:** "Regenerate Tags" (desktop) / "Tags" (mobile ≤640px)
- **Triggers:** Batch regeneration for all items needing tags
- **Shows progress bar** while processing (same UX as Sync button)

## Future Enhancements
- Filter items by tag
- Tag cloud view
- Custom tag editing
- Tag-only regeneration

## Related Documentation
- [AI Summaries](./ai-summaries.md) - How tags are generated
- [Reader Sync](./reader-sync.md) - Initial tag creation
