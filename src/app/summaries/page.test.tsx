// ABOUT: Tests for summaries page component
// ABOUT: Validates authenticated rendering, session display, logout

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { redirect } from 'next/navigation';
import SummariesPage from './page';
import { act } from 'react';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Mock Supabase server client
const mockGetSession = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe('SummariesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for items endpoint
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  it('renders summaries page when user is authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      },
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    // Check for header elements
    expect(screen.getByText('Ansible AI Reader')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('displays sync button', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      },
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync/i })).toBeInTheDocument();
    });
  });

  it('displays empty state when no items', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      },
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /No summaries yet. Click "Sync" in the header to fetch your unread items from Readwise Reader./
        )
      ).toBeInTheDocument();
    });
  });

  it('displays logout button', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      },
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    expect(logoutButton).toBeInTheDocument();
  });

  it('redirects to home page when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });

    // Expect redirect to throw (Next.js redirect throws a special error)
    await expect(SummariesPage()).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('handles different user emails', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'another-user-id',
            email: 'another@example.com',
          },
        },
      },
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    expect(screen.getByText(/another@example.com/)).toBeInTheDocument();
  });
});
