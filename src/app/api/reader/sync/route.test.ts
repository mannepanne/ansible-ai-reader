// ABOUT: Tests for Reader sync API endpoint
// ABOUT: Validates sync operation, authentication, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/utils/supabase/server');
vi.mock('@/lib/sync-operations');
vi.mock('@opennextjs/cloudflare');

import { createClient } from '@/utils/supabase/server';
import { performSyncForUser } from '@/lib/sync-operations';
import { getCloudflareContext } from '@opennextjs/cloudflare';

describe('POST /api/reader/sync', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  const mockRequest = new NextRequest('http://localhost:3000/api/reader/sync', {
    method: 'POST',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';

    // Setup default mocks
    vi.mocked(getCloudflareContext).mockReturnValue({
      env: {
        PROCESSING_QUEUE: { send: vi.fn() },
      },
    } as any);
  });

  it('syncs items successfully', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-123',
      totalItems: 2,
      totalFetched: 2,
      itemsArchived: 0,
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      syncId: 'sync-123',
      totalItems: 2,
      totalFetched: 2,
      itemsArchived: 0,
    });

    expect(performSyncForUser).toHaveBeenCalledWith(
      expect.anything(), // Supabase client
      {
        userId: 'user-123',
        triggeredBy: 'manual',
        readerApiToken: 'test-reader-token',
        cloudflareEnv: expect.objectContaining({
          PROCESSING_QUEUE: expect.anything(),
        }),
      }
    );
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    } as any);

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
    expect(performSyncForUser).not.toHaveBeenCalled();
  });

  it('returns 500 when READER_API_TOKEN not configured', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    process.env.READER_API_TOKEN = '';

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Reader API not configured' });
    expect(performSyncForUser).not.toHaveBeenCalled();
  });

  it('handles sync errors gracefully', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    vi.mocked(performSyncForUser).mockRejectedValue(
      new Error('Sync operation failed: Network error')
    );

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Sync operation failed: Network error',
    });
  });

  it('calls performSyncForUser with triggered_by=manual', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-456',
      totalItems: 5,
      totalFetched: 5,
      itemsArchived: 0,
    });

    await POST(mockRequest);

    expect(performSyncForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        triggeredBy: 'manual',
      })
    );
  });

  it('returns errors count when sync has errors', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-789',
      totalItems: 1,
      totalFetched: 2,
      itemsArchived: 0,
      errors: 1,
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      syncId: 'sync-789',
      totalItems: 1,
      totalFetched: 2,
      itemsArchived: 0,
      errors: 1,
    });
  });

  it('works in local dev mode without Cloudflare queue', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockSession.user },
        }),
      },
    } as any);

    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-local',
      totalItems: 3,
      totalFetched: 3,
      itemsArchived: 0,
    });

    // Mock getCloudflareContext to throw (simulates local dev)
    vi.mocked(getCloudflareContext).mockImplementation(() => {
      throw new Error('Not in Cloudflare Workers context');
    });

    const response = await POST(mockRequest);
    const data = await response.json() as { syncId: string };

    expect(response.status).toBe(200);
    expect(data.syncId).toBe('sync-local');

    // Should still call performSyncForUser, but with undefined cloudflareEnv
    expect(performSyncForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cloudflareEnv: undefined,
      })
    );
  });
});
