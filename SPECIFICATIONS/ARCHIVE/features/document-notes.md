# Document Notes Feature Specification

**Status**: Ready to Implement
**Created**: 2026-03-28
**Target**: v1.1
**Estimated Effort**: 1-2 days

---

## Overview

Enable users to add personal notes/annotations to articles directly in Ansible. Notes are stored locally in the Ansible database and synced to Readwise Reader, creating a unified note-taking experience.

### User Value

- **Capture thoughts immediately** while reviewing summaries
- **Preserve context** - notes stay with the article in both Ansible and Reader
- **Seamless workflow** - no context switching to Reader for note-taking

### Known Limitations (Accepted Trade-offs)

- **One-way sync**: Notes edited in Reader won't sync back to Ansible
- **Conflict resolution**: Last write wins (Ansible → Reader only)
- **No concurrent editing**: If user edits in both places, Ansible version overwrites Reader

*These limitations are acceptable because user expects to primarily interact with notes in Ansible.*

---

## User Stories

1. **As a user reviewing summaries**, I want to add a note capturing my thoughts, so I can reference them later
2. **As a user with an existing note**, I want to edit it when my thinking evolves
3. **As a user who reads in Reader**, I want my Ansible notes visible in Reader's notes section
4. **As a mobile user**, I want note-taking to work smoothly on my phone
5. **As a keyboard user**, I want Cmd+Enter to save notes quickly

---

## UI/UX Design

### Visual Mockups

**State 1: No note (collapsed summary)**
```
[Summary text - first 200 chars...]
Expand | Add Note
```

**State 2: No note (expanded summary)**
```
[Full summary text...]
Collapse | Add Note
```

**State 3: Adding/editing note (form open)**
```
[Summary text...]
Collapse | Cancel

┌─────────────────────────────────────────────────┐
│ Add your thoughts about this article...        │
│                                                 │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
0 / 10,000 characters

[Save Note]  [Cancel]
```

**State 4: Note exists (displayed)**
```
[Summary text...]
Collapse | Edit Note

📝 Your note:
┌─────────────────────────────────────────────────┐
│ This connects with the ideas in [article X].   │
│ Key insight: focus on user value first.        │
└─────────────────────────────────────────────────┘
```

### Interaction Details

**Opening the note editor:**
- Click "Add Note" or "Edit Note" link
- Text area appears with smooth expansion animation (200ms)
- Desktop: Auto-focus cursor in text area
- Mobile: No auto-focus (prevents keyboard jumping up)

**Editing:**
- Multiline text area (3-4 rows initial height)
- Auto-expand as user types (up to reasonable max height)
- Character counter updates live: "X / 10,000 characters"
- Warning when approaching limit (9,900+): Counter turns orange

**Saving:**
- Click "Save Note" button
- Press Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
- Optimistic update: Show note immediately
- Background: Save to Ansible DB, then sync to Reader
- Success: Hide form, show saved note
- Error: Show error message, keep form open for retry

**Canceling:**
- Click "Cancel" button
- Press Escape key
- Collapse form without saving
- Confirm if note has unsaved changes (simple browser confirm)

**Visual Styling:**

**Text area:**
- Border: `1px solid #ced4da`
- Padding: `12px`
- Font: Inherit from body (readable size)
- Rounded corners: `4px`
- Focus state: Blue border (`#007bff`)

**Character counter:**
- Font size: `0.85em`
- Color: `#6c757d` (normal), `#e65100` (warning)
- Position: Below text area, right-aligned

**Saved note display:**
- Background: `#f8f9fa` (subtle gray)
- Border: `1px solid #e9ecef`
- Padding: `12px`
- Margin top: `12px`
- Border radius: `4px`
- White-space: `pre-wrap` (preserves line breaks)
- Max-width: `100%`
- Word-wrap: `break-word` (prevents overflow)

**Buttons:**
- Save: Primary blue (`#007bff`), white text
- Cancel: Secondary gray (`#6c757d`), white text
- Same styling as existing "Archive" / "Open in Reader" buttons

### Mobile Responsive Behavior

**Small screens (<768px):**
- Text area: Full width with 16px side padding
- Buttons: Stack vertically, full width
- Character counter: Smaller font, still visible
- No auto-focus on input (prevents keyboard popup)

