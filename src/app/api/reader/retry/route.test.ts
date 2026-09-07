// ABOUT: Tests for Reader retry API endpoint
// ABOUT: Validates retrying failed jobs, authentication, error handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSend = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
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
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
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
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
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
    mockGetUser.mockResolvedValue({
      data: { user: null },
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
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing syncId or regenerateId parameter');
  });

  it('returns 404 when sync not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
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
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
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

  it('returns 400 when both syncId and regenerateId are provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockSession.user } });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: JSON.stringify({ syncId: 'sync-123', regenerateId: 'regen-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Provide either syncId or regenerateId, not both');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 500 when the request body is not JSON', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ data: { user: mockSession.user } });

    const request = new NextRequest('http://localhost:3000/api/reader/retry', {
      method: 'POST',
      body: 'not json',
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
    errorSpy.mockRestore();
  });

  describe('per-job failure handling (sync)', () => {
    // Builds a sync_log + processing_jobs setup with two failed jobs; the reader_items and
    // update behaviour is injected per test so each skip path can be exercised
    function setupTwoFailedJobs(opts: {
      readerItems: Record<string, { reader_id: string } | null>;
      updateError?: (jobId: string) => unknown;
    }) {
      mockGetUser.mockResolvedValue({ data: { user: mockSession.user } });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sync_log') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'sync-123' }, error: null }),
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
                      { id: 'job-1', reader_item_id: 'item-1', job_type: 'summary_generation' },
                      { id: 'job-2', reader_item_id: 'item-2', job_type: 'tag_generation' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn(async (_col: string, jobId: string) => ({
                error: opts.updateError ? opts.updateError(jobId) : null,
              })),
            }),
          };
        }
        if (table === 'reader_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn((_col: string, itemId: string) => ({
                single: vi.fn().mockResolvedValue({ data: opts.readerItems[itemId] ?? null, error: null }),
              })),
            }),
          };
        }
      });
    }

    const syncRequest = () =>
      new NextRequest('http://localhost:3000/api/reader/retry', {
        method: 'POST',
        body: JSON.stringify({ syncId: 'sync-123' }),
      });

    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSend.mockResolvedValue(undefined);
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('skips jobs whose reader item no longer exists', async () => {
      setupTwoFailedJobs({ readerItems: { 'item-1': null, 'item-2': { reader_id: 'reader-2' } } });

      const response = await POST(syncRequest());
      const data = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(data.retriedCount).toBe(1);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-2', readerId: 'reader-2' }));
      expect(errorSpy).toHaveBeenCalledWith('[Retry] Reader item not found:', 'item-1');
    });

    it('skips jobs whose status update fails', async () => {
      setupTwoFailedJobs({
        readerItems: { 'item-1': { reader_id: 'reader-1' }, 'item-2': { reader_id: 'reader-2' } },
        updateError: (jobId) => (jobId === 'job-1' ? { message: 'update failed' } : null),
      });

      const response = await POST(syncRequest());
      const data = (await response.json()) as any;

      expect(data.retriedCount).toBe(1);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-2' }));
      expect(errorSpy).toHaveBeenCalledWith('[Retry] Failed to update job:', { message: 'update failed' });
    });

    it('continues with the next job when the queue send throws', async () => {
      setupTwoFailedJobs({
        readerItems: { 'item-1': { reader_id: 'reader-1' }, 'item-2': { reader_id: 'reader-2' } },
      });
      mockSend.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValueOnce(undefined);

      const response = await POST(syncRequest());
      const data = (await response.json()) as any;

      expect(data.retriedCount).toBe(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith('[Retry] Failed to retry job:', 'job-1', expect.any(Error));
    });
  });

  describe('regenerate tags retry', () => {
    // processing_jobs is queried twice on the no-failed-jobs path: the failed-jobs lookup
    // (select.eq.eq.eq) then the batch-exists probe (select.eq.eq.limit); results are dequeued in order
    function setupRegenerate(opts: {
      failedJobs: Array<{ id: string; reader_item_id: string; job_type: string }> | null;
      failedError?: unknown;
      anyJobs?: Array<{ id: string }> | null;
    }) {
      mockGetUser.mockResolvedValue({ data: { user: mockSession.user } });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'processing_jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: opts.failedJobs, error: opts.failedError ?? null }),
                  limit: vi.fn().mockResolvedValue({ data: opts.anyJobs ?? null, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'reader_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { reader_id: 'reader-9' }, error: null }),
              }),
            }),
          };
        }
      });
    }

    const regenRequest = () =>
      new NextRequest('http://localhost:3000/api/reader/retry', {
        method: 'POST',
        body: JSON.stringify({ regenerateId: 'regen-123' }),
      });

    it('retries failed jobs in a regeneration batch', async () => {
      setupRegenerate({ failedJobs: [{ id: 'job-9', reader_item_id: 'item-9', job_type: 'tag_generation' }] });
      mockSend.mockResolvedValue(undefined);

      const response = await POST(regenRequest());
      const data = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(data.retriedCount).toBe(1);
      expect(mockSend).toHaveBeenCalledWith({
        jobId: 'job-9',
        userId: 'user-123',
        readerItemId: 'item-9',
        readerId: 'reader-9',
        jobType: 'tag_generation',
      });
      expect(mockFrom).not.toHaveBeenCalledWith('sync_log');
    });

    it('returns 0 when the batch exists but has no failed jobs', async () => {
      setupRegenerate({ failedJobs: [], anyJobs: [{ id: 'job-ok' }] });

      const response = await POST(regenRequest());
      const data = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(data.retriedCount).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 404 when no jobs exist for the batch at all', async () => {
      setupRegenerate({ failedJobs: null, anyJobs: [] });

      const response = await POST(regenRequest());
      const data = (await response.json()) as any;

      expect(response.status).toBe(404);
      expect(data.error).toBe('Regeneration batch not found');
    });

    it('returns 404 when the batch probe itself returns nothing', async () => {
      setupRegenerate({ failedJobs: [], anyJobs: null });

      const response = await POST(regenRequest());
      expect(response.status).toBe(404);
    });

    it('returns 500 when fetching the failed jobs errors and the batch exists', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setupRegenerate({ failedJobs: null, failedError: { message: 'db down' }, anyJobs: [{ id: 'job-ok' }] });

      const response = await POST(regenRequest());
      const data = (await response.json()) as any;

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch failed jobs');
      errorSpy.mockRestore();
    });
  });
});
