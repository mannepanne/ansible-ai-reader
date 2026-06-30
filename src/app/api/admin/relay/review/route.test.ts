// ABOUT: Tests for the admin Relay review API route (approve/reject proxy to the bridge)
// ABOUT: Validates the auth + admin guards, input validation, and the bridge call with the control token

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockAdminSelect }),
  })),
}));

const makeReq = (body: unknown) =>
  new Request('https://example.com/api/admin/relay/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const asAdmin = () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'admin-1' } } } });
  mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
};

describe('POST /api/admin/relay/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    process.env.RELAY_CONTROL_TOKEN = 'control-token';
    process.env.RELAY_BRIDGE_URL = 'https://bridge.test';
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect((await POST(makeReq({ id: 'p1', action: 'approve' }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated but not admin', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    expect((await POST(makeReq({ id: 'p1', action: 'approve' }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 400 on missing id or invalid action', async () => {
    asAdmin();
    expect((await POST(makeReq({ action: 'approve' }))).status).toBe(400);
    expect((await POST(makeReq({ id: 'p1', action: 'nope' }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('approves via the bridge /approve with the control token', async () => {
    asAdmin();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'p1', slug: 'a-piece' }), { status: 200 }),
    );
    const res = await POST(makeReq({ id: 'p1', action: 'approve' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'p1', slug: 'a-piece' });
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://bridge.test/approve');
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer control-token');
    expect(JSON.parse(opts.body as string)).toEqual({ id: 'p1' });
  });

  it('rejects via the bridge /reject', async () => {
    asAdmin();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'p2' }), { status: 200 }),
    );
    const res = await POST(makeReq({ id: 'p2', action: 'reject' }));
    expect(res.status).toBe(200);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('https://bridge.test/reject');
  });

  it('returns 502 with the bridge error detail when the bridge rejects', async () => {
    asAdmin();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'approve: piece p1 is approved, not pending_review' }), { status: 400 }),
    );
    const res = await POST(makeReq({ id: 'p1', action: 'approve' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('approve') });
  });

  it('returns 500 when RELAY_CONTROL_TOKEN is not configured', async () => {
    asAdmin();
    delete process.env.RELAY_CONTROL_TOKEN;
    expect((await POST(makeReq({ id: 'p1', action: 'approve' }))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });
});
