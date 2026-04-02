// ABOUT: Tests for on-demand summary regeneration endpoint
// ABOUT: Validates auth, item ownership, custom prompt, content fetching, generation, and storage

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
  generateSummary: vi.fn(),
}));

import { fetchArticleContent } from '@/lib/reader-api';
import { generateSummary } from '@/lib/perplexity-api';

describe('POST /api/reader/regenerate-summary', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const validItemId = '550e8400-e29b-41d4-a716-446655440000';
  const mockArticle = {
    title: 'Test Article',
    author: 'Dr. Smith',
    content: 'Article content...',
    url: 'https://example.com/article',
  };
  const mockSummaryResult = {
    summary: '- Key point one\n- Key point two',
    tags: ['science', 'research'],
    model: 'sonar',
    usage: { prompt_tokens: 800, completion_tokens: 150, total_tokens: 950 },
    contentTruncated: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
    process.env.PERPLEXITY_API_KEY = 'test-perplexity-key';
  });

  function makeRequest(body: object) {
    return new NextRequest('http://localhost:3000/api/reader/regenerate-summary', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  function mockItemQuery(itemData: object | null, customPrompt: string | null = null) {
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
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { summary_prompt: customPrompt },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sync_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
    (generateSummary as any).mockRejectedValue(new Error('Perplexity error'));

    const response = await POST(makeRequest({ itemId: validItemId }));

    expect(response.status).toBe(503);
  });

  it('regenerates and stores summary successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: 'Author', url: 'https://example.com' });
    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateSummary as any).mockResolvedValue(mockSummaryResult);

    const response = await POST(makeRequest({ itemId: validItemId }));
    const data = await response.json() as { summary: string; tags: string[]; contentTruncated: boolean };

    expect(response.status).toBe(200);
    expect(data.summary).toBe(mockSummaryResult.summary);
    expect(data.tags).toEqual(mockSummaryResult.tags);
    expect(data.contentTruncated).toBe(false);
  });

  it('passes custom prompt to generateSummary when set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery(
      { reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' },
      'Focus on policy implications'
    );
    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateSummary as any).mockResolvedValue(mockSummaryResult);

    await POST(makeRequest({ itemId: validItemId }));

    expect(generateSummary).toHaveBeenCalledWith(
      'test-perplexity-key',
      expect.any(Object),
      'Focus on policy implications'
    );
  });

  it('falls back to default prompt when no custom prompt is set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockItemQuery({ reader_id: 'reader-123', title: 'Test', author: null, url: 'https://example.com' }, null);
    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateSummary as any).mockResolvedValue(mockSummaryResult);

    await POST(makeRequest({ itemId: validItemId }));

    expect(generateSummary).toHaveBeenCalledWith(
      'test-perplexity-key',
      expect.any(Object),
      undefined
    );
  });

  it('stores updated summary and tags in database', async () => {
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
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { summary_prompt: null }, error: null }),
            }),
          }),
        };
      }
      if (table === 'sync_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
    });

    (fetchArticleContent as any).mockResolvedValue(mockArticle);
    (generateSummary as any).mockResolvedValue(mockSummaryResult);

    await POST(makeRequest({ itemId: validItemId }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        short_summary: mockSummaryResult.summary,
        tags: mockSummaryResult.tags,
        content_truncated: false,
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
