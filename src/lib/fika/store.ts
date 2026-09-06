// ABOUT: Data access for Fika: users, batches, candidates, email items, reading events
// ABOUT: Thin functions over a Supabase client so the orchestration in run.ts stays testable

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BatchCandidate, PreviousBatchItem, SelectedItem } from './select-batch';
import type { ReadingEvent } from './reading-days';

export interface FikaUser {
  id: string;
  email: string;
  fikaHour: number;
  timeZone: string;
  weeklyTarget: number;
}

export interface BatchRow {
  id: string;
  sentAt: string | null;
  sendAttempts: number;
  itemIds: string[];
}

export interface StoredItem {
  id: string;
  title: string;
  url: string;
  author: string | null;
  source: string | null;
  wordCount: number | null;
  createdAt: string;
  shortSummary: string | null;
  tags: string[];
}

const EMAIL_ITEM_COLUMNS = 'id, title, url, author, source, word_count, created_at, short_summary, tags';

function fail(context: string, error: { message?: string } | null): never {
  throw new Error(`[Fika store] ${context}: ${error?.message ?? 'unknown error'}`);
}

/** Users with Fika switched on */
export async function listFikaUsers(db: SupabaseClient): Promise<FikaUser[]> {
  const { data, error } = await db
    .from('users')
    .select('id, email, fika_hour, timezone, weekly_target')
    .not('fika_hour', 'is', null);
  if (error) fail('listFikaUsers', error);
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    fikaHour: row.fika_hour,
    timeZone: row.timezone ?? 'Europe/London',
    weeklyTarget: row.weekly_target ?? 5,
  }));
}

export async function getUserFikaSettings(
  db: SupabaseClient,
  userId: string
): Promise<{ timeZone: string; weeklyTarget: number } | null> {
  const { data, error } = await db.from('users').select('timezone, weekly_target').eq('id', userId).maybeSingle();
  if (error) fail('getUserFikaSettings', error);
  if (!data) return null;
  return { timeZone: data.timezone ?? 'Europe/London', weeklyTarget: data.weekly_target ?? 5 };
}

/** The batch for a given local date, with its item ids in slot order */
export async function getBatchByDate(db: SupabaseClient, userId: string, batchDate: string): Promise<BatchRow | null> {
  const { data, error } = await db
    .from('fika_batches')
    .select('id, sent_at, send_attempts, fika_batch_items(item_id, slot)')
    .eq('user_id', userId)
    .eq('batch_date', batchDate)
    .maybeSingle();
  if (error) fail('getBatchByDate', error);
  if (!data) return null;
  const items = ((data.fika_batch_items ?? []) as Array<{ item_id: string; slot: number }>).sort((a, b) => a.slot - b.slot);
  return { id: data.id, sentAt: data.sent_at, sendAttempts: data.send_attempts ?? 0, itemIds: items.map((i) => i.item_id) };
}

