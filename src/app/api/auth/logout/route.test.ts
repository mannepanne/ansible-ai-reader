// ABOUT: Tests for logout endpoint
// ABOUT: Validates sign out and redirect behavior

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase server client
const mockSignOut = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signOut: mockSignOut,
    },
  })),
}));

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs out user and redirects to login', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
    });

    const response = await POST(request);

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('returns 500 when sign out fails', async () => {
    mockSignOut.mockResolvedValue({
      error: { message: 'Sign out failed' },
    });

    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to logout');
  });
});
