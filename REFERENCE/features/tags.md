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
User wants different tags (e.g., more specific, different categories).

### Endpoint
```typescript
POST /api/reader/regenerate-tags

Body: { itemIds: ["uuid1", "uuid2"] }

Response: {
  sync_id: "uuid",
  jobs_created: 2
}
```

### Process
1. Create new jobs for selected items
2. Enqueue to processing queue
3. Consumer re-fetches content
4. Perplexity generates new summary + tags
5. Overwrites existing data

**Note:** Regenerates both summary AND tags (can't regenerate tags alone).

## UI Display

### Tag Badges
```typescript
{item.tags.map(tag => (
  <span key={tag} className="tag-badge">
    {tag}
  </span>
))}
```

### Regenerate Button
Located in header, triggers regeneration for visible items.

## Future Enhancements
- Filter items by tag
- Tag cloud view
- Custom tag editing
- Tag-only regeneration

## Related Documentation
- [AI Summaries](./ai-summaries.md) - How tags are generated
- [Reader Sync](./reader-sync.md) - Initial tag creation
