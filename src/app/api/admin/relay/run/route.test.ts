// ABOUT: Tests for the admin Relay run (trigger) API route — auth guard, validation, DO enqueue

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockItemMaybeSingle = vi.fn();
const mockDoFetch = vi.fn();
const mockGet = vi.fn(() => ({ fetch: mockDoFetch }));
const mockIdFromName = vi.fn(() => 'do-id');
let orchestratorBound = true;

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockAdminSelect }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockItemMaybeSingle }) }) }),
  })),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    if (!orchestratorBound) throw new Error('no cloudflare context');
    return { env: { RELAY_ORCHESTRATOR: { idFromName: mockIdFromName, get: mockGet } } };
  },
}));

const makeReq = (body: unknown) =>
  new Request('https://example.com/api/admin/relay/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const asAdmin = () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'admin-1' } } } });
  mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
};

describe('POST /api/admin/relay/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orchestratorBound = true;
    mockAdminSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockItemMaybeSingle.mockResolvedValue({ data: { reader_id: 'r1', title: 'A piece', short_summary: 'A point.' }, error: null });
    mockGet.mockReturnValue({ fetch: mockDoFetch });
    mockDoFetch.mockResolvedValue(new Response(JSON.stringify({ queued: true, readerId: 'r1' }), { status: 202 }));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect((await POST(makeReq({ readerId: 'r1' }))).status).toBe(401);
    expect(mockDoFetch).not.toHaveBeenCalled();
  });

  it('returns 403 when not admin', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    expect((await POST(makeReq({ readerId: 'r1' }))).status).toBe(403);
  });

  it('returns 400 when readerId is missing', async () => {
    asAdmin();
    expect((await POST(makeReq({}))).status).toBe(400);
  });

  it('returns 404 when the reader_item does not exist', async () => {
    asAdmin();
    mockItemMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(makeReq({ readerId: 'ghost' }))).status).toBe(404);
    expect(mockDoFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when the item has no summary to react to', async () => {
    asAdmin();
    mockItemMaybeSingle.mockResolvedValue({ data: { reader_id: 'r1', title: 'T', short_summary: '  ' }, error: null });
    expect((await POST(makeReq({ readerId: 'r1' }))).status).toBe(400);
  });

  it('returns 503 when the orchestrator binding is unavailable (local dev)', async () => {
    asAdmin();
    orchestratorBound = false;
    expect((await POST(makeReq({ readerId: 'r1' }))).status).toBe(503);
  });

  it('enqueues on the singleton orchestrator DO and returns 202', async () => {
    asAdmin();
    const res = await POST(makeReq({ readerId: 'r1' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ queued: true, readerId: 'r1' });
    expect(mockIdFromName).toHaveBeenCalledWith('relay'); // singleton
    const [url, init] = mockDoFetch.mock.calls[0];
    expect(String(url)).toContain('/enqueue');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ readerId: 'r1' });
  });

  it('returns 502 when the orchestrator rejects the enqueue', async () => {
    asAdmin();
    mockDoFetch.mockResolvedValue(new Response('boom', { status: 500 }));
    expect((await POST(makeReq({ readerId: 'r1' }))).status).toBe(502);
  });
});
