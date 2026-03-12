// ABOUT: Tests for auth callback route
// ABOUT: Validates code exchange, error handling, redirects

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase server client
const mockExchangeCodeForSession = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges code for session and redirects to returnTo URL', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/api/auth/callback?code=test-code&returnTo=/summaries'
    );

    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('test-code');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/summaries');
  });

  it('redirects to /summaries when returnTo not provided', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/api/auth/callback?code=test-code'
    );

    const response = await GET(request);

    expect(response.headers.get('location')).toBe('http://localhost:3000/summaries');
  });

  it('redirects to custom returnTo URL', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/api/auth/callback?code=test-code&returnTo=/settings'
    );

    const response = await GET(request);

    expect(response.headers.get('location')).toBe('http://localhost:3000/settings');
  });

  it('redirects to login with error when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'Invalid code' },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/auth/callback?code=invalid-code&returnTo=/summaries'
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?error=');
    expect(response.headers.get('location')).toContain('Authentication%20failed');
  });

  it('redirects to returnTo URL when no code provided', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/auth/callback?returnTo=/summaries'
    );

    const response = await GET(request);

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('http://localhost:3000/summaries');
  });
});
