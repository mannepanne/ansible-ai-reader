// ABOUT: Tests for the Relay bridge tool implementations (recall/fetch/write_pending/ingest_reference)
// ABOUT: Verifies the owned-memory behaviours each MCP tool exposes, with Supabase + AI + Reader mocked

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbed = vi.fn();
vi.mock('./embed', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  EMBEDDING_DIM: 1024,
}));

const mockFetchArticleContent = vi.fn();
vi.mock('../reader-api', () => ({
  fetchArticleContent: (...args: unknown[]) => mockFetchArticleContent(...args),
}));

const mockGroundedSearch = vi.fn();
vi.mock('./grounded-search', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, groundedSearch: (...args: unknown[]) => mockGroundedSearch(...args) };
});

import { recall, fetchById, writePending, ingestReference, research, normalizeSourceUrl, RESEARCH_ORIGIN } from './tools';
import { RESEARCH_UNAVAILABLE } from './grounded-search';

// A tiny chainable Supabase stub. Each method records its args and returns `this` until a
// terminal (maybeSingle/single/upsert/rpc) resolves the configured result.
function makeSupabase(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown> = {};
  const terminal = {
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn(),
    ...overrides,
  };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.maybeSingle = terminal.maybeSingle;
  builder.single = terminal.single;
  // insert(...).select(...).single() — insert returns the same builder, select chains, single resolves.
  builder.upsert = terminal.upsert;
  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
    rpc: terminal.rpc,
    __calls: calls,
    __builder: builder,
  };
  return supabase as never;
}

const deps = (supabase: unknown, extra: Record<string, unknown> = {}) =>
  ({ supabase, ai: { run: vi.fn() }, readerToken: 'reader-tok', ...extra }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue(new Array(1024).fill(0.1));
});

