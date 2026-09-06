// ABOUT: Shared sync logic for both manual and automated (cron) syncing
// ABOUT: Fetches unread items from Reader API, creates processing jobs, enqueues to Cloudflare Queue, and mirrors archive state

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUnreadItems, fetchRecentlyArchivedItems } from './reader-api';
import { evaluateRelayTriggers, type RelayOrchestratorLike } from './relay/engagement-trigger';

export interface PerformSyncOptions {
  userId: string;
  triggeredBy: 'manual' | 'cron';
  readerApiToken: string;
  cloudflareEnv?: { PROCESSING_QUEUE?: any; RELAY_ORCHESTRATOR?: RelayOrchestratorLike };
}

export interface PerformSyncResult {
  syncId: string;
  totalItems: number;
  totalFetched: number;
  itemsArchived: number;
  errors?: number;
}

/**
 * Performs a sync operation for a specific user.
 * Used by both manual sync endpoint (session auth) and cron endpoint (service role auth).
 *
 * @param supabase - Supabase client (session-based or service-role)
 * @param options - Sync parameters including userId, triggeredBy, and API credentials
 * @returns Sync result with counts and syncId for status polling
 */
export async function performSyncForUser(
  supabase: SupabaseClient,
  options: PerformSyncOptions
): Promise<PerformSyncResult> {
  const { userId, triggeredBy, readerApiToken, cloudflareEnv } = options;

  // Generate sync ID
  const syncId = crypto.randomUUID();

  // Create sync_log entry
  const { error: syncLogError } = await supabase.from('sync_log').insert({
    id: syncId,
    user_id: userId,
    sync_type: 'reader_fetch',
    triggered_by: triggeredBy,
    items_fetched: 0,
    items_created: 0,
    started_at: new Date().toISOString(),
  });

  if (syncLogError) {
    console.error('[SyncOps] Failed to create sync_log:', syncLogError);
    throw new Error(`Failed to start sync operation: ${syncLogError.message}`);
  }

  console.log(
    `[SyncOps] Starting sync ${syncId} for user ${userId} (triggered by: ${triggeredBy})`
  );

  // Fetch items with pagination
  let pageCursor: string | null | undefined = null;
  let totalFetched = 0;
  let totalCreated = 0;
  let totalArchived = 0;
  const errors: any[] = [];

  try {
    do {
      const response = await fetchUnreadItems(
        readerApiToken,
        pageCursor || undefined
      );

      for (const item of response.results) {
        try {
          // Upsert reader_item (prevents duplicates)
          // Store only metadata - Reader API is source of truth for content
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
                word_count: item.word_count || null,
                created_at: item.created_at,
              },
              {
                onConflict: 'user_id,reader_id',
                ignoreDuplicates: false,
              }
            )
            .select()
            .single();

          if (itemError) {
            console.error('[SyncOps] Failed to insert item:', itemError);
            errors.push({
              reader_id: item.id,
              title: item.title,
              error: itemError.message,
            });
            continue;
          }

          // Skip job creation if summary already exists
          if (readerItem.short_summary) {
            console.log(
              `[SyncOps] Skipping job for item ${item.id} - summary already exists`
            );
            continue;
          }

          // Skip items archived locally (e.g. auto-archived because they have no
          // content). They may still sit in Reader's unread list, so without this
          // guard every sync would re-enqueue a doomed summary job for them.
          if (readerItem.archived_at) {
            console.log(
              `[SyncOps] Skipping job for item ${item.id} - archived locally`
            );
            continue;
          }

          // Create processing job
          const { data: job, error: jobError} = await supabase
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
            console.error('[SyncOps] Failed to create job:', jobError);
            errors.push({
              reader_id: item.id,
              title: item.title,
              error: jobError.message,
            });
            continue;
          }

          // Enqueue message (only in production with Cloudflare Queue)
          // In local dev, consumer will poll database for pending jobs
          if (cloudflareEnv?.PROCESSING_QUEUE) {
            try {
              await cloudflareEnv.PROCESSING_QUEUE.send({
                jobId: job.id,
                userId: userId,
                readerItemId: readerItem.id,
                readerId: item.id,
                jobType: 'summary_generation',
              });

              totalCreated++;
            } catch (queueError) {
              console.error('[SyncOps] Failed to enqueue job:', queueError);
              errors.push({
                reader_id: item.id,
                title: item.title,
                error: 'Failed to enqueue processing job',
              });
            }
          } else {
            // Local dev: just count the job as created (consumer will poll DB)
            console.log(`[SyncOps] Job created (local dev): ${job.id}`);
            totalCreated++;
          }
        } catch (itemProcessError) {
          console.error('[SyncOps] Error processing item:', itemProcessError);
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
        `[SyncOps] Fetched ${response.results.length} items` +
          (pageCursor ? ', continuing pagination...' : ', complete')
      );
    } while (pageCursor);

    // Step 2: Archive sync — mirror Reader archive state to Ansible
    // Runs after unread fetch; failures are non-fatal and logged but do not abort sync.
    try {
      // Determine lookback window: since the last completed sync for this user,
      // or 30 days for first-time users who may have archived items before using Ansible.
      const { data: lastSync } = await supabase
        .from('sync_log')
        .select('started_at')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const updatedAfter = lastSync?.started_at ?? thirtyDaysAgo;

      // Collect all recently archived items with the signal fields the Relay trigger needs,
      // paginating if needed. highlights_count + notes already arrive on the archive response
      // (validated in ArchivedReaderItemSchema) — sync used to discard them; 2.3b retains them.
      const allArchivedItems: Array<{
        id: string;
        updated_at: string;
        highlights_count: number;
        reader_note: string | null;
      }> = [];
      let archiveCursor: string | null | undefined = null;

      do {
        const archiveResponse = await fetchRecentlyArchivedItems(
          readerApiToken,
          updatedAfter,
          archiveCursor || undefined
        );
        allArchivedItems.push(
          ...archiveResponse.results.map((item) => ({
            id: item.id,
            updated_at: item.updated_at,
            highlights_count: item.highlights_count ?? 0,
            reader_note: item.notes ?? null,
          }))
        );
        archiveCursor = archiveResponse.nextPageCursor;
      } while (archiveCursor);

      if (allArchivedItems.length > 0) {
        // Map reader_id → the archive-time metadata (updated_at is the actual archive time; the
        // signal fields feed the Relay engagement filter in the trigger-eval phase below).
        const archivedMetaMap = new Map(
          allArchivedItems.map((item) => [item.id, item])
        );

        // Batch SELECT: find which of these items exist locally and are not yet archived
        const { data: localItems, error: selectError } = await supabase
          .from('reader_items')
          .select('id, reader_id')
          .eq('user_id', userId)
          .in('reader_id', Array.from(archivedMetaMap.keys()))
          .is('archived_at', null);

        if (selectError) {
          console.error('[SyncOps] Archive sync SELECT failed:', selectError);
          errors.push({ error: `Archive sync failed: ${selectError.message}` });
        } else if (localItems && localItems.length > 0) {
          // Update each item individually to preserve its Reader archive timestamp. relay_triggered_at
          // is left NULL so the trigger-eval phase picks the item up (the migration baselined history).
          for (const localItem of localItems) {
            const meta = archivedMetaMap.get(localItem.reader_id);
            const archivedAt = meta?.updated_at ?? new Date().toISOString();
            const { error: updateError } = await supabase
              .from('reader_items')
              .update({
                archived: true,
                archived_at: archivedAt,
                archive_reason: 'user',
                highlights_count: meta?.highlights_count ?? 0,
                reader_note: meta?.reader_note ?? null,
              })
              .eq('id', localItem.id);

            if (updateError) {
              console.error(
                `[SyncOps] Archive sync update failed for item ${localItem.id}:`,
                updateError
              );
            } else {
              totalArchived++;
            }
          }
          console.log(`[SyncOps] Archive sync: ${totalArchived} items archived`);
        }
      } else {
        console.log('[SyncOps] Archive sync: no new archived items found');
      }
    } catch (archiveSyncError) {
      console.error('[SyncOps] Archive sync failed (non-fatal):', archiveSyncError);
      errors.push({
        error: `Archive sync failed: ${archiveSyncError instanceof Error ? archiveSyncError.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Step 3: Relay engagement trigger-eval — the final phase (after unread + archive steps).
    // Owner-scoped + self-healing: no-ops for every user except Relay's owner and unless the operator
    // enable-toggle is on. Non-fatal, mirroring archive-sync: a failure here must not abort the sync.
    try {
      const relayResult = await evaluateRelayTriggers({
        supabase,
        userId,
        ownerId: process.env.RELAY_OWNER_USER_ID,
        orchestrator: cloudflareEnv?.RELAY_ORCHESTRATOR,
      });
      if (!relayResult.skipped) {
        console.log(
          `[SyncOps] Relay trigger-eval: scanned ${relayResult.scanned}, enqueued ${relayResult.enqueued}, ` +
            `skipped ${relayResult.skippedItems}, deferred ${relayResult.deferred}`
        );
      }
    } catch (relayError) {
      console.error('[SyncOps] Relay trigger-eval failed (non-fatal):', relayError);
      errors.push({
        error: `Relay trigger-eval failed: ${relayError instanceof Error ? relayError.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      });
    }

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
      console.error('[SyncOps] Failed to update sync_log:', updateError);
    }

    console.log(
      `[SyncOps] Completed sync ${syncId}: ${totalFetched} fetched, ${totalCreated} created, ${errors.length} errors`
    );

    return {
      syncId,
      totalItems: totalCreated,
      totalFetched,
      itemsArchived: totalArchived,
      errors: errors.length > 0 ? errors.length : undefined,
    };
  } catch (syncError) {
    console.error('[SyncOps] Sync operation failed:', syncError);

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

    throw new Error(
      `Sync operation failed: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`
    );
  }
}
