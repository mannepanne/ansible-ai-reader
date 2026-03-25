// ABOUT: Cron handler for automated scheduled syncing
// ABOUT: Runs hourly, checks each user's sync_interval, syncs if interval elapsed

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performSyncForUser } from '@/lib/sync-operations';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Note: Using Node.js runtime (nodejs_compat) instead of edge runtime
// OpenNext requires edge runtime functions to be defined separately

/**
 * GET /api/cron/auto-sync
 *
 * Hourly cron job that checks each user's sync_interval and performs
 * automated syncs for users whose interval has elapsed.
 *
 * Authentication: CRON_SECRET header (Cloudflare Cron Trigger)
 *
 * Response:
 * - 200: { synced, skipped, failed } - Counts of users processed
 * - 401: Invalid CRON_SECRET
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate with CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedSecret) {
      console.error('[Cron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron] Auto-sync job started');

    // 2. Validate required environment variables
    const readerApiToken = process.env.READER_API_TOKEN;
    if (!readerApiToken) {
      console.error('[Cron] READER_API_TOKEN not configured');
      return NextResponse.json(
        { error: 'Reader API not configured' },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      console.error('[Cron] Supabase credentials not configured');
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    // 3. Create service-role Supabase client (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    // 4. Get Cloudflare context (queue binding)
    let cloudflareEnv: { PROCESSING_QUEUE?: any } | undefined;
    try {
      cloudflareEnv = getCloudflareContext().env;
    } catch (error) {
      // Local dev mode - queue not available
      console.log('[Cron] Running in local dev mode (no queue)');
      cloudflareEnv = undefined;
    }

    // 5. Query users with auto-sync enabled
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, sync_interval, last_auto_sync_at')
      .gt('sync_interval', 0);

    if (usersError) {
      console.error('[Cron] Failed to query users:', usersError);
      return NextResponse.json(
        { error: 'Failed to query users' },
        { status: 500 }
      );
    }

    console.log(`[Cron] Found ${users?.length || 0} users with auto-sync enabled`);

    // 6. Process each user
    const now = new Date();
    const START_TIME = Date.now();
    const MAX_EXECUTION_TIME = 14 * 60 * 1000; // 14 minutes (buffer under 15min limit)

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    let timestampFailures = 0;

    for (const user of users || []) {
      // Check timeout to avoid hitting Cloudflare Workers limits
      if (Date.now() - START_TIME > MAX_EXECUTION_TIME) {
        console.warn('[Cron] Approaching timeout limit, stopping early');
        break;
      }
      try {
        // Calculate hours since last sync
        const lastSync = user.last_auto_sync_at
          ? new Date(user.last_auto_sync_at)
          : null;

        const hoursSinceSync = lastSync
          ? (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60)
          : Infinity; // First sync - treat as elapsed

        // Check if sync needed
        if (hoursSinceSync >= user.sync_interval) {
          console.log(
            `[Cron] Syncing user ${user.id} (${user.email}) - ` +
            `interval: ${user.sync_interval}h, last sync: ${lastSync ? lastSync.toISOString() : 'never'}`
          );

          // Perform sync
          await performSyncForUser(supabase, {
            userId: user.id,
            triggeredBy: 'cron',
            readerApiToken,
            cloudflareEnv,
          });

          // Update last_auto_sync_at
          const { error: updateError } = await supabase
            .from('users')
            .update({ last_auto_sync_at: now.toISOString() })
            .eq('id', user.id);

          if (updateError) {
            console.error(
              `[Cron] Failed to update last_auto_sync_at for user ${user.id}:`,
              updateError
            );
            // Track timestamp failures separately - sync succeeded but timestamp didn't update
            timestampFailures++;
          }

          synced++;
        } else {
          console.log(
            `[Cron] Skipping user ${user.id} (${user.email}) - ` +
            `interval: ${user.sync_interval}h, hours since sync: ${hoursSinceSync.toFixed(1)}h`
          );
          skipped++;
        }
      } catch (error) {
        console.error(`[Cron] Sync failed for user ${user.id}:`, error);
        failed++;
        // Continue to next user - don't let one failure stop the entire job
      }
    }

    const result = { synced, skipped, failed, timestampFailures };
    console.log('[Cron] Auto-sync job completed:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Cron] Unexpected error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
