// ABOUT: API endpoint to retry failed processing jobs
// ABOUT: Re-enqueues failed jobs for sync or tag regeneration operations

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * POST /api/reader/retry
 *
 * Retries failed processing jobs from a sync or regenerate tags operation.
 * Resets job status to 'pending' and re-enqueues to PROCESSING_QUEUE.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - syncId?: UUID of the sync operation
 * - regenerateId?: UUID of the regenerate tags operation
 * (Exactly one must be provided)
 *
 * Response:
 * - 200: { retriedCount: number }
 * - 400: Missing or invalid parameters
 * - 401: Not authenticated
 * - 404: Operation not found
 * - 500: Retry failed
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

    // Parse request body
    const body = (await request.json()) as { syncId?: string; regenerateId?: string };
    const { syncId, regenerateId } = body;

    if (!syncId && !regenerateId) {
      return NextResponse.json(
        { error: 'Missing syncId or regenerateId parameter' },
        { status: 400 }
      );
    }

    if (syncId && regenerateId) {
      return NextResponse.json(
        { error: 'Provide either syncId or regenerateId, not both' },
        { status: 400 }
      );
    }

    let failedJobs;
    let jobsError;

    // Handle sync retry
    if (syncId) {
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
      const result = await supabase
        .from('processing_jobs')
        .select('id, reader_item_id, job_type')
        .eq('sync_log_id', syncId)
        .eq('user_id', userId)
        .eq('status', 'failed');

      failedJobs = result.data;
      jobsError = result.error;
    }
    // Handle regenerate tags retry
    else if (regenerateId) {
      // Get all failed jobs for this regeneration batch
      const result = await supabase
        .from('processing_jobs')
        .select('id, reader_item_id, job_type')
        .eq('regenerate_batch_id', regenerateId)
        .eq('user_id', userId)
        .eq('status', 'failed');

      failedJobs = result.data;
      jobsError = result.error;

      // Verify batch exists (at least some jobs found)
      if (!failedJobs || failedJobs.length === 0) {
        // Check if any jobs exist for this batch (to distinguish between "no failed jobs" vs "batch not found")
        const { data: anyJobs } = await supabase
          .from('processing_jobs')
          .select('id')
          .eq('regenerate_batch_id', regenerateId)
          .eq('user_id', userId)
          .limit(1);

        if (!anyJobs || anyJobs.length === 0) {
          return NextResponse.json({ error: 'Regeneration batch not found' }, { status: 404 });
        }
      }
    }

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
        // Get reader_id for fetching content from Reader API in Phase 4
        const { data: readerItem } = await supabase
          .from('reader_items')
          .select('reader_id')
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
        // Phase 4 consumer will fetch content from Reader API when generating summary
        await env.PROCESSING_QUEUE.send({
          jobId: job.id,
          userId: userId,
          readerItemId: job.reader_item_id,
          readerId: readerItem.reader_id,
          jobType: job.job_type,
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
