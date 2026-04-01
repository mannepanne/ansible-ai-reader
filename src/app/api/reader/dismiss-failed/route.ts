// ABOUT: API endpoint for dismissing permanently failed processing jobs
// ABOUT: Removes failed job from tracking to clean up UI

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse request body
  let itemId: string;
  try {
    const body = (await request.json()) as { itemId: string };
    itemId = body.itemId;

    if (!itemId) {
      return NextResponse.json(
        { error: 'Missing itemId parameter' },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    // 3. Verify the item belongs to the user
    const { data: item, error: itemError } = await supabase
      .from('reader_items')
      .select('id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: 'Item not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Delete all failed jobs for this item
    const { error: deleteError } = await supabase
      .from('processing_jobs')
      .delete()
      .eq('reader_item_id', itemId)
      .eq('status', 'failed');

    if (deleteError) {
      console.error('[Dismiss Failed] Error deleting jobs:', deleteError);
      return NextResponse.json(
        { error: 'Failed to dismiss failed jobs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Dismiss Failed] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
