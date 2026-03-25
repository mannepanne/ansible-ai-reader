// ABOUT: Tests for cron auto-sync handler
// ABOUT: Validates authentication, user selection, interval checking, sync triggering

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performSyncForUser } from '@/lib/sync-operations';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Mock dependencies
vi.mock('@supabase/supabase-js');
vi.mock('@/lib/sync-operations');
vi.mock('@opennextjs/cloudflare');

describe('GET /api/cron/auto-sync', () => {
  const mockRequest = (authHeader?: string) =>
    new NextRequest('http://localhost:3000/api/cron/auto-sync', {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : undefined,
    });

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default environment
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.READER_API_TOKEN = 'test-reader-token';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    // Setup default Cloudflare context
    vi.mocked(getCloudflareContext).mockReturnValue({
      env: {
        PROCESSING_QUEUE: { send: vi.fn() },
      },
    } as any);
  });

  it('requires valid CRON_SECRET', async () => {
    const response = await GET(mockRequest('Bearer wrong-secret'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('requires authorization header', async () => {
    const response = await GET(mockRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 500 when READER_API_TOKEN not configured', async () => {
    process.env.READER_API_TOKEN = '';

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Reader API not configured' });
  });

  it('returns 500 when Supabase credentials missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Supabase not configured' });
  });

  it('queries only users with sync_interval > 0', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    const response = await GET(mockRequest('Bearer test-cron-secret'));

    expect(mockSupabase.from).toHaveBeenCalledWith('users');
    expect(mockSupabase.select).toHaveBeenCalledWith(
      'id, email, sync_interval, last_auto_sync_at'
    );
    expect(mockSupabase.gt).toHaveBeenCalledWith('sync_interval', 0);
    expect(response.status).toBe(200);
  });

  it('syncs users whose interval has elapsed', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1, // 1 hour interval
        last_auto_sync_at: twoHoursAgo.toISOString(), // 2 hours ago - should sync
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-123',
      totalItems: 5,
      totalFetched: 5,
    });

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 0, failed: 0, timestampFailures: 0 });

    expect(performSyncForUser).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        userId: 'user-1',
        triggeredBy: 'cron',
        readerApiToken: 'test-reader-token',
      })
    );

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_auto_sync_at: expect.any(String),
      })
    );
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('skips users whose interval has not elapsed', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1, // 1 hour interval
        last_auto_sync_at: thirtyMinutesAgo.toISOString(), // 30 min ago - should skip
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 0, skipped: 1, failed: 0, timestampFailures: 0 });
    expect(performSyncForUser).not.toHaveBeenCalled();
  });

  it('syncs users on first auto-sync (last_auto_sync_at = null)', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 24,
        last_auto_sync_at: null, // First sync - should sync immediately
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-456',
      totalItems: 10,
      totalFetched: 10,
    });

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 0, failed: 0, timestampFailures: 0 });
    expect(performSyncForUser).toHaveBeenCalledTimes(1);
  });

  it('handles mix of sync/skip/fail users', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1,
        last_auto_sync_at: twoHoursAgo.toISOString(), // Should sync
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        sync_interval: 1,
        last_auto_sync_at: thirtyMinutesAgo.toISOString(), // Should skip
      },
      {
        id: 'user-3',
        email: 'user3@example.com',
        sync_interval: 2,
        last_auto_sync_at: twoHoursAgo.toISOString(), // Should sync but will fail
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    // user-1 succeeds, user-3 fails
    vi.mocked(performSyncForUser)
      .mockResolvedValueOnce({
        syncId: 'sync-1',
        totalItems: 5,
        totalFetched: 5,
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 1, failed: 1, timestampFailures: 0 });
    expect(performSyncForUser).toHaveBeenCalledTimes(2);
  });

  it('continues processing after individual user failure', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1,
        last_auto_sync_at: twoHoursAgo.toISOString(),
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        sync_interval: 1,
        last_auto_sync_at: twoHoursAgo.toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    // First user fails, second succeeds
    vi.mocked(performSyncForUser)
      .mockRejectedValueOnce(new Error('First user failed'))
      .mockResolvedValueOnce({
        syncId: 'sync-2',
        totalItems: 3,
        totalFetched: 3,
      });

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 0, failed: 1, timestampFailures: 0 });
    expect(performSyncForUser).toHaveBeenCalledTimes(2);
  });

  it('works in local dev mode without Cloudflare queue', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1,
        last_auto_sync_at: twoHoursAgo.toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-local',
      totalItems: 2,
      totalFetched: 2,
    });

    // Mock getCloudflareContext to throw (simulates local dev)
    vi.mocked(getCloudflareContext).mockImplementation(() => {
      throw new Error('Not in Cloudflare Workers context');
    });

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 0, failed: 0, timestampFailures: 0 });

    // Should pass undefined cloudflareEnv to performSyncForUser
    expect(performSyncForUser).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        cloudflareEnv: undefined,
      })
    );
  });

  it('handles database query errors gracefully', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to query users' });
  });

  it('continues when last_auto_sync_at update fails', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        sync_interval: 1,
        last_auto_sync_at: twoHoursAgo.toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        error: { message: 'Update failed' },
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(performSyncForUser).mockResolvedValue({
      syncId: 'sync-789',
      totalItems: 1,
      totalFetched: 1,
    });

    const response = await GET(mockRequest('Bearer test-cron-secret'));
    const data = await response.json();

    // Should still return success - sync succeeded, just timestamp update failed
    expect(response.status).toBe(200);
    expect(data).toEqual({ synced: 1, skipped: 0, failed: 0, timestampFailures: 1 });
  });
});
