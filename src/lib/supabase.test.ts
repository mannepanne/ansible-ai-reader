// ABOUT: Tests for Supabase client initialization
// ABOUT: Verifies client and admin instances are created correctly

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Supabase Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      RESEND_API_KEY: 're_test_key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a client-side Supabase client', async () => {
    const { supabase } = await import('./supabase');

    expect(supabase).toBeDefined();
    // Test that client can be used (protected properties not accessible)
    expect(typeof supabase.from).toBe('function');
  });

  it('creates a server-side Supabase admin client', async () => {
    const { supabaseAdmin } = await import('./supabase');

    expect(supabaseAdmin).toBeDefined();
    // Test that admin client can be used
    expect(typeof supabaseAdmin.from).toBe('function');
  });

  it('exports both client instances', async () => {
    const { supabase, supabaseAdmin } = await import('./supabase');

    expect(supabase).toBeDefined();
    expect(supabaseAdmin).toBeDefined();
    expect(supabase).not.toBe(supabaseAdmin);
  });
});
