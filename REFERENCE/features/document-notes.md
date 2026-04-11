# Document Notes
REFERENCE > Features > Document Notes

Personal note-taking system that syncs annotations to Readwise Reader.

## What Is This?
Users can add personal notes to any summary card. Notes are stored locally in Ansible and synchronized to Readwise Reader as document-level notes.

## User Experience

### Adding Notes
1. Click "Add note" button on summary card
2. Text field appears with autofocus
3. Type note (plain text, max 10k characters)
4. Save with "Save Note" button or Cmd+Enter

### Editing Notes
1. Click "Edit note" button on card with existing note
2. Text field appears with current note pre-filled
3. Edit and save (or Esc to cancel)

### Viewing Notes
Saved notes display below summary with "📝 Your note:" header in a light gray box.

## Technical Implementation

### API Endpoint (`/api/reader/note`)

**POST - Save Note**
```typescript
POST /api/reader/note

Body: {
  itemId: string (UUID),
  note: string (1-10k chars)
}

Response: { success: true }
```

**Validation:**
```typescript
const NoteSchema = z.object({
  itemId: z.string().uuid('Invalid item ID'),
  note: z
    .string()
    .max(MAX_NOTE_LENGTH, 'Note must be under 10,000 characters')
    .transform((note) => note.trim())
    .refine((note) => note.length > 0, {
      message: 'Note cannot be empty',
    }),
});
```

**Security:** Plain text only (v1), no HTML. This eliminates XSS risk entirely.

### Reader API Sync

**PATCH to Reader:**
```typescript
PATCH https://readwise.io/api/v3/update/<reader_id>/
Headers: Authorization: Token <reader_token>
Body: { notes: "note content" }
```

**Architecture Decision:** Inline sync (not queue-based)
- **Why?** Users expect immediate feedback when saving notes (UX priority)
- **Risk?** Acceptable - notes are small payloads (<10k chars), fast sync
- **Failure handling:** User sees error and can retry manually

See: `src/app/api/reader/note/route.ts` lines 4-12 for architectural rationale.

### UI Component (`SummaryCard.tsx`)

**Features:**
- Character counter (updates live, warns at 99% of limit)
- Keyboard shortcuts:
  - `Cmd+Enter` or `Ctrl+Enter` - Save note
  - `Esc` - Cancel editing
- Autofocus on desktop (disabled on mobile to prevent keyboard jump)
- Unsaved changes warning (confirms before cancel if edited)
- Loading state during save ("Saving...")
- Error display (inline, red background)

**Visual Design:**
- Edit mode: Textarea with border, resize vertical
- Saved mode: Light gray box (`#f8f9fa`) with preserved whitespace
- Display: `whiteSpace: 'pre-wrap'` preserves line breaks

### Database Schema

```sql
ALTER TABLE reader_items
ADD COLUMN document_note TEXT;
```

**Migration:** `20260319_add_document_note.sql`

### Interest Signal Side-Effect

When a note is saved, the endpoint checks whether this is the **first** note on the item (previous `document_note` was null or whitespace-only). If so, it writes a `note_added` signal to the `item_signals` engagement log.

Subsequent edits to an existing note do **not** generate a new signal — only the transition from no-note to having-a-note counts.

Signal writes are fire-and-forget: a failed signal insert never causes the note save to fail. See [interest-signals.md](./interest-signals.md) for full context.

---

## Error Handling

### Partial Success (502)
If note saves locally but Reader sync fails:
```
"Note saved locally. Reader sync failed - please try editing again
to retry. Your note is safe in Ansible."
```

**Why this UX?** User's work is preserved, can retry later. Better than losing the note entirely.

### Validation Errors (400)
- Empty note: "Note cannot be empty"
- Too long: "Note must be under 10,000 characters"
- Invalid item ID: "Invalid item ID"

### Complete Failure (500)
Generic error: "Failed to save note"

## Use Cases

### Capture Quick Thoughts
Reading summary triggers an idea → add note without opening Reader.

### Annotation for Later
Add context before reading full article → note syncs to Reader, visible when reading.

### Personal Memory
Note why an article is interesting → future reference when browsing Reader.

## Constraints (v1)

### Plain Text Only
- **No rich text** (bold, italic, links)
- **No formatting preserved** (just line breaks via `pre-wrap`)
- **Why?** Security (no XSS risk) and simplicity

**Future (v2):** Could add rich text with DOMPurify sanitization if needed.

### 10k Character Limit
- Enforced at API and UI level
- Equivalent to ~1,500 words
- Sufficient for personal annotations

### No Concurrent Editing
- Last write wins
- No conflict resolution
- **Risk:** Low - single user, unlikely to edit same note from multiple devices simultaneously

## Related Documentation
- [Reader Sync](./reader-sync.md) - Reader API integration
- [API Validation](../patterns/api-validation.md) - Input validation patterns
- [Settings](./settings.md) - User preferences
- [Automated Sync](./automated-sync.md) - Scheduled syncing