**Touch targets:**
- Minimum 44x44px for "Add Note" / "Edit Note" links
- Button height: Minimum 44px for easy tapping

---

## API Endpoints

### POST /api/reader/note

Save or update a note for a reader item.

**Request:**
```typescript
POST /api/reader/note
Content-Type: application/json

{
  "itemId": "uuid",           // reader_items.id
  "note": "string"            // Plain text, max 10k chars
}
```

**Validation:**
```typescript
const NoteSchema = z.object({
  itemId: z.string().uuid('Invalid item ID'),
  note: z.string()
    .max(10000, 'Note must be under 10,000 characters')
    .transform(note => note.trim())  // Remove leading/trailing whitespace
    .refine(note => note.length > 0, {
      message: 'Note cannot be empty'
    })
});
```

**Success Response (200):**
```json
{
  "success": true,
  "note": "saved note text"
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "note",
      "message": "Note must be under 10,000 characters"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "Item not found"
}
```

**500 Internal Server Error (DB save failed):**
```json
{
  "error": "Failed to save note"
}
```

**502 Bad Gateway (Reader API sync failed):**
```json
{
  "error": "Note saved locally but failed to sync to Reader",
  "details": "Reader API returned 500"
}
```

*Note: 502 is partial success - note is saved in Ansible but not synced to Reader.*

### Backend Implementation Flow

**1. Authenticate user**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;
```

**2. Validate request body**
```typescript
const validated = NoteSchema.safeParse(body);
if (!validated.success) return 400 with details;
```

**3. Verify item belongs to user**
```typescript
const { data: item } = await supabase
  .from('reader_items')
  .select('id, reader_id')
  .eq('id', itemId)
  .eq('user_id', user.id)
  .single();

if (!item) return 404;
```

**4. Save note to Ansible database**
```typescript
const { error } = await supabase
  .from('reader_items')
  .update({ document_note: validated.data.note })
  .eq('id', itemId)
  .eq('user_id', user.id);

if (error) return 500;
```

**5. Sync to Reader API (non-blocking)**
```typescript
try {
  await fetch(`https://readwise.io/api/v3/update/${item.reader_id}/`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Token ${READER_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notes: validated.data.note
    })
  });
} catch (error) {
  // Log error but don't fail the request
  console.error('[Note] Failed to sync to Reader:', error);
  // Return 502 to indicate partial success
  return 502;
}
```

**6. Return success**
```typescript
return 200 with { success: true, note: validated.data.note }
```

---

## Database Schema

**No changes needed!** The `reader_items` table already has the `document_note` field:

```sql
CREATE TABLE reader_items (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  reader_id text NOT NULL,
  title text NOT NULL,
  -- ... other fields ...
  document_note text,           -- ✅ Already exists
  -- ... other fields ...
);
```

**Field type:** `text` (unlimited length, but we validate to 10k chars)

---

## Reader API Integration

### Endpoint Documentation

**PATCH https://readwise.io/api/v3/update/:reader_id/**

Updates a Reader document. We use this to sync notes.

**Request:**
```bash
curl -X PATCH https://readwise.io/api/v3/update/01j2abc123xyz/ \
  -H "Authorization: Token ${READER_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Your note text here"}'
