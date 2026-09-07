// ABOUT: Tests for the settings page server component
// ABOUT: Validates auth redirect, admin flag lookup, and props passed to SettingsContent

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import SettingsPage from './page';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

// Mock Supabase server client
const mockGetSession = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
    from: () => ({
      select: () => ({
        eq: mockEq,
      }),
    }),
  })),
}));

// Render only the props the server component hands down
vi.mock('./SettingsContent', () => ({
  default: ({ userEmail, isAdmin }: { userEmail: string; isAdmin?: boolean }) => (
    <div data-testid="settings-content">
      <span data-testid="email">{userEmail}</span>
      <span data-testid="is-admin">{String(isAdmin)}</span>
    </div>
  ),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
  });

  it('renders SettingsContent with the session email when authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'test@example.com' } } },
    });

    const component = await SettingsPage();
    render(component as any);

    expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('passes isAdmin true when the users row says so', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    const component = await SettingsPage();
    render(component as any);

    expect(screen.getByTestId('is-admin')).toHaveTextContent('true');
  });

  it('falls back to empty email and non-admin when data is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-2' } } },
    });
    mockSingle.mockResolvedValue({ data: null, error: null });

    const component = await SettingsPage();
    render(component as any);

    expect(screen.getByTestId('email')).toHaveTextContent('');
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
  });

  it('redirects to home page when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
    expect(mockEq).not.toHaveBeenCalled();
  });
});
