// ABOUT: Tests for the admin delete-user-data API route
// ABOUT: Validates auth guard, admin guard, and cascade delete behaviour

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from './route';

// Mock Supabase server client
const mockGetSession = vi.fn();
const mockFrom = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: (table: string) => ({
      select: mockAdminSelect,
    }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const makeRequest = (email?: string) =>
  new Request(
    `https://example.com/api/admin/delete-user-data${email ? `?email=${encodeURIComponent(email)}` : ''}`,
    { method: 'DELETE' }
  );

describe('DELETE /api/admin/delete-user-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const res = await DELETE(makeRequest('user@example.com'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });

    const res = await DELETE(makeRequest('other@example.com'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when email param is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    const res = await DELETE(makeRequest());
    expect(res.status).toBe(400);
  });

  it('deletes email_captures, demo_sessions, and demo_events for the given email', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    const mockDeleteBuilder = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockFrom.mockReturnValue({ delete: vi.fn(() => mockDeleteBuilder) });

    const res = await DELETE(makeRequest('victim@example.com'));
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('email_captures');
    expect(mockFrom).toHaveBeenCalledWith('demo_sessions');
    expect(mockFrom).toHaveBeenCalledWith('demo_events');
  });
});
