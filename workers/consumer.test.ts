// ABOUT: Tests for Cloudflare Queue consumer
// ABOUT: Validates job processing, status updates, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import consumer from './consumer';

// Mock Supabase
const mockUpdate = vi.fn();
const mockEq = vi.fn(() => ({ error: null }));
const mockFrom = vi.fn(() => ({
  update: mockUpdate,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('Queue Consumer', () => {
  let mockEnv: any;
  let mockBatch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SECRET_KEY: 'test-secret-key',
    };

    mockUpdate.mockReturnValue({
      eq: mockEq,
    });
  });

  it('processes messages and marks jobs as completed', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            jobType: 'summary_generation' as const,
            payload: {
              title: 'Test Article',
              url: 'https://example.com',
            },
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch, mockEnv);

    expect(mockFrom).toHaveBeenCalledWith('processing_jobs');
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: expect.any(String),
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'job-1');
    expect(mockAck).toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('processes multiple messages in batch', async () => {
    const mockAck1 = vi.fn();
    const mockAck2 = vi.fn();

    mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            jobType: 'summary_generation' as const,
            payload: { title: 'Article 1', url: 'https://example.com/1' },
          },
          ack: mockAck1,
          retry: vi.fn(),
        },
        {
          body: {
            jobId: 'job-2',
            userId: 'user-1',
            readerItemId: 'item-2',
            jobType: 'summary_generation' as const,
            payload: { title: 'Article 2', url: 'https://example.com/2' },
          },
          ack: mockAck2,
          retry: vi.fn(),
        },
      ],
    };

    await consumer.queue(mockBatch, mockEnv);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockAck1).toHaveBeenCalled();
    expect(mockAck2).toHaveBeenCalled();
  });

  it('retries on database update error', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    mockEq.mockReturnValueOnce({
      error: { message: 'Database connection failed' } as any,
    });

    mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            jobType: 'summary_generation' as const,
            payload: { title: 'Test', url: 'https://example.com' },
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch, mockEnv);

    expect(mockRetry).toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('continues processing remaining messages after error', async () => {
    const mockAck1 = vi.fn();
    const mockAck2 = vi.fn();
    const mockRetry1 = vi.fn();
    const mockRetry2 = vi.fn();

    // First message fails, second succeeds
    mockEq
      .mockReturnValueOnce({ error: { message: 'Error on job-1' } as any })
      .mockReturnValueOnce({ error: null });

    mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            jobType: 'summary_generation' as const,
            payload: { title: 'Article 1', url: 'https://example.com/1' },
          },
          ack: mockAck1,
          retry: mockRetry1,
        },
        {
          body: {
            jobId: 'job-2',
            userId: 'user-1',
            readerItemId: 'item-2',
            jobType: 'summary_generation' as const,
            payload: { title: 'Article 2', url: 'https://example.com/2' },
          },
          ack: mockAck2,
          retry: mockRetry2,
        },
      ],
    };

    await consumer.queue(mockBatch, mockEnv);

    expect(mockRetry1).toHaveBeenCalled();
    expect(mockAck1).not.toHaveBeenCalled();
    expect(mockAck2).toHaveBeenCalled();
    expect(mockRetry2).not.toHaveBeenCalled();
  });

  it('handles unexpected errors with retry', async () => {
    const mockAck = vi.fn();
    const mockRetry = vi.fn();

    mockFrom.mockImplementationOnce(() => {
      throw new Error('Unexpected error');
    });

    mockBatch = {
      messages: [
        {
          body: {
            jobId: 'job-1',
            userId: 'user-1',
            readerItemId: 'item-1',
            jobType: 'summary_generation' as const,
            payload: { title: 'Test', url: 'https://example.com' },
          },
          ack: mockAck,
          retry: mockRetry,
        },
      ],
    };

    await consumer.queue(mockBatch, mockEnv);

    expect(mockRetry).toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });
});
