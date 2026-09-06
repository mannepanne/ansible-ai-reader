// ABOUT: Shared archive helper: archives an item in Reader first, then mirrors the state locally
// ABOUT: One implementation for the web route (session client), the Fika action endpoint and cron (service role)

import type { SupabaseClient } from '@supabase/supabase-js';
import { archiveItem, ReaderAPIError } from '@/lib/reader-api';

export type ArchiveReason = 'user' | 'drift';

export type ArchiveOutcome =
  | { ok: true; readerDeleted: boolean; alreadyArchived: boolean }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'reader_failed'; message: string }
  | { ok: false; error: 'db_failed'; message: string; requiresRefresh: true };

export interface ArchiveOptions {
  userId: string;
  itemId: string;
  reason: ArchiveReason;
  readerApiToken: string;
  now?: Date;
}

/**
 * Transaction-like: Reader is updated first and the local row only on success, so the two
 * lists never diverge. A Reader 404 (item deleted there) still archives locally and marks
 * reader_deleted. Idempotent: an already-archived item returns ok without a second Reader call.
 * Sets both `archived` and `archived_at` because the codebase queries both.
 */
export async function archiveItemForUser(
  db: SupabaseClient,
  { userId, itemId, reason, readerApiToken, now = new Date() }: ArchiveOptions
): Promise<ArchiveOutcome> {
  const { data: item, error: fetchError } = await db
    .from('reader_items')
    .select('id, reader_id, archived, archived_at, reader_deleted')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !item) {
    return { ok: false, error: 'not_found' };
  }

  if (item.archived || item.archived_at) {
    return { ok: true, readerDeleted: Boolean(item.reader_deleted), alreadyArchived: true };
  }

  let readerDeleted = false;
  try {
    await archiveItem(readerApiToken, item.reader_id);
  } catch (error) {
    if (error instanceof ReaderAPIError && error.statusCode === 404) {
      readerDeleted = true;
    } else {
      return {
        ok: false,
        error: 'reader_failed',
        message: error instanceof Error ? error.message : 'Failed to archive in Reader',
      };
    }
  }

  const { error: updateError } = await db
    .from('reader_items')
    .update({
      archived: true,
      archived_at: now.toISOString(),
      archive_reason: reason,
      reader_deleted: readerDeleted,
    })
    .eq('id', itemId)
    .eq('user_id', userId); // ownership was proven above; scoping the write keeps that local to the statement

  if (updateError) {
    return {
      ok: false,
      error: 'db_failed',
      message: 'Item archived in Reader but failed to update local database. Please refresh the page.',
      requiresRefresh: true,
    };
  }

  return { ok: true, readerDeleted, alreadyArchived: false };
}
