// ABOUT: Tests for the reading-days endpoint
// ABOUT: Auth, defaults for a missing settings row, derivation wiring, error handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { getUserFikaSettings, listReadingEvents } from '@/lib/fika/store';

const mockGetUser = vi.fn();
const mockClient = { auth: { getUser: mockGetUser } };
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => mockClient) }));
vi.mock('@/lib/fika/store');

describe('GET /api/fika/reading-days', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T11:00:00Z')); // Sunday
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns 401 without a session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
  });

  it('derives the week from events in the user timezone', async () => {
    vi.mocked(getUserFikaSettings).mockResolvedValue({ timeZone: 'Europe/London', weeklyTarget: 4 });
    vi.mocked(listReadingEvents).mockResolvedValue([{ at: '2026-08-31T08:00:00Z' }, { at: '2026-09-06T09:00:00Z' }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      days: [true, false, false, false, false, false, true],
      count: 2,
      target: 4,
      weekStart: '2026-08-31',
    });
    expect(listReadingEvents).toHaveBeenCalledWith(mockClient, 'u1', '2026-08-30T00:00:00.000Z');
  });

  it('uses defaults when the user row has no settings', async () => {
    vi.mocked(getUserFikaSettings).mockResolvedValue(null);
    vi.mocked(listReadingEvents).mockResolvedValue([]);
    expect(await (await GET()).json()).toMatchObject({ count: 0, target: 5 });
  });

  it('returns 500 on errors', async () => {
    vi.mocked(getUserFikaSettings).mockRejectedValue(new Error('x'));
    expect((await GET()).status).toBe(500);
  });
});
