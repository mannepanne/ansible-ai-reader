// ABOUT: Tests for Reader sync API endpoint
// ABOUT: Validates sync operation, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetSession = vi.fn();
const mockFrom = vi.fn();
const mockSend = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/reader-api', () => ({
  fetchUnreadItems: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      PROCESSING_QUEUE: {
        send: mockSend,
      },
    },
  })),
}));

import { fetchUnreadItems } from '@/lib/reader-api';

describe('POST /api/reader/sync', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
  });

  it('syncs items successfully', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    // Mock fetchUnreadItems
    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          url: 'https://example.com/article1',
          title: 'Article 1',
          author: 'Author 1',
          created_at: '2026-03-12T10:00:00Z',
        },
        {
          id: 'reader-2',
          url: 'https://example.com/article2',
          title: 'Article 2',
          created_at: '2026-03-12T11:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    // Mock database operations
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sync-123' },
          error: null,
        }),
      }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn()
          .mockResolvedValueOnce({
            data: { id: 'item-1', reader_id: 'reader-1' },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { id: 'item-2', reader_id: 'reader-2' },
            error: null,
          }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return {
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      if (table === 'reader_items') {
        return {
          upsert: mockUpsert,
        };
      }
      if (table === 'processing_jobs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn()
                .mockResolvedValueOnce({
                  data: { id: 'job-1' },
                  error: null,
                })
                .mockResolvedValueOnce({
                  data: { id: 'job-2' },
                  error: null,
                }),
            }),
          }),
        };
      }
    });

    mockSend.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      syncId: expect.any(String),
      totalItems: 2,
      totalFetched: 2,
    });

    expect(fetchUnreadItems).toHaveBeenCalledWith('test-reader-token', undefined);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('handles pagination correctly', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    // First page
    (fetchUnreadItems as any).mockResolvedValueOnce({
      results: [
        {
          id: 'reader-1',
          url: 'https://example.com/article1',
          title: 'Article 1',
          created_at: '2026-03-12T10:00:00Z',
        },
      ],
      nextPageCursor: 'cursor-abc',
    });

    // Second page
    (fetchUnreadItems as any).mockResolvedValueOnce({
      results: [
        {
          id: 'reader-2',
          url: 'https://example.com/article2',
          title: 'Article 2',
          created_at: '2026-03-12T11:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    // Mock database
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sync-123' },
          error: null,
        }),
      }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'item-1' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'job-1' },
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockSend.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.totalFetched).toBe(2);
    expect(fetchUnreadItems).toHaveBeenCalledTimes(2);
    expect(fetchUnreadItems).toHaveBeenNthCalledWith(1, 'test-reader-token', undefined);
    expect(fetchUnreadItems).toHaveBeenNthCalledWith(2, 'test-reader-token', 'cursor-abc');
  });

  it('skips job creation for items that already have summaries', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const mockItem = {
      id: 'reader-item-123',
      title: 'Already Summarized Article',
      url: 'https://example.com/summarized',
      author: 'Test Author',
      source: 'Test Source',
      created_at: '2026-03-15T10:00:00Z',
      word_count: 1000,
    };

    (fetchUnreadItems as any).mockResolvedValue({
      results: [mockItem],
      nextPageCursor: null,
    });

    // Mock sync_log insert
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sync-456' },
          error: null,
        }),
      }),
    });

    // Mock upsert to return item with existing summary
    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'db-item-123',
            reader_id: mockItem.id,
            short_summary: 'This article has already been summarized',
            tags: ['test'],
          },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      // processing_jobs should NOT be called
      if (table === 'processing_jobs') {
        return { insert: vi.fn() };
      }
      return {};
    });

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.totalItems).toBe(0); // No jobs created
    expect(data.totalFetched).toBe(1); // 1 item fetched
    expect(fetchUnreadItems).toHaveBeenCalledWith('test-reader-token', undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(fetchUnreadItems).not.toHaveBeenCalled();
  });

  it('returns 500 when READER_API_TOKEN not configured', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const originalToken = process.env.READER_API_TOKEN;
    process.env.READER_API_TOKEN = '';

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Reader API not configured');
  });

  it('handles sync_log creation error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    // Mock sync_log insert to return error directly
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: { message: 'Database error' },
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to start sync operation');
  });

  it('continues processing after item error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    (fetchUnreadItems as any).mockResolvedValue({
      results: [
        {
          id: 'reader-1',
          url: 'https://example.com/article1',
          title: 'Article 1',
          created_at: '2026-03-12T10:00:00Z',
        },
        {
          id: 'reader-2',
          url: 'https://example.com/article2',
          title: 'Article 2',
          created_at: '2026-03-12T11:00:00Z',
        },
      ],
      nextPageCursor: null,
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sync-123' },
          error: null,
        }),
      }),
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn()
          .mockResolvedValueOnce({
            data: null,
            error: { message: 'Item error' },
          })
          .mockResolvedValueOnce({
            data: { id: 'item-2' },
            error: null,
          }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return { insert: mockInsert, update: mockUpdate };
      }
      if (table === 'reader_items') {
        return { upsert: mockUpsert };
      }
      if (table === 'processing_jobs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'job-2' },
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockSend.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/sync', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.totalFetched).toBe(2);
    expect(data.totalItems).toBe(1); // Only 1 created successfully
    expect(data.errors).toBe(1);
  });
});
