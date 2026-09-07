// ABOUT: Unit tests for the useTracking hook and its helper utilities
// ABOUT: Covers session/visitor identity, email capture, and Supabase insert behaviour

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Supabase mock — vi.hoisted ensures refs are ready before the factory runs ─
const { mockInsert, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import {
  getSessionId,
  getVisitorId,
  getStoredEmail,
  setSessionEmail,
  clearStoredEmail,
  captureEmail,
  useTracking,
  usePageTracking,
} from './useTracking';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function clearTrackingStorage() {
  localStorage.removeItem('ansible_session_id');
  localStorage.removeItem('ansible_last_active');
  localStorage.removeItem('ansible_visitor_id');
  localStorage.removeItem('ansible_email');
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearTrackingStorage();

  // Default: insert resolves successfully; rpc resolves
  mockInsert.mockResolvedValue({ data: null, error: null });
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  clearTrackingStorage();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Simulate SSR (no window) for the duration of `fn`; localStorage itself stays reachable so the
// tests can assert nothing was written to it.
function withoutWindow(fn: () => void) {
  const windowSpy = vi.spyOn(global, 'window', 'get');
  // @ts-expect-error — simulate SSR
  windowSpy.mockReturnValue(undefined);
  try {
    fn();
  } finally {
    windowSpy.mockRestore();
  }
}

// The heartbeat runs on setInterval; only fake that so RTL's own timers stay real.
const fakeIntervals = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

// Make crypto.randomUUID yield an empty string so the identity helpers "fail" to mint an ID — the
// hooks then carry empty refs, which is the only way to reach their defensive early-return paths.
const stubEmptyUuid = () => vi.spyOn(crypto, 'randomUUID').mockReturnValue('' as never);

// ── getSessionId ─────────────────────────────────────────────────────────────

describe('getSessionId', () => {
  it('creates a new session ID when none exists', () => {
    const id = getSessionId();
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(localStorage.getItem('ansible_session_id')).toBe(id);
  });

  it('returns the same session ID on repeated calls within 30 minutes', () => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBe(id2);
  });

  it('generates a new session ID after the 30-minute timeout', () => {
    const id1 = getSessionId();

    // Simulate 31 minutes passing
    const pastTime = Date.now() - SESSION_TIMEOUT_MS - 1000;
    localStorage.setItem('ansible_last_active', String(pastTime));

    const id2 = getSessionId();
    expect(id2).not.toBe(id1);
    expect(id2).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('updates last_active timestamp on each call', () => {
    const before = Date.now();
    getSessionId();
    const stored = Number(localStorage.getItem('ansible_last_active'));
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());
  });

  it('returns empty string in SSR environment (no window)', () => {
    const windowSpy = vi.spyOn(global, 'window', 'get');
    // @ts-expect-error — simulate SSR
    windowSpy.mockReturnValue(undefined);
    expect(getSessionId()).toBe('');
    windowSpy.mockRestore();
  });
});

// ── getVisitorId ─────────────────────────────────────────────────────────────

describe('getVisitorId', () => {
  it('creates a new visitor ID when none exists', () => {
    const id = getVisitorId();
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem('ansible_visitor_id')).toBe(id);
  });

  it('returns the same visitor ID across multiple calls (persistent)', () => {
    const id1 = getVisitorId();
    const id2 = getVisitorId();
    expect(id1).toBe(id2);
  });

  it('persists across simulated page reloads (same localStorage key)', () => {
    const id1 = getVisitorId();
    // Simulate fresh call (new function invocation, same localStorage)
    const id2 = getVisitorId();
    expect(id1).toBe(id2);
  });

  it('returns a different ID than the session ID', () => {
    const visitor = getVisitorId();
    const session = getSessionId();
    expect(visitor).not.toBe(session);
  });

  it('returns empty string in SSR environment (no window)', () => {
    const windowSpy = vi.spyOn(global, 'window', 'get');
    // @ts-expect-error — simulate SSR
    windowSpy.mockReturnValue(undefined);
    expect(getVisitorId()).toBe('');
    windowSpy.mockRestore();
  });
});

// ── Email storage helpers ─────────────────────────────────────────────────────

describe('getStoredEmail / setSessionEmail / clearStoredEmail', () => {
  it('getStoredEmail returns null when no email is stored', () => {
    expect(getStoredEmail()).toBeNull();
  });

  it('setSessionEmail stores the email in localStorage', () => {
    setSessionEmail('alice@example.com');
    expect(localStorage.getItem('ansible_email')).toBe('alice@example.com');
  });

  it('getStoredEmail returns the stored email', () => {
    setSessionEmail('alice@example.com');
    expect(getStoredEmail()).toBe('alice@example.com');
  });

  it('clearStoredEmail removes the stored email', () => {
    setSessionEmail('alice@example.com');
    clearStoredEmail();
    expect(getStoredEmail()).toBeNull();
  });

  it('getStoredEmail returns null after clear', () => {
    setSessionEmail('alice@example.com');
    clearStoredEmail();
    expect(getStoredEmail()).toBeNull();
  });

  it('getStoredEmail returns null in SSR environment even when an email is stored', () => {
    localStorage.setItem('ansible_email', 'alice@example.com');
    withoutWindow(() => expect(getStoredEmail()).toBeNull());
  });

  it('setSessionEmail is a no-op in SSR environment (nothing written)', () => {
    withoutWindow(() => setSessionEmail('alice@example.com'));
    expect(localStorage.getItem('ansible_email')).toBeNull();
  });

  it('clearStoredEmail is a no-op in SSR environment (stored email survives)', () => {
    localStorage.setItem('ansible_email', 'alice@example.com');
    withoutWindow(() => clearStoredEmail());
    expect(localStorage.getItem('ansible_email')).toBe('alice@example.com');
  });
});

// ── captureEmail ──────────────────────────────────────────────────────────────

describe('captureEmail', () => {
  it('inserts to email_captures with correct fields for consented user', async () => {
    await captureEmail('alice@example.com', 'hero', true);

    expect(mockFrom).toHaveBeenCalledWith('email_captures');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        source: 'hero',
        consented: true,
        consented_at: expect.any(String),
      })
    );
  });

  it('inserts to email_captures with correct fields for cta source', async () => {
    await captureEmail('bob@example.com', 'cta', true);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cta' })
    );
  });

  it('sets consented_at to null when consented is false', async () => {
    await captureEmail('alice@example.com', 'hero', false);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ consented: false, consented_at: null })
    );
  });

  it('sets consented_at to an ISO timestamp when consented is true', async () => {
    const before = new Date().toISOString();
    await captureEmail('alice@example.com', 'hero', true);
    const call = mockInsert.mock.calls[0][0] as { consented_at: string };
    expect(new Date(call.consented_at).toISOString()).toBe(call.consented_at);
    expect(call.consented_at >= before).toBe(true);
  });
});

