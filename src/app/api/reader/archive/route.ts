// ABOUT: API endpoint to archive a Reader item
// ABOUT: Archives in Reader first, then updates local database

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { archiveItem } from '@/lib/reader-api';

/**
 * POST /api/reader/archive
 *
 * Archives a Reader item both in Readwise Reader and in local database.
 * Transaction-like pattern: archives in Reader first, only updates DB on success.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - itemId: UUID of the reader_item to archive
 *
 * Response:
 * - 200: { success: true }
 * - 400: Missing or invalid itemId
 * - 401: Not authenticated
 * - 404: Item not found
 * - 500: Archive failed (Reader API or database error)
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
    try {
      await archiveItem(readerApiToken, item.reader_id);
      console.log('[Archive] Archived in Reader:', item.reader_id);
    } catch (error) {
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

    // Update local database (mark as archived)
    const { error: updateError } = await supabase
      .from('reader_items')
      .update({
        archived_at: new Date().toISOString(),
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
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Archive] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
