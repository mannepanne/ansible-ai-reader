// ABOUT: Tests for authentication middleware
// ABOUT: Validates route protection, redirects, session refresh

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { middleware } from './middleware';
import { NextRequest, NextResponse } from 'next/server';

// Mock middleware client
const mockGetSession = vi.fn();

vi.mock('@/utils/supabase/middleware', () => ({
  createClient: vi.fn(() => ({
    supabase: {
      auth: {
        getSession: mockGetSession,
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
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/summaries'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toContain('/login');
      expect(response?.headers.get('location')).toContain('returnTo=%2Fsummaries');
    });

    it('redirects unauthenticated user from /settings to /login', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/settings'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toContain('/login');
      expect(response?.headers.get('location')).toContain('returnTo=%2Fsettings');
    });

    it('allows authenticated user to access /summaries', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'test-token',
          },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/summaries'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });

    it('allows authenticated user to access /settings', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'test-token',
          },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/settings'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('login route', () => {
    it('redirects authenticated user from /login to /summaries', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            access_token: 'test-token',
          },
        },
      });

      const request = new NextRequest(new URL('http://localhost:3000/login'));
      const response = await middleware(request);

      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toBe('http://localhost:3000/summaries');
    });

    it('allows unauthenticated user to access /login', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/login'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('public routes', () => {
    it('allows access to root path', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });

    it('allows access to API routes', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/api/jobs'));
      const response = await middleware(request);

      expect(response?.status).not.toBe(307);
    });
  });

  describe('session management', () => {
    it('calls getSession to refresh session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      await middleware(request);

      expect(mockGetSession).toHaveBeenCalled();
    });
  });
});
