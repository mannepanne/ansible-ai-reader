-- ABOUT: Relay recall — one ANN function over the owned-memory corpus for the bridge's recall tool
-- ABOUT: Unifies relay_references + APPROVED relay_pieces into a single cosine-ranked result set,
-- ABOUT: so the rented mind reaches conceptual neighbours through one service-role RPC.

-- The bridge embeds the stimulus (the one sealed bge-m3 fn) and calls this with the resulting
-- 1024-dim vector. Cosine distance (<=>) matches the vector_cosine_ops hnsw indexes from the
-- foundation migration.
--
-- Index usage: each branch does its OWN `ORDER BY embedding <=> query LIMIT match_count` directly
-- on its table, so the per-table hnsw index can serve the ANN search; the outer query then merges
-- the two small candidate sets (≤ 2·match_count rows) and takes the global top match_count. A
-- single ORDER BY over the whole UNION would instead force a brute-force seq-scan of both tables.
--
-- Result shape mirrors the spec's recall surface: {id, kind, title, summary, concepts}. Two tables
-- are unified, so the columns are reconciled:
--   reference → kind='reference', title=title,        summary=content, concepts={} (no concepts col)
--   piece     → kind='self',      title=NULL,         summary=summary, concepts=concepts
-- relay_pieces has no title column; recall returns NULL there and leans on summary/concepts for the
-- self corpus. Only APPROVED pieces are recallable as self (pending/rejected never surface).
--
-- search_path is pinned (silences Supabase's function_search_path_mutable linter); it is NOT a
-- privilege boundary here because the function is SECURITY INVOKER (the default — never make a
-- relay_* function SECURITY DEFINER, or it would bypass RLS and leak the corpus to anon).
CREATE OR REPLACE FUNCTION relay_recall(
  query_embedding vector(1024),
  match_count int
)
RETURNS TABLE (
  id uuid,
  kind text,
  title text,
  summary text,
  concepts text[],
  distance double precision
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT * FROM (
    SELECT
      r.id,
      'reference'::text AS kind,
      r.title,
      r.content AS summary,
      '{}'::text[] AS concepts,
      (r.embedding <=> query_embedding) AS distance
    FROM relay_references r
    WHERE r.embedding IS NOT NULL
    ORDER BY r.embedding <=> query_embedding
    LIMIT match_count
  ) refs

  UNION ALL

  SELECT * FROM (
    SELECT
      p.id,
      'self'::text AS kind,
      NULL::text AS title,
      p.summary,
      p.concepts,
      (p.embedding <=> query_embedding) AS distance
    FROM relay_pieces p
    WHERE p.state = 'approved' AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count
  ) selfs

  ORDER BY distance
  LIMIT match_count;
$$;

-- Defense in depth: PostgREST exposes RPCs to anon by default, and Postgres grants EXECUTE to
-- PUBLIC. Remove that surface entirely so only the service-role bridge can call recall — instead of
-- relying on RLS to merely return zero rows to an anon caller. service_role gets its grant via
-- PUBLIC, so it must be re-granted explicitly after the revoke or the bridge would lose access.
REVOKE EXECUTE ON FUNCTION relay_recall(vector(1024), int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION relay_recall(vector(1024), int) TO service_role;
