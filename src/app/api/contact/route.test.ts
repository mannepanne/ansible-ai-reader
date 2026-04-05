// ABOUT: Tests for the contact form API route
// ABOUT: Validates Turnstile verification, input validation, and email sending

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock fetch for Turnstile verification and Resend API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment variables
vi.stubEnv('CLOUDFLARE_TURNSTILE_SECRET_KEY', 'test-turnstile-secret');
vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
vi.stubEnv('CONTACT_EMAIL', 'test@example.com');
vi.stubEnv('RESEND_FROM_EMAIL', 'from@example.com');

// Import after stubs are set up
const { POST } = await import('./route');

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockTurnstileSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true }),
  });
}

function mockTurnstileFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
  });
}

function mockResendSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: 'email-id-123' }),
  });
}

function mockResendFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ message: 'Invalid API key' }),
  });
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input validation', () => {
    it('returns 400 when body is missing required fields', async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({
        email: 'not-an-email',
        message: 'Hello there, this is a test message',
        turnstileToken: 'token',
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 when message is too short', async () => {
      const res = await POST(makeRequest({
        email: 'test@example.com',
        message: 'Hi',
        turnstileToken: 'token',
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 when message exceeds max length', async () => {
      const res = await POST(makeRequest({
        email: 'test@example.com',
        message: 'a'.repeat(2001),
        turnstileToken: 'token',
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 when turnstileToken is missing', async () => {
      const res = await POST(makeRequest({
        email: 'test@example.com',
        message: 'This is a valid message with enough characters',
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });
  });

  describe('Turnstile verification', () => {
    it('returns 400 when Turnstile verification fails', async () => {
      mockTurnstileFailure();

      const res = await POST(makeRequest({
        email: 'test@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'bad-token',
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('CAPTCHA verification failed');
    });

    it('verifies Turnstile token with correct secret key', async () => {
      mockTurnstileSuccess();
      mockResendSuccess();

      await POST(makeRequest({
        email: 'test@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      const turnstileCall = mockFetch.mock.calls[0];
      expect(turnstileCall[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      const callBody = JSON.parse(turnstileCall[1].body);
      expect(callBody.secret).toBe('test-turnstile-secret');
      expect(callBody.response).toBe('valid-token');
    });
  });

  describe('Email sending', () => {
    it('returns 200 and sends email on valid submission', async () => {
      mockTurnstileSuccess();
      mockResendSuccess();

      const res = await POST(makeRequest({
        email: 'user@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('sends email to CONTACT_EMAIL via Resend with reply-to set to sender', async () => {
      mockTurnstileSuccess();
      mockResendSuccess();

      await POST(makeRequest({
        email: 'user@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      const resendCall = mockFetch.mock.calls[1];
      expect(resendCall[0]).toBe('https://api.resend.com/emails');
      const callBody = JSON.parse(resendCall[1].body);
      expect(callBody.to).toContain('test@example.com');
      expect(callBody.reply_to).toBe('user@example.com');
    });

    it('returns 500 when Resend API call fails', async () => {
      mockTurnstileSuccess();
      mockResendFailure();

      const res = await POST(makeRequest({
        email: 'user@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to send message');
    });
  });

  describe('Missing configuration', () => {
    it('returns 500 if CONTACT_EMAIL is not set', async () => {
      vi.stubEnv('CONTACT_EMAIL', '');
      mockTurnstileSuccess();

      const res = await POST(makeRequest({
        email: 'user@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      expect(res.status).toBe(500);
      vi.stubEnv('CONTACT_EMAIL', 'test@example.com');
    });

    it('returns 500 if RESEND_FROM_EMAIL is not set', async () => {
      vi.stubEnv('RESEND_FROM_EMAIL', '');
      mockTurnstileSuccess();

      const res = await POST(makeRequest({
        email: 'user@example.com',
        message: 'This is a valid message with enough characters',
        turnstileToken: 'valid-token',
      }));

      expect(res.status).toBe(500);
      vi.stubEnv('RESEND_FROM_EMAIL', 'from@example.com');
    });
  });
});
