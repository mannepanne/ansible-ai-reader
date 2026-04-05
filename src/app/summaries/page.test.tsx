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
const mockSingle = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  })),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe('SummariesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
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
      expect(screen.getByText('Knowledge Synchronized')).toBeInTheDocument();
      expect(
        screen.getByText(/All articles processed. Your ansible is fully charged./)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Time to transmit what you've learned to the world./)
      ).toBeInTheDocument();
    });
  });

  it('hides empty state when items exist', async () => {
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

    // Mock fetch to return items
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'item-1',
            reader_id: 'reader-1',
            title: 'Test Article',
            author: 'Test Author',
            source: 'test.com',
            url: 'https://test.com/article',
            word_count: 1000,
            short_summary: 'This is a test summary.',
            tags: ['test', 'article'],
            perplexity_model: 'sonar-pro',
            content_truncated: false,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    });

    const component = await SummariesPage();
    await act(async () => {
      render(component as any);
    });

    await waitFor(() => {
      // Empty state should NOT be present
      expect(
        screen.queryByText('Knowledge Synchronized')
      ).not.toBeInTheDocument();
      // Item should be present
      expect(screen.getByText('Test Article')).toBeInTheDocument();
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
