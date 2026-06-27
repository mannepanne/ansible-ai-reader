// ABOUT: One-time back-fill of Ansible reader_items into Relay's reference corpus
// ABOUT: Embeds each item's stored summary + commentary and upserts into relay_references (idempotent)

import type { SupabaseClient } from '@supabase/supabase-js';
import { embed, type AiBinding } from './embed';

export const BACKFILL_ORIGIN = 'ansible_backfill';

export interface BackfillResult {
  scanned: number;
  ingested: number;
  skippedEmpty: number;
  failed: number;
}

interface ReaderItemRow {
  reader_id: string;
  title: string | null;
  short_summary: string | null;
  commentariat_summary: string | null;
}

/**
 * Assemble a reference body from whichever of the two stored summaries exist, each labelled.
 * Returns null when there is nothing worth embedding (both empty / whitespace).
 * The back-fill embeds the SUMMARIES, not full article text — recall scans this cheap surface;
 * full text is fetched on demand at session time (a later slice).
 */
export function buildReferenceContent(item: ReaderItemRow): string | null {
  const parts: string[] = [];
  if (item.short_summary?.trim()) parts.push(`Summary:\n${item.short_summary.trim()}`);
  if (item.commentariat_summary?.trim()) parts.push(`Counter-case:\n${item.commentariat_summary.trim()}`);
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Read every reader_item and ingest its summary/commentary as a relay_references row.
 * Idempotent: upsert keyed on (origin, source_ref), so re-running never double-ingests.
 * Per-item failures are logged and counted rather than aborting the whole batch.
 *
 * NOTE (first-real-run smoke test): inserting `embedding` as a JS number[] relies on
 * PostgREST/pgvector accepting the array for the `vector(1024)` column — confirm on a live run.
 */
export async function runBackfill(deps: {
  supabase: SupabaseClient;
  ai: AiBinding;
}): Promise<BackfillResult> {
  const { supabase, ai } = deps;
  const result: BackfillResult = { scanned: 0, ingested: 0, skippedEmpty: 0, failed: 0 };

  const { data, error } = await supabase
    .from('reader_items')
    .select('reader_id, title, short_summary, commentariat_summary');
  if (error) {
    throw new Error(`backfill: failed to read reader_items: ${error.message}`);
  }

  const items = (data ?? []) as ReaderItemRow[];

  for (const item of items) {
    result.scanned++;
    const content = buildReferenceContent(item);
    if (!content) {
      result.skippedEmpty++;
      continue;
    }

    try {
      const embedding = await embed(ai, content);
      const { error: upsertError } = await supabase.from('relay_references').upsert(
        {
          origin: BACKFILL_ORIGIN,
          source_ref: item.reader_id,
          title: item.title,
          content,
          embedding,
        },
        { onConflict: 'origin,source_ref' },
      );
      if (upsertError) {
        console.error(`backfill: upsert failed for ${item.reader_id}: ${upsertError.message}`);
        result.failed++;
      } else {
        result.ingested++;
      }
    } catch (err) {
      console.error(
        `backfill: embed failed for ${item.reader_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.failed++;
    }
  }

  return result;
}
