// ABOUT: Tests for signal API endpoint
// ABOUT: Validates click_through signal recording, auth, and graceful non-blocking behaviour

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './route';
import { createClient } from '@/utils/supabase/server';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

const VALID_ITEM_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-123';

describe('POST /api/reader/signal', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID, email: 'test@example.com' } },
          error: null,
        }),
      },
      from: vi.fn(),
    };

    mockCreateClient.mockResolvedValue(mockSupabase);
  });

  function mockItemFound() {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: VALID_ITEM_ID },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'item_signals') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
    });
  }

  function mockItemNotFound() {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'No rows found' },
                }),
              }),
            }),
          }),
        };
      }
    });
  }

  describe('Authentication', () => {
    it('returns 401 for unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: VALID_ITEM_ID }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Input Validation', () => {
    it('returns 400 for invalid UUID', async () => {
      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: 'not-a-uuid' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string; details: Array<{ field: string }> };
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'itemId' })])
      );
    });

    it('returns 400 for missing itemId', async () => {
      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('Signal Recording', () => {
    it('inserts click_through signal for valid owned item', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'reader_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: VALID_ITEM_ID }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'item_signals') {
          return { insert: insertMock };
        }
      });

      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: VALID_ITEM_ID }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      expect(insertMock).toHaveBeenCalledWith({
        user_id: USER_ID,
        item_id: VALID_ITEM_ID,
        signal_type: 'click_through',
      });
    });

    it('inserts a new signal on every call (no deduplication)', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'reader_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: VALID_ITEM_ID }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'item_signals') {
          return { insert: insertMock };
        }
      });

      const makeRequest = () =>
        POST(
          new Request('http://localhost/api/reader/signal', {
            method: 'POST',
            body: JSON.stringify({ itemId: VALID_ITEM_ID }),
          })
        );

      await makeRequest();
      await makeRequest();
      await makeRequest();

      expect(insertMock).toHaveBeenCalledTimes(3);
    });

    it('returns success even when item does not belong to user', async () => {
      mockItemNotFound();

      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: VALID_ITEM_ID }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns success even when signal insert fails', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'reader_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: VALID_ITEM_ID }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'item_signals') {
          return {
            insert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
          };
        }
      });

      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: VALID_ITEM_ID }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  describe('Success Response', () => {
    it('returns success response on valid request', async () => {
      mockItemFound();

      const request = new Request('http://localhost/api/reader/signal', {
        method: 'POST',
        body: JSON.stringify({ itemId: VALID_ITEM_ID }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data).toEqual({ success: true });
    });
  });
});
