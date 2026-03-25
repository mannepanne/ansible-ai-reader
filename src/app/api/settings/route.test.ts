// ABOUT: Tests for Settings API endpoint
// ABOUT: Validates GET/PATCH operations, authentication, validation, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Mock dependencies
vi.mock('@/utils/supabase/server');

describe('GET /api/settings', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user settings successfully', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          sync_interval: 2,
          summary_prompt: 'Custom prompt',
        },
        error: null,
      }),
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      sync_interval: 2,
      summary_prompt: 'Custom prompt',
    });
  });

  it('returns defaults when user record does not exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' },
      }),
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      sync_interval: 0,
      summary_prompt: null,
    });
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
        }),
      },
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 500 on database error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER_ERROR', message: 'Database error' },
      }),
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to fetch settings' });
  });
});

describe('PATCH /api/settings', () => {
  const mockSession = {
    user: { id: 'user-123', email: 'test@example.com' },
    access_token: 'test-token',
  };

  const mockRequest = (body: any) =>
    new NextRequest('http://localhost:3000/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates sync_interval successfully', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 4 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('updates summary_prompt successfully', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as any);

    const response = await PATCH(
      mockRequest({ summary_prompt: 'Custom prompt here' })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('updates both settings simultaneously', async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

    const response = await PATCH(
      mockRequest({
        sync_interval: 12,
        summary_prompt: 'New prompt',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    // Verify upsert was called with correct data
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-123',
        email: 'test@example.com',
        sync_interval: 12,
        summary_prompt: 'New prompt',
        updated_at: expect.any(String),
      }),
      { onConflict: 'id' }
    );
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
        }),
      },
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 2 }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid sync_interval (negative)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: -1 }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 for invalid sync_interval (too large)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 25 }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 for invalid summary_prompt (too short)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
    } as any);

    const response = await PATCH(mockRequest({ summary_prompt: 'short' }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 for invalid summary_prompt (too long)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
    } as any);

    const response = await PATCH(
      mockRequest({ summary_prompt: 'x'.repeat(2001) })
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('accepts sync_interval = 0 (disabled)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 0 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('accepts sync_interval = 24 (maximum)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 24 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('returns 500 on database error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({
        error: { message: 'Database error' },
      }),
    } as any);

    const response = await PATCH(mockRequest({ sync_interval: 2 }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to update settings' });
  });
});
