// ABOUT: API endpoint for updating item ratings
// ABOUT: Binary rating system - 1 (not interesting) or 4 (interesting)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

// Validation schema for rating updates
const RatingSchema = z.object({
  itemId: z.string().uuid('Invalid UUID'),
  rating: z
    .number()
    .int('Rating must be an integer')
    .nullable()
    .refine(
      (val) => val === null || val === 1 || val === 4,
      'Rating must be either 1 (not interesting) or 4 (interesting)'
    ),
});

export async function POST(request: Request) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = RatingSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        { status: 400 }
      );
    }

    const { itemId, rating } = validation.data;

    // Update rating in database
    const { data, error } = await supabase
      .from('reader_items')
      .update({ rating })
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('[Rating] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update rating' },
        { status: 500 }
      );
    }

    // Check if item was found and updated
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    console.log(`[Rating] Updated rating for item ${itemId}: ${rating}`);

    // Record engagement signal — fire-and-forget, never blocks the rating response
    if (rating !== null) {
      try {
        const signalType = rating === 4 ? 'rated_interesting' : 'rated_not_interesting';
        const { error: signalError } = await supabase.from('item_signals').insert({
          user_id: user.id,
          item_id: itemId,
          signal_type: signalType,
        });
        if (signalError) {
          console.error('[Rating] Failed to record signal:', signalError);
        }
      } catch (signalError) {
        console.error('[Rating] Unexpected signal error:', signalError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Rating] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
