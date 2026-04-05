// ABOUT: Tests for the login page server component
// ABOUT: Verifies unauthenticated users see the login form; authenticated users are redirected

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { redirect } from 'next/navigation';
import LoginPage from './page';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Mock Supabase server client
const mockGetSession = vi.fn();
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

global.fetch = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form for unauthenticated users', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const component = await LoginPage();
    const { render: renderComponent } = await import('@testing-library/react');
    renderComponent(component as any);

    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send login link/i })).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to /summaries', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { user: { id: 'test-user', email: 'test@example.com' } },
      },
    });

    await LoginPage();

    expect(redirect).toHaveBeenCalledWith('/summaries');
  });

  it('submits login form and shows success message', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Magic link sent' }),
    });

    const component = await LoginPage();
    const { render: renderComponent } = await import('@testing-library/react');
    renderComponent(component as any);

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /send login link/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Check your email for the magic link!')).toBeDefined();
    });
  });

  it('shows back to home link', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const component = await LoginPage();
    const { render: renderComponent } = await import('@testing-library/react');
    renderComponent(component as any);

    const backLink = screen.getByRole('link', { name: /back to home/i });
    expect(backLink).toBeDefined();
  });
});
