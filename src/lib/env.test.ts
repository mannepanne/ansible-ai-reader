// ABOUT: Tests for environment variable validation
// ABOUT: Verifies required env vars are present and valid

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and clear ALL env vars before each test
    vi.resetModules();
    process.env = {
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Phase 1.2 - Supabase and Resend', () => {
    it('validates all required Phase 1.2 environment variables are present', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).not.toThrow();
    });

    it('throws error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it('throws error when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    });

    it('throws error when SUPABASE_SECRET_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/SUPABASE_SECRET_KEY/);
    });

    it('throws error when RESEND_API_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/RESEND_API_KEY/);
    });

    it('throws error with helpful message listing all missing variables', async () => {
      // No env vars set
      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/Missing required environment variables/);
      expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
      expect(() => validateEnv()).toThrow(/SUPABASE_SECRET_KEY/);
      expect(() => validateEnv()).toThrow(/RESEND_API_KEY/);
    });

    it('validates NEXT_PUBLIC_SUPABASE_URL is a valid URL', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/Invalid URL/);
    });

    it('validates RESEND_API_KEY starts with re_', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 'invalid_format';

      const { validateEnv } = await import('./env');

      expect(() => validateEnv()).toThrow(/re_/);
    });
  });

  describe('Typed environment access', () => {
    it('exports typed env object with validated variables', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
      process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
      process.env.RESEND_API_KEY = 're_test_key';

      const { env } = await import('./env');

      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
      expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('test-publishable-key');
      expect(env.SUPABASE_SECRET_KEY).toBe('test-secret-key');
      expect(env.RESEND_API_KEY).toBe('re_test_key');
    });
  });
});
