// ABOUT: Tests for regenerate-tags API endpoint
// ABOUT: Validates tag regeneration, user isolation, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

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
        send: mockSend,
      },
    },
  })),
}));

describe('POST /api/reader/regenerate-tags', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const response = await POST();

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('only regenerates tags for authenticated user items', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'item-1',
                reader_id: 'reader-1',
                title: 'Item 1',
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'job-1' },
            error: null,
          }),
        }),
      }),
    });

    await POST();

    // Verify user_id filter was applied
    const selectCall = mockFrom.mock.calls[0][0];
    expect(selectCall).toBe('reader_items');
    expect(mockSelect().eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('creates jobs for items with summaries but null tags', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'item-1',
                reader_id: 'reader-1',
                title: 'Item 1',
              },
              {
                id: 'item-2',
                reader_id: 'reader-2',
                title: 'Item 2',
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'reader_items') {
        return { select: mockSelect };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
    });

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { count?: number; message?: string };
    expect(body.count).toBe(2);
    expect(body.message).toContain('Queued 2 items');
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns count of queued items', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [
              { id: 'item-1', reader_id: 'reader-1', title: 'Item 1' },
              { id: 'item-2', reader_id: 'reader-2', title: 'Item 2' },
              { id: 'item-3', reader_id: 'reader-3', title: 'Item 3' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'reader_items') {
        return { select: mockSelect };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
    });

    const response = await POST();
    const body = (await response.json()) as { count?: number; message?: string };

    expect(body.count).toBe(3);
    expect(body.message).toBe('Queued 3 items for tag regeneration');
  });

  it('returns message when no items need regeneration', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
    });

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { count?: number; message?: string };
    expect(body.message).toBe('No items need tag regeneration');
    expect(body.count).toBe(0);
  });

  it('handles database query errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
    });

    const response = await POST();

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Failed to query items');
  });

  it('handles job creation errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [{ id: 'item-1', reader_id: 'reader-1', title: 'Item 1' }],
            error: null,
          }),
        }),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Insert failed' },
        }),
      }),
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'reader_items') {
        return { select: mockSelect };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
    });

    const response = await POST();
    const body = (await response.json()) as {
      count?: number;
      errors?: Array<{ item_id: string; title: string; error: string }>;
    };

    // Should complete but report errors
    expect(body.count).toBe(0);
    expect(body.errors).toBeDefined();
    expect(body.errors?.length).toBe(1);
  });

  it('works in local dev mode without queue', async () => {
    // Mock local dev (no queue available)
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    vi.mocked(getCloudflareContext).mockImplementationOnce(() => {
      throw new Error('Not in Cloudflare runtime');
    });

    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [{ id: 'item-1', reader_id: 'reader-1', title: 'Item 1' }],
            error: null,
          }),
        }),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-1' },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'reader_items') {
        return { select: mockSelect };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
    });

    const response = await POST();
    const body = (await response.json()) as { count?: number };

    // Should create job but not send to queue
    expect(body.count).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('enqueues messages with correct structure', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [{ id: 'item-1', reader_id: 'reader-1', title: 'Item 1' }],
            error: null,
          }),
        }),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-123' },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'reader_items') {
        return { select: mockSelect };
      }
      if (table === 'processing_jobs') {
        return { insert: mockInsert };
      }
    });

    await POST();

    expect(mockSend).toHaveBeenCalledWith({
      jobId: 'job-123',
      userId: 'user-123',
      readerItemId: 'item-1',
      readerId: 'reader-1',
      jobType: 'summary_generation',
    });
  });
});
