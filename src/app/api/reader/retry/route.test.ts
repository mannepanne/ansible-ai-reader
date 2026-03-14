// ABOUT: Tests for Reader retry API endpoint
// ABOUT: Validates retrying failed jobs, authentication, error handling

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

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      PROCESSING_QUEUE: {
        send: (...args: any[]) => mockSend(...args),
      },
    },
  })),
}));

describe('POST /api/reader/retry', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries failed jobs successfully', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sync-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'job-1',
                      reader_item_id: 'item-1',
                      job_type: 'summary_generation',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  reader_id: 'reader-123',
                },
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockSend.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'sync-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.retriedCount).toBe(1);
    expect(mockSend).toHaveBeenCalledWith({
      jobId: 'job-1',
      userId: 'user-123',
      readerItemId: 'item-1',
      readerId: 'reader-123',
      jobType: 'summary_generation',
    });
  });

  it('returns 0 when no failed jobs', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sync-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'sync-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.retriedCount).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'sync-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when syncId is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing syncId parameter');
  });

  it('returns 404 when sync not found', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'nonexistent' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error).toBe('Sync not found');
  });

  it('returns 500 when failed to fetch jobs', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_log') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sync-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'sync-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch failed jobs');
  });
});
