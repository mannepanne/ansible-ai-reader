// ABOUT: Tests for the admin export-user-data API route
// ABOUT: Validates auth guard, admin guard, and correct data aggregation per email

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({
      select: mockAdminSelect,
    }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const makeRequest = (email?: string) =>
  new Request(
    `https://example.com/api/admin/export-user-data${email ? `?email=${encodeURIComponent(email)}` : ''}`,
    { method: 'GET' }
  );

describe('GET /api/admin/export-user-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const res = await GET(makeRequest('user@example.com'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    const res = await GET(makeRequest('other@example.com'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when email param is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 500 when a Supabase query fails', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    });

    const res = await GET(makeRequest('victim@example.com'));
    expect(res.status).toBe(500);
  });

  it('returns JSON file download with all data for the given email', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
    });
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });

    const capturesData = [{ email: 'victim@example.com', source: 'hero', consented: true, created_at: '2026-04-01T10:00:00Z' }];
    const sessionsData = [{ session_id: 'sess-1', email: 'victim@example.com', started_at: '2026-04-01T10:00:00Z', last_active_at: '2026-04-01T10:05:00Z', total_events: 5 }];
    const eventsData = [{ event_type: 'tab_switch', email: 'victim@example.com', session_id: 'sess-1', created_at: '2026-04-01T10:01:00Z' }];

    mockFrom.mockImplementation((table: string) => {
      const dataMap: Record<string, unknown[]> = {
        email_captures: capturesData,
        demo_sessions: sessionsData,
        demo_events: eventsData,
      };
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: dataMap[table] ?? [], error: null }),
        }),
      };
    });

    const res = await GET(makeRequest('victim@example.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain('victim');

    const body = await res.json() as { email: string; emailCaptures: unknown[]; demoSessions: unknown[]; demoEvents: unknown[] };
    expect(body.email).toBe('victim@example.com');
    expect(body.emailCaptures).toEqual(capturesData);
    expect(body.demoSessions).toEqual(sessionsData);
    expect(body.demoEvents).toEqual(eventsData);
  });
});
