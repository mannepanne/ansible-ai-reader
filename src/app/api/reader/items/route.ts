// ABOUT: API endpoint to fetch user's Reader items
// ABOUT: Returns list of synced items with basic details

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/reader/items
 *
 * Returns all Reader items for the authenticated user.
 * Items are ordered by created_at descending (newest first).
 *
 * Authentication: Required (session check)
 *
 * Response:
 * - 200: { items: ReaderItem[] }
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function GET() {
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

    // Fetch items for user (excluding archived items)
    const { data: items, error } = await supabase
      .from('reader_items')
      .select(
        'id, reader_id, title, author, source, url, word_count, short_summary, tags, perplexity_model, content_truncated, created_at'
      )
      .eq('user_id', userId)
      .is('archived_at', null) // Only show non-archived items
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Items] Failed to fetch items:', error);
      return NextResponse.json(
        { error: 'Failed to fetch items' },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: items || [] });
  } catch (error) {
    console.error('[Items] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
