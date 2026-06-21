// ABOUT: Tests for the Relay bridge Worker (Stage 1: auth + back-fill endpoint)
// ABOUT: Verifies the shared-secret gate, routing, and that /backfill invokes the back-fill

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunBackfill = vi.fn();
vi.mock('../src/lib/relay/backfill', () => ({
  runBackfill: (...args: unknown[]) => mockRunBackfill(...args),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ __isClient: true })),
}));

import worker from './relay-bridge';

function makeEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'secret',
    RELAY_BRIDGE_TOKEN: 'bridge-token',
    AI: { run: vi.fn() },
  };
}

function req(path: string, init?: RequestInit) {
  return new Request(`https://relay-bridge.example.com${path}`, init);
}

describe('relay-bridge worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunBackfill.mockResolvedValue({ scanned: 3, ingested: 2, skippedEmpty: 1, failed: 0 });
  });

  it('rejects requests with no authorization header', async () => {
    const res = await worker.fetch(req('/backfill', { method: 'POST' }), makeEnv() as any);
    expect(res.status).toBe(401);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it('rejects requests with the wrong bearer token', async () => {
    const res = await worker.fetch(
      req('/backfill', { method: 'POST', headers: { authorization: 'Bearer wrong' } }),
      makeEnv() as any,
    );
    expect(res.status).toBe(401);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it('runs the back-fill and returns its counts on POST /backfill with a valid token', async () => {
    const res = await worker.fetch(
      req('/backfill', { method: 'POST', headers: { authorization: 'Bearer bridge-token' } }),
      makeEnv() as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 3, ingested: 2, skippedEmpty: 1, failed: 0 });
    expect(mockRunBackfill).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an authorized request to an unknown route', async () => {
    const res = await worker.fetch(
      req('/nope', { method: 'POST', headers: { authorization: 'Bearer bridge-token' } }),
      makeEnv() as any,
    );
    expect(res.status).toBe(404);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it('returns 404 for a GET to /backfill (wrong method)', async () => {
    const res = await worker.fetch(
      req('/backfill', { method: 'GET', headers: { authorization: 'Bearer bridge-token' } }),
      makeEnv() as any,
    );
    expect(res.status).toBe(404);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });
});
