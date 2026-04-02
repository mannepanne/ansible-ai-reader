// ABOUT: Tests for Perplexity API client
// ABOUT: Validates summary generation, parsing, rate limiting, error handling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSummary,
  smartTruncate,
  parseSummaryResponse,
  PerplexityAPIError,
  ParsedSummarySchema,
  PerplexityResponseSchema,
} from './perplexity-api';

describe('Perplexity API Client', () => {
  describe('smartTruncate', () => {
    it('returns content unchanged if under limit', () => {
      const content = 'Short article content';
      const result = smartTruncate(content, 1000);

      expect(result.content).toBe(content);
      expect(result.truncated).toBe(false);
    });

    it('truncates long content keeping first 80% and last 20%', () => {
      const content = 'A'.repeat(50000); // 50k characters
      const result = smartTruncate(content, 30000);

      expect(result.content.length).toBeLessThanOrEqual(30000 + 100); // Allow for truncation message
      expect(result.truncated).toBe(true);
      expect(result.content).toContain('[... content truncated for length ...]');
      expect(result.content.startsWith('A')).toBe(true);
      expect(result.content.endsWith('A')).toBe(true);
    });

    it('preserves intro and conclusion with smart truncation', () => {
      const intro = 'Introduction paragraph. ';
      const middle = 'B'.repeat(50000);
      const conclusion = ' Conclusion paragraph.';
      const content = intro + middle + conclusion;

      const result = smartTruncate(content, 1000);

      expect(result.content).toContain(intro);
      expect(result.content).toContain(conclusion);
      expect(result.truncated).toBe(true);
    });
  });

  describe('parseSummaryResponse', () => {
    it('parses valid summary and tags', () => {
      const response = `## Summary
- Key concept 1
- Key concept 2
- Key concept 3

## Tags
ai, machine-learning, software-engineering`;

      const result = parseSummaryResponse(response);

      expect(result.summary).toContain('Key concept 1');
      expect(result.summary).toContain('Key concept 2');
      expect(result.tags).toEqual(['ai', 'machine-learning', 'software-engineering']);
    });

    it('handles missing summary section', () => {
      const response = `## Tags
ai, testing`;

      const result = parseSummaryResponse(response);

      expect(result.summary).toBeNull();
      expect(result.tags).toEqual(['ai', 'testing']);
    });

    it('handles missing tags section', () => {
      const response = `## Summary
- Main point about AI
- Another key insight`;

      const result = parseSummaryResponse(response);

      expect(result.summary).toContain('Main point');
      expect(result.tags).toEqual([]);
    });

    it('handles malformed response gracefully', () => {
      const response = 'Just some random text without proper formatting';

      const result = parseSummaryResponse(response);

      expect(result.summary).toBeNull();
      expect(result.tags).toEqual([]);
    });

    it('trims whitespace from tags', () => {
      const response = `## Summary
- Point 1

## Tags
  ai  ,  testing  , software   `;

      const result = parseSummaryResponse(response);

      expect(result.tags).toEqual(['ai', 'testing', 'software']);
    });

    it('limits tags to maximum 10 when validation fails', () => {
      const manyTags = Array.from({ length: 15 }, (_, i) => `tag${i + 1}`).join(', ');
      const response = `## Summary
- Summary point

## Tags
${manyTags}`;

      const result = parseSummaryResponse(response);

      expect(result.tags.length).toBeLessThanOrEqual(10);
    });
  });

  describe('PerplexityResponseSchema', () => {
    it('validates correct API response', () => {
      const validResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '## Summary\n- Point 1\n\n## Tags\nai, testing',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 150,
          total_tokens: 650,
        },
      };

      const result = PerplexityResponseSchema.safeParse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('resp-123');
        expect(result.data.usage.total_tokens).toBe(650);
      }
    });

    it('rejects response with missing required fields', () => {
      const invalidResponse = {
        id: 'resp-123',
        model: 'sonar',
        // Missing choices array
        usage: {
          prompt_tokens: 500,
          completion_tokens: 150,
          total_tokens: 650,
        },
      };

      const result = PerplexityResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });

    it('rejects response with negative token counts', () => {
      const invalidResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Summary' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: -100, // Invalid
          completion_tokens: 150,
          total_tokens: 50,
        },
      };

      const result = PerplexityResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });

    it('rejects response with absurdly long content', () => {
      const invalidResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'A'.repeat(6000), // Exceeds 5000 char limit
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 150,
          total_tokens: 650,
        },
      };

      const result = PerplexityResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
    });
  });

  describe('ParsedSummarySchema', () => {
    it('validates correct parsed summary', () => {
      const valid = {
        summary: 'A valid summary with at least 10 characters',
        tags: ['ai', 'testing', 'software'],
      };

      const result = ParsedSummarySchema.safeParse(valid);

      expect(result.success).toBe(true);
    });

    it('accepts null summary', () => {
      const valid = {
        summary: null,
        tags: ['ai', 'testing'],
      };

      const result = ParsedSummarySchema.safeParse(valid);

      expect(result.success).toBe(true);
    });

    it('rejects summary that is too short', () => {
      const invalid = {
        summary: 'Too short',
        tags: ['ai'],
      };

      const result = ParsedSummarySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('rejects summary that is too long', () => {
      const invalid = {
        summary: 'A'.repeat(2001), // Exceeds 2000 char limit
        tags: ['ai'],
      };

      const result = ParsedSummarySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('rejects too many tags', () => {
      const invalid = {
        summary: 'Valid summary text here',
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`), // Exceeds 10 tag limit
      };

      const result = ParsedSummarySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });
  });

  describe('generateSummary', () => {
    const mockApiToken = 'test-perplexity-token';

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates summary successfully', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `## Summary
- AI is transforming software development
- Key applications include code generation and testing
- Practical implications for developers

## Tags
ai, software-development, automation`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 800,
          completion_tokens: 120,
          total_tokens: 920,
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await generateSummary(mockApiToken, {
        title: 'AI in Software Development',
        author: 'John Doe',
        content: 'Article content about AI and software development...',
        url: 'https://example.com/article',
      });

      expect(result.summary).toContain('AI is transforming');
      expect(result.tags).toEqual(['ai', 'software-development', 'automation']);
      expect(result.model).toBe('sonar');
      expect(result.usage.total_tokens).toBe(920);
      expect(result.contentTruncated).toBe(false);
    });

    it('truncates long content and sets flag', async () => {
      const longContent = 'A'.repeat(50000);

      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `## Summary
- Summary point

## Tags
testing`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 50,
          total_tokens: 1050,
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await generateSummary(mockApiToken, {
        title: 'Long Article',
        content: longContent,
        url: 'https://example.com',
      });

      expect(result.contentTruncated).toBe(true);

      // Verify the request body was truncated
      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toContain('[... content truncated for length ...]');
    });

    it('throws error on 401 unauthorized', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        generateSummary(mockApiToken, {
          title: 'Test',
          content: 'Content',
          url: 'https://example.com',
        })
      ).rejects.toThrow('Invalid Perplexity API token');
    });

    it('retries on 429 rate limit with Retry-After header', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '2']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await generateSummary(mockApiToken, {
        title: 'Test',
        content: 'Content',
        url: 'https://example.com',
      });

      expect(result.summary).toContain('Point');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server error with exponential backoff', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await generateSummary(mockApiToken, {
        title: 'Test',
        content: 'Content',
        url: 'https://example.com',
      });

      expect(result.summary).toContain('Point');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it(
      'fails after max retries on persistent server error',
      async () => {
        (global.fetch as any).mockResolvedValue({
          ok: false,
          status: 500,
        });

        await expect(
          generateSummary(mockApiToken, {
            title: 'Test',
            content: 'Content',
            url: 'https://example.com',
          })
        ).rejects.toThrow('Server error: 500');

        expect(global.fetch).toHaveBeenCalledTimes(3); // Max retries
      },
      15000
    ); // 15s timeout for retry backoff (2s + 4s + 8s)

    it('throws error on invalid response format', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          // Missing required fields
        }),
      });

      await expect(
        generateSummary(mockApiToken, {
          title: 'Test',
          content: 'Content',
          url: 'https://example.com',
        })
      ).rejects.toThrow('Invalid response format from Perplexity API');
    });

    it('includes title and author in request', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await generateSummary(mockApiToken, {
        title: 'AI Revolution',
        author: 'Jane Smith',
        content: 'Article content',
        url: 'https://example.com',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain('Title: AI Revolution');
      expect(userMessage.content).toContain('Author: Jane Smith');
    });

    it('handles missing author gracefully', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await generateSummary(mockApiToken, {
        title: 'Test Article',
        content: 'Content',
        url: 'https://example.com',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain('Author: Unknown');
    });

    it('prepends customPrompt to user message when provided', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await generateSummary(
        mockApiToken,
        { title: 'Test Article', content: 'Content', url: 'https://example.com' },
        'I am interested in AI and product management.'
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain('I am interested in AI and product management.');
      expect(userMessage.content).toContain('Summarize this article');
    });

    it('uses default prompt when customPrompt is not provided', async () => {
      const mockResponse = {
        id: 'resp-123',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Summary\n- Point\n\n## Tags\nai' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await generateSummary(mockApiToken, {
        title: 'Test Article',
        content: 'Content',
        url: 'https://example.com',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain('Summarize this article');
      expect(userMessage.content).not.toContain('undefined');
    });
  });

  describe('generateCommentariat', () => {
    const mockApiToken = 'test-perplexity-token';

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates commentariat successfully', async () => {
      const mockResponse = {
        id: 'resp-456',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `## Counter-arguments
- Studies show the opposite effect in low-income contexts
- Recent meta-analysis challenges the core claim

## Alternative perspectives
- Behavioural economists take a different view
- The Austrian school offers a competing framework

## Caveats and blind spots
- The author ignores non-Western data
- Sample size limitations are not addressed`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 900,
          completion_tokens: 200,
          total_tokens: 1100,
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const { generateCommentariat } = await import('./perplexity-api');
      const result = await generateCommentariat(mockApiToken, {
        title: 'Economic Theory Article',
        author: 'Dr. Smith',
        content: 'Article content about economic theory...',
        url: 'https://example.com/article',
      });

      expect(result.commentariat).toContain('Counter-arguments');
      expect(result.commentariat).toContain('Alternative perspectives');
      expect(result.model).toBe('sonar');
      expect(result.usage.total_tokens).toBe(1100);
      expect(result.contentTruncated).toBe(false);
    });

    it('truncates long content and sets flag', async () => {
      const longContent = 'A'.repeat(50000);

      const mockResponse = {
        id: 'resp-456',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '## Counter-arguments\n- A point\n\n## Alternative perspectives\n- Another point',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const { generateCommentariat } = await import('./perplexity-api');
      const result = await generateCommentariat(mockApiToken, {
        title: 'Long Article',
        content: longContent,
        url: 'https://example.com',
      });

      expect(result.contentTruncated).toBe(true);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toContain('[... content truncated for length ...]');
    });

    it('includes correct system prompt for critical analysis', async () => {
      const mockResponse = {
        id: 'resp-456',
        model: 'sonar',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '## Counter-arguments\n- A point' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const { generateCommentariat } = await import('./perplexity-api');
      await generateCommentariat(mockApiToken, {
        title: 'Test Article',
        content: 'Content',
        url: 'https://example.com',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const systemMessage = requestBody.messages.find((m: any) => m.role === 'system');
      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');

      expect(systemMessage.content).toContain('sharp, well-read critic');
      expect(userMessage.content).toContain("Today's date is");
      expect(userMessage.content).toContain('sceptical reader');
      expect(userMessage.content).toContain('2–3 most important things');
    });

    it('throws error on 401 unauthorized', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { generateCommentariat } = await import('./perplexity-api');
      await expect(
        generateCommentariat(mockApiToken, {
          title: 'Test',
          content: 'Content',
          url: 'https://example.com',
        })
      ).rejects.toThrow('Invalid Perplexity API token');
    });

    it('throws error on invalid response format', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'resp-123' /* missing required fields */ }),
      });

      const { generateCommentariat } = await import('./perplexity-api');
      await expect(
        generateCommentariat(mockApiToken, {
          title: 'Test',
          content: 'Content',
          url: 'https://example.com',
        })
      ).rejects.toThrow('Invalid response format from Perplexity API');
    });
  });

  describe('PerplexityAPIError', () => {
    it('creates error with message and status code', () => {
      const error = new PerplexityAPIError('API Error', 401, false);

      expect(error.message).toBe('API Error');
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
      expect(error.name).toBe('PerplexityAPIError');
    });

    it('creates retryable error', () => {
      const error = new PerplexityAPIError('Timeout', undefined, true);

      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBeUndefined();
    });
  });
});
