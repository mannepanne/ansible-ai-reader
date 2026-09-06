// ABOUT: Tests for the cron worker
// ABOUT: Both endpoints are called with the secret, and one failure never suppresses the other

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { CRON_ENDPOINTS } from './cron';

const env = { CRON_SECRET: 'cron-secret' };
const event = { cron: '0 * * * *' } as ScheduledEvent;
const ctx = {} as ExecutionContext;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function fail(status: number, text: string) {
  return { ok: false, status, json: async () => ({}), text: async () => text } as Response;
}

describe('cron worker', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('calls auto-sync and fika with the bearer secret', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ done: true }));

    await worker.scheduled(event, env, ctx);

    expect(CRON_ENDPOINTS).toEqual(['/api/cron/auto-sync', '/api/cron/fika']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(1, 'https://ansible.hultberg.org/api/cron/auto-sync', {
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://ansible.hultberg.org/api/cron/fika', {
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
    });
  });

  it('starts both endpoints without waiting for the first to finish', async () => {
    let resolveSync!: (r: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveSync = resolve)))
      .mockResolvedValueOnce(ok({ sent: 1 }));

    const run = worker.scheduled(event, env, ctx);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2); // fika was requested while auto-sync is still pending
    resolveSync(ok({ synced: 1 }));
    await run;
  });

  it('still calls fika when auto-sync fails, then throws with the failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fail(500, 'sync broke')).mockResolvedValueOnce(ok({ sent: 1 }));

    await expect(worker.scheduled(event, env, ctx)).rejects.toThrow('/api/cron/auto-sync: API returned 500: sync broke');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports every failure, including thrown network errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNRESET')).mockRejectedValueOnce('odd');

    await expect(worker.scheduled(event, env, ctx)).rejects.toThrow(
      'Cron endpoints failed: /api/cron/auto-sync: ECONNRESET; /api/cron/fika: odd'
    );
  });
});
