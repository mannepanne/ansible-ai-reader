-- ABOUT: Relay recall — one ANN function over the owned-memory corpus for the bridge's recall tool
-- ABOUT: Unifies relay_references + APPROVED relay_pieces into a single cosine-ranked result set,
-- ABOUT: so the rented mind reaches conceptual neighbours through one service-role RPC.

-- The bridge embeds the stimulus (the one sealed bge-m3 fn) and calls this with the resulting
-- 1024-dim vector. Cosine distance (<=>) matches the vector_cosine_ops hnsw indexes from the
-- foundation migration, so this uses the ANN index rather than a brute-force scan.
--
-- Result shape mirrors the spec's recall surface: {id, kind, title, summary, concepts}.
-- Two tables are unified, so the columns are reconciled:
--   reference → kind='reference', title=title,        summary=content, concepts={} (no concepts col)
--   piece     → kind='self',      title=NULL,         summary=summary, concepts=concepts
-- relay_pieces has no title column; recall returns NULL there and leans on summary/concepts for
-- the self corpus. Only APPROVED pieces are recallable as self (pending/rejected never surface).
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
AS $$
  SELECT
    r.id,
    'reference'::text AS kind,
    r.title,
    r.content AS summary,
    '{}'::text[] AS concepts,
    (r.embedding <=> query_embedding) AS distance
  FROM relay_references r
  WHERE r.embedding IS NOT NULL

  UNION ALL

  SELECT
    p.id,
    'self'::text AS kind,
    NULL::text AS title,
    p.summary,
    p.concepts,
    (p.embedding <=> query_embedding) AS distance
  FROM relay_pieces p
  WHERE p.state = 'approved' AND p.embedding IS NOT NULL

  ORDER BY distance
  LIMIT match_count;
$$;
