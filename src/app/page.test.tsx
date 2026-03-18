// ABOUT: Tests for home page component
// ABOUT: Validates authenticated and unauthenticated rendering

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Home from './page';

// Mock Supabase server client
const mockGetSession = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the landing page hero heading', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    const heading = screen.getByRole('heading', {
      name: /stop drowning in saved articles/i,
    });
    expect(heading).toBeDefined();
  });

  it('displays the landing page tagline', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    const tagline = screen.getByText(
      /Ansible gives you AI-powered summaries/i
    );
    expect(tagline).toBeDefined();
  });

  it('shows developer login button when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    // Landing page should show developer login button
    expect(screen.getByRole('button', { name: /developer login/i })).toBeDefined();

    // Login form should not be visible by default
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
  });

  it('shows authenticated view when user is logged in', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user',
            email: 'test@example.com',
          },
        },
      },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    expect(screen.getByText(/welcome back/i)).toBeDefined();
    expect(screen.getByText(/test@example.com/)).toBeDefined();
    expect(screen.getByRole('link', { name: /view summaries/i })).toBeDefined();
  });
});