describe('recall', () => {
  it('embeds the stimulus and returns cosine-ranked neighbours via the relay_recall RPC', async () => {
    const supabase = makeSupabase();
    (supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc.mockResolvedValue({
      data: [
        { id: 'r1', kind: 'reference', title: 'A', summary: 'sa', concepts: [], distance: 0.1 },
        { id: 'p1', kind: 'self', title: null, summary: 'sp', concepts: ['x'], distance: 0.2 },
      ],
      error: null,
    });

    const out = await recall(deps(supabase), { stimulus_text: 'hello', k: 5 });

    expect(mockEmbed).toHaveBeenCalledTimes(1);
    const rpc = (supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith('relay_recall', {
      query_embedding: expect.any(Array),
      match_count: 5,
    });
    expect(out).toEqual([
      { id: 'r1', kind: 'reference', title: 'A', summary: 'sa', concepts: [] },
      { id: 'p1', kind: 'self', title: null, summary: 'sp', concepts: ['x'] },
    ]);
  });

  it('defaults and clamps k to the allowed range', async () => {
    const supabase = makeSupabase();
    (supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc.mockResolvedValue({ data: [], error: null });

    await recall(deps(supabase), { stimulus_text: 'hi' });
    expect((supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'relay_recall',
      expect.objectContaining({ match_count: 8 }),
    );

    await recall(deps(supabase), { stimulus_text: 'hi', k: 999 });
    expect((supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenLastCalledWith(
      'relay_recall',
      expect.objectContaining({ match_count: 50 }),
    );
  });

  it('rejects an empty stimulus', async () => {
    await expect(recall(deps(makeSupabase()), { stimulus_text: '  ' })).rejects.toThrow(/stimulus_text/);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('throws when the RPC errors', async () => {
    const supabase = makeSupabase();
    (supabase as never as { rpc: ReturnType<typeof vi.fn> }).rpc.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(recall(deps(supabase), { stimulus_text: 'x' })).rejects.toThrow(/boom/);
  });
});

describe('fetchById', () => {
  it('fetches a reference full body via the Reader API when it has a source_ref', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle.mockResolvedValueOnce(
      { data: { id: 'r1', title: 'Title', content: 'stored summary', source_ref: 'reader-99', origin: 'ansible_backfill' }, error: null },
    );
    mockFetchArticleContent.mockResolvedValue({ title: 'Full Title', content: 'FULL BODY', url: 'u', author: 'a' });

    const out = await fetchById(deps(supabase), { id: 'r1' });

    expect(mockFetchArticleContent).toHaveBeenCalledWith('reader-99', 'reader-tok');
    expect(out).toEqual({ id: 'r1', kind: 'reference', title: 'Title', text: 'FULL BODY' });
  });

  it('degrades to the stored content when the Reader API fetch fails', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle.mockResolvedValueOnce(
      { data: { id: 'r1', title: 'Title', content: 'stored summary', source_ref: 'reader-99', origin: 'ansible_backfill' }, error: null },
    );
    mockFetchArticleContent.mockRejectedValue(new Error('422 no body'));

    const out = await fetchById(deps(supabase), { id: 'r1' });
    expect(out).toEqual({ id: 'r1', kind: 'reference', title: 'Title', text: 'stored summary', degraded: 'summary_only' });
  });

  it('returns stored content for a reference with no source_ref (no Reader call)', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle.mockResolvedValueOnce(
      { data: { id: 'r2', title: 'Res', content: 'research text', source_ref: null, origin: 'research' }, error: null },
    );

    const out = await fetchById(deps(supabase), { id: 'r2' });
    expect(mockFetchArticleContent).not.toHaveBeenCalled();
    expect(out).toEqual({ id: 'r2', kind: 'reference', title: 'Res', text: 'research text' });
  });

  it('returns stored content for a research ref even when source_ref is a URL (never round-trips Reader)', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle.mockResolvedValueOnce(
      { data: { id: 'r3', title: 'Res', content: 'the snippet', source_ref: 'https://a.example/x', origin: 'research' }, error: null },
    );

    const out = await fetchById(deps(supabase), { id: 'r3' });
    expect(mockFetchArticleContent).not.toHaveBeenCalled(); // origin==='research' short-circuits the Reader path
    expect(out).toEqual({ id: 'r3', kind: 'reference', title: 'Res', text: 'the snippet' });
  });

  it('falls through to a piece body when the id is not a reference', async () => {
    const supabase = makeSupabase();
    const maybeSingle = (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle;
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // reference lookup miss
      .mockResolvedValueOnce({ data: { id: 'p1', body: 'PIECE BODY', summary: 's' }, error: null }); // piece hit

    const out = await fetchById(deps(supabase), { id: 'p1' });
    expect(out).toEqual({ id: 'p1', kind: 'self', title: null, text: 'PIECE BODY' });
  });

  it('throws when neither a reference nor a piece matches', async () => {
    const supabase = makeSupabase();
    const maybeSingle = (supabase as never as { __builder: { maybeSingle: ReturnType<typeof vi.fn> } }).__builder.maybeSingle;
    maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchById(deps(supabase), { id: 'ghost' })).rejects.toThrow(/ghost/);
  });

  it('rejects a missing id', async () => {
    await expect(fetchById(deps(makeSupabase()), { id: '' })).rejects.toThrow(/id/);
  });
});

describe('writePending', () => {
  it('inserts a pending_review piece with embedding left null and returns plain success', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({
      data: { id: 'new-piece' },
      error: null,
    });

    const out = await writePending(deps(supabase), {
      body: 'the piece',
      summary: 'a summary',
      concepts: ['memory', 'voice'],
      links: [{ id: 'r1' }],
    });

    const insert = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert;
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ body: 'the piece', summary: 'a summary', concepts: ['memory', 'voice'], links: [{ id: 'r1' }] });
    expect(row).not.toHaveProperty('embedding');
    expect(row).not.toHaveProperty('state');
    expect(out).toEqual({ ok: true });
  });

  it("derives verification_status='sourced' when the piece carries a type:'source' link", async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });

    await writePending(deps(supabase), {
      body: 'grounded piece',
      links: [
        { type: 'recall', ref: 'uuid-1' },
        { type: 'source', ref: 'https://a.example', title: 'A' },
      ],
    });

    const insert = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert;
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.verification_status).toBe('sourced');
  });

  it("leaves verification_status='unverified' when there is no source link", async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });

    await writePending(deps(supabase), { body: 'ungrounded', links: [{ type: 'recall', ref: 'uuid-1' }] });

    const insert = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert;
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.verification_status).toBe('unverified');
  });

  it('coerces a JSON-STRING links argument (the LLM stringify quirk) instead of throwing', async () => {
    // The live agent intermittently sends `links` as a JSON string rather than a native array —
    // `hasSourceLink` would throw `links.some is not a function` and the whole write is lost if the
    // agent doesn't retry. Coerce defensively: parse the string, keep the source links, stay 'sourced'.
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });

    await writePending(deps(supabase), {
      body: 'grounded piece',
      links: '[{"type":"source","ref":"https://a.example","title":"A"},{"type":"recall","ref":"uuid-1"}]' as never,
    });

    const insert = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert;
    const row = insert.mock.calls[0][0] as { verification_status: string; links: unknown[] };
    expect(row.verification_status).toBe('sourced');
    expect(row.links).toEqual([
      { type: 'source', ref: 'https://a.example', title: 'A' },
      { type: 'recall', ref: 'uuid-1' },
    ]);
  });

  it('wraps a single link object passed instead of an array', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });
    await writePending(deps(supabase), { body: 'x', links: { type: 'source', ref: 'https://a.example' } as never });
    const row = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert.mock.calls[0][0] as { links: unknown[]; verification_status: string };
    expect(row.links).toEqual([{ type: 'source', ref: 'https://a.example' }]);
    expect(row.verification_status).toBe('sourced');
  });

  it('coerces an unparseable links string to an empty array (no throw)', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });
    await writePending(deps(supabase), { body: 'x', links: 'not json at all' as never });
    const row = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert.mock.calls[0][0] as { links: unknown[]; verification_status: string };
    expect(row.links).toEqual([]);
    expect(row.verification_status).toBe('unverified');
  });

  it('coerces a JSON-string concepts argument to an array (same LLM quirk, text[] column)', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({ data: { id: 'p' }, error: null });
    await writePending(deps(supabase), { body: 'x', concepts: '["memory","voice"]' as never });
    const row = (supabase as never as { __builder: { insert: ReturnType<typeof vi.fn> } }).__builder.insert.mock.calls[0][0] as { concepts: unknown };
    expect(row.concepts).toEqual(['memory', 'voice']);
  });

  it('rejects an empty body', async () => {
    await expect(writePending(deps(makeSupabase()), { body: '   ' } as never)).rejects.toThrow(/body/);
  });

  it('throws when the insert errors', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { single: ReturnType<typeof vi.fn> } }).__builder.single.mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    });
    await expect(writePending(deps(supabase), { body: 'x' } as never)).rejects.toThrow(/insert failed/);
  });
});

