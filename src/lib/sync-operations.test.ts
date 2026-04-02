// ABOUT: Tests for shared sync operations logic
// ABOUT: Validates performSyncForUser function used by both manual and cron syncs

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performSyncForUser } from './sync-operations';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock reader-api
vi.mock('./reader-api', () => ({
  fetchUnreadItems: vi.fn(),
  fetchRecentlyArchivedItems: vi.fn(),
}));

import { fetchUnreadItems, fetchRecentlyArchivedItems } from './reader-api';

describe('performSyncForUser', () => {
  let mockSupabase: any;
  let mockQueue: any;
  let mockSyncLogSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Cloudflare Queue
    mockQueue = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    // Mock Supabase client
    mockSupabase = {
      from: vi.fn(),
    } as unknown as SupabaseClient;

    // Default: archive sync finds nothing archived in Reader (no-op)
    (fetchRecentlyArchivedItems as any).mockResolvedValue({
      results: [],
      nextPageCursor: null,
    });

    // Chainable select mock for the "get last sync" query in archive sync step.
    // Returns no prior sync by default (first-time user → 30-day fallback).
    const mockMaybySingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybySingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockNot = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEqChain = vi.fn().mockReturnValue({ not: mockNot });
    mockSyncLogSelect = vi.fn().mockReturnValue({ eq: mockEqChain });
  });

  it('creates sync_log with triggered_by=manual for manual syncs', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Test Article',
          url: 'https://example.com/test',
          created_at: '2026-03-24T10:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    // Verify sync_log insert was called with triggered_by='manual'
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        sync_type: 'reader_fetch',
        triggered_by: 'manual',
      })
    );
  });

  it('creates sync_log with triggered_by=cron for automated syncs', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Test Article',
          url: 'https://example.com/test',
          created_at: '2026-03-24T10:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'cron',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    // Verify sync_log insert was called with triggered_by='cron'
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        sync_type: 'reader_fetch',
        triggered_by: 'cron',
      })
    );
  });

  it('handles pagination correctly', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn()
          .mockResolvedValueOnce({
            data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { id: 'item-2', reader_id: 'reader-2', short_summary: null },
            error: null,
          }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    // First page with cursor
    (fetchUnreadItems as any)
      .mockResolvedValueOnce({
        results: [
          {
            id: 'reader-1',
            title: 'Article 1',
            url: 'https://example.com/1',
            created_at: '2026-03-24T10:00:00Z',
          },
        ],
        nextPageCursor: 'cursor-123',
      })
      // Second page without cursor
      .mockResolvedValueOnce({
        results: [
          {
            id: 'reader-2',
            title: 'Article 2',
            url: 'https://example.com/2',
            created_at: '2026-03-24T11:00:00Z',
          },
        ],
        nextPageCursor: null,
      });

    const result = await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    // Should fetch both pages
    expect(fetchUnreadItems).toHaveBeenCalledTimes(2);
    expect(fetchUnreadItems).toHaveBeenNthCalledWith(
      1,
      'test-token',
      undefined
    );
    expect(fetchUnreadItems).toHaveBeenNthCalledWith(
      2,
      'test-token',
      'cursor-123'
    );

    // Should process both items
    expect(result.totalFetched).toBe(2);
  });

  it('skips items with existing summaries', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn()
          // First item has summary (skip job creation)
          .mockResolvedValueOnce({
            data: {
              id: 'item-1',
              reader_id: 'reader-1',
              short_summary: 'Existing summary',
            },
            error: null,
          })
          // Second item has no summary (create job)
          .mockResolvedValueOnce({
            data: { id: 'item-2', reader_id: 'reader-2', short_summary: null },
            error: null,
          }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Article 1',
          url: 'https://example.com/1',
          created_at: '2026-03-24T10:00:00Z',
        },
        {
          id: 'reader-2',
          title: 'Article 2',
          url: 'https://example.com/2',
          created_at: '2026-03-24T11:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    const result = await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    // Should fetch 2 items but only create 1 job
    expect(result.totalFetched).toBe(2);
    expect(result.totalItems).toBe(1);
    expect(mockQueue.send).toHaveBeenCalledTimes(1);
  });

  it('enqueues jobs to Cloudflare Queue', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Test Article',
          url: 'https://example.com/test',
          created_at: '2026-03-24T10:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    // Verify queue message sent
    expect(mockQueue.send).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: 'user-123',
      readerItemId: 'item-1',
      readerId: 'reader-1',
      jobType: 'summary_generation',
    });
  });

  it('works without Cloudflare Queue (local dev mode)', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Test Article',
          url: 'https://example.com/test',
          created_at: '2026-03-24T10:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    const result = await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      // No cloudflareEnv - local dev mode
    });

    // Should still count job as created
    expect(result.totalItems).toBe(1);
    // Queue should not be called
    expect(mockQueue.send).not.toHaveBeenCalled();
  });

  it('throws error if sync_log creation fails', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      error: { message: 'Database error' },
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert };
      }
      return {};
    });

    await expect(
      performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
      })
    ).rejects.toThrow('Failed to start sync operation');
  });

  describe('archive sync step', () => {
    // Shared helpers for tests that need a successful unread fetch + full mock setup
    function makeBaseMocks() {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null }),
        }),
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
            error: null,
          }),
        }),
      });

      (fetchUnreadItems as any).mockResolvedValue({
        results: [
          { id: 'reader-1', title: 'Test Article', url: 'https://example.com/test', created_at: '2026-04-01T10:00:00Z' },
        ],
        nextPageCursor: null,
      });

      return { mockInsert, mockUpdate, mockUpsert };
    }

    it('archives locally visible items that are archived in Reader', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      (fetchRecentlyArchivedItems as any).mockResolvedValue({
        results: [{ id: 'reader-archived-1', updated_at: '2026-04-01T12:00:00Z' }],
        nextPageCursor: null,
      });

      // SELECT: finds the matching local item
      const mockItemsSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: [{ id: 'local-item-uuid', reader_id: 'reader-archived-1' }],
              error: null,
            }),
          }),
        }),
      });
      // UPDATE: per-item update with Reader's archived_at timestamp
      const mockItemsUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
        if (table === 'reader_items') return { upsert: mockUpsert, select: mockItemsSelect, update: mockItemsUpdate };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      const result = await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      expect(result.itemsArchived).toBe(1);
      // Verify the per-item UPDATE used Reader's archived_at timestamp
      expect(mockItemsUpdate).toHaveBeenCalledWith({
        archived: true,
        archived_at: '2026-04-01T12:00:00Z',
      });
    });

    it('skips the DB update when no items were archived in Reader', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      // Default mock already returns empty results
      const mockItemsUpdate = vi.fn();

      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
        if (table === 'reader_items') return { upsert: mockUpsert, update: mockItemsUpdate };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      const result = await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      expect(result.itemsArchived).toBe(0);
      expect(mockItemsUpdate).not.toHaveBeenCalled();
    });

    it('uses last sync started_at as the updatedAfter window when a prior sync exists', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      // Override: prior sync exists
      const mockMaybySingle = vi.fn().mockResolvedValue({
        data: { started_at: '2026-04-01T09:00:00Z' },
        error: null,
      });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybySingle });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockNot = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEqChain = vi.fn().mockReturnValue({ not: mockNot });
      const mockSelectWithPriorSync = vi.fn().mockReturnValue({ eq: mockEqChain });

      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSelectWithPriorSync };
        if (table === 'reader_items') return { upsert: mockUpsert };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      expect(fetchRecentlyArchivedItems).toHaveBeenCalledWith(
        'test-token',
        '2026-04-01T09:00:00Z',
        undefined
      );
    });

    it('uses 30-day fallback as updatedAfter for first-time users with no prior sync', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      // Default mockSyncLogSelect returns null data (no prior sync)
      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
        if (table === 'reader_items') return { upsert: mockUpsert };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      const calledWith = (fetchRecentlyArchivedItems as any).mock.calls[0][1] as string;
      const calledDate = new Date(calledWith);
      // Should be approximately 30 days ago (within 1 minute tolerance)
      expect(Math.abs(calledDate.getTime() - before.getTime())).toBeLessThan(60_000);
    });

    it('handles pagination when Reader returns multiple pages of archived items', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      (fetchRecentlyArchivedItems as any)
        .mockResolvedValueOnce({
          results: [{ id: 'archived-1', updated_at: '2026-04-01T10:00:00Z' }],
          nextPageCursor: 'cursor-page-2',
        })
        .mockResolvedValueOnce({
          results: [{ id: 'archived-2', updated_at: '2026-04-01T11:00:00Z' }],
          nextPageCursor: null,
        });

      // SELECT: verify both reader_ids from both pages are queried together
      const capturedReaderIds: string[] = [];
      const mockItemsSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation((_, ids) => {
            capturedReaderIds.push(...ids);
            return {
              is: vi.fn().mockResolvedValue({
                data: [
                  { id: 'local-1', reader_id: 'archived-1' },
                  { id: 'local-2', reader_id: 'archived-2' },
                ],
                error: null,
              }),
            };
          }),
        }),
      });
      // UPDATE: called once per matched local item
      const mockItemsUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
        if (table === 'reader_items') return { upsert: mockUpsert, select: mockItemsSelect, update: mockItemsUpdate };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      const result = await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      expect(fetchRecentlyArchivedItems).toHaveBeenCalledTimes(2);
      expect(fetchRecentlyArchivedItems).toHaveBeenNthCalledWith(2, 'test-token', expect.any(String), 'cursor-page-2');
      // Both pages' reader_ids should be batched into a single SELECT
      expect(capturedReaderIds).toEqual(expect.arrayContaining(['archived-1', 'archived-2']));
      expect(capturedReaderIds).toHaveLength(2);
      // One UPDATE per matched item
      expect(mockItemsUpdate).toHaveBeenCalledTimes(2);
      expect(result.itemsArchived).toBe(2);
    });

    it('continues sync and logs error when archive sync fails (non-fatal)', async () => {
      const { mockInsert, mockUpdate, mockUpsert } = makeBaseMocks();

      (fetchRecentlyArchivedItems as any).mockRejectedValue(new Error('Reader API unavailable'));

      (mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'sync_log') return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
        if (table === 'reader_items') return { upsert: mockUpsert };
        if (table === 'processing_jobs') return { insert: mockInsert };
        return {};
      });

      // Should NOT throw — archive sync errors are non-fatal
      const result = await performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
        cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
      });

      expect(result.itemsArchived).toBe(0);
      // Unread sync should still have completed normally
      expect(result.totalFetched).toBe(1);
      // Error should be recorded
      expect(result.errors).toBe(1);
    });
  });

  it('handles fetch errors and updates sync_log', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sync-123' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      return {};
    });

    (fetchUnreadItems as any).mockRejectedValue(new Error('Reader API error'));

    await expect(
      performSyncForUser(mockSupabase, {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-token',
      })
    ).rejects.toThrow('Sync operation failed');

    // Verify sync_log was updated with error
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('returns correct result structure', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1', reader_id: 'reader-1', short_summary: null },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate, select: mockSyncLogSelect };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
      return {};
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          title: 'Test Article',
          url: 'https://example.com/test',
          created_at: '2026-03-24T10:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    const result = await performSyncForUser(mockSupabase, {
      userId: 'user-123',
      triggeredBy: 'manual',
      readerApiToken: 'test-token',
      cloudflareEnv: { PROCESSING_QUEUE: mockQueue },
    });

    expect(result).toEqual({
      syncId: expect.any(String),
      totalItems: 1,
      totalFetched: 1,
      itemsArchived: 0,
      errors: undefined,
    });
  });
});
