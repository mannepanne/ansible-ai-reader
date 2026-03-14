// ABOUT: API endpoint to check sync status
// ABOUT: Returns progress of processing jobs for a given sync operation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Sync status response
 */
interface SyncStatusResponse {
  syncId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  pendingJobs: number;
  status: 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';
  failedItems?: Array<{
    itemId: string;
    title: string;
    error: string;
  }>;
}

/**
 * GET /api/reader/status?syncId=<sync_id>
 *
 * Returns the current status of a sync operation.
 * Used for client-side polling to show progress.
 *
 * Authentication: Required (session check)
 *
 * Query Parameters:
 * - syncId: UUID of the sync operation
 *
 * Response:
 * - 200: { syncId, totalJobs, completedJobs, ... }
 * - 400: Missing or invalid syncId
 * - 401: Not authenticated
 * - 404: Sync not found
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
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

    // Get syncId from query params
    const { searchParams } = new URL(request.url);
    const syncId = searchParams.get('syncId');

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

    // Get all processing jobs for this sync
    const { data: jobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('id, status, reader_item_id, error_message')
      .eq('sync_log_id', syncId)
      .eq('user_id', userId);

    if (jobsError) {
      console.error('[Status] Failed to fetch jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch sync status' },
        { status: 500 }
      );
    }

    const totalJobs = jobs?.length || 0;
    const completedJobs = jobs?.filter((j) => j.status === 'completed').length || 0;
    const failedJobs = jobs?.filter((j) => j.status === 'failed').length || 0;
    const inProgressJobs = jobs?.filter((j) => j.status === 'processing').length || 0;
    const pendingJobs = jobs?.filter((j) => j.status === 'pending').length || 0;

    // Determine overall status
    let status: SyncStatusResponse['status'];
    if (totalJobs === 0) {
      status = 'pending';
    } else if (completedJobs === totalJobs) {
      status = 'completed';
    } else if (failedJobs === totalJobs) {
      status = 'failed';
    } else if (failedJobs > 0 && completedJobs + failedJobs === totalJobs) {
      status = 'partial_failure';
    } else if (inProgressJobs > 0 || completedJobs > 0) {
      status = 'processing';
    } else {
      status = 'pending';
    }

    // Get failed items with details
    const failedItems: SyncStatusResponse['failedItems'] = [];
    if (failedJobs > 0) {
      const failedJobIds = jobs
        ?.filter((j) => j.status === 'failed')
        .map((j) => j.reader_item_id);

      if (failedJobIds && failedJobIds.length > 0) {
        const { data: items } = await supabase
          .from('reader_items')
          .select('id, title')
          .in('id', failedJobIds);

        if (items) {
          for (const job of jobs?.filter((j) => j.status === 'failed') || []) {
            const item = items.find((i) => i.id === job.reader_item_id);
            if (item) {
              failedItems.push({
                itemId: item.id,
                title: item.title,
                error: job.error_message || 'Unknown error',
              });
            }
          }
        }
      }
    }

    const response: SyncStatusResponse = {
      syncId,
      totalJobs,
      completedJobs,
      failedJobs,
      inProgressJobs,
      pendingJobs,
      status,
      ...(failedItems.length > 0 && { failedItems }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Status] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
