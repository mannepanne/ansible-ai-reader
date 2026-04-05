// ABOUT: Tests for the home server component
// ABOUT: Verifies unauthenticated users see the landing page; authenticated users are redirected

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { redirect } from 'next/navigation';
import Home from './page';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

// Mock Supabase server client
const mockGetSession = vi.fn();
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}));

// Mock the tracking hook so it doesn't fire Supabase calls in tests
vi.mock('@/hooks/useTracking', () => ({
  usePageTracking: vi.fn(() => ({ trackPageEvent: vi.fn(), visitorId: 'test-visitor' })),
  useTracking: vi.fn(() => ({ trackEvent: vi.fn(), sessionId: 'test-session' })),
  getStoredEmail: vi.fn(() => null),
  captureEmail: vi.fn(),
  setSessionEmail: vi.fn(),
  verifyStoredEmail: vi.fn(async () => false),
}));

// Mock Lucide icons to avoid rendering issues in tests
vi.mock('lucide-react', () => ({
  ArrowRight: () => null,
  Zap: () => null,
  MessageSquareWarning: () => null,
  Search: () => null,
  BookOpen: () => null,
  Filter: () => null,
  Clock: () => null,
  ChevronRight: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  ExternalLink: () => null,
  Archive: () => null,
  StickyNote: () => null,
  ArrowLeft: () => null,
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders landing page for unauthenticated users', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    // Landing page hero heading should be present
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to /summaries', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'test-user', email: 'test@example.com' } },
      },
    });

    await Home();

    expect(redirect).toHaveBeenCalledWith('/summaries');
  });
});
