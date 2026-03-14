// ABOUT: Tests for Reader archive API endpoint
// ABOUT: Validates archiving items, authentication, error handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
    from: mockFrom,
  })),
}));

const mockArchiveItem = vi.fn();

vi.mock('@/lib/reader-api', () => ({
  archiveItem: (...args: any[]) => mockArchiveItem(...args),
}));

describe('POST /api/reader/archive', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  const originalEnv = process.env.READER_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
  });

  afterEach(() => {
    process.env.READER_API_TOKEN = originalEnv;
  });

  it('archives item successfully', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        const selectMock = {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'item-123',
                    reader_id: 'reader-123',
                  },
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

        return selectMock as any;
      }
    });

    mockArchiveItem.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockArchiveItem).toHaveBeenCalledWith('test-reader-token', 'reader-123');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing itemId parameter');
  });

  it('returns 404 when item not found', async () => {
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

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'nonexistent' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error).toBe('Item not found');
  });

  it('returns 500 when READER_API_TOKEN not configured', async () => {
    process.env.READER_API_TOKEN = '';

    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'item-123',
                reader_id: 'reader-123',
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Reader API not configured');
  });

  it('returns 500 when Reader API fails', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'item-123',
                reader_id: 'reader-123',
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    mockArchiveItem.mockRejectedValue(new Error('Reader API error'));

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Reader API error');
  });

  it('succeeds even when database update fails after Reader archive', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        const selectMock = {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'item-123',
                    reader_id: 'reader-123',
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: { message: 'Database error' },
            }),
          }),
        };

        return selectMock as any;
      }
    });

    mockArchiveItem.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/reader/archive', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-123' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    // Should still succeed since Reader archive succeeded
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
