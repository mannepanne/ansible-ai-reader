// ABOUT: Tests for the server-side Supabase client factories
// ABOUT: Validates cookie get/set/remove handlers (including Server Component write failures) and service role config

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type CookieHandlers = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: Record<string, unknown>) => void;
  remove: (name: string, options: Record<string, unknown>) => void;
};

// Capture what createClient hands to @supabase/ssr and what createServiceRoleClient
// hands to @supabase/supabase-js, so the tests can drive the cookie handlers directly.
const { captured, cookieStore } = vi.hoisted(() => ({
  captured: {
    ssr: null as null | { url: string; key: string; cookies: CookieHandlers },
    js: null as null | { url: string; key: string; options: Record<string, unknown> },
  },
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((url: string, key: string, opts: { cookies: CookieHandlers }) => {
    captured.ssr = { url, key, cookies: opts.cookies };
    return { kind: 'ssr-client' };
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string, options: Record<string, unknown>) => {
    captured.js = { url, key, options };
    return { kind: 'service-role-client' };
  }),
}));

import { createClient, createServiceRoleClient } from './server';

describe('createClient (server)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    captured.ssr = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds the SSR client with the public URL and publishable key', async () => {
    const client = await createClient();

    expect(client).toEqual({ kind: 'ssr-client' });
    expect(captured.ssr?.url).toBe('https://example.supabase.co');
    expect(captured.ssr?.key).toBe('publishable-key');
  });

  it('get returns the cookie value from the store, or undefined when absent', async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === 'sb-token' ? { name, value: 'abc123' } : undefined
    );

    await createClient();

    expect(captured.ssr!.cookies.get('sb-token')).toBe('abc123');
    expect(captured.ssr!.cookies.get('missing')).toBeUndefined();
  });

  it('set writes name, value and options to the cookie store', async () => {
    await createClient();

    captured.ssr!.cookies.set('sb-token', 'xyz', { path: '/', maxAge: 60 });

    expect(cookieStore.set).toHaveBeenCalledWith({
      name: 'sb-token',
      value: 'xyz',
      path: '/',
      maxAge: 60,
    });
  });

  it('set swallows errors thrown by the cookie store (Server Component context)', async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });

    await createClient();

    expect(() => captured.ssr!.cookies.set('sb-token', 'xyz', { path: '/' })).not.toThrow();
  });

  it('remove writes an empty value for the cookie with the given options', async () => {
    await createClient();

    captured.ssr!.cookies.remove('sb-token', { path: '/' });

    expect(cookieStore.set).toHaveBeenCalledWith({ name: 'sb-token', value: '', path: '/' });
  });

  it('remove swallows errors thrown by the cookie store (Server Component context)', async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });

    await createClient();

    expect(() => captured.ssr!.cookies.remove('sb-token', { path: '/' })).not.toThrow();
  });
});

describe('createServiceRoleClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    captured.js = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'secret-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds a supabase-js client with the secret key and no session persistence', () => {
    const client = createServiceRoleClient();

    expect(client).toEqual({ kind: 'service-role-client' });
    expect(captured.js).toEqual({
      url: 'https://example.supabase.co',
      key: 'secret-key',
      options: {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    });
  });
});
