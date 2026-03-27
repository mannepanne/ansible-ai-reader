// ABOUT: API endpoint to regenerate tags for items with summaries but missing tags
// ABOUT: Finds items with summaries but empty/null tags and requeues them for processing

import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST() {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Find items with summaries but no tags (for this user only)
    const { data: itemsWithoutTags, error: queryError } = await supabase
      .from('reader_items')
      .select('id, reader_id, title')
      .eq('user_id', userId)
      .not('short_summary', 'is', null)
      .or('tags.is.null,tags.eq.{}');

    if (queryError) {
      console.error('[RegenerateTags] Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to query items' },
        { status: 500 }
      );
    }

    if (!itemsWithoutTags || itemsWithoutTags.length === 0) {
      return NextResponse.json({
        message: 'No items need tag regeneration',
        count: 0,
      });
    }

    console.log(
      `[RegenerateTags] Found ${itemsWithoutTags.length} items without tags`
    );

    // Check if we're in Cloudflare Workers runtime (production) or local dev
    let cloudflareEnv: { PROCESSING_QUEUE?: any } | null = null;
    try {
      cloudflareEnv = getCloudflareContext().env;
    } catch (error) {
      // Local dev mode - queue not available
    }

    let jobsCreated = 0;
    const errors: any[] = [];

    // Create processing jobs and enqueue
    for (const item of itemsWithoutTags) {
      try {
        // Create processing job
        // TODO: Optimize to avoid regenerating summary (wasteful API usage - see TD-002)
        // This implementation uses 'summary_generation' job type which regenerates
        // both summary AND tags. Since summary exists, we waste ~80% of API credits.
        // See REFERENCE/technical-debt.md TD-002 for cost analysis and future fix options.
        const { data: job, error: jobError } = await supabase
          .from('processing_jobs')
          .insert({
            user_id: userId,
            reader_item_id: item.id,
            sync_log_id: null, // Not part of a sync operation
            job_type: 'summary_generation', // Re-generates BOTH summary and tags (inefficient)
            status: 'pending',
          })
          .select()
          .single();

        if (jobError) {
          console.error('[RegenerateTags] Failed to create job:', jobError);
          errors.push({
            item_id: item.id,
            title: item.title,
            error: jobError.message,
          });
          continue;
        }

        // Enqueue message (only in production with Cloudflare Queue)
        if (cloudflareEnv?.PROCESSING_QUEUE) {
          try {
            await cloudflareEnv.PROCESSING_QUEUE.send({
              jobId: job.id,
              userId: userId,
              readerItemId: item.id,
              readerId: item.reader_id,
              jobType: 'summary_generation',
            });

            jobsCreated++;
          } catch (queueError) {
            console.error('[RegenerateTags] Failed to enqueue job:', queueError);
            errors.push({
              item_id: item.id,
              title: item.title,
              error: 'Failed to enqueue processing job',
            });
          }
        } else {
          // Local dev: just count the job as created
          console.log(`[RegenerateTags] Job created (local dev): ${job.id}`);
          jobsCreated++;
        }
      } catch (itemError) {
        console.error('[RegenerateTags] Error processing item:', itemError);
        errors.push({
          item_id: item.id,
          title: item.title,
          error:
            itemError instanceof Error ? itemError.message : 'Unknown error',
        });
      }
    }

    console.log(
      `[RegenerateTags] Queued ${jobsCreated} items for tag regeneration` +
        (errors.length > 0 ? ` (${errors.length} errors)` : '')
    );

    return NextResponse.json({
      message: `Queued ${jobsCreated} items for tag regeneration`,
      count: jobsCreated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[RegenerateTags] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
