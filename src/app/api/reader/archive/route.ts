// ABOUT: API endpoint to archive a Reader item from the web UI
// ABOUT: Thin session-authenticated wrapper over the shared archive helper

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { archiveItemForUser } from '@/lib/archive';

/**
 * POST /api/reader/archive
 *
 * Archives a Reader item both in Readwise Reader and in the local database via
 * `archiveItemForUser` (Reader first, local row only on success; a Reader 404 still
 * archives locally and sets reader_deleted). Writes archive_reason = 'user'.
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { itemId?: string };
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId parameter' }, { status: 400 });
    }

    const readerApiToken = process.env.READER_API_TOKEN;
    if (!readerApiToken) {
      console.error('[Archive] READER_API_TOKEN not configured');
      return NextResponse.json({ error: 'Reader API not configured' }, { status: 500 });
    }

    const outcome = await archiveItemForUser(supabase, {
      userId: user.id,
      itemId,
      reason: 'user',
      readerApiToken,
    });

    if (!outcome.ok) {
      switch (outcome.error) {
        case 'not_found':
          console.error('[Archive] Item not found:', itemId);
          return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        case 'reader_failed':
          console.error('[Archive] Failed to archive in Reader:', outcome.message);
          return NextResponse.json({ error: outcome.message }, { status: 500 });
        case 'db_failed':
          console.error('[Archive] Item archived in Reader but local DB update failed');
          return NextResponse.json({ error: outcome.message, requiresRefresh: true }, { status: 500 });
      }
    }

    console.log('[Archive] Successfully archived item:', itemId);
    return NextResponse.json({ success: true, readerDeleted: outcome.readerDeleted });
  } catch (error) {
    console.error('[Archive] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
