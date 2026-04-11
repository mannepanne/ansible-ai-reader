# Feature: Interest Signals — Phase 1 (Local Actions)

**Status**: Implemented — Merged PR #94
**Last Updated**: 2026-04-11
**Dependencies**: Phase 5 ✅ (Notes & Rating), Phase 3 ✅ (Reader Integration)
**Related Issue**: [#58](https://github.com/mannepanne/ansible-ai-reader/issues/58)
**Phase 2 dependency**: [#26](https://github.com/mannepanne/ansible-ai-reader/issues/26) (Archive Sync — Reader-side signals)

---

## Overview

Track engagement signals that indicate how interested Magnus is in a given article. The raw signal data is the first step toward a future "sort by likelihood to be interesting" feature — correlating signals with tags to surface patterns in reading behaviour over time.

Phase 1 captures only signals that can be recorded from local Ansible actions, with no dependency on polling the Reader API. Phase 2 (Reader-side signals: highlights, inline notes) will be built on top of the Archive Sync infrastructure from #26.

---

## Signal Model

Signals are an **append-only event log**, not a current-state snapshot. Every signal event that occurs is recorded. This means:

- Rating changes are fully tracked (e.g., interesting → not interesting → interesting = three events)
- Flip-flopping is itself potentially meaningful data
- The most recent signal per item per type gives current state when needed
- `reader_items.rating` remains the authoritative source of current rating state

### Phase 1 Signals

| Signal Type | Strength | Trigger |
|---|---|---|
| `click_through` | Weak | User clicks "Open in Reader" |
| `note_added` | Medium | User saves a note (first time only — not on edits) |
| `rated_interesting` | Strong | User rates item as 💡 (rating=4) |
| `rated_not_interesting` | Anti | User rates item as 🤷 (rating=1) |

**Click-through**: Log every click. Multiple clicks on the same article indicate returning to re-read — stronger interest than a single visit.

**Note added**: Log only the transition from no-note → has-note. Subsequent edits to an existing note do not generate a new signal.

**Rating signals**: Log every rating event, including toggles and changes. The history of rating changes is richer data than just the final state.

---

## What Already Exists (and must be preserved)

- `reader_items.rating` — current rating state, authoritative, not changed by this feature
- `reader_items.document_note` — note content, not changed by this feature
- `/api/reader/rating` — existing endpoint, will be extended to also write signals
- `/api/reader/note` — existing endpoint, will be extended to also write signals
- `SummaryCard.tsx` — existing UI component, "Open in Reader" link will get an onClick handler

---

## What Must Be Built

### 1. Database: `item_signals` table

```sql
CREATE TABLE item_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'click_through',
    'note_added',
    'rated_interesting',
    'rated_not_interesting'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for pattern analysis queries (tags × signals)
CREATE INDEX item_signals_item_id_idx ON item_signals(item_id);
CREATE INDEX item_signals_user_id_idx ON item_signals(user_id);
CREATE INDEX item_signals_signal_type_idx ON item_signals(signal_type);
CREATE INDEX item_signals_created_at_idx ON item_signals(created_at);
```

**RLS Policies:**
- `authenticated` users can INSERT their own signals (`user_id = auth.uid()`)
- `authenticated` users can SELECT their own signals (`user_id = auth.uid()`)
- No UPDATE or DELETE (append-only)

No foreign key to `reader_items` tags — analysis joins happen at query time, consistent with the existing analytics design pattern (see ADR: no foreign keys between analytics and main tables).

---

### 2. API: `POST /api/reader/signal`

New endpoint. Handles click-through signals (the only signal that doesn't piggyback on an existing endpoint).

**Request:**
```typescript
{ itemId: string }  // UUID
```

**Validation (Zod):**
- `itemId`: UUID format
- item must belong to authenticated user (verify ownership before inserting)

**Response:**
```typescript
{ success: true }
```

**Behaviour:**
- Inserts `signal_type: 'click_through'` into `item_signals`
- Every call inserts a new row (multiple clicks = multiple signals, by design)
- Returns 200 even if item not found — signal capture should never block navigation

**Error handling:** Silent failure is acceptable. A failed signal capture must not prevent the user from opening Reader. Log errors server-side but return success to client.

---

### 3. Extend existing endpoints

#### `POST /api/reader/rating`

After updating `reader_items.rating`, also insert into `item_signals`:
- rating=4 → `rated_interesting`
- rating=1 → `rated_not_interesting`
- rating=null (unrate) → no signal (unrating is not a signal worth tracking)

The signal insert should not affect the response or cause the rating update to fail. Use a try/catch that logs but does not propagate signal write failures.

#### `POST /api/reader/note`

After saving the note, check if this is the **first** note on this item (previous `document_note` was null or empty). If so, insert `note_added` into `item_signals`.

The check must use the *previous* state of the note (before the save), not the post-save state. The signal insert should be fire-and-forget — note save failures and signal write failures are independent.

---

### 4. UI: Click-through tracking in `SummaryCard.tsx`

The "Open in Reader" link currently:
```tsx
<a href={url} target="_blank" rel="noopener noreferrer">Open in Reader</a>
```

Add an `onClick` handler that fires a non-blocking signal capture:
```tsx
<a
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  onClick={() => captureClickThrough(itemId)}
>
  Open in Reader
</a>
```

The `captureClickThrough` function calls `POST /api/reader/signal` with `fetch` — fire-and-forget, no await on the navigation path. The link navigates regardless of whether the signal API call succeeds.

**No UI feedback required.** Signal capture is invisible to the user.

---

## Data Model for Future Analysis (Phase 2+ context)

The signals table is intentionally minimal. Future pattern analysis will join:

```sql
-- Example: which tags correlate with click-through?
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

No schema changes needed to support this — the join is sufficient.

---

## Out of Scope (Phase 1)

- Signal 2a: Click-through + highlights added in Reader (requires #26 archive sync)
- Signal 3: Click-through + inline notes in Reader (requires #26 archive sync)
- Any UI surfacing of signal data (charts, counts, per-item signal indicators)
- "Sort by likelihood to be interesting" ranking algorithm
- Backfilling historical ratings/notes as signals (no timestamps available for past data)

---

## Testing Requirements

**Coverage target: 95%+ lines/functions/statements, 90%+ branches** (project standard)

### Unit / Integration Tests

**`/api/reader/signal` endpoint:**
- [ ] Returns 401 for unauthenticated requests
- [ ] Returns 400 for invalid UUID
- [ ] Inserts `click_through` signal for valid owned item
- [ ] Inserts signal even when called multiple times (no deduplication)
- [ ] Returns success (200) even if item does not exist (graceful non-blocking)
- [ ] Rejects item belonging to another user

**`/api/reader/rating` endpoint (extended):**
- [ ] Existing rating tests continue to pass (no regression)
- [ ] rating=4 inserts `rated_interesting` signal
- [ ] rating=1 inserts `rated_not_interesting` signal
- [ ] rating=null does NOT insert a signal
- [ ] Signal write failure does not cause rating update to fail

**`/api/reader/note` endpoint (extended):**
- [ ] Existing note tests continue to pass (no regression)
- [ ] First note save inserts `note_added` signal
- [ ] Editing an existing note does NOT insert a new signal
- [ ] Signal write failure does not cause note save to fail

**`SummaryCard.tsx`:**
- [ ] onClick handler fires on "Open in Reader" click
- [ ] Navigation is not blocked if signal API call fails
- [ ] Signal call is fire-and-forget (does not await before navigation)

### Database Migration
- [ ] Migration creates `item_signals` table with correct schema
- [ ] RLS policies allow authenticated users to insert/select own signals only
- [ ] Indexes created correctly
- [ ] Rollback migration defined

---

## Implementation Order

1. Database migration (`item_signals` table + RLS + indexes)
2. `POST /api/reader/signal` endpoint (new, with tests)
3. Extend `/api/reader/rating` (add signal write, with tests)
4. Extend `/api/reader/note` (add signal write, with tests)
5. Update `SummaryCard.tsx` onClick (with tests)
6. Update REFERENCE documentation
