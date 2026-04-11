// ABOUT: API endpoint for recording item engagement signals
// ABOUT: Handles click_through signal; rating and note signals are recorded by their own endpoints

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

const SignalSchema = z.object({
  itemId: z.string().uuid('Invalid UUID'),
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
    const validation = SignalSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    const { itemId } = validation.data;

    // Verify item belongs to authenticated user before recording signal
    const { data: item } = await supabase
      .from('reader_items')
      .select('id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (!item) {
      // Return success to avoid blocking navigation — signal capture is non-blocking
      console.warn(`[Signal] Item ${itemId} not found for user ${user.id} — signal not recorded`);
      return NextResponse.json({ success: true });
    }

    // Insert click_through signal — every click is recorded (multiple = stronger interest)
    const { error: insertError } = await supabase.from('item_signals').insert({
      user_id: user.id,
      item_id: itemId,
      signal_type: 'click_through',
    });

    if (insertError) {
      console.error('[Signal] Failed to insert click_through signal:', insertError);
      // Return success — signal failure must never block navigation
      return NextResponse.json({ success: true });
    }

    console.log(`[Signal] Recorded click_through for item ${itemId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Signal] Unexpected error:', error);
    // Return success — signal failure must never block navigation
    return NextResponse.json({ success: true });
  }
}
