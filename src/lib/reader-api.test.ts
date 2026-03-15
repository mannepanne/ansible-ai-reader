// ABOUT: Tests for Readwise Reader API client
// ABOUT: Validates API calls, validation, error handling, rate limiting, retries

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchUnreadItems,
  archiveItem,
  ReaderAPIError,
  getQueueStatus,
} from './reader-api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Reader API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fetchUnreadItems', () => {
    it('fetches unread items successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 'reader-123',
              url: 'https://example.com/article',
              title: 'Test Article',
              author: 'John Doe',
              source: 'blog',
              content: 'Article content...',
              created_at: '2026-03-12T10:00:00Z',
              content_type: 'article',
            },
          ],
          nextPageCursor: null,
        }),
        headers: new Map(),
      } as any);

      const result = await fetchUnreadItems('test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://readwise.io/api/v3/list/'),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Token test-token',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        id: 'reader-123',
        url: 'https://example.com/article',
        title: 'Test Article',
        author: 'John Doe',
      });
      expect(result.nextPageCursor).toBeNull();
    });

    it('handles pagination with cursor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'reader-456',
              url: 'https://example.com/article2',
              title: 'Article 2',
              created_at: '2026-03-12T11:00:00Z',
            },
          ],
          nextPageCursor: 'next-cursor-xyz',
        }),
        headers: new Map(),
      } as any);

      const result = await fetchUnreadItems('test-token', 'cursor-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageCursor=cursor-abc'),
        expect.any(Object)
      );

      expect(result.nextPageCursor).toBe('next-cursor-xyz');
    });

    it('sanitizes HTML from title and author', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'reader-789',
              url: 'https://example.com/xss',
              title: '<script>alert("xss")</script>Safe Title',
              author: '<b>John</b> <i>Doe</i>',
              created_at: '2026-03-12T12:00:00Z',
            },
          ],
        }),
        headers: new Map(),
      } as any);

      const result = await fetchUnreadItems('test-token');

      expect(result.results[0].title).toBe('Safe Title');
      expect(result.results[0].author).toBe('John Doe');
    });

    it('rejects non-HTTP/HTTPS URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'reader-dangerous',
              url: 'javascript:alert("xss")',
              title: 'Dangerous Article',
              created_at: '2026-03-12T13:00:00Z',
            },
          ],
        }),
        headers: new Map(),
      } as any);

      await expect(fetchUnreadItems('test-token')).rejects.toThrow(
        ReaderAPIError
      );
    });

    it('returns 401 error for invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
      } as any);

      await expect(fetchUnreadItems('invalid-token')).rejects.toThrow(
        'Invalid Reader API token'
      );
    });

    it('retries on 429 rate limit with Retry-After header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '2']]),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [],
          }),
          headers: new Map(),
        } as any);

      const promise = fetchUnreadItems('test-token');

      // Advance timer to trigger retry
      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server error with exponential backoff', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Map(),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [],
          }),
          headers: new Map(),
        } as any);

      const promise = fetchUnreadItems('test-token');

      // Advance timer for exponential backoff (2^1 * 1000 = 2000ms)
      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('fails after max retries on persistent server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
      } as any);

      const promise = fetchUnreadItems('test-token');

      // Create expectation first to catch the rejection
      const expectation = expect(promise).rejects.toThrow('Server error: 500');

      // Advance timers for all 3 retry attempts
      await vi.advanceTimersByTimeAsync(2000); // First retry
      await vi.advanceTimersByTimeAsync(4000); // Second retry
      await vi.advanceTimersByTimeAsync(8000); // Third retry

      await expectation;
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('validates response format with Zod', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'reader-999',
              // Missing required 'url' field
              title: 'Invalid Item',
              created_at: '2026-03-12T14:00:00Z',
            },
          ],
        }),
        headers: new Map(),
      } as any);

      await expect(fetchUnreadItems('test-token')).rejects.toThrow(
        'Invalid response format'
      );
    });

    it('accepts null values for optional fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'reader-null-test',
              url: 'https://example.com/article',
              title: 'Test Article',
              author: null, // Nullable field
              source: null, // Nullable field
              word_count: null, // Nullable field
              content: null, // Nullable field
              content_type: null, // Nullable field
              created_at: '2026-03-12T10:00:00Z',
            },
          ],
          nextPageCursor: null,
        }),
        headers: new Map(),
      } as any);

      const result = await fetchUnreadItems('test-token');

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        id: 'reader-null-test',
        url: 'https://example.com/article',
        title: 'Test Article',
      });
      // Nullable fields should be undefined (transformed)
      expect(result.results[0].author).toBeUndefined();
    });

    it('accepts flexible datetime formats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'datetime-test-1',
              url: 'https://example.com/article1',
              title: 'ISO with timezone',
              created_at: '2026-03-15T10:00:00+00:00', // With timezone
            },
            {
              id: 'datetime-test-2',
              url: 'https://example.com/article2',
              title: 'ISO without milliseconds',
              created_at: '2026-03-15T10:00:00Z', // Without milliseconds
            },
            {
              id: 'datetime-test-3',
              url: 'https://example.com/article3',
              title: 'ISO with milliseconds',
              created_at: '2026-03-15T10:00:00.123Z', // With milliseconds
            },
          ],
          nextPageCursor: null,
        }),
        headers: new Map(),
      } as any);

      const result = await fetchUnreadItems('test-token');

      expect(result.results).toHaveLength(3);
      expect(result.results[0].created_at).toBe('2026-03-15T10:00:00+00:00');
      expect(result.results[1].created_at).toBe('2026-03-15T10:00:00Z');
      expect(result.results[2].created_at).toBe('2026-03-15T10:00:00.123Z');
    });
  });

  describe('archiveItem', () => {
    it('archives item successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
      } as any);

      await archiveItem('test-token', 'reader-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://readwise.io/api/v3/update/reader-123/',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            Authorization: 'Token test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ location: 'archive' }),
        })
      );
    });

    it('returns 404 error for non-existent item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
      } as any);

      await expect(archiveItem('test-token', 'nonexistent')).rejects.toThrow(
        'Item not found in Reader'
      );
    });

    it('retries on server error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Map(),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
        } as any);

      const promise = archiveItem('test-token', 'reader-123');

      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting', () => {
    it('provides queue status', () => {
      const status = getQueueStatus();

      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('pending');
      expect(typeof status.size).toBe('number');
      expect(typeof status.pending).toBe('number');
    });
  });
});