// ── useTracking hook ──────────────────────────────────────────────────────────

describe('useTracking', () => {
  it('returns a trackEvent function', () => {
    const { result } = renderHook(() => useTracking());
    expect(typeof result.current.trackEvent).toBe('function');
  });

  it('inserts a demo_session row on mount', async () => {
    renderHook(() => useTracking());
    // Allow useEffect to run
    await act(async () => {});
    expect(mockFrom).toHaveBeenCalledWith('demo_sessions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: expect.any(String),
        started_at: expect.any(String),
        last_active_at: expect.any(String),
        total_events: 0,
      })
    );
  });

  it('associates stored email with the session on mount', async () => {
    setSessionEmail('alice@example.com');
    renderHook(() => useTracking());
    await act(async () => {});
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com' })
    );
  });

  it('trackEvent inserts a demo_events row with event_type and data', async () => {
    const { result } = renderHook(() => useTracking());
    await act(async () => {});

    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackEvent('tab_switch', { tab: 'commentary' });
    });

    await act(async () => {});
    expect(mockFrom).toHaveBeenCalledWith('demo_events');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'tab_switch',
        event_data: { tab: 'commentary' },
      })
    );
  });

  it('trackEvent calls increment_session_events RPC', async () => {
    const { result } = renderHook(() => useTracking());
    await act(async () => {});

    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockRpc.mockResolvedValue({});

    act(() => {
      result.current.trackEvent('expand');
    });

    await act(async () => {});
    expect(mockRpc).toHaveBeenCalledWith('increment_session_events', expect.objectContaining({ sid: expect.any(String) }));
  });

  it('bumps the existing session via heartbeat RPC when the demo_session insert is rejected', async () => {
    // A duplicate session_id (page reload within 30 min) makes the insert fail — that is expected,
    // and the hook must fall back to touching last_active_at on the existing row.
    mockInsert.mockResolvedValue({ data: null, error: { message: 'duplicate key' } });
    renderHook(() => useTracking());
    await act(async () => {});

    const sid = localStorage.getItem('ansible_session_id');
    expect(mockRpc).toHaveBeenCalledWith('update_session_heartbeat', { sid });
  });

  it('does not send a heartbeat RPC on mount when the session insert succeeds', async () => {
    renderHook(() => useTracking());
    await act(async () => {});
    expect(mockRpc).not.toHaveBeenCalledWith('update_session_heartbeat', expect.anything());
  });

  it('initialises the session row only once when effects are double-invoked (StrictMode)', async () => {
    renderHook(() => useTracking(), { reactStrictMode: true });
    await act(async () => {});
    const sessionInserts = mockFrom.mock.calls.filter(([table]) => table === 'demo_sessions');
    expect(sessionInserts).toHaveLength(1);
  });

  it('sends a heartbeat RPC every 30 seconds and refreshes last_active', async () => {
    fakeIntervals();
    renderHook(() => useTracking());
    await act(async () => {});
    mockRpc.mockClear();
    localStorage.setItem('ansible_last_active', '0');

    await tick(30000);

    const sid = localStorage.getItem('ansible_session_id');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('update_session_heartbeat', { sid });
    expect(Number(localStorage.getItem('ansible_last_active'))).toBeGreaterThan(0);

    await tick(30000);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('stops the heartbeat when the hook unmounts', async () => {
    fakeIntervals();
    const { unmount } = renderHook(() => useTracking());
    await act(async () => {});
    mockRpc.mockClear();

    unmount();
    await tick(60000);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('skips the heartbeat RPC when no session ID could be minted (still touches last_active)', async () => {
    stubEmptyUuid();
    fakeIntervals();
    renderHook(() => useTracking());
    await act(async () => {});
    mockRpc.mockClear();
    localStorage.setItem('ansible_last_active', '0');

    await tick(30000);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(Number(localStorage.getItem('ansible_last_active'))).toBeGreaterThan(0);
  });

  it('trackEvent records nothing when no session ID could be minted', async () => {
    stubEmptyUuid();
    const { result } = renderHook(() => useTracking());
    await act(async () => {});
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackEvent('expand');
    });
    await act(async () => {});

    expect(mockFrom).not.toHaveBeenCalledWith('demo_events');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('trackEvent still records the event in SSR environment, without touching localStorage', async () => {
    const { result } = renderHook(() => useTracking());
    await act(async () => {});
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert });
    localStorage.setItem('ansible_last_active', '0');
    localStorage.setItem('ansible_email', 'alice@example.com');

    withoutWindow(() => {
      act(() => {
        result.current.trackEvent('expand');
      });
    });
    await act(async () => {});

    expect(localStorage.getItem('ansible_last_active')).toBe('0'); // touchLastActive skipped
    expect(mockFrom).toHaveBeenCalledWith('demo_events');
    // The stored email is unreadable without a window, so the event carries none.
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'expand', email: null }));
  });
});

