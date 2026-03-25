// ABOUT: Tests for shared sync operations logic
// ABOUT: Validates performSyncForUser function used by both manual and cron syncs

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performSyncForUser } from './sync-operations';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock reader-api
vi.mock('./reader-api', () => ({
  fetchUnreadItems: vi.fn(),
}));

import { fetchUnreadItems } from './reader-api';

describe('performSyncForUser', () => {
  let mockSupabase: any;
  let mockQueue: any;

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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
        return { insert: mockInsert, update: mockUpdate };
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
      errors: undefined,
    });
  });
});
