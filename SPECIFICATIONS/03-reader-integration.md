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
- [ ] Implement Reader API client (TypeScript)
- [ ] Create "Sync Reader" button on /summaries page
- [ ] Fetch unread items from Reader API (with pagination)
- [ ] Store items in database (without summaries yet - that's Phase 4)
- [ ] Display list of items (title, URL, author, source, created date)
- [ ] Implement archive functionality (syncs back to Reader)
- [ ] Add loading states for sync operation
- [ ] Handle API errors gracefully
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
Background process:
  1. Fetch unread items from Reader API (location=new)
  2. Handle pagination (nextPageCursor)
  3. For each item, insert into database (if not exists)
  4. Show progress indicator ("Syncing... X items fetched")
  ↓
List view shows items:
  - Title
  - URL
  - Author (if available)
  - Source (blog, newsletter, pdf, etc.)
  - Created date
  - "Archive" button
  ↓
User clicks "Archive" on an item
  ↓
  1. PATCH to Reader API (location=archive)
  2. Mark as archived in Ansible database
  3. Remove from list view
```

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

- **Check API docs for rate limits** (need to verify actual limits)
- Implement retry logic with exponential backoff
- Handle common errors:
  - 401 Unauthorized (invalid token)
  - 429 Too Many Requests (rate limit)
  - 500 Server Error (Reader API issues)
- Log errors to `sync_log` table for debugging

---

## Database Operations

### Storing Items

```typescript
// Pseudocode for sync operation
async function syncReaderItems(userId: string) {
  let pageCursor = null;
  let totalFetched = 0;

  do {
    const response = await readerAPI.fetchUnreadItems(pageCursor);

    for (const item of response.results) {
      await db.reader_items.upsert({
        user_id: userId,
        reader_id: item.id,
        title: item.title,
        url: item.url,
        author: item.author,
        source: item.source,
        content_type: item.content_type,
        created_at: item.created_at,
        // short_summary, tags, etc. added in Phase 4
      });
    }

    totalFetched += response.results.length;
    pageCursor = response.nextPageCursor;
  } while (pageCursor);

  return totalFetched;
}
```

### Archiving Items

```typescript
async function archiveItem(itemId: string, readerId: string) {
  // 1. Archive in Reader
  await readerAPI.archiveItem(readerId);

  // 2. Mark as archived in database
  await db.reader_items.update({
    where: { id: itemId },
    data: {
      archived: true,
      archived_at: new Date(),
    },
  });
}
```

---

## Testing Strategy

### Required Tests

**1. Reader API Client Tests**
- [ ] Fetch unread items successfully
- [ ] Handle pagination correctly
- [ ] Archive item via API
- [ ] Handle invalid API token (401 error)
- [ ] Handle rate limiting (429 error)
- [ ] Retry logic works with exponential backoff

**2. Database Operations Tests**
- [ ] Items stored correctly (upsert prevents duplicates)
- [ ] UNIQUE constraint (user_id, reader_id) enforced
- [ ] Archive updates database correctly
- [ ] Timestamps set properly

**3. Integration Tests**
- [ ] Full sync operation works end-to-end
- [ ] Pagination fetches all items
- [ ] Archive syncs to both Reader and database
- [ ] Error states handled gracefully

**4. UI Tests**
- [ ] "Sync Reader" button shows loading state
- [ ] Progress indicator updates during sync
- [ ] Items displayed in list view
- [ ] "Archive" button removes item from view
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
- [ ] Manual testing: sync fetches real Reader items
- [ ] Manual testing: archive syncs back to Reader
- [ ] Reader API token documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] Error handling tested (invalid token, rate limits)
- [ ] No secrets committed to repository
- [ ] Pagination tested with large item counts

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

1. ✅ "Sync Reader" button fetches unread items
2. ✅ Pagination handles large item counts
3. ✅ Items stored in database correctly
4. ✅ Archive button syncs to Reader
5. ✅ Error handling works for common failures
6. ✅ All tests passing with 95%+ coverage
7. ✅ No secrets in repository
8. ✅ PR merged to main branch

---

## Technical Considerations

### API Performance
- **Pagination**: Handle potentially hundreds of items
- **Timeouts**: Cloudflare Workers have execution time limits
- **Solution**: Process in batches, show progress incrementally

### Data Consistency
- **Duplicate prevention**: UNIQUE constraint on (user_id, reader_id)
- **Upsert strategy**: Update if exists, insert if new
- **Archive sync**: Ensure both Reader and Ansible updated

### User Experience
- **Loading states**: Clear progress indicator during sync
- **Error messages**: User-friendly explanations of failures
- **Empty states**: Helpful guidance when no items exist

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Reader API**: https://readwise.io/reader_api
