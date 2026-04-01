// ABOUT: Tests for regenerate-tags-status API endpoint
// ABOUT: Validates progress polling for tag regeneration, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe('GET /api/reader/regenerate-tags-status', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pending status for new regeneration batch', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'job-1', status: 'pending', reader_item_id: 'item-1' },
              { id: 'job-2', status: 'pending', reader_item_id: 'item-2' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      regenerateId: 'regen-123',
      totalJobs: 2,
      completedJobs: 0,
      failedJobs: 0,
      inProgressJobs: 0,
      pendingJobs: 2,
      status: 'pending',
    });
  });

  it('returns processing status when jobs are in progress', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'job-1', status: 'completed', reader_item_id: 'item-1' },
              { id: 'job-2', status: 'processing', reader_item_id: 'item-2' },
              { id: 'job-3', status: 'pending', reader_item_id: 'item-3' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      regenerateId: 'regen-123',
      totalJobs: 3,
      completedJobs: 1,
      failedJobs: 0,
      inProgressJobs: 1,
      pendingJobs: 1,
      status: 'processing',
    });
  });

  it('returns completed status when all jobs finished', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'job-1', status: 'completed', reader_item_id: 'item-1' },
              { id: 'job-2', status: 'completed', reader_item_id: 'item-2' },
              { id: 'job-3', status: 'completed', reader_item_id: 'item-3' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      regenerateId: 'regen-123',
      totalJobs: 3,
      completedJobs: 3,
      failedJobs: 0,
      status: 'completed',
    });
  });

  it('returns partial_failure status when some jobs failed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'job-1', status: 'completed', reader_item_id: 'item-1' },
                  {
                    id: 'job-2',
                    status: 'failed',
                    reader_item_id: 'item-2',
                    error_message: 'API error',
                  },
                  { id: 'job-3', status: 'completed', reader_item_id: 'item-3' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'item-2', title: 'Failed Article' }],
            }),
          }),
        };
      }
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      regenerateId: 'regen-123',
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      status: 'partial_failure',
      failedItems: [
        {
          itemId: 'item-2',
          title: 'Failed Article',
          error: 'API error',
        },
      ],
    });
  });

  it('returns failed status when all jobs failed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-1',
                    status: 'failed',
                    reader_item_id: 'item-1',
                    error_message: 'Error 1',
                  },
                  {
                    id: 'job-2',
                    status: 'failed',
                    reader_item_id: 'item-2',
                    error_message: 'Error 2',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'item-1', title: 'Failed Article 1' },
                { id: 'item-2', title: 'Failed Article 2' },
              ],
            }),
          }),
        };
      }
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.status).toBe('failed');
    expect(data.failedJobs).toBe(2);
    expect(data.failedItems).toHaveLength(2);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when regenerateId missing', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing regenerateId parameter');
  });

  it('returns 404 when regeneration batch not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=nonexistent'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error).toBe('Regeneration batch not found');
  });

  it('returns 500 when jobs query fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    const response = await GET(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch regeneration status');
  });

  it('verifies user isolation - only returns jobs for authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const mockEq2 = vi.fn().mockResolvedValue({
      data: [{ id: 'job-1', status: 'pending', reader_item_id: 'item-1' }],
      error: null,
    });

    const mockEq1 = vi.fn().mockReturnValue({
      eq: mockEq2,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq1,
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/regenerate-tags-status?regenerateId=regen-123'
    );

    await GET(request);

    // Verify both filters were applied
    expect(mockEq1).toHaveBeenCalledWith('regenerate_batch_id', 'regen-123');
    expect(mockEq2).toHaveBeenCalledWith('user_id', 'user-123');
  });
});
