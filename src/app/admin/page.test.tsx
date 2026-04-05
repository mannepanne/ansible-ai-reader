// ABOUT: Tests for the admin analytics page
// ABOUT: Validates auth guard, admin-role guard, and AdminContent rendering

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Next.js navigation
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error(`redirect:${url}`); },
}));

// Mock Supabase server client
const mockGetSession = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockSelect }),
  })),
  createServiceRoleClient: vi.fn(() => {
    const resolved = Promise.resolve({ count: 0, data: [], error: null });
    const chain: Record<string, unknown> = {
      eq: vi.fn(() => resolved),
      order: vi.fn(() => chain),
      limit: vi.fn(() => resolved),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
    };
    return {
      from: () => ({ select: vi.fn(() => chain) }),
    };
  }),
}));

// Mock AdminContent
vi.mock('@/components/admin/AdminContent', () => ({
  default: ({ userEmail }: { userEmail: string }) => (
    <div data-testid="admin-content">Admin dashboard for {userEmail}</div>
  ),
}));

import AdminPage from './page';

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it('redirects to / when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(AdminPage()).rejects.toThrow('redirect:/');
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('redirects to /summaries when authenticated but not admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });

    await expect(AdminPage()).rejects.toThrow('redirect:/summaries');
    expect(mockRedirect).toHaveBeenCalledWith('/summaries');
  });

  it('renders AdminContent when authenticated and admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    const result = await AdminPage();
    const { getByTestId } = render(result as React.ReactElement);

    expect(getByTestId('admin-content')).toBeDefined();
    expect(screen.getByText(/admin dashboard for admin@example.com/i)).toBeDefined();
  });
});
