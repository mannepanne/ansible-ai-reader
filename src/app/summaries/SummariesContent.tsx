// ABOUT: Client component for summaries page with card-based layout
// ABOUT: Handles Reader sync, status polling, and items display with responsive grid

'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import SummaryCard from '@/components/SummaryCard';
import EmptyState from '@/components/EmptyState';
import ProgressBar from '@/components/ProgressBar';

interface ReaderItem {
  id: string;
  reader_id: string;
  title: string;
  author: string | null;
  source: string | null;
  url: string;
  word_count: number | null;
  short_summary: string | null;
  tags: string[];
  perplexity_model: string | null;
  content_truncated: boolean;
  document_note: string | null;
  rating: number | null;
  created_at: string;
}

interface SyncStatus {
  syncId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  pendingJobs: number;
  status: 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';
  failedItems?: Array<{
    itemId: string;
    title: string;
    error: string;
  }>;
}

// Regenerate status uses same structure as SyncStatus but with regenerateId
interface RegenerateStatus {
  regenerateId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  pendingJobs: number;
  status: 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';
  failedItems?: Array<{
    itemId: string;
    title: string;
    error: string;
  }>;
}

interface SummariesContentProps {
  userEmail: string;
}

export default function SummariesContent({ userEmail }: SummariesContentProps) {
  const [items, setItems] = useState<ReaderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateStatus, setRegenerateStatus] = useState<RegenerateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dismissingItemId, setDismissingItemId] = useState<string | null>(null);

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  // Poll sync status when syncing
  useEffect(() => {
    if (!syncing || !syncStatus) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/reader/status?syncId=${syncStatus.syncId}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch sync status');
        }

        const status: SyncStatus = await response.json();
        setSyncStatus(status);

        // Stop polling when sync is complete or empty
        if (
          status.totalJobs === 0 ||
          status.status === 'completed' ||
          status.status === 'partial_failure' ||
          status.status === 'failed'
        ) {
          setSyncing(false);
          loadItems(); // Reload items list
        }
      } catch (err) {
        console.error('Status polling error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setSyncing(false);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [syncing, syncStatus]);

  // Poll regenerate tags status when regenerating
  useEffect(() => {
    if (!regenerating || !regenerateStatus) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/reader/regenerate-tags-status?regenerateId=${regenerateStatus.regenerateId}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch regenerate status');
        }

        const status: RegenerateStatus = await response.json();
        setRegenerateStatus(status);

        // Stop polling when regeneration is complete
        if (
          status.totalJobs === 0 ||
          status.status === 'completed' ||
          status.status === 'partial_failure' ||
          status.status === 'failed'
        ) {
          setRegenerating(false);
          loadItems(); // Reload items to show new tags
        }
      } catch (err) {
        console.error('Regenerate status polling error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setRegenerating(false);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [regenerating, regenerateStatus]);

  async function loadItems() {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/reader/items');

      if (!response.ok) {
        throw new Error('Failed to load items');
      }

      const data = (await response.json()) as { items: ReaderItem[] };
      setItems(data.items || []);
    } catch (err) {
      console.error('Load items error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    setSyncStatus(null);

    try {
      const response = await fetch('/api/reader/sync', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Sync failed');
      }

      const data = (await response.json()) as {
        syncId: string;
        totalItems: number;
      };
      setSyncStatus({
        syncId: data.syncId,
        totalJobs: data.totalItems,
        completedJobs: 0,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: data.totalItems,
        status: 'pending',
      });
    } catch (err) {
      console.error('Sync error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSyncing(false);
    }
  }

  async function handleArchive(itemId: string) {
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/reader/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Archive failed');
      }

      const data = (await response.json()) as {
        success: boolean;
        readerDeleted?: boolean;
      };

      // Show feedback if item was already deleted in Reader
      if (data.readerDeleted) {
        setSuccessMessage('Archived (already deleted in Reader)');
      }

      // Remove from items list
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error('Archive error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function handleRetry() {
    if (!syncStatus) return;

    setError(null);
    setSuccessMessage(null);
    setSyncing(true);

    try {
      const response = await fetch('/api/reader/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncId: syncStatus.syncId }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Retry failed');
      }

      const data = (await response.json()) as { retriedCount: number };

      // Reset sync status to start polling again
      setSyncStatus({
        ...syncStatus,
        failedJobs: syncStatus.failedJobs - data.retriedCount,
        pendingJobs: syncStatus.pendingJobs + data.retriedCount,
        status: 'processing',
      });
    } catch (err) {
      console.error('Retry error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSyncing(false);
    }
  }

  async function handleRetryRegenerateTags() {
    if (!regenerateStatus) return;

    setError(null);
    setSuccessMessage(null);
    setRegenerating(true);

    try {
      const response = await fetch('/api/reader/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ regenerateId: regenerateStatus.regenerateId }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Retry failed');
      }

      const data = (await response.json()) as { retriedCount: number };

      // Reset regenerate status to start polling again
      setRegenerateStatus({
        ...regenerateStatus,
        failedJobs: regenerateStatus.failedJobs - data.retriedCount,
        pendingJobs: regenerateStatus.pendingJobs + data.retriedCount,
        status: 'processing',
      });
    } catch (err) {
      console.error('Retry regenerate tags error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRegenerating(false);
    }
  }

  async function handleDismissFailedItem(itemId: string) {
    setError(null);
    setSuccessMessage(null);
    setDismissingItemId(itemId);

    try {
      const response = await fetch('/api/reader/dismiss-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to dismiss item');
      }

      // Remove from failed items lists
      if (syncStatus?.failedItems) {
        setSyncStatus({
          ...syncStatus,
          failedItems: syncStatus.failedItems.filter((item) => item.itemId !== itemId),
          failedJobs: Math.max(0, syncStatus.failedJobs - 1),
        });
      }

      if (regenerateStatus?.failedItems) {
        setRegenerateStatus({
          ...regenerateStatus,
          failedItems: regenerateStatus.failedItems.filter((item) => item.itemId !== itemId),
          failedJobs: Math.max(0, regenerateStatus.failedJobs - 1),
        });
      }

      setSuccessMessage('Failed item dismissed');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Dismiss failed item error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDismissingItemId(null);
    }
  }

  async function handleRegenerateTags() {
    setError(null);
    setSuccessMessage(null);
    setRegenerating(true);
    setRegenerateStatus(null);

    try {
      const response = await fetch('/api/reader/regenerate-tags', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Tag regeneration failed');
      }

      const data = (await response.json()) as {
        regenerateId: string;
        totalItems: number;
      };

      // Initialize status tracking (no alert - progress bar will show)
      setRegenerateStatus({
        regenerateId: data.regenerateId,
        totalJobs: data.totalItems,
        completedJobs: 0,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: data.totalItems,
        status: 'pending',
      });
    } catch (err) {
      console.error('Regenerate tags error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRegenerating(false);
    }
  }

  async function handleSaveNote(itemId: string, note: string) {
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/reader/note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, note }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        note?: string;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        // Handle partial success (502 - saved locally but Reader sync failed)
        if (response.status === 502) {
          setSuccessMessage('Note saved locally. Reader sync failed - please try editing again to retry. Your note is safe in Ansible.');
          // Update local state even though Reader sync failed
          setItems((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, document_note: note } : item
            )
          );
          return;
        }

        throw new Error(data.error || 'Failed to save note');
      }

      // Update items list with the saved note
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, document_note: data.note || note } : item
        )
      );

      setSuccessMessage('Note saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Save note error:', err);
      throw err; // Re-throw so SummaryCard can handle the error
    }
  }

  async function handleSaveRating(itemId: string, rating: number | null) {
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/reader/rating', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, rating }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: Array<{ field: string; message: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save rating');
      }

      // Update items list with the new rating
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, rating } : item
        )
      );

      // Optional: Show success message
      // setSuccessMessage('Rating saved successfully');
      // setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Save rating error:', err);
      throw err; // Re-throw so SummaryCard can handle the error
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <Header
        userEmail={userEmail}
        showSync={true}
        onSync={handleSync}
        isSyncing={syncing}
        showRegenerateTags={
          !loading && items.some((item) => !item.tags || item.tags.length === 0)
        }
        onRegenerateTags={handleRegenerateTags}
        isRegenerating={regenerating}
      />

      {/* Main content */}
      <main style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 24px' }}>
        {/* Error display */}
        {error && (
          <div
            style={{
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '20px',
              background: '#f8d7da',
              color: '#dc3545',
            }}
          >
            Error: {error}
          </div>
        )}

        {/* Success message display */}
        {successMessage && (
          <div
            style={{
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '20px',
              background: '#d4edda',
              color: '#155724',
            }}
          >
            ✅ {successMessage}
          </div>
        )}

        {/* Sync progress */}
        {syncStatus && syncing && (
          <ProgressBar
            title="Sync Progress"
            completed={syncStatus.completedJobs}
            failed={syncStatus.failedJobs}
            total={syncStatus.totalJobs}
          />
        )}

        {/* Regenerate tags progress */}
        {regenerateStatus && regenerating && (
          <ProgressBar
            title="Tag Regeneration Progress"
            completed={regenerateStatus.completedJobs}
            failed={regenerateStatus.failedJobs}
            total={regenerateStatus.totalJobs}
          />
        )}

        {/* Completion status */}
        {syncStatus && !syncing && (
          <div
            style={{
              padding: '16px',
              borderRadius: '4px',
              marginBottom: '20px',
              background:
                syncStatus.status === 'completed'
                  ? '#d4edda'
                  : syncStatus.status === 'partial_failure'
                  ? '#fff3cd'
                  : '#f8d7da',
              color:
                syncStatus.status === 'completed'
                  ? '#155724'
                  : syncStatus.status === 'partial_failure'
                  ? '#856404'
                  : '#721c24',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {syncStatus.status === 'completed' && syncStatus.totalJobs === 0 &&
                  `✅ No unsynced items. Ansible is up to date!`}
                {syncStatus.status === 'completed' && syncStatus.totalJobs > 0 &&
                  `✅ Sync completed! ${syncStatus.completedJobs} items processed.`}
                {syncStatus.status === 'partial_failure' &&
                  `⚠️ Sync completed with ${syncStatus.failedJobs} failures. ${syncStatus.completedJobs} items processed successfully.`}
                {syncStatus.status === 'failed' &&
                  `❌ Sync failed. ${syncStatus.failedJobs} items failed to process.`}
              </p>

              {/* Retry button */}
              {syncStatus.failedJobs > 0 && (
                <button
                  onClick={handleRetry}
                  style={{
                    background: '#ffc107',
                    color: '#fff',
                    padding: '6px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.9em',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Retry Failed ({syncStatus.failedJobs})
                </button>
              )}
            </div>

            {/* Failed items list */}
            {syncStatus.failedItems && syncStatus.failedItems.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p
                  style={{
                    margin: '0 0 8px 0',
                    fontWeight: 600,
                    fontSize: '0.9em',
                  }}
                >
                  Failed items:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9em', listStyle: 'none' }}>
                  {syncStatus.failedItems.map((item) => (
                    <li key={item.itemId} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{item.title}:</strong> {item.error}
                      </span>
                      <button
                        onClick={() => handleDismissFailedItem(item.itemId)}
                        disabled={dismissingItemId === item.itemId}
                        style={{
                          background: 'transparent',
                          border: '1px solid currentColor',
                          color: 'inherit',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: dismissingItemId === item.itemId ? 'not-allowed' : 'pointer',
                          fontSize: '0.85em',
                          flexShrink: 0,
                          opacity: dismissingItemId === item.itemId ? 0.5 : 1,
                        }}
                        title="Dismiss this failed item"
                      >
                        {dismissingItemId === item.itemId ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Regenerate tags completion status */}
        {regenerateStatus && !regenerating && (
          <div
            style={{
              padding: '16px',
              borderRadius: '4px',
              marginBottom: '20px',
              background:
                regenerateStatus.status === 'completed'
                  ? '#d4edda'
                  : regenerateStatus.status === 'partial_failure'
                  ? '#fff3cd'
                  : '#f8d7da',
              color:
                regenerateStatus.status === 'completed'
                  ? '#155724'
                  : regenerateStatus.status === 'partial_failure'
                  ? '#856404'
                  : '#721c24',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {regenerateStatus.status === 'completed' && regenerateStatus.totalJobs === 0 &&
                  `✅ No items need tag regeneration.`}
                {regenerateStatus.status === 'completed' && regenerateStatus.totalJobs > 0 &&
                  `✅ Successfully regenerated tags for ${regenerateStatus.completedJobs} items.`}
                {regenerateStatus.status === 'partial_failure' &&
                  `⚠️ Tag regeneration completed with ${regenerateStatus.failedJobs} failures. ${regenerateStatus.completedJobs} items processed successfully.`}
                {regenerateStatus.status === 'failed' &&
                  `❌ Tag regeneration failed. ${regenerateStatus.failedJobs} items failed to process.`}
              </p>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {/* Retry button */}
                {regenerateStatus.failedJobs > 0 && (
                  <button
                    onClick={handleRetryRegenerateTags}
                    style={{
                      background: '#ffc107',
                      color: '#fff',
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.9em',
                      fontWeight: 600,
                    }}
                  >
                    Retry Failed ({regenerateStatus.failedJobs})
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={() => setRegenerateStatus(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '1.2em',
                    padding: '4px 8px',
                  }}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Failed items list */}
            {regenerateStatus.failedItems && regenerateStatus.failedItems.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p
                  style={{
                    margin: '0 0 8px 0',
                    fontWeight: 600,
                    fontSize: '0.9em',
                  }}
                >
                  Failed items:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9em', listStyle: 'none' }}>
                  {regenerateStatus.failedItems.map((item) => (
                    <li key={item.itemId} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{item.title}:</strong> {item.error}
                      </span>
                      <button
                        onClick={() => handleDismissFailedItem(item.itemId)}
                        disabled={dismissingItemId === item.itemId}
                        style={{
                          background: 'transparent',
                          border: '1px solid currentColor',
                          color: 'inherit',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: dismissingItemId === item.itemId ? 'not-allowed' : 'pointer',
                          fontSize: '0.85em',
                          flexShrink: 0,
                          opacity: dismissingItemId === item.itemId ? 0.5 : 1,
                        }}
                        title="Dismiss this failed item"
                      >
                        {dismissingItemId === item.itemId ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Items grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: '#6c757d' }}>Loading summaries...</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {items.map((item) => (
              <SummaryCard
                key={item.id}
                id={item.id}
                title={item.title}
                url={item.url}
                summary={item.short_summary || 'No summary available'}
                tags={item.tags || []}
                author={item.author || undefined}
                wordCount={item.word_count || undefined}
                contentTruncated={item.content_truncated}
                documentNote={item.document_note}
                rating={item.rating}
                onArchive={handleArchive}
                onSaveNote={handleSaveNote}
                onSaveRating={handleSaveRating}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
