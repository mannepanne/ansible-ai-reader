// ABOUT: Cloudflare Workers cron handler for scheduled jobs (auto-sync, Fika email)
// ABOUT: Calls each Next.js cron endpoint independently with CRON_SECRET authentication

interface Env {
  CRON_SECRET: string;
}

const BASE_URL = 'https://ansible.hultberg.org';

/** Each endpoint runs independently and concurrently; one failure never suppresses the others */
export const CRON_ENDPOINTS = ['/api/cron/auto-sync', '/api/cron/fika'] as const;

async function trigger(path: string, env: Env): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${env.CRON_SECRET}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('[Cron Worker] Scheduled event triggered:', event.cron);

    // Concurrent, not serial: the jobs touch different tables and Fika has a hard send window, so a
    // slow or hanging sync must not delay it. Failures are isolated per endpoint and reported together.
    const results = await Promise.allSettled(CRON_ENDPOINTS.map((path) => trigger(path, env)));
    const failures: string[] = [];
    results.forEach((result, i) => {
      const path = CRON_ENDPOINTS[i];
      if (result.status === 'fulfilled') {
        console.log(`[Cron Worker] ${path} completed:`, result.value);
      } else {
        console.error(`[Cron Worker] ${path} failed:`, result.reason);
        failures.push(`${path}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    });

    // Re-throw after every endpoint has had its turn, so the cron execution is marked failed
    if (failures.length > 0) {
      throw new Error(`Cron endpoints failed: ${failures.join('; ')}`);
    }
  },
};
