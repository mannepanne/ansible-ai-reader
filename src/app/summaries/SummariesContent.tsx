// ABOUT: Client component for summaries page with card-based layout
// ABOUT: Handles Reader sync, status polling, and items display with responsive grid

'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import SummaryCard from '@/components/SummaryCard';

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

interface SummariesContentProps {
  userEmail: string;
}

export default function SummariesContent({ userEmail }: SummariesContentProps) {
  const [items, setItems] = useState<ReaderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

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

        // Stop polling when sync is complete
        if (
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

  async function loadItems() {
    setLoading(true);
    setError(null);

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

  async function handleRegenerateTags() {
    setError(null);
    setRegenerating(true);

    try {
      const response = await fetch('/api/reader/regenerate-tags', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Tag regeneration failed');
      }

      const data = (await response.json()) as {
        message: string;
        count: number;
      };

      // Show success message
      alert(`${data.message}. Items will be reprocessed in the background.`);

      // Optionally reload items after a delay
      setTimeout(() => {
        loadItems();
      }, 3000);
    } catch (err) {
      console.error('Regenerate tags error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRegenerating(false);
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

        {/* Sync progress */}
        {syncStatus && syncing && (
          <div
            style={{
              padding: '16px',
              background: '#d1ecf1',
              border: '1px solid #bee5eb',
              borderRadius: '4px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontWeight: 600, color: '#0c5460' }}>
                Sync Progress
              </span>
              <span style={{ color: '#0c5460' }}>
                {syncStatus.completedJobs + syncStatus.failedJobs} /{' '}
                {syncStatus.totalJobs}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                background: '#bee5eb',
                borderRadius: '4px',
                height: '8px',
              }}
            >
              <div
                style={{
                  width: `${
                    syncStatus.totalJobs > 0
                      ? ((syncStatus.completedJobs + syncStatus.failedJobs) /
                          syncStatus.totalJobs) *
                        100
                      : 0
                  }%`,
                  background: '#17a2b8',
                  height: '8px',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
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
                {syncStatus.status === 'completed' &&
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
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9em' }}>
                  {syncStatus.failedItems.map((item) => (
                    <li key={item.itemId}>
                      {item.title}: {item.error}
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
          <div
            style={{
              textAlign: 'center',
              padding: '48px',
              background: '#fff',
              borderRadius: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,.1)',
            }}
          >
            <p style={{ color: '#6c757d', margin: 0 }}>
              No summaries yet. Click &quot;Sync&quot; in the header to fetch
              your unread items from Readwise Reader.
            </p>
          </div>
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
                onArchive={handleArchive}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
