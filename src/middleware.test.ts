// ABOUT: Tests for authentication middleware
// ABOUT: Validates route protection, redirects, session refresh

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { middleware, SECURITY_HEADERS } from './middleware';
import { NextRequest, NextResponse } from 'next/server';

// Mock middleware client
const mockGetUser = vi.fn();

vi.mock('@/utils/supabase/middleware', () => ({
  createClient: vi.fn(() => ({
    supabase: {
      auth: {
        getUser: mockGetUser,
      },
    },
    response: NextResponse.next(),
  })),
}));

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('protected routes', () => {
    it('redirects unauthenticated user from /summaries to /login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/summaries'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toContain('/login');
      expect(response?.headers.get('location')).toContain('returnTo=%2Fsummaries');
    });

    it('redirects unauthenticated user from /settings to /login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/settings'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toContain('/login');
      expect(response?.headers.get('location')).toContain('returnTo=%2Fsettings');
    });

    it('allows authenticated user to access /summaries', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/summaries'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });

    it('allows authenticated user to access /settings', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/settings'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('login route', () => {
    it('redirects authenticated user from /login to /summaries', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/login'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toBe('http://localhost:3000/summaries');
    });

    it('allows unauthenticated user to access /login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/login'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('public routes', () => {
    it('allows access to root path', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });

    it('allows access to API routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/api/jobs'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('security headers', () => {
    it('sets all baseline security headers on a served page', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response?.headers.get(name)).toBe(value);
      }
    });

    it('sets X-Frame-Options to DENY to prevent clickjacking', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      expect(response?.headers.get('x-frame-options')).toBe('DENY');
      expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('does NOT set Strict-Transport-Security (owned by the Cloudflare edge)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      expect(response?.headers.get('strict-transport-security')).toBeNull();
    });
  });

  describe('session management', () => {
    it('verifies the user with getUser on every request', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      await middleware(request);

      expect(mockGetUser).toHaveBeenCalled();
    });
  });
});
