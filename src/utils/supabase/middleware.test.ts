// ABOUT: Tests for the middleware Supabase client cookie handling
// ABOUT: Pins the regression where refreshed-session cookies were dropped

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal cookie jar matching the slice of the ResponseCookies/RequestCookies API
// that createClient touches (set with an object arg, get returning { value }).
function makeCookieJar() {
  const store = new Map<string, string>();
  return {
    store,
    set: (arg: { name: string; value: string }) => store.set(arg.name, arg.value),
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
  };
}

// Capture the cookie handlers createClient hands to @supabase/ssr, plus a spy on
// NextResponse.next so we can prove the response object is built exactly once
// (the orphaning bug rebuilt it inside every set/remove call).
const { captured, nextSpy } = vi.hoisted(() => ({
  captured: { cookies: null as unknown as Record<string, (...args: never[]) => unknown> },
  nextSpy: { count: 0, last: null as unknown as { cookies: ReturnType<typeof makeCookieJar> } },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: typeof captured.cookies }) => {
    captured.cookies = opts.cookies;
    return {} as unknown;
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: () => {
      nextSpy.count += 1;
      nextSpy.last = { cookies: makeCookieJar() };
      return nextSpy.last;
    },
  },
}));

import { createClient } from './middleware';

function makeRequest() {
  return { cookies: makeCookieJar(), headers: new Map() };
}

describe('createClient (middleware Supabase client)', () => {
  beforeEach(() => {
    nextSpy.count = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';
  });

  it('writes cookies set during getSession to the response the caller already holds', () => {
    const { response } = createClient(makeRequest() as never);

    // The caller destructures `response` BEFORE getSession() runs; a session refresh
    // then invokes this callback. If createClient reassigned `response` to a fresh
    // object here, the cookie would land on an orphan the caller never returns.
    (captured.cookies.set as (n: string, v: string, o: object) => void)(
      'sb-access-token',
      'refreshed-value',
      { path: '/' }
    );

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-value');
  });

  it('builds the response exactly once — no orphaning reassignment on cookie writes', () => {
    createClient(makeRequest() as never);
    (captured.cookies.set as (n: string, v: string, o: object) => void)('sb', 'v', {});
    (captured.cookies.remove as (n: string, o: object) => void)('sb', {});

    // One NextResponse.next() at construction; the set/remove callbacks must mutate
    // it in place, not rebuild it. Two-plus calls would mean the orphaning bug is back.
    expect(nextSpy.count).toBe(1);
  });

  it('clears cookies on the held response via remove', () => {
    const { response } = createClient(makeRequest() as never);

    (captured.cookies.set as (n: string, v: string, o: object) => void)('sb', 'v', {});
    (captured.cookies.remove as (n: string, o: object) => void)('sb', {});

    expect(response.cookies.get('sb')?.value).toBe('');
  });

  it('reads cookies from the incoming request', () => {
    const request = makeRequest();
    request.cookies.set({ name: 'sb', value: 'from-request' });

    createClient(request as never);

    expect((captured.cookies.get as (n: string) => string | undefined)('sb')).toBe('from-request');
  });
});
