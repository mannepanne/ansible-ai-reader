# Binary Rating System

**REFERENCE > Features > Ratings**

## What Is This?

A binary rating system that lets users mark items as "Interesting" (💡) or "Not interesting" (🤷). Ratings help users triage content and build a history of what they found valuable.

**Key characteristics:**
- **Binary system**: Only two rating values (not a 5-point scale)
- **Toggle behavior**: Click the same button again to remove rating
- **Optimistic UI**: Instant visual feedback, reverts on error
- **Future-proof storage**: Uses values 1 and 4 (not 0 and 1) to allow expansion to 5-point scale without database migration

## User Experience

### Rating an Item

1. User clicks 💡 "Interesting" or 🤷 "Not interesting" button
2. UI updates immediately (optimistic update)
3. Button highlights in color (yellow for interesting, red for not interesting)
4. Hint text appears: "(click again to unrate)"
5. API call persists rating in background

### Unrating an Item

1. User clicks the same rating button again
2. UI removes highlight immediately
3. Hint text disappears
4. API call sets rating to `null` in database

### Visual States

**Unrated (null):**
- Both buttons show in neutral gray
- No hint text

**Rated as Interesting (4):**
- 💡 button highlighted in yellow (`#fff3cd` background)
- Border becomes more prominent (`2px solid #ffc107`)
- Font weight increases to 600
- Hint text shown

**Rated as Not Interesting (1):**
- 🤷 button highlighted in red (`#f8d7da` background)
- Border becomes more prominent (`2px solid #dc3545`)
- Font weight increases to 600
- Hint text shown

**Saving (disabled):**
- Both buttons disabled
- Opacity reduced to 0.6
- Cursor shows "not-allowed"
- Prevents double-clicks

## API Endpoint

### POST /api/reader/rating

Updates the rating for a reader item.

**Request:**
```typescript
{
  itemId: string;  // UUID of reader_items.id
  rating: 1 | 4 | null;  // 1 = not interesting, 4 = interesting, null = unrate
}
```

**Validation:**
- `itemId`: Must be valid UUID
- `rating`: Must be exactly 1, 4, or null (no other values accepted)

**Response (200 OK):**
```typescript
{
  success: true
}
```

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `400 Validation failed`: Invalid itemId or rating value
- `404 Item not found`: Item doesn't exist or doesn't belong to user
- `500 Failed to update rating`: Database error

**Example:**
```bash
# Rate as interesting
curl -X POST /api/reader/rating \
  -H "Content-Type: application/json" \
  -d '{"itemId":"550e8400-e29b-41d4-a716-446655440000","rating":4}'

# Unrate
curl -X POST /api/reader/rating \
  -H "Content-Type: application/json" \
  -d '{"itemId":"550e8400-e29b-41d4-a716-446655440000","rating":null}'
```

## Technical Implementation

### Database Schema

Ratings stored in `reader_items.rating` column:
```sql
rating integer CHECK (rating IS NULL OR rating IN (1, 4))
```

**Why 1 and 4 (not 0 and 1)?**
- Leaves room for future expansion to 0-5 scale without database migration
- Can add 0, 2, 3, 5 later without changing existing data
- Strategic architectural decision for long-term flexibility

### UI Component (SummaryCard.tsx)

**State management:**
```typescript
const [currentRating, setCurrentRating] = useState<number | null>(rating || null);
const [isSavingRating, setIsSavingRating] = useState(false);
```

**Optimistic update pattern:**
```typescript
const handleRatingClick = async (targetRating: number) => {
  if (isSavingRating) return; // Prevent double-clicks

  // Toggle: if clicking the same rating, unrate (set to null)
  const newRating = currentRating === targetRating ? null : targetRating;

  // Optimistic UI update
  const previousRating = currentRating;
  setCurrentRating(newRating);
  setIsSavingRating(true);

  try {
    await onSaveRating(id, newRating);
  } catch (error) {
    // Revert on error
    setCurrentRating(previousRating);
    console.error('Failed to save rating:', error);
  } finally {
    setIsSavingRating(false);
  }
};
```

### API Handler (route.ts)

**Authentication:**
- Uses Supabase `auth.getUser()` to verify user is logged in
- Returns 401 if unauthenticated

**Validation:**
- Uses Zod schema to validate request body
- Ensures itemId is valid UUID
- Ensures rating is 1, 4, or null (no other values)
- Returns 400 with detailed error messages on validation failure

**Database Update:**
- Updates `reader_items.rating` field
- Filters by both `id` AND `user_id` (prevents users from rating other users' items)
- Returns 404 if no rows updated (item not found or doesn't belong to user)

**Security:**
- RLS policies ensure users can only access their own items
- Double-checking user_id in query provides defense-in-depth

## Why Binary (Not 5-Point Scale)?

**Simplicity wins:**
- Faster decision-making (binary choice vs. nuanced scale)
- Reduces cognitive load during triage
- Clear semantic meaning: "Did I find this valuable or not?"
- Avoids "3-star problem" (what does 3 stars mean?)

**Future expansion:**
- Can add 5-point scale later without breaking existing ratings
- Existing ratings of 1 and 4 map cleanly to "low" and "high" on expanded scale
- Database already supports 0-5 range via check constraint

## Limitations & Future Enhancements

**Current limitations:**
- No "neutral" or "unsure" option (only interesting/not interesting/unrated)
- No history view to see all rated items
- No analytics or aggregation of rating data
- No keyboard shortcuts for rating

**Potential enhancements:**
- Add history view to browse archived items with ratings
- Add analytics dashboard (how many items rated, distribution, trends)
- Keyboard shortcuts (e.g., `i` for interesting, `u` for uninteresting)
- Bulk rating operations
- Export ratings for analysis
- Filter/sort by rating
- Expand to 5-point scale when user needs more granularity

## Testing

**API tests (15 tests):**
- Authentication requirements
- Input validation (UUID, rating values)
- Database operations (update, filtering, error handling)
- Edge cases (item not found, DB errors)
- 96.75% test coverage

**Component tests (13 tests):**
- Button rendering and click behavior
- Toggle functionality (click to rate, click again to unrate)
- Optimistic UI updates
- Disabled state during save
- Error handling and rollback
- Visual feedback (highlights, hint text)
- Prevents double-clicks

## Related Documentation

- **[document-notes.md](./document-notes.md)** - Document notes feature (similar inline editing pattern)
- **[REFERENCE/patterns/api-validation.md](../patterns/api-validation.md)** - API validation patterns with Zod
- **[REFERENCE/development/testing-strategy.md](../development/testing-strategy.md)** - Testing approach

---

**Last updated:** 2026-03-31
**Related PR:** [#59 - Binary Rating System](https://github.com/mannepanne/ansible-ai-reader/pull/59)
