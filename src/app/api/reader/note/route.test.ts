// ABOUT: Tests for document notes API endpoint
// ABOUT: Validates note saving, Reader sync, validation, and error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockFetch = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

// Mock global fetch for Reader API
global.fetch = mockFetch;

describe('POST /api/reader/note', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const validItemId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
  });

  it('saves note successfully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'This is a test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      note: 'This is a test note',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://readwise.io/api/v3/update/reader-123/',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Token test-reader-token',
        }),
        body: JSON.stringify({ notes: 'This is a test note' }),
      })
    );
  });

  it('updates existing note', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Updated note text',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.note).toBe('Updated note text');
  });

  it('trims whitespace from note', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: '  note with whitespace  ',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.note).toBe('note with whitespace');
  });

  it('rejects empty note after trimming', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: '   ',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'note',
          message: 'Note cannot be empty',
        }),
      ])
    );
  });

  it('rejects note exceeding 10k characters', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    const longNote = 'x'.repeat(10001);

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: longNote,
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'note',
          message: 'Note must be under 10,000 characters',
        }),
      ])
    );
  });

  it('rejects invalid item ID', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: 'not-a-uuid',
        note: 'Test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'itemId',
          message: 'Invalid item ID',
        }),
      ])
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 404 when item not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
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

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error).toBe('Item not found');
  });

  it('returns 500 when database save fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: { message: 'Database error' },
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to save note');
  });

  it('returns 502 when Reader API sync fails', async () => {
    vi.useFakeTimers();

    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    // Mock persistent 500 errors (will exhaust retries)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Reader API error',
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const promise = POST(request);

    // Fast-forward through retry delays (2s + 4s)
    await vi.advanceTimersByTimeAsync(10000);

    const response = await promise;
    const data = (await response.json()) as any;

    expect(response.status).toBe(502);
    expect(data.error).toBe('Note saved locally but failed to sync to Reader');

    vi.useRealTimers();
  });

  it('returns 502 when Reader API token not configured', async () => {
    const originalToken = process.env.READER_API_TOKEN;
    process.env.READER_API_TOKEN = '';

    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const response = await POST(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(502);
    expect(data.error).toBe('Note saved locally but failed to sync to Reader');
  });

  it('returns 502 when Reader API request throws error', async () => {
    vi.useFakeTimers();

    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: validItemId, reader_id: 'reader-123' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          }),
        };
      }
    });

    mockFetch.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/reader/note', {
      method: 'POST',
      body: JSON.stringify({
        itemId: validItemId,
        note: 'Test note',
      }),
    });

    const promise = POST(request);

    // Fast-forward through retry delays (2s + 4s)
    await vi.advanceTimersByTimeAsync(10000);

    const response = await promise;
    const data = (await response.json()) as any;

    expect(response.status).toBe(502);
    expect(data.error).toBe('Note saved locally but failed to sync to Reader');
    expect(data.details).toBe('Network error');

    vi.useRealTimers();
  });
});
