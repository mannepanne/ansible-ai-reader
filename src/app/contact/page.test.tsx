// ABOUT: Tests for the contact form page
// ABOUT: Validates form rendering, submission flow, and success/error states

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import ContactPage from './page';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="arrow-left" />,
}));

// Mock Turnstile — simulates widget already verified by default
let onSuccessCallback: ((token: string) => void) | null = null;
const mockTurnstileReset = vi.fn();
vi.mock('@marsidev/react-turnstile', () => ({
  // Must use forwardRef so the component can call turnstileRef.current.reset()
  Turnstile: React.forwardRef(({ onSuccess }: any, ref: any) => {
    onSuccessCallback = onSuccess;
    if (ref) ref.current = { reset: mockTurnstileReset };
    return <div data-testid="turnstile-widget" />;
  }),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

async function simulateTurnstileSuccess() {
  await act(async () => {
    onSuccessCallback?.('mock-turnstile-token');
  });
}

describe('ContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSuccessCallback = null;
  });

  describe('Rendering', () => {
    it('renders the page heading', () => {
      render(<ContactPage />);
      expect(screen.getByRole('heading', { name: /contact/i })).toBeDefined();
    });

    it('renders email and message fields', () => {
      render(<ContactPage />);
      expect(screen.getByLabelText(/your email address/i)).toBeDefined();
      expect(screen.getByLabelText(/message/i)).toBeDefined();
    });

    it('renders the Turnstile widget', () => {
      render(<ContactPage />);
      expect(screen.getByTestId('turnstile-widget')).toBeDefined();
    });

    it('renders the submit button', () => {
      render(<ContactPage />);
      expect(screen.getByRole('button', { name: /send message/i })).toBeDefined();
    });

    it('submit button is disabled before Turnstile is verified', () => {
      render(<ContactPage />);
      const button = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('Submit button enablement', () => {
    it('remains disabled when email and message filled but Turnstile not yet verified', async () => {
      const user = userEvent.setup();
      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');

      const button = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('enables submit when email, message, and Turnstile are all valid', async () => {
      const user = userEvent.setup();
      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      const button = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('remains disabled when message is too short (under 10 chars)', async () => {
      const user = userEvent.setup();
      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'Short');
      await simulateTurnstileSuccess();

      const button = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('remains disabled when email has no @ symbol', async () => {
      const user = userEvent.setup();
      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'notanemail');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      const button = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('Successful submission', () => {
    it('shows success message after successful form submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(screen.getByText(/message sent/i)).toBeDefined();
      });
    });

    it('POSTs to /api/contact with correct payload', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/contact');
      const body = JSON.parse(options.body);
      expect(body.email).toBe('test@example.com');
      expect(body.message).toBe('This is a long enough message');
      expect(body.turnstileToken).toBe('mock-turnstile-token');
    });
  });

  describe('Error handling', () => {
    it('shows error message when API returns error', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'CAPTCHA verification failed' }),
      });

      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText(/CAPTCHA verification failed/i)).toBeDefined();
      });
    });

    it('shows fallback error message on network failure', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText(/check your connection/i)).toBeDefined();
      });
    });

    it('resets Turnstile widget after a failed submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'CAPTCHA verification failed' }),
      });

      render(<ContactPage />);

      await user.type(screen.getByLabelText(/your email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This is a long enough message');
      await simulateTurnstileSuccess();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockTurnstileReset).toHaveBeenCalled();
      });
    });
  });
});