```

**Response (200):**
```json
{
  "id": "01j2abc123xyz",
  "notes": "Your note text here",
  // ... other document fields ...
}
```

**Error Responses:**
- **401**: Invalid or missing API token
- **404**: Document not found (invalid reader_id)
- **500**: Reader API internal error

### Note Format

- **Plain text only** (no HTML)
- **Preserves line breaks** (Reader displays as formatted text)
- **No length limit** in Reader API (we enforce 10k locally)

### Important Notes

- Reader API supports **document-level notes** (attached to the article)
- These are different from **highlight notes** (attached to specific text selections)
- We're using document-level notes for simplicity
- Reader displays document notes at the bottom of the article

---

## Error Handling

### User-Facing Errors

**Character limit exceeded (validation):**
- Message: "Note is too long. Maximum 10,000 characters."
- Action: Show error below text area, keep form open

**Network error (save failed):**
- Message: "Failed to save note. Please check your connection and try again."
- Action: Keep form open with note text, show retry button

**Partial success (saved locally, Reader sync failed):**
- Message: "Note saved locally but couldn't sync to Reader. It will sync on next attempt."
- Action: Show note as saved, log error for debugging

**Item not found (404):**
- Message: "Article not found. It may have been deleted."
- Action: Close form, refresh items list

**Unauthorized (401):**
- Message: "Session expired. Please log in again."
- Action: Redirect to login page

### Developer/Logging

**Console logs:**
```typescript
console.log('[Note] Saving note for item:', itemId);
console.log('[Note] Note saved successfully');
console.error('[Note] Failed to save note:', error);
console.error('[Note] Failed to sync to Reader:', error);
```

**Sentry/Error tracking (future):**
- Track Reader API sync failures
- Track validation errors (might indicate attack attempts)
- Track 502 responses (partial success)

---

## Frontend State Management

### Component State

```typescript
interface NoteState {
  isEditing: boolean;        // Is the form open?
  noteText: string;          // Current text in the textarea
  savedNote: string | null;  // The saved note (from DB)
  isSaving: boolean;         // Is save in progress?
  error: string | null;      // Error message to display
}
```

### State Transitions

**Initial load (note exists):**
```typescript
{
  isEditing: false,
  noteText: '',
  savedNote: item.document_note,  // From API
  isSaving: false,
  error: null
}
```

**User clicks "Add Note" / "Edit Note":**
```typescript
{
  isEditing: true,
  noteText: savedNote || '',  // Pre-fill if editing
  savedNote: savedNote,
  isSaving: false,
  error: null
}
```

**User types in textarea:**
```typescript
{
  isEditing: true,
  noteText: event.target.value,  // Live update
  // ... rest unchanged
}
```

**User clicks "Save":**
```typescript
// 1. Optimistic update
{
  isEditing: false,
  noteText: '',
  savedNote: noteText,  // Show immediately
  isSaving: true,
  error: null
}

// 2. After API call succeeds
{
  isEditing: false,
  noteText: '',
  savedNote: response.note,
  isSaving: false,
  error: null
}

