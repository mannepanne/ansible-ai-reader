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

  it('renders the main heading', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    const heading = screen.getByRole('heading', {
      name: /ansible ai reader/i,
    });
    expect(heading).toBeDefined();
  });

  it('displays the tagline', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    const tagline = screen.getByText(
      /AI-powered reading triage for your Readwise library/i
    );
    expect(tagline).toBeDefined();
  });

  it('shows login form when not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const component = await Home();
    await act(async () => {
      render(component as any);
    });

    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send login link/i })).toBeDefined();
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
