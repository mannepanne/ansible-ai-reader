# Phase 5: Notes, Rating & Polish

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: Phase 4 (Perplexity Integration)
**Estimated Effort**: Week 4-5

---

## Overview

Add document notes (synced to Reader), interest ratings, customizable summary prompts, and final polish. By the end of this phase, Ansible should be feature-complete for v1 MVP.

---

## Scope & Deliverables

### Core Tasks
- [ ] Implement document notes UI (add/edit note field)
- [ ] Sync notes to Reader API (PATCH `/api/v3/update/:id`)
- [ ] Implement rating system (0-5 stars)
- [ ] Create settings page (editable summary prompt)
- [ ] Add "Read in Reader" link (opens Reader URL)
- [ ] Improve empty states (helpful guidance)
- [ ] Polish error messages (user-friendly)
- [ ] Add loading states for all async operations
- [ ] Test with real data (Magnus's actual Reader items)
- [ ] Performance optimization (if needed)

### Out of Scope
- Long summaries (future v1.1)
- Learning from ratings (future v2)
- Tag filtering/search (future v1.1)
- Automated background sync (future v2)

---

## User Flows

### Document Notes Flow

```
User viewing summary (list or detail view)
  ↓
Sees existing note (if any) or "Add Note" button
  ↓
Clicks "Add Note" or "Edit Note"
  ↓
Text field appears (autofocus)
  ↓
User types thought/annotation
  ↓
Clicks "Save" or presses Cmd+Enter
  ↓
Background:
  1. Store note in Ansible database (document_note field)
  2. PATCH to Reader API (notes parameter)
  3. Show success indicator
  ↓
Note displayed below summary
  ↓
If user edits note:
  - Update local database
  - PATCH full note content to Reader
```

### Rating Flow

```
User viewing item (list or detail view)
  ↓
Sees rating widget (0-5 stars, unrated by default)
  ↓
Clicks star rating (e.g., 4 stars)
  ↓
Rating saved to database immediately
  ↓
Visual feedback (stars filled, brief animation)
  ↓
User can change rating anytime
```

### Settings Flow

```
User clicks "Settings" in navigation
  ↓
Sees editable text field: "Summary Prompt"
  ↓
Default value:
  "I'm interested in product management, AI/LLM applications,
   software architecture, writing craft, and cognitive science.
   Focus on practical takeaways and novel applications."
  ↓
User edits prompt
  ↓
Clicks "Save"
  ↓
Stored in users.summary_prompt
  ↓
Future summaries use this prompt (prepended to Perplexity request)
  ↓
Note: Existing summaries NOT regenerated
```

---

## API Integration Details

### Reader API - Document Notes

**Endpoint**: `PATCH https://readwise.io/api/v3/update/<reader_id>/`

**Request**:
```typescript
await fetch(`https://readwise.io/api/v3/update/${readerId}/`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Token ${READER_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    notes: noteContent, // Full note text
  }),
});
```

**Note**: This creates/updates a document-level note (not attached to a specific highlight).

### Database Schema Updates

**users table**: Already has `summary_prompt` field (Phase 1)

**reader_items table**: Already has `document_note` and `rating` fields (Phase 1)

No schema changes needed - just implement the features!

---

## Testing Strategy

### Required Tests

**1. Document Notes Tests**
- [ ] Add note to item (stored locally)
- [ ] Add note syncs to Reader API
- [ ] Edit note updates local + Reader
- [ ] Delete note removes from local + Reader
- [ ] Handle API failures gracefully
- [ ] Note persists across page reloads

**2. Rating System Tests**
- [ ] Rating saved to database
- [ ] Rating displayed correctly (0-5 stars)
- [ ] Rating can be changed
- [ ] Unrated items show empty stars
- [ ] Rating validation (0-5 only)

**3. Settings Tests**
- [ ] Summary prompt saved to users table
- [ ] Default prompt provided for new users
- [ ] Custom prompt used in future summaries
- [ ] Empty prompt falls back to default
- [ ] Settings page only accessible when authenticated

**4. UI Polish Tests**
- [ ] Empty states display helpful guidance
- [ ] Error messages are user-friendly
- [ ] Loading states show for async operations
- [ ] "Read in Reader" link opens correct URL
- [ ] Responsive design works on mobile

**5. Integration Tests**
- [ ] Full workflow: sync → view → note → rate → archive
- [ ] Custom prompt affects new summaries
- [ ] Multiple notes/ratings on different items
- [ ] Real data testing (Magnus's actual items)

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
- [ ] Manual testing: add/edit notes sync to Reader
- [ ] Manual testing: ratings save correctly
- [ ] Manual testing: custom prompt affects summaries
- [ ] Real data tested (Magnus's actual Reader items)
- [ ] Mobile responsive design tested
- [ ] Error handling tested for all features
- [ ] No secrets committed to repository

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 5: Notes, Rating & Polish - Complete v1 MVP features`

**PR Description Template**:
```markdown
## Summary
Completes Phase 5: Document notes, ratings, settings, and final polish for v1 MVP.

## What's Included
- Document notes (add/edit/sync to Reader)
- Interest rating system (0-5 stars)
- Settings page (customizable summary prompt)
- "Read in Reader" link
- Empty states and error messages
- Loading states for all async operations
- Mobile responsive design

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: notes sync to Reader
- [x] Manual testing: ratings work correctly
- [x] Real data tested with Magnus's Reader items

## Real-World Testing Results
- Synced XX items from Reader
- Generated XX summaries
- Created XX notes (synced to Reader)
- Rated XX items

## Next Steps
Phase 6: Launch (final testing, documentation, monitoring)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 5 is complete when:

1. ✅ Document notes add/edit/sync to Reader
2. ✅ Rating system works (0-5 stars)
3. ✅ Settings page allows custom summary prompts
4. ✅ "Read in Reader" link opens correct URL
5. ✅ Empty states are helpful and clear
6. ✅ Error messages are user-friendly
7. ✅ All tests passing with 95%+ coverage
8. ✅ Mobile responsive design works
9. ✅ Real data tested successfully
10. ✅ No secrets in repository
11. ✅ PR merged to main branch

---

## Technical Considerations

### Note Syncing Strategy
- **Optimistic updates**: Update UI immediately, sync in background
- **Conflict resolution**: Last write wins (no concurrent editing expected)
- **Retry logic**: If sync fails, retry with exponential backoff
- **Offline support**: Not required for v1 (future consideration)

### Rating Storage
- **Database**: Simple integer (0-5)
- **Validation**: Enforce range at database and UI level
- **Future use**: Phase 2 will use ratings for learning (out of scope for v1)

### Performance Optimization
- **List view**: Virtualization if >100 items (unlikely for single user)
- **Summary rendering**: Markdown rendering optimized
- **API calls**: Debounce note saves (don't send on every keystroke)

### User Experience Polish
- **Keyboard shortcuts**: Cmd+Enter to save notes
- **Autofocus**: Focus note field when opened
- **Animations**: Subtle transitions (not distracting)
- **Feedback**: Clear success/error indicators

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Reader API**: https://readwise.io/reader_api