/** The most recent batch of any date, with the current archived/deleted state of each item */
export async function getMostRecentBatch(
  db: SupabaseClient,
  userId: string
): Promise<{ id: string; items: PreviousBatchItem[] } | null> {
  const { data, error } = await db
    .from('fika_batches')
    .select('id, fika_batch_items(item_id, slot, reader_items(archived, archived_at, reader_deleted))')
    .eq('user_id', userId)
    .order('batch_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('getMostRecentBatch', error);
  if (!data) return null;
  type Row = {
    item_id: string;
    slot: number;
    reader_items: { archived: boolean | null; archived_at: string | null; reader_deleted: boolean | null } | null;
  };
  const items = ((data.fika_batch_items ?? []) as unknown as Row[]).map((row) => ({
    itemId: row.item_id,
    slot: (row.slot === 2 ? 2 : 1) as 1 | 2,
    archived: Boolean(row.reader_items?.archived || row.reader_items?.archived_at),
    deleted: !row.reader_items || Boolean(row.reader_items.reader_deleted),
  }));
  return { id: data.id, items };
}

/** Eligible items: unread, not deleted in Reader, and summarised */
export async function listCandidates(db: SupabaseClient, userId: string): Promise<BatchCandidate[]> {
  const { data, error } = await db
    .from('reader_items')
    .select('id, created_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .eq('reader_deleted', false)
    .not('short_summary', 'is', null);
  if (error) fail('listCandidates', error);
  return (data ?? []).map((row) => ({ id: row.id, createdAt: row.created_at }));
}

/** Item ids that appeared in any batch on or after the given local date */
export async function listRecentlyBatchedIds(db: SupabaseClient, userId: string, sinceDate: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('fika_batches')
    .select('fika_batch_items(item_id)')
    .eq('user_id', userId)
    .gte('batch_date', sinceDate);
  if (error) fail('listRecentlyBatchedIds', error);
  const ids = new Set<string>();
  for (const batch of data ?? []) {
    for (const item of (batch.fika_batch_items ?? []) as Array<{ item_id: string }>) ids.add(item.item_id);
  }
  return ids;
}

export async function createBatch(
  db: SupabaseClient,
  userId: string,
  batchDate: string,
  items: SelectedItem[]
): Promise<string> {
  const { data, error } = await db
    .from('fika_batches')
    .insert({ user_id: userId, batch_date: batchDate })
    .select('id')
    .single();
  if (error || !data) fail('createBatch', error);
  const { error: itemsError } = await db.from('fika_batch_items').insert(
    items.map((item) => ({ batch_id: data.id, item_id: item.itemId, slot: item.slot, carried_from: item.carriedFrom }))
  );
  if (itemsError) fail('createBatch items', itemsError);
  return data.id;
}

/** Loads the items for the email, in the order of the given ids */
export async function loadEmailItems(db: SupabaseClient, userId: string, itemIds: string[]): Promise<StoredItem[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await db.from('reader_items').select(EMAIL_ITEM_COLUMNS).eq('user_id', userId).in('id', itemIds);
  if (error) fail('loadEmailItems', error);
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return itemIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      author: row.author ?? null,
      source: row.source ?? null,
      wordCount: row.word_count ?? null,
      createdAt: row.created_at,
      shortSummary: row.short_summary ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
    }));
}

/** Same definition of unread as the summaries list */
export async function countUnread(db: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await db
    .from('reader_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('archived_at', null);
  if (error) fail('countUnread', error);
  return count ?? 0;
}

/** User actions since an instant: signals of any type, plus archives that were not drift */
export async function listReadingEvents(db: SupabaseClient, userId: string, sinceIso: string): Promise<ReadingEvent[]> {
  const [signals, archives] = await Promise.all([
    db.from('item_signals').select('created_at').eq('user_id', userId).gte('created_at', sinceIso),
    db
      .from('reader_items')
      .select('archived_at')
      .eq('user_id', userId)
      .gte('archived_at', sinceIso)
      .or('archive_reason.is.null,archive_reason.eq.user'),
  ]);
  if (signals.error) fail('listReadingEvents signals', signals.error);
  if (archives.error) fail('listReadingEvents archives', archives.error);
  return [
    ...(signals.data ?? []).map((row) => ({ at: row.created_at as string })),
    ...(archives.data ?? []).map((row) => ({ at: row.archived_at as string })),
  ];
}

export async function recordSendAttempt(db: SupabaseClient, batchId: string, attempts: number): Promise<void> {
  const { error } = await db.from('fika_batches').update({ send_attempts: attempts }).eq('id', batchId);
  if (error) fail('recordSendAttempt', error);
}

export async function markSent(db: SupabaseClient, batchId: string, sentAt: string, resendId: string | null): Promise<void> {
  const { error } = await db
    .from('fika_batches')
    .update({ sent_at: sentAt, resend_message_id: resendId })
    .eq('id', batchId);
  if (error) fail('markSent', error);
}
