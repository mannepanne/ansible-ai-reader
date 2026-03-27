// ABOUT: API endpoint to archive a Reader item
// ABOUT: Archives in Reader first, then updates local database

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { archiveItem, ReaderAPIError } from '@/lib/reader-api';

/**
 * POST /api/reader/archive
 *
 * Archives a Reader item both in Readwise Reader and in local database.
 * Transaction-like pattern: archives in Reader first, only updates DB on success.
 *
 * Special case: If the item was already deleted in Reader (404 error),
 * still marks it as archived locally and sets reader_deleted flag to true.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - itemId: UUID of the reader_item to archive
 *
 * Response:
 * - 200: { success: true, readerDeleted?: boolean }
 * - 400: Missing or invalid itemId
 * - 401: Not authenticated
 * - 404: Item not found in local database
 * - 500: Archive failed (Reader API or database error)
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
    const body = (await request.json()) as { itemId?: string };
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: 'Missing itemId parameter' },
        { status: 400 }
      );
    }

    // Get item from database
    const { data: item, error: fetchError } = await supabase
      .from('reader_items')
      .select('id, reader_id')
      .eq('id', itemId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !item) {
      console.error('[Archive] Item not found:', fetchError);
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Get Reader API token
    const readerApiToken = process.env.READER_API_TOKEN;
    if (!readerApiToken) {
      console.error('[Archive] READER_API_TOKEN not configured');
      return NextResponse.json(
        { error: 'Reader API not configured' },
        { status: 500 }
      );
    }

    // Archive in Reader first (transaction-like pattern)
    let readerDeleted = false;
    try {
      await archiveItem(readerApiToken, item.reader_id);
      console.log('[Archive] Archived in Reader:', item.reader_id);
    } catch (error) {
      // If item was deleted in Reader (404), mark as reader_deleted but continue
      if (error instanceof ReaderAPIError && error.statusCode === 404) {
        console.log('[Archive] Item already deleted in Reader:', item.reader_id);
        readerDeleted = true;
      } else {
        // For other errors, fail the request
        console.error('[Archive] Failed to archive in Reader:', error);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to archive in Reader',
          },
          { status: 500 }
        );
      }
    }

    // Update local database (mark as archived, and reader_deleted if applicable)
    const { error: updateError } = await supabase
      .from('reader_items')
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
        reader_deleted: readerDeleted,
      })
      .eq('id', itemId);

    if (updateError) {
      console.error(
        '[Archive] Item archived in Reader but local DB update failed:',
        updateError
      );
      return NextResponse.json(
        {
          error:
            'Item archived in Reader but failed to update local database. Please refresh the page.',
          requiresRefresh: true,
        },
        { status: 500 }
      );
    }

    console.log('[Archive] Successfully archived item:', itemId);
    return NextResponse.json({
      success: true,
      readerDeleted: readerDeleted
    });
  } catch (error) {
    console.error('[Archive] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
