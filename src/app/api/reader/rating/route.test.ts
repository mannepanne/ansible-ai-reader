// ABOUT: Tests for rating API endpoint
// ABOUT: Validates rating updates (binary system: 1 or 4)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './route';
import { createClient } from '@/utils/supabase/server';

// Mock Supabase
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

describe('POST /api/reader/rating', () => {
  let mockSupabase: any;
  let request: Request;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    };

    mockCreateClient.mockResolvedValue(mockSupabase);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      // Mock successful database update for validation tests
      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() =>
                Promise.resolve({
                  data: [{ id: '123e4567-e89b-12d3-a456-426614174000', rating: 4 }],
                  error: null,
                })
              ),
            })),
          })),
        })),
      }));
    });

    it('rejects invalid item ID', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: 'not-a-uuid',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as {
        error: string;
        details: Array<{ field: string; message: string }>;
      };
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'itemId',
            message: 'Invalid UUID',
          }),
        ])
      );
    });

    it('rejects missing item ID', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Validation failed');
    });

    it('accepts rating of 1', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 1,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('accepts rating of 4', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('accepts null rating (unrate)', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: null,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('rejects rating of 0', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 0,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as {
        error: string;
        details: Array<{ field: string; message: string }>;
      };
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'rating',
            message: 'Rating must be either 1 (not interesting) or 4 (interesting)',
          }),
        ])
      );
    });

    it('rejects rating of 2', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 2,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as {
        details: Array<{ field: string; message: string }>;
      };
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'rating',
          }),
        ])
      );
    });

    it('rejects rating of 5', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 5,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('rejects non-integer rating', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 3.5,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
    });

    it('updates rating in database', async () => {
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }));

      mockSupabase.from = vi.fn(() => ({
        update: updateMock,
      }));

      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      await POST(request);

      expect(mockSupabase.from).toHaveBeenCalledWith('reader_items');
      expect(updateMock).toHaveBeenCalledWith({ rating: 4 });
    });

    it('filters by user ID and item ID', async () => {
      const eqUserMock = vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }));

      const eqItemMock = vi.fn(() => ({
        eq: eqUserMock,
      }));

      const updateMock = vi.fn(() => ({
        eq: eqItemMock,
      }));

      mockSupabase.from = vi.fn(() => ({
        update: updateMock,
      }));

      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 1,
        }),
      });

      await POST(request);

      expect(eqItemMock).toHaveBeenCalledWith('id', '123e4567-e89b-12d3-a456-426614174000');
      expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('handles database errors', async () => {
      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() =>
                Promise.resolve({
                  data: null,
                  error: { message: 'Database error' },
                })
              ),
            })),
          })),
        })),
      }));

      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Failed to update rating');
    });

    it('handles item not found (no rows updated)', async () => {
      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() =>
                Promise.resolve({
                  data: [], // Empty array = no item found
                  error: null,
                })
              ),
            })),
          })),
        })),
      }));

      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Item not found');
    });
  });

  describe('Success Response', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() =>
                Promise.resolve({
                  data: [{ id: '123e4567-e89b-12d3-a456-426614174000', rating: 4 }],
                  error: null,
                })
              ),
            })),
          })),
        })),
      }));
    });

    it('returns success response', async () => {
      request = new Request('http://localhost/api/reader/rating', {
        method: 'POST',
        body: JSON.stringify({
          itemId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 4,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data).toEqual({ success: true });
    });
  });
});
