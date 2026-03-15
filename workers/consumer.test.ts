// ABOUT: Tests for Cloudflare Queue consumer with Perplexity integration
// ABOUT: Validates summary generation, token tracking, error handling, retries

import { describe, it, expect, vi, beforeEach } from 'vitest';
import consumer from './consumer';

// Mock dependencies
const mockFrom = vi.fn();
const mockGenerateSummary = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('../src/lib/perplexity-api', () => ({
  generateSummary: (...args: any[]) => mockGenerateSummary(...args),
}));

// Mock global fetch for Reader API
global.fetch = vi.fn();

describe('Queue Consumer', () => {
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      READER_API_TOKEN: 'test-reader-token',
      PERPLEXITY_API_KEY: 'test-perplexity-key',
    };
  });

  it('processes summary generation successfully', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    // Mock Reader API response (with html_content field)
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'AI in Software Development',
            author: 'John Doe',
            html_content:
              '<p>A comprehensive article about AI applications in software development. This article explores how artificial intelligence is revolutionizing the way we write code, test applications, and deploy software at scale. From automated code reviews to intelligent debugging tools, AI is becoming an essential part of modern software engineering practices.</p>',
            url: 'https://example.com/ai-software',
          },
        ],
      }),
    });

    // Mock Perplexity API response
    mockGenerateSummary.mockResolvedValue({
      summary:
        '- AI is transforming software development\n- Key applications include code generation',
      tags: ['ai', 'software-development', 'automation'],
      model: 'sonar',
      usage: {
        prompt_tokens: 800,
        completion_tokens: 120,
        total_tokens: 920,
      },
      contentTruncated: false,
    });

    // Mock database operations
    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 0, max_attempts: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'sync_log') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Verify Reader API was called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('readwise.io/api/v3/list'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Token test-reader-token',
        }),
      })
    );

    // Verify Perplexity API was called
    expect(mockGenerateSummary).toHaveBeenCalledWith(
      'test-perplexity-key',
      expect.objectContaining({
        title: 'AI in Software Development',
        author: 'John Doe',
        content: expect.any(String),
        url: 'https://example.com/ai-software',
      })
    );

    // Verify message was acknowledged
    expect(mockAck).toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('tracks token usage in sync_log', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'Test Article',
            html_content:
              '<p>Article content for testing token tracking. This is a longer piece of content that exceeds the minimum 100 character requirement for processing. We need to ensure that token usage is properly tracked in the sync_log table for cost monitoring and analysis purposes.</p>',
            url: 'https://example.com',
          },
        ],
      }),
    });

    mockGenerateSummary.mockResolvedValue({
      summary: '- Summary point',
      tags: ['testing'],
      model: 'sonar',
      usage: {
        prompt_tokens: 500,
        completion_tokens: 100,
        total_tokens: 600,
      },
      contentTruncated: true,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 0, max_attempts: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'sync_log') {
        return { insert: mockInsert };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Verify token usage was logged
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        sync_type: 'summary_generation',
        items_created: 1,
        errors: expect.objectContaining({
          reader_item_id: 'item-1',
          token_usage: expect.objectContaining({
            prompt_tokens: 500,
            completion_tokens: 100,
            total_tokens: 600,
            model: 'sonar',
            content_truncated: true,
          }),
        }),
      })
    );
  });

  it('retries on transient errors', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'Test',
            html_content:
              '<p>Content for testing error handling and retry logic. This needs to be longer than 100 characters to pass the content validation check in the consumer before we can test the error handling properly.</p>',
            url: 'https://example.com',
          },
        ],
      }),
    });

    // Simulate Perplexity API error
    mockGenerateSummary.mockRejectedValue(new Error('Temporary API error'));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 1, max_attempts: 3 }, // Not exceeded yet
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Should retry, not ack
    expect(mockRetry).toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('marks job as failed after max retries', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();
    const mockUpdateJob = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockInsertLog = vi.fn().mockResolvedValue({ error: null });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'Test',
            html_content:
              '<p>Content for testing persistent failures and max retry logic. This article content needs to be sufficiently long to pass validation checks before we can properly test the retry and failure handling mechanisms.</p>',
            url: 'https://example.com',
          },
        ],
      }),
    });

    mockGenerateSummary.mockRejectedValue(new Error('Persistent API error'));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 3, max_attempts: 3 }, // Max attempts reached
                error: null,
              }),
            }),
          }),
          update: mockUpdateJob,
        };
      }
      if (table === 'sync_log') {
        return { insert: mockInsertLog };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Verify job was marked as failed
    expect(mockUpdateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'Persistent API error',
      })
    );

    // Verify failure was logged
    expect(mockInsertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        sync_type: 'summary_generation_failed',
        items_failed: 1,
      })
    );

    // Should ack, not retry
    expect(mockAck).toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('handles missing content from Reader API', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    // Mock Reader API with no content
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'Test',
            html_content: '', // Empty content
            url: 'https://example.com',
          },
        ],
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 0, max_attempts: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Should retry due to content error
    expect(mockRetry).toHaveBeenCalled();
    expect(mockGenerateSummary).not.toHaveBeenCalled();
  });

  it('stores summary and tags in database', async () => {
    const mockUpdateItem = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'reader-123',
            title: 'Test Article',
            html_content:
              '<p>Article content for summary generation and database storage testing. This content explores various aspects of the system including how summaries are generated, how tags are extracted, and how all this data is persisted to the database for later retrieval and display in the user interface.</p>',
            url: 'https://example.com',
          },
        ],
      }),
    });

    mockGenerateSummary.mockResolvedValue({
      summary: '- First point\n- Second point\n- Third point',
      tags: ['ai', 'testing', 'automation'],
      model: 'sonar-pro',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
      },
      contentTruncated: false,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { attempts: 0, max_attempts: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'reader_items') {
        return { update: mockUpdateItem };
      }
      if (table === 'sync_log') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
    });

    const mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            readerId: 'reader-123',
            jobType: 'summary_generation' as const,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    };

    await consumer.queue(mockBatch as any, mockEnv);

    // Verify summary and tags were stored
    expect(mockUpdateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        short_summary: '- First point\n- Second point\n- Third point',
        tags: ['ai', 'testing', 'automation'],
        perplexity_model: 'sonar-pro',
      })
    );
  });
});