describe('ingestReference', () => {
  it('embeds the text and upserts a research reference', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { upsert: ReturnType<typeof vi.fn> } }).__builder.upsert.mockResolvedValue({ error: null });

    const out = await ingestReference(deps(supabase), { source_ref: 'https://x', title: 'T', text: 'body text' });

    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), 'body text');
    const upsert = (supabase as never as { __builder: { upsert: ReturnType<typeof vi.fn> } }).__builder.upsert;
    const [row, opts] = upsert.mock.calls[0];
    expect(row).toMatchObject({ origin: RESEARCH_ORIGIN, source_ref: 'https://x', title: 'T', content: 'body text' });
    expect((row as { embedding: unknown }).embedding).toHaveLength(1024);
    expect(opts).toEqual({ onConflict: 'origin,source_ref' });
    expect(out).toEqual({ ok: true });
  });

  it('normalises source_ref so tracking params + trailing slash dedup to one key', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { upsert: ReturnType<typeof vi.fn> } }).__builder.upsert.mockResolvedValue({ error: null });

    await ingestReference(deps(supabase), { source_ref: 'https://Example.com/x/?utm_source=z', text: 'body' });

    const upsert = (supabase as never as { __builder: { upsert: ReturnType<typeof vi.fn> } }).__builder.upsert;
    const row = upsert.mock.calls[0][0] as { source_ref: string };
    expect(row.source_ref).toBe('https://example.com/x');
  });

  it('rejects empty text', async () => {
    await expect(ingestReference(deps(makeSupabase()), { source_ref: 'https://x', text: ' ' } as never)).rejects.toThrow(/text/);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('rejects a missing source_ref (never inserts a null-source dupe)', async () => {
    await expect(ingestReference(deps(makeSupabase()), { text: 'x' } as never)).rejects.toThrow(/source_ref/);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('throws when the upsert errors', async () => {
    const supabase = makeSupabase();
    (supabase as never as { __builder: { upsert: ReturnType<typeof vi.fn> } }).__builder.upsert.mockResolvedValue({
      error: { message: 'dup' },
    });
    await expect(ingestReference(deps(supabase), { source_ref: 'https://x', text: 'x' } as never)).rejects.toThrow(/dup/);
  });
});

describe('normalizeSourceUrl', () => {
  it('forces https, lowercases host, strips tracking params + trailing slash', () => {
    expect(normalizeSourceUrl('http://Example.COM/a/?utm_source=x&keep=1')).toBe('https://example.com/a?keep=1');
    expect(normalizeSourceUrl('https://example.com/a/')).toBe('https://example.com/a');
    expect(normalizeSourceUrl('example.com/a')).toBe('https://example.com/a');
  });

  it('falls back to the trimmed original when unparseable', () => {
    expect(normalizeSourceUrl('  not a url with spaces  ')).toBe('not a url with spaces');
  });
});

describe('research', () => {
  it('delegates to grounded-search with the perplexity key and trusted sources', async () => {
    mockGroundedSearch.mockResolvedValue({ findings: [{ quote: 'q', source_url: 'https://a', source_title: 't' }] });

    const out = await research(deps(makeSupabase(), { perplexityKey: 'pk' }), { query: 'a fact', k: 3 });

    expect(mockGroundedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'pk', trustedSources: expect.any(Array) }),
      { query: 'a fact', k: 3 },
    );
    expect(out.findings).toHaveLength(1);
  });

  it('fails CLOSED (degraded, no call) when no perplexity key is configured', async () => {
    const out = await research(deps(makeSupabase()), { query: 'a fact' });
    expect(mockGroundedSearch).not.toHaveBeenCalled();
    expect(out).toEqual({ findings: [], degraded: RESEARCH_UNAVAILABLE });
  });

  it('rejects an empty query', async () => {
    await expect(research(deps(makeSupabase(), { perplexityKey: 'pk' }), { query: '  ' })).rejects.toThrow(/query/);
  });
});
