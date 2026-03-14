// ABOUT: Tests for Reader items API endpoint
// ABOUT: Validates items fetching, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

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

describe('GET /api/reader/items', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns items for authenticated user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const mockItems = [
      {
        id: 'item-1',
        reader_id: 'reader-1',
        title: 'Test Article 1',
        author: 'Author 1',
        source: 'Source 1',
        url: 'https://example.com/1',
        word_count: 500,
        created_at: '2026-03-12T10:00:00Z',
      },
      {
        id: 'item-2',
        reader_id: 'reader-2',
        title: 'Test Article 2',
        author: 'Author 2',
        source: 'Source 2',
        url: 'https://example.com/2',
        word_count: 1000,
        created_at: '2026-03-12T11:00:00Z',
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockItems,
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      id: 'item-1',
      title: 'Test Article 1',
      author: 'Author 1',
      url: 'https://example.com/1',
    });
  });

  it('returns empty array when user has no items', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.items).toEqual([]);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const response = await GET();
    const data = (await response.json()) as any;

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 500 when database query fails', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
    });

    const response = await GET();
    const data = (await response.json()) as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch items');
  });
});
