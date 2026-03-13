// ABOUT: API endpoint to sync unread items from Readwise Reader
// ABOUT: Fetches items, stores in database, enqueues processing jobs

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { fetchUnreadItems } from '@/lib/reader-api';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get Reader API token from environment
    const readerApiToken = process.env.READER_API_TOKEN;
    if (!readerApiToken) {
      console.error('[Sync] READER_API_TOKEN not configured');
      return NextResponse.json(
        { error: 'Reader API not configured' },
        { status: 500 }
      );
    }

    // Generate sync ID
    const syncId = crypto.randomUUID();

    // Create sync_log entry
    const { error: syncLogError } = await supabase.from('sync_log').insert({
      id: syncId,
      user_id: userId,
      sync_type: 'reader_fetch',
      items_fetched: 0,
      items_created: 0,
      started_at: new Date().toISOString(),
    });

    if (syncLogError) {
      console.error('[Sync] Failed to create sync_log:', syncLogError);
      return NextResponse.json(
        { error: 'Failed to start sync operation' },
        { status: 500 }
      );
    }

    console.log(`[Sync] Starting sync ${syncId} for user ${userId}`);

    // Fetch items with pagination
    let pageCursor: string | null | undefined = null;
    let totalFetched = 0;
    let totalCreated = 0;
    const errors: any[] = [];

    try {
      const { env } = getCloudflareContext();

      do {
        const response = await fetchUnreadItems(
          readerApiToken,
          pageCursor || undefined
        );

        for (const item of response.results) {
          try {
            // Upsert reader_item (prevents duplicates)
            const { data: readerItem, error: itemError } = await supabase
              .from('reader_items')
              .upsert(
                {
                  user_id: userId,
                  reader_id: item.id,
                  title: item.title,
                  url: item.url,
                  author: item.author || null,
                  source: item.source || null,
                  content_type: item.content_type || null,
                  created_at: item.created_at,
                  // short_summary and tags will be added by queue consumer in Phase 4
                },
                {
                  onConflict: 'user_id,reader_id',
                  ignoreDuplicates: false,
                }
              )
              .select()
              .single();

            if (itemError) {
              console.error('[Sync] Failed to insert item:', itemError);
              errors.push({
                reader_id: item.id,
                title: item.title,
                error: itemError.message,
              });
              continue;
            }

            // Create processing job
            const { data: job, error: jobError } = await supabase
              .from('processing_jobs')
              .insert({
                user_id: userId,
                reader_item_id: readerItem.id,
                sync_log_id: syncId,
                job_type: 'summary_generation',
                status: 'pending',
              })
              .select()
              .single();

            if (jobError) {
              console.error('[Sync] Failed to create job:', jobError);
              errors.push({
                reader_id: item.id,
                title: item.title,
                error: jobError.message,
              });
              continue;
            }

            // Enqueue message
            try {
              await env.PROCESSING_QUEUE.send({
                jobId: job.id,
                userId: userId,
                readerItemId: readerItem.id,
                jobType: 'summary_generation',
                payload: {
                  title: item.title,
                  author: item.author,
                  content: item.content,
                  url: item.url,
                },
              });

              totalCreated++;
            } catch (queueError) {
              console.error('[Sync] Failed to enqueue job:', queueError);
              errors.push({
                reader_id: item.id,
                title: item.title,
                error: 'Failed to enqueue processing job',
              });
            }
          } catch (itemProcessError) {
            console.error('[Sync] Error processing item:', itemProcessError);
            errors.push({
              reader_id: item.id,
              title: item.title,
              error:
                itemProcessError instanceof Error
                  ? itemProcessError.message
                  : 'Unknown error',
            });
          }
        }

        totalFetched += response.results.length;
        pageCursor = response.nextPageCursor;

        console.log(
          `[Sync] Fetched ${response.results.length} items` +
            (pageCursor ? ', continuing pagination...' : ', complete')
        );
      } while (pageCursor);

      // Update sync_log with totals
      const { error: updateError } = await supabase
        .from('sync_log')
        .update({
          items_fetched: totalFetched,
          items_created: totalCreated,
          completed_at: new Date().toISOString(),
          errors: errors.length > 0 ? errors : null,
        })
        .eq('id', syncId);

      if (updateError) {
        console.error('[Sync] Failed to update sync_log:', updateError);
      }

      console.log(
        `[Sync] Completed sync ${syncId}: ${totalFetched} fetched, ${totalCreated} created, ${errors.length} errors`
      );

      return NextResponse.json({
        syncId,
        totalItems: totalCreated,
        totalFetched,
        errors: errors.length > 0 ? errors.length : undefined,
      });
    } catch (syncError) {
      console.error('[Sync] Sync operation failed:', syncError);

      // Update sync_log with error
      await supabase
        .from('sync_log')
        .update({
          items_fetched: totalFetched,
          items_created: totalCreated,
          completed_at: new Date().toISOString(),
          errors: [
            ...errors,
            {
              error:
                syncError instanceof Error
                  ? syncError.message
                  : 'Unknown sync error',
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .eq('id', syncId);

      return NextResponse.json(
        {
          error: 'Sync operation failed',
          syncId,
          totalFetched,
          totalCreated,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Sync] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
