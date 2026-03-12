// ABOUT: Tests for logout endpoint
// ABOUT: Validates sign out, redirect behavior, and confirmation page

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
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

describe('GET /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns HTML confirmation page', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
    });

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Logout - Ansible</title>');
  });

  it('includes logout confirmation text', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
    });

    const response = await GET(request);
    const html = await response.text();

    expect(html).toContain('Logout');
    expect(html).toContain('Are you sure you want to log out?');
  });

  it('includes form that posts to logout endpoint', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
    });

    const response = await GET(request);
    const html = await response.text();

    expect(html).toContain('method="POST"');
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('<button type="submit">Logout</button>');
  });

  it('is responsive with viewport meta tag', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
    });

    const response = await GET(request);
    const html = await response.text();

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it('includes inline styles for presentation', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
    });

    const response = await GET(request);
    const html = await response.text();

    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
  });
});
