# Interest Signals
REFERENCE > Features > Interest Signals

Engagement event log that tracks how interested Magnus is in each article. The data foundation for future "sort by likelihood to be interesting" functionality.

## What Is This?

Every meaningful engagement action on an article generates a signal record in the `item_signals` table. Over time, correlating signals with article tags reveals patterns — which topics consistently trigger deeper engagement.

**Phase 1** (implemented): Local Ansible actions only — no Reader API dependency.
**Phase 2** (planned, depends on #26): Reader-side signals — highlights and inline notes added in Reader itself.

## Signal Types

| Signal | Strength | Trigger | Deduplication |
|---|---|---|---|
| `click_through` | Weak | Clicked "Open in Reader" | None — every click recorded |
| `note_added` | Medium | Saved a note | First note only — edits don't count |
| `rated_interesting` | Strong | Rated 💡 | None — every rating change recorded |
| `rated_not_interesting` | Anti | Rated 🤷 | None — every rating change recorded |

## Design: Append-Only Event Log

`item_signals` is a history log, not a current-state table. Each engagement event gets its own row. This means:

- **Rating toggles are fully tracked** — switching from interesting to not interesting to interesting again = three events. The full history is preserved, including ambivalence.
- **Current state** of a rating is always read from `reader_items.rating` (authoritative). Signals record what happened and when.
- **No UPDATE or DELETE** on `item_signals` — enforced at both application and RLS level.

## Technical Implementation

### API Endpoints

**`POST /api/reader/signal`** — Click-through capture
```typescript
{ itemId: string }  // UUID
```
- Verifies item belongs to authenticated user before inserting
- Returns `{ success: true }` even if item not found or insert fails (non-blocking by design)
- Every call inserts a new row — multiple clicks = stronger signal

**`POST /api/reader/rating`** — Extended with signal side-effect
- Inserts `rated_interesting` or `rated_not_interesting` after successful rating update
- `null` rating (unrate) produces no signal
- Signal failure never causes rating update to fail

**`POST /api/reader/note`** — Extended with signal side-effect
- Inserts `note_added` if previous `document_note` was null or whitespace-only
- Does not insert signal on note edits
- Signal failure never causes note save to fail

### UI: Click-Through Capture

`SummaryCard.tsx` passes an optional `onClickThrough` prop. When provided, clicking "Open in Reader" calls it before the browser navigates. `SummariesContent.tsx` implements `handleClickThrough` as a fire-and-forget `fetch` to `/api/reader/signal`:

```typescript
function handleClickThrough(itemId: string) {
  fetch('/api/reader/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  }).catch((err) => console.error('[Signal] Failed to record click_through:', err));
}
```

Navigation is never blocked regardless of signal API outcome.

### Database Schema

See [database-schema.md](../architecture/database-schema.md#item_signals) for full schema, indexes, and RLS policies.

### Non-Blocking Architecture

Signal capture is intentionally "best-effort" everywhere:
- API endpoint returns success even on item-not-found or insert failure
- Rating/note endpoints wrap signal inserts in `try/catch` — failures are logged, not propagated
- Client-side click-through uses `.catch()` with no `await`

A signal that blocks a user action would be worse than no signal at all.

## Future Use

The first increment of data collection. Once enough signals are recorded, future work can:

1. **Correlate signals with tags** — Which tags predict click-through? Which predict "not interesting"?
2. **Sort by predicted interest** — Surface articles with tag patterns that historically trigger engagement
3. **Phase 2 signals** — Add Reader-side highlights and inline notes (via archive sync polling)

Example analysis query:
```sql
SELECT t.name, COUNT(s.id) as click_count
FROM item_signals s
JOIN reader_items i ON s.item_id = i.id
JOIN item_tags it ON i.id = it.item_id
JOIN tags t ON it.tag_id = t.id
WHERE s.signal_type = 'click_through'
  AND s.user_id = $1
GROUP BY t.name
ORDER BY click_count DESC;
```

## Related Documentation

- **[ratings.md](./ratings.md)** — Rating system (source of `rated_*` signals)
- **[document-notes.md](./document-notes.md)** — Notes system (source of `note_added` signal)
- **[database-schema.md](../architecture/database-schema.md#item_signals)** — Full schema and RLS
- **Issue [#58](https://github.com/mannepanne/ansible-ai-reader/issues/58)** — Original feature specification

---

**Implemented:** 2026-04-11
**Related PR:** [#94](https://github.com/mannepanne/ansible-ai-reader/pull/94)
