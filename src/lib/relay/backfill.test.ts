// ABOUT: Tests for the one-time Relay reference back-fill
// ABOUT: Covers reference-body assembly, idempotent upsert, skipping, and per-item failure counting

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runBackfill,
  buildReferenceContent,
  BACKFILL_ORIGIN,
} from './backfill';
import { EMBEDDING_DIM, type AiBinding } from './embed';

const vector = () => Array.from({ length: EMBEDDING_DIM }, () => 0.01);

function aiReturning(): AiBinding {
  return { run: vi.fn().mockResolvedValue({ data: [vector()] }) };
}

describe('buildReferenceContent', () => {
  it('labels and joins both summaries when present', () => {
    const out = buildReferenceContent({
      reader_id: 'r1',
      title: 't',
      short_summary: 'the summary',
      commentariat_summary: 'the counter',
    });
    expect(out).toContain('Summary:\nthe summary');
    expect(out).toContain('Counter-case:\nthe counter');
  });

  it('uses only the summary when commentary is missing', () => {
    const out = buildReferenceContent({
      reader_id: 'r1', title: 't', short_summary: 'only summary', commentariat_summary: null,
    });
    expect(out).toBe('Summary:\nonly summary');
  });

  it('returns null when both summaries are empty or whitespace', () => {
    expect(
      buildReferenceContent({ reader_id: 'r1', title: 't', short_summary: '  ', commentariat_summary: null }),
    ).toBeNull();
  });
});

describe('runBackfill', () => {
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockUpsert: ReturnType<typeof vi.fn>;
  let supabase: any;

  beforeEach(() => {
    mockSelect = vi.fn();
    mockUpsert = vi.fn().mockResolvedValue({ error: null });
    supabase = {
      from: vi.fn((table: string) => {
        if (table === 'reader_items') return { select: mockSelect };
        if (table === 'relay_references') return { upsert: mockUpsert };
        return {};
      }),
    };
  });

  it('embeds non-empty items and upserts them idempotently', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { reader_id: 'r1', title: 'A', short_summary: 'sa', commentariat_summary: 'ca' },
        { reader_id: 'r2', title: 'B', short_summary: 'sb', commentariat_summary: null },
      ],
      error: null,
    });
    const ai = aiReturning();

    const result = await runBackfill({ supabase, ai });

    expect(result).toEqual({ scanned: 2, ingested: 2, skippedEmpty: 0, failed: 0 });
    expect(ai.run).toHaveBeenCalledTimes(2);
    // Upsert carries the dedup key and the embedding
    const [row, opts] = mockUpsert.mock.calls[0];
    expect(row).toMatchObject({ origin: BACKFILL_ORIGIN, source_ref: 'r1', title: 'A' });
    expect(row.embedding).toHaveLength(EMBEDDING_DIM);
    expect(opts).toEqual({ onConflict: 'origin,source_ref' });
  });

  it('skips items whose summaries are both empty (no embed, no upsert)', async () => {
    mockSelect.mockResolvedValue({
      data: [{ reader_id: 'r1', title: 'A', short_summary: null, commentariat_summary: '' }],
      error: null,
    });
    const ai = aiReturning();

    const result = await runBackfill({ supabase, ai });

    expect(result).toEqual({ scanned: 1, ingested: 0, skippedEmpty: 1, failed: 0 });
    expect(ai.run).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('counts an upsert error as failed without aborting the run', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { reader_id: 'r1', title: 'A', short_summary: 'sa', commentariat_summary: null },
        { reader_id: 'r2', title: 'B', short_summary: 'sb', commentariat_summary: null },
      ],
      error: null,
    });
    mockUpsert
      .mockResolvedValueOnce({ error: { message: 'boom' } })
      .mockResolvedValueOnce({ error: null });

    const result = await runBackfill({ supabase, ai: aiReturning() });

    expect(result).toEqual({ scanned: 2, ingested: 1, skippedEmpty: 0, failed: 1 });
  });

  it('counts an embedding failure as failed without aborting the run', async () => {
    mockSelect.mockResolvedValue({
      data: [{ reader_id: 'r1', title: 'A', short_summary: 'sa', commentariat_summary: null }],
      error: null,
    });
    const ai: AiBinding = { run: vi.fn().mockRejectedValue(new Error('AI down')) };

    const result = await runBackfill({ supabase, ai });

    expect(result).toEqual({ scanned: 1, ingested: 0, skippedEmpty: 0, failed: 1 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('treats a null reader_items result (no error) as zero rows', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });
    const result = await runBackfill({ supabase, ai: aiReturning() });
    expect(result).toEqual({ scanned: 0, ingested: 0, skippedEmpty: 0, failed: 0 });
  });

  it('handles a non-Error embedding rejection without crashing', async () => {
    mockSelect.mockResolvedValue({
      data: [{ reader_id: 'r1', title: 'A', short_summary: 'sa', commentariat_summary: null }],
      error: null,
    });
    const ai: AiBinding = { run: vi.fn().mockRejectedValue('string failure') };
    const result = await runBackfill({ supabase, ai });
    expect(result.failed).toBe(1);
  });

  it('throws when reader_items cannot be read', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'no table' } });
    await expect(runBackfill({ supabase, ai: aiReturning() })).rejects.toThrow(/no table/);
  });
});
