// ABOUT: API endpoint for saving document notes
// ABOUT: Saves notes locally and syncs to Readwise Reader
//
// ARCHITECTURE DECISION: Inline sync vs queue-based sync
// This endpoint uses inline/synchronous sync to Reader API (not queue-based like archives).
// Rationale:
//   - User expects immediate feedback when saving notes (UX priority)
//   - Notes are small payloads (<10k chars) with fast sync time
//   - Failure case is acceptable: user sees error and can retry manually
//   - Archives use queues because: bulk operations, higher failure tolerance, async OK
// Trade-off: User waits ~500ms for Reader API vs instant response with background queue

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import { updateNote, ReaderAPIError } from '@/lib/reader-api';
import { MAX_NOTE_LENGTH } from '@/lib/constants';

const NoteSchema = z.object({
  itemId: z.string().uuid('Invalid item ID'),
  note: z
    .string()
    .max(MAX_NOTE_LENGTH, `Note must be under ${MAX_NOTE_LENGTH.toLocaleString()} characters`)
    .transform((note) => note.trim())
    .refine((note) => note.length > 0, {
      message: 'Note cannot be empty',
    }),
});

/**
 * POST /api/reader/note
 *
 * Save or update a note for a reader item.
 * Saves to Ansible database and syncs to Reader API.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - itemId: UUID of the reader item
 * - note: Plain text note (max 10k chars)
 *
 * Response:
 * - 200: { success: true, note: string }
 * - 400: Invalid request body
 * - 401: Not authenticated
 * - 404: Item not found
 * - 500: Database error
 * - 502: Note saved locally but Reader sync failed
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate request body
    const body = await request.json();
    const validated = NoteSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { itemId, note } = validated.data;

    // 3. Verify item belongs to user
    const { data: item, error: itemError } = await supabase
      .from('reader_items')
      .select('id, reader_id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !item) {
      console.error('[Note] Item not found:', itemError);
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // 4. Save note to Ansible database
    const { error: saveError } = await supabase
      .from('reader_items')
      .update({ document_note: note })
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (saveError) {
      console.error('[Note] Failed to save note:', saveError);
      return NextResponse.json(
        { error: 'Failed to save note' },
        { status: 500 }
      );
    }

    console.log('[Note] Note saved successfully for item:', itemId);

    // 5. Sync to Reader API using shared client (inline sync for immediate feedback)
    const readerToken = process.env.READER_API_TOKEN;
    if (!readerToken) {
      console.error('[Note] Reader API token not configured');
      return NextResponse.json(
        {
          error: 'Note saved locally but failed to sync to Reader',
          details: 'Reader API token not configured',
        },
        { status: 502 }
      );
    }

    try {
      await updateNote(readerToken, item.reader_id, note);
      console.log('[Note] Note synced to Reader successfully');
    } catch (readerError) {
      console.error('[Note] Reader API request failed:', readerError);

      // Handle specific Reader API errors
      if (readerError instanceof ReaderAPIError) {
        return NextResponse.json(
          {
            error: 'Note saved locally but failed to sync to Reader',
            details: readerError.message,
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          error: 'Note saved locally but failed to sync to Reader',
          details:
            readerError instanceof Error
              ? readerError.message
              : 'Unknown error',
        },
        { status: 502 }
      );
    }

    // 6. Return success
    return NextResponse.json({
      success: true,
      note: note,
    });
  } catch (error) {
    console.error('[Note] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
