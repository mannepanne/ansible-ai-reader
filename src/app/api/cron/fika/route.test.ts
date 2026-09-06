// ABOUT: Tests for the Fika cron handler
// ABOUT: Auth, configuration checks, per-user outcomes and counts, isolation of failures

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';
import { listFikaUsers } from '@/lib/fika/store';
import { runFikaForUser } from '@/lib/fika/run';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ tag: 'db' })) }));
vi.mock('@/lib/fika/store');
vi.mock('@/lib/fika/run');

const request = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/fika', { method: 'GET', headers: auth ? { authorization: auth } : undefined });

const users = [
  { id: 'u1', email: 'a@x', fikaHour: 7, timeZone: 'Europe/London', weeklyTarget: 5 },
  { id: 'u2', email: 'b@x', fikaHour: 8, timeZone: 'UTC', weeklyTarget: 3 },
  { id: 'u3', email: 'c@x', fikaHour: 9, timeZone: 'UTC', weeklyTarget: 3 },
  { id: 'u4', email: 'd@x', fikaHour: 9, timeZone: 'UTC', weeklyTarget: 3 },
  { id: 'u5', email: 'e@x', fikaHour: 9, timeZone: 'UTC', weeklyTarget: 3 },
];

describe('GET /api/cron/fika', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sk';
    process.env.RESEND_API_KEY = 'rk';
    process.env.RESEND_FROM_EMAIL = 'fika@x';
    process.env.FIKA_ACTION_SECRET = 'as';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.test';
    vi.mocked(listFikaUsers).mockResolvedValue(users);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('rejects a missing or wrong secret', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer wrong'))).status).toBe(401);
    expect(listFikaUsers).not.toHaveBeenCalled();
  });

  it('returns 500 when Supabase or Fika configuration is missing', async () => {
    Reflect.deleteProperty(process.env, 'SUPABASE_SECRET_KEY');
    expect((await GET(request('Bearer cron'))).status).toBe(500);
    process.env.SUPABASE_SECRET_KEY = 'sk';
    Reflect.deleteProperty(process.env, 'FIKA_ACTION_SECRET');
    const res = await GET(request('Bearer cron'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Fika not configured' });
  });

  it('runs every user, counts outcomes, and isolates a thrown failure', async () => {
    vi.mocked(runFikaForUser)
      .mockResolvedValueOnce({ status: 'sent', batchId: 'b1', itemCount: 2 })
      .mockResolvedValueOnce({ status: 'skipped', reason: 'before_window' })
      .mockResolvedValueOnce({ status: 'empty' })
      .mockResolvedValueOnce({ status: 'send_failed', batchId: 'b4', attempts: 1, message: 'Resend responded 500' })
      .mockRejectedValueOnce(new Error('db down'));

    const res = await GET(request('Bearer cron'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, skipped: 1, empty: 1, sendFailed: 1, failed: 1 });
    expect(runFikaForUser).toHaveBeenCalledTimes(5);
    const [db, user, deps] = vi.mocked(runFikaForUser).mock.calls[0];
    expect(db).toEqual({ tag: 'db' });
    expect(user).toEqual(users[0]);
    expect(deps).toMatchObject({ actionSecret: 'as', siteUrl: 'https://app.test', fromEmail: 'fika@x', resendApiKey: 'rk' });
    expect(deps.now).toBeInstanceOf(Date);
  });

  it('falls back to the production site url', async () => {
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SITE_URL');
    vi.mocked(listFikaUsers).mockResolvedValue([users[0]]);
    vi.mocked(runFikaForUser).mockResolvedValue({ status: 'skipped', reason: 'fika_off' });
    await GET(request('Bearer cron'));
    expect(vi.mocked(runFikaForUser).mock.calls[0][2].siteUrl).toBe('https://ansible.hultberg.org');
  });

  it('stops early when the time budget is exhausted', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(runFikaForUser).mockImplementation(async () => {
        vi.advanceTimersByTime(15 * 60 * 1000); // the first run overruns the budget
        return { status: 'skipped', reason: 'fika_off' };
      });
      const res = await GET(request('Bearer cron'));
      expect(await res.json()).toEqual({ sent: 0, skipped: 1, empty: 0, sendFailed: 0, failed: 0 });
      expect(runFikaForUser).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 500 when listing users fails', async () => {
    vi.mocked(listFikaUsers).mockRejectedValue(new Error('query failed'));
    const res = await GET(request('Bearer cron'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'query failed' });
  });
});
