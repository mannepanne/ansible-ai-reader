// ABOUT: Cloudflare Workers cron handler for scheduled jobs (auto-sync, Fika email)
// ABOUT: Calls each Next.js cron endpoint independently with CRON_SECRET authentication

interface Env {
  CRON_SECRET: string;
}

const BASE_URL = 'https://ansible.hultberg.org';

/** Each endpoint runs in its own try/catch so one failure never suppresses the others */
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

    const failures: string[] = [];
    for (const path of CRON_ENDPOINTS) {
      try {
        const result = await trigger(path, env);
        console.log(`[Cron Worker] ${path} completed:`, result);
      } catch (error) {
        console.error(`[Cron Worker] ${path} failed:`, error);
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Re-throw after every endpoint has had its turn, so the cron execution is marked failed
    if (failures.length > 0) {
      throw new Error(`Cron endpoints failed: ${failures.join('; ')}`);
    }
  },
};
