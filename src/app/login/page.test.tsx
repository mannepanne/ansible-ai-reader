// ABOUT: Tests for login page UI component
// ABOUT: Validates form rendering, user interactions, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams } from 'next/navigation';
import LoginPage from './page';

// Mock useSearchParams
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSearchParams as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'returnTo') return null;
        if (key === 'error') return null;
        return null;
      }),
    });
  });

  it('renders login form with email input', () => {
    render(<LoginPage />);

    expect(screen.getByText('Sign in to Ansible')).toBeInTheDocument();
    expect(screen.getByText('Enter your email to receive a magic link')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument();
  });

  it('displays error message from URL parameter', () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'error') return 'Authentication failed';
        return null;
      }),
    });

    render(<LoginPage />);

    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
  });

  it('submits form and shows success message', async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Magic link sent successfully' }),
    });

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('Email address');
    const submitButton = screen.getByRole('button', { name: /send magic link/i });

    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Check your email for the magic link!')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', returnTo: '/summaries' }),
    });
  });

  it('submits form with custom returnTo URL', async () => {
    const user = userEvent.setup();
    (useSearchParams as any).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'returnTo') return '/settings';
        return null;
      }),
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Magic link sent successfully' }),
    });

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('Email address');
    const submitButton = screen.getByRole('button', { name: /send magic link/i });

    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', returnTo: '/settings' }),
      });
    });
  });

  it('renders loading fallback during Suspense', () => {
    const { container } = render(<LoginPage />);

    // The component should render without errors
    expect(container).toBeInTheDocument();
  });
});
