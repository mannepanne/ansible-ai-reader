// ABOUT: Tests for queue producer API endpoint
// ABOUT: Verifies job creation and queue message sending

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              id: '550e8400-e29b-41d4-a716-446655440099',
              status: 'pending',
              created_at: new Date().toISOString(),
            },
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ data: null, error: null })),
      })),
    })),
  },
}));

// Mock getCloudflareContext
const mockGetCloudflareContext = vi.fn();
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

describe('POST /api/jobs', () => {
  const originalEnv = process.env;
  const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_ITEM_ID = '550e8400-e29b-41d4-a716-446655440001';

  const mockQueue = {
    send: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      SUPABASE_SECRET_KEY: 'test-secret',
      RESEND_API_KEY: 're_test',
      READER_API_TOKEN: 'test-reader-token',
      PERPLEXITY_API_KEY: 'test-perplexity-key',
    };

    // Mock getCloudflareContext to return queue binding
    mockGetCloudflareContext.mockReturnValue({
      env: {
        PROCESSING_QUEUE: mockQueue,
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 405 when called without Cloudflare env (local development)', async () => {
    // Mock getCloudflareContext to return env without queue binding
    mockGetCloudflareContext.mockReturnValue({
      env: {},
    });

    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        jobType: 'summary_generation',
        readerItemId: TEST_ITEM_ID,
        payload: { title: 'Test Article' },
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(405);

    const data = (await response.json()) as { error: string };
    expect(data.error).toContain('Queue functionality not available');
  });

  it('validates required fields', async () => {
    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing userId, jobType, readerItemId
        payload: {},
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBeDefined();
  });

  it('validates jobType is one of allowed types', async () => {
    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        jobType: 'invalid_type',
        readerItemId: TEST_ITEM_ID,
        payload: {},
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe('Invalid request data');
    // Details will include Zod validation errors
  });

  it('validates UUID formats for userId and readerItemId', async () => {
    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'not-a-valid-uuid',
        jobType: 'summary_generation',
        readerItemId: 'also-not-a-uuid',
        payload: { title: 'Test' },
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string; details: any };
    expect(data.error).toBe('Invalid request data');
    expect(data.details).toBeDefined();
  });

  it('creates job and sends message to queue', async () => {
    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        jobType: 'summary_generation',
        readerItemId: TEST_ITEM_ID,
        payload: {
          title: 'Test Article',
          content: 'Article content',
        },
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = (await response.json()) as {
      jobId: string;
      status: string;
      createdAt: string;
    };
    expect(data.jobId).toBeDefined();
    expect(data.status).toBe('pending');

    // Verify queue message was sent
    expect(mockQueue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: data.jobId,
        userId: TEST_USER_ID,
        jobType: 'summary_generation',
        readerItemId: TEST_ITEM_ID,
        payload: expect.objectContaining({
          title: 'Test Article',
        }),
      })
    );
  });

  it('handles queue send errors gracefully', async () => {
    // Mock getCloudflareContext to return a failing queue
    const failingQueue = {
      send: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
    };
    mockGetCloudflareContext.mockReturnValue({
      env: {
        PROCESSING_QUEUE: failingQueue,
      },
    });

    const { POST } = await import('./route');

    const request = new Request('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        jobType: 'summary_generation',
        readerItemId: TEST_ITEM_ID,
        payload: { title: 'Test' },
      }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = (await response.json()) as { error: string };
    expect(data.error).toContain('queue');
  });
});
