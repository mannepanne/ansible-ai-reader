# Feature: Archive Sync — Mirror Reader Archives to Ansible

**Status**: Planned
**Last Updated**: 2026-04-02
**Dependencies**: Phase 3 ✅ (Reader integration), Phase 5 ✅ (archive flow exists)
**Related Issues**: [#26](https://github.com/mannepanne/ansible-ai-reader/issues/26), [#58](https://github.com/mannepanne/ansible-ai-reader/issues/58)

---

## Overview

When a user archives an item directly in Readwise Reader (rather than via Ansible), the corresponding summary stays visible in Ansible indefinitely. This feature closes that gap by polling for recently archived items during each sync and mirroring the archived state locally.

---

## What Already Exists

- `archived`, `archived_at` columns on `reader_items` — no schema changes needed
- `archiveItem()` in `src/lib/reader-api.ts` — existing PATCH pattern
- `fetchUnreadItems()` in `src/lib/reader-api.ts` — pagination pattern to follow
- `performSyncForUser()` in `src/lib/sync-operations.ts` — sync step to extend
- Reader API supports `location: 'archive'` filter and `updatedAfter` ISO 8601 parameter

---

## What Must Be Built

- `fetchRecentlyArchivedItems(apiToken, updatedAfter)` in `src/lib/reader-api.ts`
- Archive sync step inside `performSyncForUser()` in `src/lib/sync-operations.ts`

---

## Scope

### Part 1: `fetchRecentlyArchivedItems()` (`src/lib/reader-api.ts`)

New function alongside `fetchUnreadItems()`. Shares the same rate-limited HTTP client.

```typescript
fetchRecentlyArchivedItems(
  apiToken: string,
  updatedAfter: string  // ISO 8601 — typically last sync time
): Promise<ArchivedReaderItem[]>
```

**Request:**
```
GET https://readwise.io/api/v3/list/?location=archive&updatedAfter={iso8601}
```

**Response shape to capture** (subset of full Reader item):
```typescript
interface ArchivedReaderItem {
  id: string;             // reader_id — used to cross-reference local items
  updated_at: string;     // when it was archived in Reader
  // Future signal data (for issue #58 — captured now, used later):
  highlights_count?: number;
  notes?: string;
}
```

**Why capture highlight/note metadata now:** The same API response that tells us an item was archived also carries highlight counts and inline notes. Capturing these fields costs nothing extra and means issue #58's Reader-based interest signals (2a: highlights, 3: inline notes) won't require a separate API integration later. They can be persisted when the signal tracking feature is built.

**Pagination:** Use the same `nextPageCursor` pattern as `fetchUnreadItems()`. In practice, the window is short (since last sync, typically ≤1 hour) so pagination will rarely be needed, but implement it correctly.

**Validation:** Zod schema, same pattern as `ReaderItemSchema`.

---

### Part 2: Archive sync step in `performSyncForUser()` (`src/lib/sync-operations.ts`)

Add a second step after the existing unread items fetch:

```
Existing step: fetch location=new → upsert items → create summary jobs
New step:      fetch location=archive (updatedAfter=lastSyncTime) →
               find matching local items →
               mark as archived
```

**Determining `updatedAfter`:**
Use `sync_log.started_at` from the most recent completed sync for this user. If no prior sync exists (first sync), use a sensible default lookback (e.g. 30 days) to catch any items archived since the user first set up Ansible.

**Archive logic:**
```typescript
// For each returned archived item:
// 1. Look up local reader_items by reader_id + user_id
// 2. Skip if already archived locally (archived_at IS NOT NULL)
// 3. Otherwise: update archived=true, archived_at=NOW()
```

Batch the lookups — a single `WHERE reader_id = ANY($1)` query rather than N individual queries.

**Error handling:** Archive sync failure should not abort or fail the overall sync. Log the error to `sync_log.errors` and continue. Unread item sync and summary generation must not be blocked by an archive sync error.

**`PerformSyncResult` additions:**
```typescript
{
  syncId: string;
  totalItems: number;
  totalFetched: number;
  itemsArchived: number;   // new — count of items archived this sync
  errors?: number;
}
```

---

## No Schema Changes Required

`archived` (BOOLEAN) and `archived_at` (TIMESTAMPTZ) already exist on `reader_items`. No migration needed.

---

## Future Extension: Interest Signals (Issue #58)

When issue #58 is implemented, the Reader-based signals (highlights, inline notes) will be available without a new API call — `fetchRecentlyArchivedItems()` already returns them. The only additional work will be:

1. Adding signal storage columns to `reader_items` (e.g. `reader_highlights_count INTEGER`)
2. Persisting the values already returned by this feature's API call

This is why `ArchivedReaderItem` captures `highlights_count` and `notes` even though they aren't used yet.

---

## Testing Strategy

### Unit tests

**`src/lib/reader-api.test.ts`**
- `fetchRecentlyArchivedItems()` constructs correct URL with `location=archive` and `updatedAfter`
- Returns parsed array of `ArchivedReaderItem` on success
- Handles empty results (no items archived since last sync)
- Handles pagination (multiple pages)
- Propagates API errors

**`src/lib/sync-operations.test.ts`**
- Archive sync step runs after unread fetch
- Items found in Reader archive that exist locally → marked archived
- Items already archived locally → skipped (no duplicate update)
- Items in Reader archive that don't exist locally → ignored (no error)
- Archive sync error → logged, sync continues (unread sync unaffected)
- `itemsArchived` count returned correctly in result

---

## Out of Scope

- **Webhooks / real-time sync** — Reader webhook docs are sparse on archive events; polling during sync is sufficient. Revisit if real-time becomes a strong user need.
- **Interest signals storage** — Covered by issue #58. The API groundwork is laid here; the DB columns and persistence logic belong in that feature.
- **Un-archiving** — If a user moves an item back out of their Reader archive, we do not currently un-archive it in Ansible. Edge case; defer.

---

## Pre-commit Checklist

- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] No `console.log` or debug code
- [ ] No secrets in code

---

## PR Workflow

**Branch:** `feature/archive-sync`
**Review:** `/review-pr` — contained change to two existing files, no schema changes

---

## Related Documentation

- [REFERENCE/features/reader-sync.md](../REFERENCE/features/reader-sync.md) — Reader API integration patterns
- [REFERENCE/features/automated-sync.md](../REFERENCE/features/automated-sync.md) — Sync scheduling
- [Issue #26](https://github.com/mannepanne/ansible-ai-reader/issues/26) — Archive sync request
- [Issue #58](https://github.com/mannepanne/ansible-ai-reader/issues/58) — Interest signals (future extension)
