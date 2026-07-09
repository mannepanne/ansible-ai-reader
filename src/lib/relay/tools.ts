// ABOUT: Relay bridge tool implementations — the owned-memory operations behind the MCP surface
// ABOUT: recall (ANN), fetch (full text), write_pending, ingest_reference, research (grounded facts)

import type { SupabaseClient } from '@supabase/supabase-js';
import { embed, type AiBinding } from './embed';
import { fetchArticleContent } from '../reader-api';
import { groundedSearch, RESEARCH_UNAVAILABLE, type GroundedSearchResult } from './grounded-search';
import { TRUSTED_SOURCES } from './trusted-sources';

// Origin tag for references the narrator ingests itself (vs. 'ansible_backfill' from the seed run).
export const RESEARCH_ORIGIN = 'research';

// recall neighbour-count guards: a sensible default and a ceiling so a stray k can't pull the corpus.
export const DEFAULT_RECALL_K = 8;
export const MAX_RECALL_K = 50;

// A piece's (or decision's) provenance link. `recall` refs point at a memory id; `source` refs at a
// research URL. The `type` is what the admin surface and the future re-verification pass filter on.
export interface PieceLink {
  type: 'recall' | 'source';
  ref: string; // a recall UUID (type:'recall') or a source URL (type:'source')
  title?: string;
}

export interface ToolDeps {
  supabase: SupabaseClient;
  ai: AiBinding;
  // The bridge's own Reader API token, used by `fetch` to pull full article bodies on demand.
  // Optional: without it, `fetch` returns the stored reference content rather than the full body.
  readerToken?: string;
  // The bridge's Perplexity key, used by `research` to fetch grounded, source-attributable facts.
  // Optional: without it, `research` fails CLOSED (returns degraded) rather than aborting the session.
  perplexityKey?: string;
}

/**
 * Normalise a source URL into a stable dedup key: force https, lowercase host, drop common tracking
 * params, strip a single trailing slash. A protocol-less input is treated as https. Unparseable input
 * falls back to the trimmed original (never throws — dedup is best-effort, never a session-breaker).
 */
export function normalizeSourceUrl(u: string): string {
  const raw = u.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase();
    for (const p of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(p)) url.searchParams.delete(p);
    }
    // Strip a single trailing path slash, whether it sits at the end or just before the query string.
    return url.href.replace(/\/(\?|$)/, '$1');
  } catch {
    return raw;
  }
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
 * Fetch the full text of one recall hit by id. A `research`-origin reference's stored content IS the
 * retrieved snippet (there is no Reader body behind it), so it is returned directly. An
 * `ansible_backfill` reference carrying a `source_ref` (a Reader doc id) pulls the full article body
 * from the Reader API (reusing `fetchArticleContent` — never scraping); if that fetch fails, it
 * degrades to the stored summary so a session proceeds on frontmatter rather than aborting (spec §6).
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
    // A research ref's source_ref is a URL, not a Reader doc id — never round-trip it to the Reader API
    // (that call would 404 and pointlessly degrade). Its stored content is already the snippet.
    if (ref.origin === RESEARCH_ORIGIN) {
      return { id: ref.id, kind: 'reference', title: ref.title, text: ref.content };
    }
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
 * Whether a piece carries at least one grounded source link. `verification_status` is derived from
 * this backend-side (never trusted from the agent), and it is deliberately honest: a source link
 * means the piece is `sourced` (it cites a real, checkable URL), NOT `verified` (proven true — that
 * is the deferred re-verification pass). Legacy bare-id links (no `type`) count as no source.
 */
function hasSourceLink(links: unknown[]): boolean {
  return links.some((l) => typeof l === 'object' && l !== null && (l as { type?: string }).type === 'source');
}

/**
 * Write a new piece into the human-review gate as `pending_review`, embedding left null until
 * approval. Returns plain success only: the narrator stays blind to the gate (it never learns
 * the piece id, whether it was approved, or that it became recallable — spec §5/§7, A4).
 *
 * `verification_status` is set here from the links' provenance (not accepted from the agent): a piece
 * carrying a `type:'source'` link is `sourced`, otherwise it stays `unverified` (the column default).
 */
export async function writePending(
  deps: ToolDeps,
  args: { body: string; summary?: string; concepts?: string[]; links?: unknown[] },
): Promise<{ ok: true }> {
  const body = args?.body?.trim();
  if (!body) {
    throw new Error('write_pending: body is required');
  }

  const links = args.links ?? [];
  // state defaults to 'pending_review' and embedding stays null — both set on approval, backend-side.
  const { error } = await deps.supabase
    .from('relay_pieces')
    .insert({
      body,
      summary: args.summary ?? null,
      concepts: args.concepts ?? [],
      links,
      verification_status: hasSourceLink(links) ? 'sourced' : 'unverified',
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
 * Idempotent on (origin, normalised source_ref). References are recall substrate, never gospel.
 *
 * A stable `source_ref` (the source URL) is REQUIRED and normalised before it becomes the dedup key:
 * Postgres treats NULLs as distinct, so a null-source ingest would always insert a duplicate. Refusing
 * the null-source case is what makes today's research tomorrow's recall without piling up dupes.
 */
export async function ingestReference(
  deps: ToolDeps,
  args: { source_ref?: string; title?: string; text: string },
): Promise<{ ok: true }> {
  const content = args?.text?.trim();
  if (!content) {
    throw new Error('ingest_reference: text is required');
  }
  const rawRef = args?.source_ref?.trim();
  if (!rawRef) {
    throw new Error('ingest_reference: source_ref (a source URL) is required to dedup research');
  }
  const source_ref = normalizeSourceUrl(rawRef);

  const embedding = await embed(deps.ai, content);
  const { error } = await deps.supabase.from('relay_references').upsert(
    {
      origin: RESEARCH_ORIGIN,
      source_ref,
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

/**
 * Research: fetch verbatim, source-attributable facts from the web before the narrator asserts a
 * specific. Delegates to the bridge's grounded-search (sonar → search_result snippets), and fails
 * CLOSED — without a Perplexity key, or on any search failure, it returns `{ findings: [], degraded }`
 * so the coda discipline hedges or stays silent rather than grounding a claim on nothing.
 */
export async function research(
  deps: ToolDeps,
  args: { query: string; k?: number },
): Promise<GroundedSearchResult> {
  const query = args?.query?.trim();
  if (!query) {
    throw new Error('research: query is required');
  }
  if (!deps.perplexityKey) {
    return { findings: [], degraded: RESEARCH_UNAVAILABLE };
  }
  return groundedSearch(
    { apiKey: deps.perplexityKey, trustedSources: TRUSTED_SOURCES },
    { query, k: args.k },
  );
}
