// ABOUT: Tests for the Relay bridge Worker (Stage 1: auth + back-fill endpoint)
// ABOUT: Verifies the shared-secret gate, routing, and that /backfill invokes the back-fill

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunBackfill = vi.fn();
vi.mock('../src/lib/relay/backfill', () => ({
  runBackfill: (...args: unknown[]) => mockRunBackfill(...args),
}));

const mockHandleMcpMessage = vi.fn();
vi.mock('../src/lib/relay/mcp', () => ({
  handleMcpMessage: (...args: unknown[]) => mockHandleMcpMessage(...args),
}));

const mockFinalizeDecision = vi.fn();
vi.mock('../src/lib/relay/decisions', () => ({
  finalizeDecision: (...args: unknown[]) => mockFinalizeDecision(...args),
}));

const mockApprovePiece = vi.fn();
const mockRejectPiece = vi.fn();
vi.mock('../src/lib/relay/approval', () => ({
  approvePiece: (...args: unknown[]) => mockApprovePiece(...args),
  rejectPiece: (...args: unknown[]) => mockRejectPiece(...args),
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

  it('rejects an unauthorized POST /mcp before touching the MCP handler', async () => {
    const res = await worker.fetch(req('/mcp', { method: 'POST' }), makeEnv() as any);
    expect(res.status).toBe(401);
    expect(mockHandleMcpMessage).not.toHaveBeenCalled();
  });

  it('routes an authorized POST /mcp through the MCP handler and returns its JSON-RPC response', async () => {
    mockHandleMcpMessage.mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    const res = await worker.fetch(
      req('/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    expect(mockHandleMcpMessage).toHaveBeenCalledTimes(1);
    const [message, deps] = mockHandleMcpMessage.mock.calls[0];
    expect(message).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(deps).toMatchObject({ ai: expect.anything() });
  });

  it('returns 202 with no body for a notification (handler returns null)', async () => {
    mockHandleMcpMessage.mockResolvedValue(null);
    const res = await worker.fetch(
      req('/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('returns a -32700 parse error for an unparseable /mcp body', async () => {
    const res = await worker.fetch(
      req('/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: 'not json{',
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
    expect(mockHandleMcpMessage).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized POST /decision before touching the handler', async () => {
    const res = await worker.fetch(req('/decision', { method: 'POST' }), makeEnv() as any);
    expect(res.status).toBe(401);
    expect(mockFinalizeDecision).not.toHaveBeenCalled();
  });

  it('routes an authorized POST /decision through finalizeDecision and returns its verdict', async () => {
    mockFinalizeDecision.mockResolvedValue({ verdict: 'wrote', piece_id: 'piece-1' });
    const res = await worker.fetch(
      req('/decision', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ stimulus_ref: ['r1'], started_at: '2026-06-28T10:00:00Z' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: 'wrote', piece_id: 'piece-1' });
    expect(mockFinalizeDecision).toHaveBeenCalledTimes(1);
    const [deps, input] = mockFinalizeDecision.mock.calls[0];
    expect(deps).toMatchObject({ ai: expect.anything() });
    expect(input).toEqual({ stimulus_ref: ['r1'], started_at: '2026-06-28T10:00:00Z' });
  });

  it('returns 400 for an unparseable /decision body without calling the handler', async () => {
    const res = await worker.fetch(
      req('/decision', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: 'not json{',
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(400);
    expect(mockFinalizeDecision).not.toHaveBeenCalled();
  });

  it('returns 400 with the error message when finalizeDecision throws (e.g. missing started_at)', async () => {
    mockFinalizeDecision.mockRejectedValue(new Error('finalizeDecision: started_at (the T0 window anchor) is required'));
    const res = await worker.fetch(
      req('/decision', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ stimulus_ref: ['r1'] }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('started_at') });
  });

  it('rejects an unauthorized POST /approve before touching the handler', async () => {
    const res = await worker.fetch(req('/approve', { method: 'POST' }), makeEnv() as any);
    expect(res.status).toBe(401);
    expect(mockApprovePiece).not.toHaveBeenCalled();
  });

  it('routes an authorized POST /approve through approvePiece and returns its result', async () => {
    mockApprovePiece.mockResolvedValue({ ok: true, id: 'p1', slug: 'a-piece' });
    const res = await worker.fetch(
      req('/approve', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'p1', slug: 'a-piece' });
    expect(mockApprovePiece).toHaveBeenCalledTimes(1);
    const [deps, input] = mockApprovePiece.mock.calls[0];
    expect(deps).toMatchObject({ ai: expect.anything() });
    expect(input).toEqual({ id: 'p1' });
    expect(mockRejectPiece).not.toHaveBeenCalled();
  });

  it('routes an authorized POST /reject through rejectPiece', async () => {
    mockRejectPiece.mockResolvedValue({ ok: true, id: 'p2' });
    const res = await worker.fetch(
      req('/reject', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p2' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'p2' });
    expect(mockRejectPiece).toHaveBeenCalledTimes(1);
    expect(mockApprovePiece).not.toHaveBeenCalled();
  });

  it('returns 400 with the message when approvePiece throws', async () => {
    mockApprovePiece.mockRejectedValue(new Error('approve: piece p1 is approved, not pending_review'));
    const res = await worker.fetch(
      req('/approve', {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
      makeEnv() as any,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('pending_review') });
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
