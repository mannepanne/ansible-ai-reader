// ABOUT: Tests for the admin Relay engagement-gate toggle route — auth guards, read/flip, validation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PATCH } from './route';

const mockGetSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockAdminSelect }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({ update: mockUpdate }),
  })),
}));

const asAdmin = () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'admin-1' } } } });
  mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
};

const patchReq = (body: unknown) =>
  new Request('https://example.com/api/admin/relay/gate', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

let prevOwner: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  prevOwner = process.env.RELAY_OWNER_USER_ID;
  process.env.RELAY_OWNER_USER_ID = 'owner-1';
  mockAdminSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });
});

afterEach(() => {
  if (prevOwner === undefined) delete process.env.RELAY_OWNER_USER_ID;
  else process.env.RELAY_OWNER_USER_ID = prevOwner;
});

describe('PATCH /api/admin/relay/gate', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect((await PATCH(patchReq({ enabled: true }))).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 when not admin', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    expect((await PATCH(patchReq({ enabled: true }))).status).toBe(403);
  });

  it('returns 503 when the owner is unconfigured', async () => {
    asAdmin();
    delete process.env.RELAY_OWNER_USER_ID;
    expect((await PATCH(patchReq({ enabled: true }))).status).toBe(503);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    asAdmin();
    expect((await PATCH(patchReq('not json'))).status).toBe(400);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    asAdmin();
    expect((await PATCH(patchReq({ enabled: 'yes' }))).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('flips the owner flag and echoes the new value', async () => {
    asAdmin();
    const res = await PATCH(patchReq({ enabled: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
    expect(mockUpdate).toHaveBeenCalledWith({ relay_engagement_gate_enabled: true });
  });

  it('returns 500 when the update fails', async () => {
    asAdmin();
    mockUpdateEq.mockResolvedValue({ error: { message: 'db down' } });
    expect((await PATCH(patchReq({ enabled: false }))).status).toBe(500);
  });
});
