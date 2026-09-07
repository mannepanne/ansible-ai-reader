// ABOUT: Tests for the browser-side Supabase client factory
// ABOUT: Validates the public URL and publishable key are passed to @supabase/ssr

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBrowserClient } from '@supabase/ssr';
import { createClient } from './client';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ kind: 'browser-client' })),
}));

describe('createClient (browser)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates a browser client with the public URL and publishable key', () => {
    const client = createClient();

    expect(client).toEqual({ kind: 'browser-client' });
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'publishable-key'
    );
  });
});
