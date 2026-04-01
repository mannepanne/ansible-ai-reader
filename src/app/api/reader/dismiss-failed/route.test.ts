// ABOUT: Tests for dismiss-failed API endpoint
// ABOUT: Validates dismissing failed jobs, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

describe('POST /api/reader/dismiss-failed', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dismisses failed jobs successfully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    // Mock standard client for auth and item ownership check
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'item-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
    });

    // Mock service role client for delete operation
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: JSON.stringify({ itemId: 'item-123' }),
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: JSON.stringify({ itemId: 'item-123' }),
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing itemId parameter');
  });

  it('returns 404 when item not found', async () => {
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

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: JSON.stringify({ itemId: 'nonexistent' }),
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error).toBe('Item not found or access denied');
  });

  it('returns 500 when delete fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    // Mock standard client for auth and item ownership check
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'item-123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
    });

    // Mock service role client for delete operation (with error)
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: { message: 'Database error' },
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: JSON.stringify({ itemId: 'item-123' }),
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to dismiss failed jobs');
  });

  it('returns 400 for invalid JSON', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockSession.user },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/reader/dismiss-failed',
      {
        method: 'POST',
        body: 'invalid json',
      }
    );

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });
});
