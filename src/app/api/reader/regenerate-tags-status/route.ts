// ABOUT: API endpoint to check tag regeneration status
// ABOUT: Returns progress of processing jobs for a given regenerate tags operation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Regenerate tags status response
 */
interface RegenerateStatusResponse {
  regenerateId: string;
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
 * GET /api/reader/regenerate-tags-status?regenerateId=<regenerate_id>
 *
 * Returns the current status of a tag regeneration operation.
 * Used for client-side polling to show progress.
 *
 * Authentication: Required (session check)
 *
 * Query Parameters:
 * - regenerateId: UUID of the regenerate tags operation
 *
 * Response:
 * - 200: { regenerateId, totalJobs, completedJobs, ... }
 * - 400: Missing or invalid regenerateId
 * - 401: Not authenticated
 * - 404: Regeneration batch not found
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
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

    // Get regenerateId from query params
    const { searchParams } = new URL(request.url);
    const regenerateId = searchParams.get('regenerateId');

    if (!regenerateId) {
      return NextResponse.json(
        { error: 'Missing regenerateId parameter' },
        { status: 400 }
      );
    }

    // Get all processing jobs for this regenerate batch
    // No need to verify batch exists separately - if no jobs found, return 404
    const { data: jobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('id, status, reader_item_id, error_message')
      .eq('regenerate_batch_id', regenerateId)
      .eq('user_id', userId);

    if (jobsError) {
      console.error('[RegenerateStatus] Failed to fetch jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch regeneration status' },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        { error: 'Regeneration batch not found' },
        { status: 404 }
      );
    }

    const totalJobs = jobs.length;
    const completedJobs = jobs.filter((j) => j.status === 'completed').length;
    const failedJobs = jobs.filter((j) => j.status === 'failed').length;
    const inProgressJobs = jobs.filter((j) => j.status === 'processing').length;
    const pendingJobs = jobs.filter((j) => j.status === 'pending').length;

    // Determine overall status
    let status: RegenerateStatusResponse['status'];
    if (completedJobs === totalJobs) {
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
    const failedItems: RegenerateStatusResponse['failedItems'] = [];
    if (failedJobs > 0) {
      const failedJobIds = jobs
        .filter((j) => j.status === 'failed')
        .map((j) => j.reader_item_id);

      if (failedJobIds.length > 0) {
        const { data: items } = await supabase
          .from('reader_items')
          .select('id, title')
          .in('id', failedJobIds);

        if (items) {
          for (const job of jobs.filter((j) => j.status === 'failed')) {
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

    const response: RegenerateStatusResponse = {
      regenerateId,
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
    console.error('[RegenerateStatus] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
