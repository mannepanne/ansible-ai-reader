// ABOUT: Tests for magic link login API endpoint
// ABOUT: Validates email input, Supabase interaction, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase server client
const mockSignInWithOtp = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}));

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends magic link for valid email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as { message: string };

    expect(response.status).toBe(200);
    expect(data.message).toBe('Magic link sent successfully');
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        emailRedirectTo: expect.stringContaining('/api/auth/callback?returnTo=%2Fsummaries'),
      },
    });
  });

  it('uses custom returnTo URL when provided', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        returnTo: '/settings',
      }),
    });

    await POST(request);

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        emailRedirectTo: expect.stringContaining('/api/auth/callback?returnTo=%2Fsettings'),
      },
    });
  });

  it('returns 400 for invalid email', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as { error: string; details: unknown };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request data');
    expect(data.details).toBeDefined();
  });

  it('returns 400 for missing email', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request data');
  });

  it('returns 500 when Supabase returns error', async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'SMTP configuration error' },
    });

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(data.error).toBe('SMTP configuration error');
  });

  it('returns 500 for unexpected errors', async () => {
    mockSignInWithOtp.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