// 3. If API call fails
{
  isEditing: true,  // Reopen form
  noteText: previousNoteText,  // Restore user's text
  savedNote: previousSavedNote,  // Revert to last saved
  isSaving: false,
  error: 'Failed to save note...'
}
```

**User clicks "Cancel":**
```typescript
{
  isEditing: false,
  noteText: '',
  savedNote: savedNote,  // Keep existing saved note
  isSaving: false,
  error: null
}
```

---

## Testing Strategy

### Unit Tests

**API Endpoint Tests (`src/app/api/reader/note/route.test.ts`):**

- [ ] Save note successfully (200)
- [ ] Update existing note (200)
- [ ] Empty note rejected (400)
- [ ] Note exceeding 10k chars rejected (400)
- [ ] Invalid item ID rejected (400)
- [ ] Item not found returns 404
- [ ] Unauthorized request returns 401
- [ ] Reader API sync failure returns 502 (partial success)
- [ ] Database error returns 500
- [ ] Note trimmed (leading/trailing whitespace removed)

**Validation Tests:**
```typescript
describe('Note validation', () => {
  it('accepts valid note', () => {
    const result = NoteSchema.safeParse({
      itemId: 'valid-uuid',
      note: 'This is a valid note'
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty note', () => {
    const result = NoteSchema.safeParse({
      itemId: 'valid-uuid',
      note: '   '  // Only whitespace
    });
    expect(result.success).toBe(false);
  });

  it('rejects note exceeding 10k chars', () => {
    const result = NoteSchema.safeParse({
      itemId: 'valid-uuid',
      note: 'x'.repeat(10001)
    });
    expect(result.success).toBe(false);
  });

  it('trims whitespace', () => {
    const result = NoteSchema.safeParse({
      itemId: 'valid-uuid',
      note: '  note text  '
    });
    expect(result.data?.note).toBe('note text');
  });
});
```

### Integration Tests

**Full Note Lifecycle:**
- [ ] Create note → saved in DB → synced to Reader
- [ ] Edit note → updated in DB → updated in Reader
- [ ] Note persists across page reload
- [ ] Multiple notes on different items work independently

### Manual Testing Checklist

**Desktop:**
- [ ] Click "Add Note" opens form
- [ ] Text area accepts input
- [ ] Character counter updates live
- [ ] Cmd+Enter saves note
- [ ] "Save" button saves note
- [ ] "Cancel" button closes form
- [ ] Saved note displays correctly
- [ ] Click "Edit Note" reopens form with existing text
- [ ] Note persists after page refresh

**Mobile:**
- [ ] "Add Note" link tappable (44x44px target)
- [ ] Text area full width, readable font size
- [ ] No auto-focus (keyboard doesn't jump up)
- [ ] Buttons stack vertically, easy to tap
- [ ] Character counter visible and readable
- [ ] Save/Cancel work on touch

**Error Scenarios:**
- [ ] Exceeding 10k chars shows error
- [ ] Network error shows retry option
- [ ] Session expiry redirects to login

**Reader Sync:**
- [ ] Note appears in Reader after saving
- [ ] Updated note reflects in Reader
- [ ] Note visible in Reader's notes section

### Test Commands
```bash
npm test                           # Run all tests
npm test -- note                   # Run note-related tests only
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
```

**Coverage Target**: 95%+ for new code

---

## Implementation Checklist

### Backend (API Route)

- [ ] Create `src/app/api/reader/note/route.ts`
- [ ] Implement POST handler with authentication
- [ ] Add Zod validation schema
- [ ] Implement database save logic
- [ ] Implement Reader API sync
- [ ] Handle errors gracefully (400, 401, 404, 500, 502)
- [ ] Add logging for debugging
- [ ] Write comprehensive tests

### Frontend (UI Component)

- [ ] Update `SummaryCard.tsx` with note UI
- [ ] Add state management for note editing
- [ ] Implement "Add Note" / "Edit Note" toggle
- [ ] Create text area with character counter
- [ ] Add Save/Cancel buttons
- [ ] Implement keyboard shortcuts (Cmd+Enter, Escape)
- [ ] Style saved note display
- [ ] Add loading states during save
- [ ] Handle and display errors
- [ ] Make responsive (mobile-friendly)

### Data Flow

- [ ] Fetch existing notes when loading items (`GET /api/reader/items` already returns `document_note`)
- [ ] Pass note data to SummaryCard component
- [ ] Optimistic UI updates on save
- [ ] Handle API failures gracefully

### Testing

- [ ] Write API route tests (10+ test cases)
- [ ] Write component tests (note UI interactions)
- [ ] Test validation edge cases
- [ ] Test error scenarios
- [ ] Manual testing on desktop
- [ ] Manual testing on mobile
- [ ] Test Reader sync (end-to-end)

### Documentation

- [ ] Update `REFERENCE/features/` with implementation details
- [ ] Update Phase 5 spec to mark notes as complete
- [ ] Add troubleshooting guide if needed

---

## Out of Scope (Future Enhancements)

**v1.1 - Excluded:**
- Rich text formatting (bold, italic, lists)
- Markdown support in notes
- Note templates or prompts
- Bulk note operations
- Note search/filter
- Note export
- Two-way sync (Reader → Ansible)
- Conflict resolution (concurrent edits)
- Note versioning/history
- Auto-save on blur
- Note attachments/images

**Why excluded:**
- **YAGNI principle**: Start simple, add complexity only if users request it
- **Speed to ship**: Plain text notes deliver 80% of value with 20% of complexity
- **Safety**: Rich text introduces XSS risks, sanitization overhead

---

## Success Metrics

**Feature is successful when:**

1. Users can add notes to articles in <5 seconds
2. Notes sync to Reader 95%+ of the time
3. No XSS vulnerabilities or security issues
4. Mobile experience works smoothly
5. Zero data loss (notes always saved to Ansible DB)
6. User feedback is positive (qualitative)

---

## Related Documentation

- **Phase 5 Spec**: [SPECIFICATIONS/05-notes-rating-polish.md](../05-notes-rating-polish.md)
- **Reader API Docs**: https://readwise.io/reader_api
- **Database Schema**: [REFERENCE/architecture/database.md](../../REFERENCE/architecture/database.md) (if exists)
- **Testing Strategy**: [REFERENCE/development/testing-strategy.md](../../REFERENCE/development/testing-strategy.md)
