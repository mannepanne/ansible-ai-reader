// ABOUT: API endpoint to sync unread items from Readwise Reader
// ABOUT: Fetches items, stores in database, enqueues processing jobs

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { performSyncForUser } from '@/lib/sync-operations';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Note: Using Node.js runtime (nodejs_compat) instead of edge runtime
// OpenNext requires edge runtime functions to be defined separately

/**
 * POST /api/reader/sync
 *
 * Fetches unread items from Readwise Reader and enqueues them for processing.
 * Returns immediately with syncId for status polling.
 *
 * Authentication: Required (session check)
 *
 * Response:
 * - 200: { syncId, totalItems }
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Get Reader API token from environment
    const readerApiToken = process.env.READER_API_TOKEN;
    if (!readerApiToken) {
      console.error('[Sync] READER_API_TOKEN not configured');
      return NextResponse.json(
        { error: 'Reader API not configured' },
        { status: 500 }
      );
    }

    // Get Cloudflare context (queue binding)
    let cloudflareEnv: { PROCESSING_QUEUE?: any } | undefined;
    try {
      cloudflareEnv = getCloudflareContext().env;
    } catch (error) {
      // Local dev mode - queue not available, consumer will poll database
      cloudflareEnv = undefined;
    }

    // Perform sync using shared logic
    const result = await performSyncForUser(supabase, {
      userId,
      triggeredBy: 'manual',
      readerApiToken,
      cloudflareEnv,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Sync] Unexpected error:', error);

    // Extract error message for user-friendly response
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
