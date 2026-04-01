// ABOUT: Tests for on-demand commentariat generation endpoint
// ABOUT: Validates auth, item ownership, content fetching, generation, and storage

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/reader-api', () => ({
  fetchArticleContent: vi.fn(),
}));

vi.mock('@/lib/perplexity-api', () => ({
  generateCommentariat: vi.fn(),
}));

import { fetchArticleContent } from '@/lib/reader-api';
import { generateCommentariat } from '@/lib/perplexity-api';

describe('POST /api/reader/commentariat', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const validItemId = '550e8400-e29b-41d4-a716-446655440000';
  const mockArticle = {
    title: 'Test Article',
    author: 'Dr. Smith',
    content: 'Article content...',
    url: 'https://example.com/article',
  };
  const mockCommentariat = `## Counter-arguments
- Studies challenge this view

## Alternative perspectives
- The behavioural economics lens differs`;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
    process.env.PERPLEXITY_API_KEY = 'test-perplexity-key';
  });

  function makeRequest(body: object) {
    return new NextRequest('http://localhost:3000/api/reader/commentariat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  function mockItemQuery(itemData: object | null) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: itemData,
                  error: itemData ? null : { message: 'Not found' },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
    });
  }

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid item ID format', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    const response = await POST(makeRequest({ itemId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing itemId', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
  });

  it('returns 404 when item does not belong to user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery(null);

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(404);
  });

  it('returns 503 when content fetch fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' });
    (fetchArticleContent as any).mockRejectedValue(new Error('Network error'));

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(503);
  });

  it('returns 503 when generation fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' });
    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateCommentariat as any).mockRejectedValue(new Error('Perplexity error'));

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(503);
  });

  it('generates and stores commentariat successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: 'Author', url: 'https://example.com' });
    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateCommentariat as any).mockResolvedValue({
      commentariat: mockCommentariat,
      model: 'sonar',
      usage: { prompt_tokens: 900, completion_tokens: 200, total_tokens: 1100 },
      contentTruncated: false,
    });

    const response = await POST(makeRequest({ itemId: validItemId }));
    const data = await response.json() as { commentariat: string; generatedAt: string };

    expect(response.status).toBe(200);
    expect(data.commentariat).toBe(mockCommentariat);
    expect(data.generatedAt).toBeDefined();
  });

  it('stores result in database', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reader_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' },
                  error: null,
                }),
              }),
            }),
          }),
          update: mockUpdate,
        };
      }
    });

    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateCommentariat as any).mockResolvedValue({
      commentariat: mockCommentariat,
      model: 'sonar',
      usage: { prompt_tokens: 900, completion_tokens: 200, total_tokens: 1100 },
      contentTruncated: false,
    });

    await POST(makeRequest({ itemId: validItemId }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        commentariat_summary: mockCommentariat,
        commentariat_generated_at: expect.any(String),
      })
    );
  });

  it('returns 500 if missing API keys', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' });
    process.env.PERPLEXITY_API_KEY = '';

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(500);
  });
});
