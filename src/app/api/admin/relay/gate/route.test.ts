// ABOUT: Tests for the admin Relay engagement-gate toggle route — auth guards, flip, validation,
// ABOUT: and the OFF→ON backlog baseline-stamp (react-from-now-on semantics).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PATCH } from './route';

const mockGetSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

// Service-role client: users.select (prev flag), users.update (flip), reader_items.update (backlog stamp).
const mockPrevMaybeSingle = vi.fn();
const mockUsersUpdateEq = vi.fn();
const mockUsersUpdate = vi.fn(() => ({ eq: mockUsersUpdateEq }));
const mockStampIs = vi.fn();
const mockStampUpdate = vi.fn(() => ({ eq: () => ({ eq: () => ({ is: mockStampIs }) }) }));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockAdminSelect }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: mockPrevMaybeSingle }) }),
          update: mockUsersUpdate,
        };
      }
      if (table === 'reader_items') return { update: mockStampUpdate };
      return {};
    },
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
  // Default prior state: gate OFF.
  mockPrevMaybeSingle.mockResolvedValue({ data: { relay_engagement_gate_enabled: false }, error: null });
  mockUsersUpdateEq.mockResolvedValue({ error: null });
  mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
  mockStampIs.mockResolvedValue({ error: null });
  mockStampUpdate.mockReturnValue({ eq: () => ({ eq: () => ({ is: mockStampIs }) }) });
});

afterEach(() => {
  if (prevOwner === undefined) delete process.env.RELAY_OWNER_USER_ID;
  else process.env.RELAY_OWNER_USER_ID = prevOwner;
});

describe('PATCH /api/admin/relay/gate', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect((await PATCH(patchReq({ enabled: true }))).status).toBe(401);
    expect(mockUsersUpdate).not.toHaveBeenCalled();
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
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    asAdmin();
    expect((await PATCH(patchReq('not json'))).status).toBe(400);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    asAdmin();
    expect((await PATCH(patchReq({ enabled: 'yes' }))).status).toBe(400);
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it('flips the owner flag and echoes the new value', async () => {
    asAdmin();
    const res = await PATCH(patchReq({ enabled: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
    expect(mockUsersUpdate).toHaveBeenCalledWith({ relay_engagement_gate_enabled: true });
  });

  it('returns 500 when the update fails', async () => {
    asAdmin();
    mockUsersUpdateEq.mockResolvedValue({ error: { message: 'db down' } });
    expect((await PATCH(patchReq({ enabled: false }))).status).toBe(500);
    expect(mockStampUpdate).not.toHaveBeenCalled();
  });

  it('baseline-stamps the backlog on OFF→ON (react from now on)', async () => {
    asAdmin();
    mockPrevMaybeSingle.mockResolvedValue({ data: { relay_engagement_gate_enabled: false }, error: null });
    const res = await PATCH(patchReq({ enabled: true }));
    expect(res.status).toBe(200);
    expect(mockStampUpdate).toHaveBeenCalledWith({ relay_triggered_at: expect.any(String) });
  });

  it('does NOT stamp on a redundant ON→ON (keeps live pending items firing)', async () => {
    asAdmin();
    mockPrevMaybeSingle.mockResolvedValue({ data: { relay_engagement_gate_enabled: true }, error: null });
    await PATCH(patchReq({ enabled: true }));
    expect(mockStampUpdate).not.toHaveBeenCalled();
  });

  it('does NOT stamp when disabling (ON→OFF)', async () => {
    asAdmin();
    mockPrevMaybeSingle.mockResolvedValue({ data: { relay_engagement_gate_enabled: true }, error: null });
    await PATCH(patchReq({ enabled: false }));
    expect(mockStampUpdate).not.toHaveBeenCalled();
  });

  it('still succeeds when the backlog stamp fails (non-fatal, flag already flipped)', async () => {
    asAdmin();
    mockStampIs.mockResolvedValue({ error: { message: 'stamp boom' } });
    const res = await PATCH(patchReq({ enabled: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
  });
});
