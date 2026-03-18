// ABOUT: Tests for HomeContent component
// ABOUT: Validates dual-purpose page (login form vs authenticated welcome)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomeContent from './HomeContent';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock fetch
global.fetch = vi.fn();

describe('HomeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.reload
    delete (window as any).location;
    window.location = { reload: vi.fn() } as any;
  });

  describe('Landing page (unauthenticated)', () => {
    it('shows hero headline', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.getByText(/stop drowning in saved articles/i)).toBeInTheDocument();
      expect(
        screen.getByText(/AI-powered summaries of your Readwise library/i)
      ).toBeInTheDocument();
    });

    it('shows ansible symbol', () => {
      const { container } = render(<HomeContent isAuthenticated={false} />);

      // Check for SVG ansible symbol
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('shows "The Problem" section', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.getByText('The Problem')).toBeInTheDocument();
      expect(
        screen.getByText(/You save articles faster than you read them/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Your reading list grows by hundreds/i)
      ).toBeInTheDocument();
    });

    it('shows "How It Works" section', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.getByText('How It Works')).toBeInTheDocument();
      expect(
        screen.getByText(/Sync your Readwise Reader library/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Get summaries of articles and video transcripts/i)
      ).toBeInTheDocument();
    });

    it('shows "Key Features" section', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.getByText('Key Features')).toBeInTheDocument();
      expect(screen.getByText(/AI summaries with smart tags/i)).toBeInTheDocument();
      expect(screen.getByText(/Two-way sync with Readwise Reader/i)).toBeInTheDocument();
    });

    it('shows "Built With" section', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.getByText('Built With')).toBeInTheDocument();
      expect(screen.getByText(/Next.js 15.*React 19.*Cloudflare/s)).toBeInTheDocument();
      expect(screen.getByText(/240 tests.*95%\+ coverage/s)).toBeInTheDocument();
    });

    it('shows developer login button', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(
        screen.getByRole('button', { name: /developer login/i })
      ).toBeInTheDocument();
    });

    it('does not show login form by default', () => {
      render(<HomeContent isAuthenticated={false} />);

      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /send login link/i })
      ).not.toBeInTheDocument();
    });

    it('shows login form when developer login clicked', async () => {
      const user = userEvent.setup();
      render(<HomeContent isAuthenticated={false} />);

      const devLoginButton = screen.getByRole('button', { name: /developer login/i });
      await user.click(devLoginButton);

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /send login link/i })
      ).toBeInTheDocument();
    });
  });

  describe('Login form (after clicking developer login)', () => {
    async function openLoginForm() {
      const user = userEvent.setup();
      render(<HomeContent isAuthenticated={false} />);
      const devLoginButton = screen.getByRole('button', { name: /developer login/i });
      await user.click(devLoginButton);
      return user;
    }

    it('shows login form elements', async () => {
      await openLoginForm();

      expect(screen.getByText('Ansible AI Reader')).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /send login link/i })
      ).toBeInTheDocument();
    });

    it('shows how it works section', async () => {
      await openLoginForm();

      expect(screen.getByText(/how it works:/i)).toBeInTheDocument();
      expect(
        screen.getByText(/enter your email address and we'll send/i)
      ).toBeInTheDocument();
    });

    it('submits login form and shows success message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Magic link sent' }),
      });

      const user = await openLoginForm();

      const emailInput = screen.getByLabelText(/email address/i);
      const submitButton = screen.getByRole('button', {
        name: /send login link/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('Check your email for the magic link!')
        ).toBeInTheDocument();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', returnTo: '/summaries' }),
      });
    });

    it('clears email field after successful submission', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Success' }),
      });

      const user = await openLoginForm();

      const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
      await user.type(emailInput, 'test@example.com');
      await user.click(screen.getByRole('button', { name: /send login link/i }));

      await waitFor(() => {
        expect(emailInput.value).toBe('');
      });
    });

    it('shows error message on failed submission', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid email' }),
      });

      const user = await openLoginForm();

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'invalid-email');

      const form = emailInput.closest('form');
      fireEvent.submit(form!);

      // Wait for error message to appear
      const errorMessage = await screen.findByText('Invalid email', {}, { timeout: 5000 });
      expect(errorMessage).toBeInTheDocument();
    });

    it('shows loading state during submission', async () => {
      let resolveFetch: any;
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = () =>
              resolve({ ok: true, json: async () => ({}) });
          })
      );

      await openLoginForm();

      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = emailInput.closest('form');
      fireEvent.submit(form!);

      // Should show "Sending..." during submission
      const sendingButton = await screen.findByText('Sending...', {}, { timeout: 5000 });
      expect(sendingButton).toBeInTheDocument();

      // Complete the fetch
      resolveFetch();

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /sending/i })
        ).not.toBeInTheDocument();
      });
    });

    it('disables form during submission', async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: true, json: async () => ({}) }),
              100
            )
          )
      );

      const user = await openLoginForm();

      const emailInput = screen.getByLabelText(/email address/i);
      const submitButton = screen.getByRole('button', {
        name: /send login link/i,
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
    });
  });

  describe('Authenticated state', () => {
    it('shows welcome message with user email', () => {
      render(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('shows View Summaries link', () => {
      render(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      const summariesLink = screen.getByRole('link', {
        name: /view summaries/i,
      });
      expect(summariesLink).toHaveAttribute('href', '/summaries');
    });

    it('shows logout button', () => {
      render(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      expect(
        screen.getByRole('button', { name: /logout/i })
      ).toBeInTheDocument();
    });

    it('does not show login form when authenticated', () => {
      render(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /send login link/i })
      ).not.toBeInTheDocument();
    });

    it('calls logout API and reloads when logout clicked', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const mockReload = vi.fn();
      delete (window as any).location;
      window.location = { reload: mockReload } as any;

      render(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      const logoutButton = screen.getByRole('button', { name: /logout/i });
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
          method: 'POST',
        });
      });

      expect(mockReload).toHaveBeenCalled();
    });

    it('displays different user emails', () => {
      const { rerender } = render(
        <HomeContent isAuthenticated={true} userEmail="first@example.com" />
      );

      expect(screen.getByText('first@example.com')).toBeInTheDocument();

      rerender(
        <HomeContent isAuthenticated={true} userEmail="second@example.com" />
      );

      expect(screen.getByText('second@example.com')).toBeInTheDocument();
    });
  });

  describe('State transitions', () => {
    it('switches from unauthenticated to authenticated', () => {
      const { rerender } = render(<HomeContent isAuthenticated={false} />);

      // Should show landing page
      expect(screen.getByText(/stop drowning in saved articles/i)).toBeInTheDocument();

      rerender(
        <HomeContent isAuthenticated={true} userEmail="test@example.com" />
      );

      // Should now show authenticated view
      expect(screen.queryByText(/stop drowning in saved articles/i)).not.toBeInTheDocument();
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('shows generic error on network failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      render(<HomeContent isAuthenticated={false} />);

      // Click developer login to show form
      const devLoginButton = screen.getByRole('button', { name: /developer login/i });
      await user.click(devLoginButton);

      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = emailInput.closest('form');
      fireEvent.submit(form!);

      // Wait for error message to appear
      const errorMessage = await screen.findByText('An unexpected error occurred', {}, { timeout: 5000 });
      expect(errorMessage).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has required email input', async () => {
      const user = userEvent.setup();
      render(<HomeContent isAuthenticated={false} />);

      // Click developer login to show form
      const devLoginButton = screen.getByRole('button', { name: /developer login/i });
      await user.click(devLoginButton);

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('required');
    });

    it('has proper form structure', async () => {
      const user = userEvent.setup();
      const { container } = render(<HomeContent isAuthenticated={false} />);

      // Click developer login to show form
      const devLoginButton = screen.getByRole('button', { name: /developer login/i });
      await user.click(devLoginButton);

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput.closest('form')).toBe(form);
    });
  });
});
