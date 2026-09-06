// ABOUT: Hourly cron handler for the Fika email
// ABOUT: Same shape as auto-sync: CRON_SECRET auth, service-role client, per-user try/catch, time budget

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFikaUsers } from '@/lib/fika/store';
import { runFikaForUser } from '@/lib/fika/run';

const MAX_EXECUTION_TIME = 14 * 60 * 1000;

/**
 * GET /api/cron/fika
 *
 * For every user with Fika on, decides whether this tick is their send moment and sends.
 * Sending once per local day inside a window after fika_hour, with retries, is decided in
 * `shouldSend`; this handler is only the loop.
 *
 * Authentication: CRON_SECRET bearer header (called by workers/cron.ts)
 *
 * Response:
 * - 200: { sent, skipped, empty, sendFailed, failed }
 * - 401: Invalid CRON_SECRET
 * - 500: Missing configuration
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('[Cron Fika] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const actionSecret = process.env.FIKA_ACTION_SECRET;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ansible.hultberg.org';

    if (!supabaseUrl || !supabaseSecretKey) {
      console.error('[Cron Fika] Supabase credentials not configured');
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    if (!resendApiKey || !fromEmail || !actionSecret) {
      console.error('[Cron Fika] RESEND_API_KEY, RESEND_FROM_EMAIL or FIKA_ACTION_SECRET not configured');
      return NextResponse.json({ error: 'Fika not configured' }, { status: 500 });
    }

    const db = createClient(supabaseUrl, supabaseSecretKey);
    const users = await listFikaUsers(db);
    console.log(`[Cron Fika] ${users.length} users with Fika on`);

    const startedAt = Date.now();
    const counts = { sent: 0, skipped: 0, empty: 0, sendFailed: 0, failed: 0 };

    for (const user of users) {
      if (Date.now() - startedAt > MAX_EXECUTION_TIME) {
        console.warn('[Cron Fika] Approaching timeout limit, stopping early');
        break;
      }
      try {
        const outcome = await runFikaForUser(db, user, {
          now: new Date(),
          actionSecret,
          siteUrl,
          fromEmail,
          resendApiKey,
        });
        switch (outcome.status) {
          case 'sent':
            counts.sent++;
            console.log(`[Cron Fika] Sent batch ${outcome.batchId} (${outcome.itemCount} items) to user ${user.id}`);
            break;
          case 'skipped':
            counts.skipped++;
            break;
          case 'empty':
            counts.empty++;
            break;
          case 'send_failed':
            counts.sendFailed++;
            console.error(`[Cron Fika] Send failed for user ${user.id} (attempt ${outcome.attempts}): ${outcome.message}`);
            break;
        }
      } catch (error) {
        counts.failed++;
        console.error(`[Cron Fika] Run failed for user ${user.id}:`, error);
      }
    }

    console.log('[Cron Fika] Completed:', counts);
    return NextResponse.json(counts);
  } catch (error) {
    console.error('[Cron Fika] Unexpected error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
