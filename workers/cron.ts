// ABOUT: Cloudflare Workers cron handler for automated syncing
// ABOUT: Calls the Next.js API endpoint with CRON_SECRET authentication

interface Env {
  CRON_SECRET: string;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('[Cron Worker] Scheduled event triggered:', event.cron);

    try {
      // Call the Next.js API endpoint
      const response = await fetch('https://ansible.hultberg.org/api/cron/auto-sync', {
        method: 'GET',
        headers: {
          'x-cron-secret': env.CRON_SECRET,
        },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      console.log('[Cron Worker] Auto-sync completed:', result);
    } catch (error) {
      console.error('[Cron Worker] Failed to trigger auto-sync:', error);
      throw error; // Re-throw to mark the cron execution as failed
    }
  },
};