// ── usePageTracking hook ──────────────────────────────────────────────────────

describe('usePageTracking', () => {
  it('returns a trackPageEvent function', () => {
    const { result } = renderHook(() => usePageTracking());
    expect(typeof result.current.trackPageEvent).toBe('function');
  });

  it('trackPageEvent inserts to page_events with visitor_id and session_id', async () => {
    const { result } = renderHook(() => usePageTracking());
    await act(async () => {});

    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackPageEvent('landing_page_view');
    });

    await act(async () => {});
    expect(mockFrom).toHaveBeenCalledWith('page_events');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'landing_page_view',
        visitor_id: expect.any(String),
        session_id: expect.any(String),
        event_data: {},
      })
    );
  });

  it('trackPageEvent passes event_data correctly', async () => {
    const { result } = renderHook(() => usePageTracking());
    await act(async () => {});

    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackPageEvent('nav_click', { label: 'features' });
    });

    await act(async () => {});
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_data: { label: 'features' } })
    );
  });

  it('trackPageEvent uses the same visitor_id across calls', async () => {
    const { result } = renderHook(() => usePageTracking());
    await act(async () => {});

    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackPageEvent('landing_page_view');
      result.current.trackPageEvent('nav_click', { label: 'demo' });
    });

    await act(async () => {});
    const calls = mockInsert.mock.calls as Array<[{ visitor_id: string }]>;
    expect(calls[0][0].visitor_id).toBe(calls[1][0].visitor_id);
  });

  it('trackPageEvent mints fresh identities when the mount-time refs are empty', async () => {
    // Mount with an ID generator that yields nothing, so both refs stay empty…
    const uuid = stubEmptyUuid();
    const { result } = renderHook(() => usePageTracking());
    await act(async () => {});
    // …then let the generator work again: the event must fall back to minting IDs on demand.
    uuid.mockRestore();
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert });

    act(() => {
      result.current.trackPageEvent('landing_page_view');
    });
    await act(async () => {});

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        visitor_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
    );
  });
});
