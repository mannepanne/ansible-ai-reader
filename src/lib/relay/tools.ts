// ABOUT: Relay bridge tool implementations — the owned-memory operations behind the MCP surface
// ABOUT: recall (ANN over the corpus), fetch (full text + Reader-API body), write_pending, ingest_reference

import type { SupabaseClient } from '@supabase/supabase-js';
import { embed, type AiBinding } from './embed';
import { fetchArticleContent } from '../reader-api';

// Origin tag for references the narrator ingests itself (vs. 'ansible_backfill' from the seed run).
export const RESEARCH_ORIGIN = 'research';

// recall neighbour-count guards: a sensible default and a ceiling so a stray k can't pull the corpus.
export const DEFAULT_RECALL_K = 8;
export const MAX_RECALL_K = 50;

export interface ToolDeps {
  supabase: SupabaseClient;
  ai: AiBinding;
  // The bridge's own Reader API token, used by `fetch` to pull full article bodies on demand.
  // Optional: without it, `fetch` returns the stored reference content rather than the full body.
  readerToken?: string;
}

export interface RecallResult {
  id: string;
  kind: 'reference' | 'self';
  title: string | null;
  summary: string | null;
  concepts: string[];
}

function clampK(k: unknown): number {
  const n = typeof k === 'number' && Number.isFinite(k) ? Math.floor(k) : DEFAULT_RECALL_K;
  return Math.min(Math.max(n, 1), MAX_RECALL_K);
}

/**
 * Recall: embed the stimulus (the one sealed bge-m3 fn) and return its cosine-nearest neighbours
 * across the reference corpus and Relay's own APPROVED pieces, via the `relay_recall` SQL function.
 * The narrator never sees the embedding — it asks for neighbours and receives pieces.
 */
export async function recall(
  deps: ToolDeps,
  args: { stimulus_text: string; k?: number },
): Promise<RecallResult[]> {
  const text = args?.stimulus_text?.trim();
  if (!text) {
    throw new Error('recall: stimulus_text is required');
  }
  const matchCount = clampK(args?.k);
  const embedding = await embed(deps.ai, text);

  const { data, error } = await deps.supabase.rpc('relay_recall', {
    query_embedding: embedding,
    match_count: matchCount,
  });
  if (error) {
    throw new Error(`recall: ${error.message}`);
  }

  return ((data ?? []) as Array<Omit<RecallResult, 'concepts'> & { concepts: string[] | null }>).map(
    (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title ?? null,
      summary: row.summary ?? null,
      concepts: row.concepts ?? [],
    }),
  );
}

export interface FetchResult {
  id: string;
  kind: 'reference' | 'self';
  title: string | null;
  text: string;
  degraded?: 'summary_only';
}

/**
 * Fetch the full text of one recall hit by id. For a reference carrying a `source_ref`, this
 * pulls the full article body from the Reader API (reusing `fetchArticleContent` — never scraping);
 * if that fetch fails, it degrades to the stored summary content so a session can proceed on
 * frontmatter rather than aborting (spec §6, mid-session finalist failure policy).
 */
export async function fetchById(deps: ToolDeps, args: { id: string }): Promise<FetchResult> {
  const id = args?.id?.trim?.() ?? args?.id;
  if (!id) {
    throw new Error('fetch: id is required');
  }

  const { data: ref, error: refError } = await deps.supabase
    .from('relay_references')
    .select('id, title, content, source_ref, origin')
    .eq('id', id)
    .maybeSingle();
  if (refError) {
    throw new Error(`fetch: ${refError.message}`);
  }

  if (ref) {
    if (ref.source_ref && deps.readerToken) {
      try {
        const article = await fetchArticleContent(ref.source_ref, deps.readerToken);
        return { id: ref.id, kind: 'reference', title: ref.title ?? article.title, text: article.content };
      } catch {
        // Degrade rather than abort: the narrator proceeds on the stored summary (frontmatter).
        return { id: ref.id, kind: 'reference', title: ref.title, text: ref.content, degraded: 'summary_only' };
      }
    }
    return { id: ref.id, kind: 'reference', title: ref.title, text: ref.content };
  }

  const { data: piece, error: pieceError } = await deps.supabase
    .from('relay_pieces')
    .select('id, body, summary')
    .eq('id', id)
    .maybeSingle();
  if (pieceError) {
    throw new Error(`fetch: ${pieceError.message}`);
  }
  if (piece) {
    return { id: piece.id, kind: 'self', title: null, text: piece.body };
  }

  throw new Error(`fetch: no piece or reference found for id ${id}`);
}

/**
 * Write a new piece into the human-review gate as `pending_review`, embedding left null until
 * approval. Returns plain success only: the narrator stays blind to the gate (it never learns
 * the piece id, whether it was approved, or that it became recallable — spec §5/§7, A4).
 */
export async function writePending(
  deps: ToolDeps,
  args: { body: string; summary?: string; concepts?: string[]; links?: unknown[] },
): Promise<{ ok: true }> {
  const body = args?.body?.trim();
  if (!body) {
    throw new Error('write_pending: body is required');
  }

  // state defaults to 'pending_review' and embedding stays null — both set on approval, backend-side.
  const { error } = await deps.supabase
    .from('relay_pieces')
    .insert({
      body,
      summary: args.summary ?? null,
      concepts: args.concepts ?? [],
      links: args.links ?? [],
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`write_pending: ${error.message}`);
  }
  return { ok: true };
}

/**
 * Ingest a reference the narrator gathered itself (research material), embedded and upserted.
 * Idempotent on (origin, source_ref). References are recall substrate, never gospel.
 */
export async function ingestReference(
  deps: ToolDeps,
  args: { source_ref?: string; title?: string; text: string },
): Promise<{ ok: true }> {
  const content = args?.text?.trim();
  if (!content) {
    throw new Error('ingest_reference: text is required');
  }

  const embedding = await embed(deps.ai, content);
  const { error } = await deps.supabase.from('relay_references').upsert(
    {
      origin: RESEARCH_ORIGIN,
      source_ref: args.source_ref ?? null,
      title: args.title ?? null,
      content,
      embedding,
    },
    { onConflict: 'origin,source_ref' },
  );
  if (error) {
    throw new Error(`ingest_reference: ${error.message}`);
  }
  return { ok: true };
}
