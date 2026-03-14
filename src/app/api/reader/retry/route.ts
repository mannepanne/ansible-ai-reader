// ABOUT: API endpoint to retry failed processing jobs
// ABOUT: Re-enqueues failed jobs for a given sync operation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * POST /api/reader/retry
 *
 * Retries failed processing jobs from a sync operation.
 * Resets job status to 'pending' and re-enqueues to PROCESSING_QUEUE.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - syncId: UUID of the sync operation
 *
 * Response:
 * - 200: { retriedCount: number }
 * - 400: Missing or invalid syncId
 * - 401: Not authenticated
 * - 404: Sync not found
 * - 500: Retry failed
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse request body
    const body = (await request.json()) as { syncId?: string };
    const { syncId } = body;

    if (!syncId) {
      return NextResponse.json(
        { error: 'Missing syncId parameter' },
        { status: 400 }
      );
    }

    // Verify sync belongs to user
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_log')
      .select('id')
      .eq('id', syncId)
      .eq('user_id', userId)
      .single();

    if (syncLogError || !syncLog) {
      return NextResponse.json({ error: 'Sync not found' }, { status: 404 });
    }

    // Get all failed jobs for this sync
    const { data: failedJobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('id, reader_item_id, job_type')
      .eq('sync_log_id', syncId)
      .eq('user_id', userId)
      .eq('status', 'failed');

    if (jobsError) {
      console.error('[Retry] Failed to fetch failed jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch failed jobs' },
        { status: 500 }
      );
    }

    if (!failedJobs || failedJobs.length === 0) {
      return NextResponse.json({ retriedCount: 0 });
    }

    // Get Cloudflare context for queue
    const { env } = getCloudflareContext();

    let retriedCount = 0;

    // Retry each failed job
    for (const job of failedJobs) {
      try {
        // Get reader item details
        const { data: readerItem } = await supabase
          .from('reader_items')
          .select('title, author, content, url')
          .eq('id', job.reader_item_id)
          .single();

        if (!readerItem) {
          console.error('[Retry] Reader item not found:', job.reader_item_id);
          continue;
        }

        // Reset job status to pending (increment retry_count is handled by trigger)
        const { error: updateError } = await supabase
          .from('processing_jobs')
          .update({
            status: 'pending',
            error_message: null,
          })
          .eq('id', job.id);

        if (updateError) {
          console.error('[Retry] Failed to update job:', updateError);
          continue;
        }

        // Re-enqueue to PROCESSING_QUEUE
        await env.PROCESSING_QUEUE.send({
          jobId: job.id,
          userId: userId,
          readerItemId: job.reader_item_id,
          jobType: job.job_type,
          payload: {
            title: readerItem.title,
            author: readerItem.author,
            content: readerItem.content,
            url: readerItem.url,
          },
        });

        retriedCount++;
        console.log('[Retry] Re-enqueued job:', job.id);
      } catch (error) {
        console.error('[Retry] Failed to retry job:', job.id, error);
        // Continue with next job
      }
    }

    console.log(`[Retry] Successfully retried ${retriedCount} jobs for sync ${syncId}`);
    return NextResponse.json({ retriedCount });
  } catch (error) {
    console.error('[Retry] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
