# Regenerate Tags UX Consistency

**Status**: Planning → In Progress
**Related Issue**: #57
**Last Updated**: 2026-04-01
**Branch**: `feature/regenerate-tags-ux`
**Estimated Effort**: 4-6 hours

---

## Overview

Align the "Regenerate Tags" button UX with the "Sync" button experience. Currently, Sync provides a polished experience with progress bars and silent background processing, while Regenerate Tags uses a clunky browser `alert()` popup with no progress feedback.

**Goal**: Make both operations feel consistent—calm, professional, with clear progress indication.

---

## Current State Analysis

### Sync Button (Target Pattern)
**Location**: `src/app/summaries/SummariesContent.tsx:120-154`

**Flow**:
1. User clicks "Sync" → `handleSync()` called
2. POST to `/api/reader/sync` → returns `{ syncId, totalItems }`
3. Sets `syncing = true`, initializes `syncStatus` state
4. Polls `/api/reader/status?syncId=...` every 2 seconds
5. Updates progress bar with `completedJobs / totalJobs`
6. Shows completion message (green/yellow/red based on status)
7. Offers "Retry Failed" button if needed

**Progress Display**: Lines 405-456
- HTML progress bar with title "Sync Progress"
- Counter: "X / Y items"
- Visual bar: CSS width calculation
- Light blue styling (#bee5eb background, #17a2b8 fill)

### Regenerate Tags Button (Current, Needs Fix)
**Location**: `src/app/summaries/SummariesContent.tsx:229-262`

**Flow**:
1. User clicks "Regenerate Tags" → `handleRegenerateTags()` called
2. POST to `/api/reader/regenerate-tags` → returns `{ message, count }`
3. Shows browser `alert()`: "Regenerating tags for X items. This will happen in the background."
4. No polling, no progress tracking
5. 3-second delay, then reloads items
6. User has no visibility into completion

**Problems**:
- ❌ Browser alert is jarring and old-fashioned
- ❌ No progress indication
- ❌ No completion confirmation
- ❌ User doesn't know when it's done
- ❌ Inconsistent with Sync pattern

---

## Proposed Solution

### Architecture Changes

#### 1. Backend: Add Batch Tracking
**New field**: `regenerate_batch_id` in `processing_jobs` table
- Type: UUID
- Purpose: Group jobs from a single "Regenerate Tags" operation
- Index: For fast status queries

**API Endpoint Changes**:

**A. `/api/reader/regenerate-tags` (modify)**
```typescript
// Before
return { message: string, count: number }

// After
return { regenerateId: string, totalItems: number }
```

**B. `/api/reader/regenerate-tags-status` (new)**
```typescript
GET /api/reader/regenerate-tags-status?regenerateId=<uuid>

Response:
{
  status: 'processing' | 'completed' | 'partial_failure' | 'failed',
  totalJobs: number,
  completedJobs: number,
  failedJobs: number,
  failedItems: Array<{
    title: string,
    error: string
  }>
}
```

**Query logic**:
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
FROM processing_jobs
WHERE regenerate_batch_id = $1
```

#### 2. Frontend: Unified Progress Pattern

**State Management** (in `SummariesContent.tsx`):
```typescript
// Add alongside syncStatus
const [regenerateStatus, setRegenerateStatus] = useState<SyncStatus | null>(null);
const [regenerating, setRegenerating] = useState(false);
```

**Polling Logic** (reuse existing pattern):
```typescript
useEffect(() => {
  if (!regenerating || !regenerateStatus?.regenerateId) return;

  const pollInterval = setInterval(async () => {
    const response = await fetch(
      `/api/reader/regenerate-tags-status?regenerateId=${regenerateStatus.regenerateId}`
    );
    const data = await response.json();

    setRegenerateStatus(prev => ({ ...prev, ...data }));

    if (['completed', 'partial_failure', 'failed'].includes(data.status)) {
      setRegenerating(false);
      clearInterval(pollInterval);
      await loadItems(); // Refresh items to show new tags
    }
  }, 2000);

  return () => clearInterval(pollInterval);
}, [regenerating, regenerateStatus?.regenerateId]);
```

**Handler Update**:
```typescript
async function handleRegenerateTags() {
  try {
    setRegenerating(true);
    const response = await fetch('/api/reader/regenerate-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error('Failed to start regeneration');

    const data = await response.json();

    // Initialize status tracking (no alert!)
    setRegenerateStatus({
      regenerateId: data.regenerateId,
      status: 'processing',
      totalJobs: data.totalItems,
      completedJobs: 0,
      failedJobs: 0,
      failedItems: [],
    });
  } catch (error) {
    setError('Failed to regenerate tags. Please try again.');
    setRegenerating(false);
  }
}
```

#### 3. UI Component: Extract Reusable ProgressBar

**New file**: `src/components/ProgressBar.tsx`
```typescript
interface ProgressBarProps {
  title: string;
  completed: number;
  failed: number;
  total: number;
}

export function ProgressBar({ title, completed, failed, total }: ProgressBarProps) {
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;

  return (
    <div style={{ /* existing styles */ }}>
      <div style={{ /* header with title and counter */ }}>
        <strong>{title}</strong>
        <span>{completed + failed} / {total}</span>
      </div>
      <div style={{ /* progress bar background */ }}>
        <div style={{ width: `${progress}%`, /* bar fill */ }} />
      </div>
    </div>
  );
}
```

**Usage in `SummariesContent.tsx`**:
```tsx
{/* Sync progress */}
{syncing && syncStatus && (
  <ProgressBar
    title="Sync Progress"
    completed={syncStatus.completedJobs}
    failed={syncStatus.failedJobs}
    total={syncStatus.totalJobs}
  />
)}

{/* Regenerate tags progress */}
{regenerating && regenerateStatus && (
  <ProgressBar
    title="Tag Regeneration Progress"
    completed={regenerateStatus.completedJobs}
    failed={regenerateStatus.failedJobs}
    total={regenerateStatus.totalJobs}
  />
)}
```

#### 4. Unified Status Messages

**Extend existing status message component** (lines 459-541) to handle both operations:
```tsx
{syncStatus?.status && !syncing && (
  <StatusMessage
    status={syncStatus.status}
    type="sync"
    failedJobs={syncStatus.failedJobs}
    failedItems={syncStatus.failedItems}
    onRetry={handleRetryFailed}
    onDismiss={() => setSyncStatus(null)}
  />
)}

{regenerateStatus?.status && !regenerating && (
  <StatusMessage
    status={regenerateStatus.status}
    type="regenerate"
    failedJobs={regenerateStatus.failedJobs}
    failedItems={regenerateStatus.failedItems}
    onRetry={handleRetryFailedRegenerate}
    onDismiss={() => setRegenerateStatus(null)}
  />
)}
```

**Messages**:
- ✅ Completed: "Successfully regenerated tags for X items"
- ⚠️ Partial: "Regenerated tags for X items (Y failed)"
- ❌ Failed: "Tag regeneration failed"

---

## Database Schema Changes

### Migration: Add `regenerate_batch_id` column

**File**: `supabase/migrations/YYYYMMDDHHMMSS_add_regenerate_batch_id.sql`

```sql
-- Add regenerate_batch_id column to processing_jobs
ALTER TABLE processing_jobs
ADD COLUMN regenerate_batch_id UUID;

-- Create index for fast status queries
CREATE INDEX idx_processing_jobs_regenerate_batch_id
ON processing_jobs(regenerate_batch_id)
WHERE regenerate_batch_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN processing_jobs.regenerate_batch_id IS
  'UUID linking jobs from a single regenerate tags operation (for progress tracking)';
```

---

## Implementation Steps

### Phase 1: Backend Infrastructure
- [ ] Create database migration (add `regenerate_batch_id` column + index)
- [ ] Run migration locally and verify
- [ ] Modify `/api/reader/regenerate-tags` to generate and return `regenerateId`
- [ ] Update job creation to include `regenerate_batch_id`
- [ ] Create `/api/reader/regenerate-tags-status` endpoint
- [ ] Write tests for status endpoint

### Phase 2: Frontend Progress Tracking
- [ ] Extract `ProgressBar` component from sync code
- [ ] Add `regenerateStatus` state to `SummariesContent.tsx`
- [ ] Implement polling loop for regenerate tags (mirror sync pattern)
- [ ] Update `handleRegenerateTags()` to use new API response
- [ ] Remove `alert()` call

### Phase 3: UI Polish
- [ ] Convert both sync and regenerate to use `ProgressBar` component
- [ ] Extract `StatusMessage` component (optional, for reusability)
- [ ] Add completion messages for regenerate tags
- [ ] Test "Retry Failed" button for regenerate tags
- [ ] Verify styling matches sync exactly

### Phase 4: Testing
- [ ] Unit tests: `/api/reader/regenerate-tags-status` logic
- [ ] Unit tests: ProgressBar component
- [ ] Integration test: Full regenerate flow with progress tracking
- [ ] Manual test: Click regenerate tags, verify progress bar appears
- [ ] Manual test: Verify completion message shows correctly
- [ ] Manual test: Test with failures, verify retry button works

### Phase 5: Documentation
- [ ] Update `REFERENCE/features/tags.md` with new UX pattern
- [ ] Add API documentation for status endpoint
- [ ] Document batch ID architecture decision

---

## Testing Strategy

### Unit Tests

**Backend** (`/api/reader/regenerate-tags-status/route.test.ts`):
```typescript
describe('GET /api/reader/regenerate-tags-status', () => {
  it('returns processing status with job counts', async () => {
    // Create 10 jobs with same regenerate_batch_id
    // 7 completed, 2 failed, 1 processing
    // Verify response: { status: 'processing', total: 10, completed: 7, failed: 2 }
  });

  it('returns completed status when all jobs done', async () => {
    // Create 5 jobs, all completed
    // Verify response: { status: 'completed', total: 5, completed: 5, failed: 0 }
  });

  it('includes failed item details', async () => {
    // Create 3 jobs, 1 failed with error
    // Verify failedItems array includes title and error
  });

  it('returns 404 for unknown regenerateId', async () => {
    // Query with random UUID
    // Verify 404 response
  });
});
```

**Frontend** (`ProgressBar.test.tsx`):
```typescript
describe('ProgressBar', () => {
  it('renders title and progress counter', () => {
    render(<ProgressBar title="Test" completed={5} failed={2} total={10} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
  });

  it('calculates progress bar width correctly', () => {
    const { container } = render(
      <ProgressBar title="Test" completed={3} failed={1} total={10} />
    );
    const bar = container.querySelector('[style*="width: 40%"]');
    expect(bar).toBeInTheDocument();
  });

  it('handles zero total gracefully', () => {
    render(<ProgressBar title="Test" completed={0} failed={0} total={0} />);
    // Should not crash, should show 0 / 0
  });
});
```

### Integration Tests

**Full regenerate flow** (`SummariesContent.test.tsx`):
```typescript
describe('Regenerate Tags Flow', () => {
  it('shows progress bar during regeneration', async () => {
    // Mock POST /api/reader/regenerate-tags → { regenerateId, totalItems: 5 }
    // Mock GET /api/reader/regenerate-tags-status → processing, then completed

    render(<SummariesContent />);

    fireEvent.click(screen.getByText('Regenerate Tags'));

    // Progress bar should appear
    expect(screen.getByText('Tag Regeneration Progress')).toBeInTheDocument();

    // Wait for completion
    await waitFor(() => {
      expect(screen.getByText(/Successfully regenerated/)).toBeInTheDocument();
    });
  });

  it('shows retry button on partial failure', async () => {
    // Mock response with 2 failed jobs
    // Verify "Retry Failed" button appears
  });
});
```

### Manual Testing Checklist

- [ ] Click "Regenerate Tags" → No alert popup appears
- [ ] Progress bar shows immediately with "Tag Regeneration Progress" title
- [ ] Counter updates: "0 / 10", "3 / 10", "10 / 10"
- [ ] Visual progress bar fills from left to right
- [ ] Completion message appears (green background)
- [ ] Items list refreshes with new tags visible
- [ ] Test with failures: "Retry Failed" button appears and works
- [ ] Test rapid clicking: Button disabled during processing
- [ ] Compare to Sync: Both look and behave identically

---

## Acceptance Criteria

✅ Feature is complete when:

1. **No alert popup**: Clicking "Regenerate Tags" never shows `alert()`
2. **Progress bar appears**: Same styling as Sync progress bar
3. **Real-time updates**: Counter and bar update every 2 seconds
4. **Completion message**: Green success message (or yellow/red for failures)
5. **Retry on failure**: "Retry Failed" button works for regenerate tags
6. **Visual consistency**: Sync and Regenerate Tags UX are indistinguishable
7. **All tests pass**: 95%+ coverage maintained
8. **Migration runs**: Database updated with `regenerate_batch_id` column
9. **Documentation updated**: REFERENCE/ docs reflect new pattern

---

## Technical Considerations

### Batch ID Lifecycle
- **Creation**: Generated in `/api/reader/regenerate-tags` endpoint
- **Storage**: Saved to each job's `regenerate_batch_id` column
- **Querying**: Filtered by batch ID in status endpoint
- **Cleanup**: Jobs eventually deleted by existing cleanup logic (no special handling)

### Race Conditions
- **Multiple regenerate clicks**: Button disabled while `regenerating = true`
- **Polling overlap**: Each operation has unique `regenerateId`, no collision
- **Status updates**: Last write wins (acceptable for progress tracking)

### Performance
- **Status query**: Indexed on `regenerate_batch_id`, should be fast (<10ms)
- **Polling frequency**: 2 seconds (same as sync, not excessive)
- **Frontend state**: Minimal overhead (one polling loop per operation type)

### Error Handling
- **API failure**: Show error message, don't start polling
- **Polling failure**: Retry on next interval (silent, no user disruption)
- **Job failures**: Displayed in failedItems list, retry button available

---

## Migration Path

### Supabase Migration
This project uses Supabase (hosted PostgreSQL). Migrations are applied via Supabase dashboard or CLI:

```bash
# Option 1: Apply via Supabase dashboard
# 1. Go to Supabase project dashboard
# 2. Navigate to SQL Editor
# 3. Paste migration SQL and run

# Option 2: Apply via Supabase CLI (if configured)
supabase db push

# Verify column exists
# Run in Supabase SQL Editor:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'processing_jobs'
AND column_name = 'regenerate_batch_id';
```

---

## Files to Modify

### Backend
- `supabase/migrations/YYYYMMDDHHMMSS_add_regenerate_batch_id.sql` (new)
- `src/app/api/reader/regenerate-tags/route.ts` (modify)
- `src/app/api/reader/regenerate-tags-status/route.ts` (new)

### Frontend
- `src/components/ProgressBar.tsx` (new)
- `src/components/Header.tsx` (no changes needed)
- `src/app/summaries/SummariesContent.tsx` (major changes)

### Tests
- `src/app/api/reader/regenerate-tags-status/route.test.ts` (new)
- `src/components/ProgressBar.test.tsx` (new)
- `src/app/summaries/SummariesContent.test.tsx` (update)

### Documentation
- `REFERENCE/features/tags.md` (update)
- `REFERENCE/architecture/api-design.md` (update)

---

## Reference

**Related Issue**: #57
**Similar Pattern**: Sync button (lines 120-154, 405-456 in `SummariesContent.tsx`)
**Inspiration**: hultberg.org admin panel UX (calm, professional interactions)

---

## Timeline

**Estimated**: 4-6 hours
- Backend: 2 hours (migration, endpoints, tests)
- Frontend: 2 hours (component extraction, polling, UI)
- Testing: 1 hour (integration tests, manual QA)
- Documentation: 1 hour (update REFERENCE/ docs)

**PR Review**: Use `/review-pr` for standard review
