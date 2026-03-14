// ABOUT: Client component for summaries page with sync and list functionality
// ABOUT: Handles Reader sync, status polling, and items display

'use client';

import { useState, useEffect } from 'react';

interface ReaderItem {
  id: string;
  reader_id: string;
  title: string;
  author: string | null;
  source: string | null;
  url: string;
  word_count: number | null;
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
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());

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

      const data = (await response.json()) as { syncId: string; totalItems: number };
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
    // Add to archiving set
    setArchivingIds((prev) => new Set(prev).add(itemId));
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
    } finally {
      // Remove from archiving set
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Summaries</h1>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Logout
              </button>
            </form>
          </div>

          {/* User info */}
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Logged in as: <strong>{userEmail}</strong>
            </p>
          </div>

          {/* Sync button and status */}
          <div className="mb-6">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Syncing...
                </>
              ) : (
                'Sync Reader'
              )}
            </button>

            {/* Progress indicator */}
            {syncStatus && syncing && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">
                    Sync Progress
                  </span>
                  <span className="text-sm text-blue-600">
                    {syncStatus.completedJobs + syncStatus.failedJobs} /{' '}
                    {syncStatus.totalJobs}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        syncStatus.totalJobs > 0
                          ? ((syncStatus.completedJobs + syncStatus.failedJobs) /
                              syncStatus.totalJobs) *
                            100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
                <div className="mt-2 text-sm text-blue-600">
                  {syncStatus.status === 'pending' && 'Starting sync...'}
                  {syncStatus.status === 'processing' && 'Processing items...'}
                </div>
              </div>
            )}

            {/* Completion status */}
            {syncStatus && !syncing && (
              <div
                className={`mt-4 p-4 border rounded-md ${
                  syncStatus.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : syncStatus.status === 'partial_failure'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <p
                    className={`text-sm font-medium ${
                      syncStatus.status === 'completed'
                        ? 'text-green-900'
                        : syncStatus.status === 'partial_failure'
                        ? 'text-yellow-900'
                        : 'text-red-900'
                    }`}
                  >
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
                      className="flex-shrink-0 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                    >
                      Retry Failed ({syncStatus.failedJobs})
                    </button>
                  )}
                </div>

                {/* Failed items list */}
                {syncStatus.failedItems && syncStatus.failedItems.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      Failed items:
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {syncStatus.failedItems.map((item) => (
                        <li key={item.itemId}>
                          • {item.title}: {item.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">Error: {error}</p>
            </div>
          )}

          {/* Items list */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-600">
                No items yet. Click &quot;Sync Reader&quot; to fetch your unread
                items.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Reader Items ({items.length})
              </h2>
              <div className="divide-y divide-gray-200">
                {items.map((item) => (
                  <div key={item.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-medium text-gray-900 mb-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600"
                          >
                            {item.title}
                          </a>
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {item.author && <span>By {item.author}</span>}
                          {item.source && <span>• {item.source}</span>}
                          {item.word_count && (
                            <span>• {item.word_count.toLocaleString()} words</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleArchive(item.id)}
                        disabled={archivingIds.has(item.id)}
                        className="flex-shrink-0 inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {archivingIds.has(item.id) ? (
                          <>
                            <svg
                              className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-gray-700"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Archiving...
                          </>
                        ) : (
                          'Archive'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
