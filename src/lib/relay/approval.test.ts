// ABOUT: Tests for Relay approval/rejection — the human gate's promote-to-recallable step
// ABOUT: approve embeds (sealed fn) then atomically flips a pending piece to approved; reject marks it

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbed = vi.fn();
vi.mock('./embed', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  EMBEDDING_DIM: 1024,
}));

import { approvePiece, rejectPiece, slugify } from './approval';

// Stub supporting both chains on relay_pieces:
//   fetch:  from().select().eq().maybeSingle()
//   update: from().update().eq().eq().select().maybeSingle()
function makeSupabase({
  piece = undefined as undefined | Record<string, unknown>,
  fetchError = null as { message: string } | null,
  updateResult = { id: 'p1' } as Record<string, unknown> | null,
  updateError = null as { message: string } | null,
} = {}) {
  const recorded: { update?: Record<string, unknown>; eqs: unknown[][]; ins: unknown[][] } = { eqs: [], ins: [] };
  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
  updateChain.eq = vi.fn((...a: unknown[]) => (recorded.eqs.push(a), updateChain));
  updateChain.in = vi.fn((...a: unknown[]) => (recorded.ins.push(a), updateChain));
  updateChain.select = vi.fn(() => updateChain);
  updateChain.maybeSingle = vi.fn(() => Promise.resolve({ data: updateResult, error: updateError }));
  const selectChain: Record<string, ReturnType<typeof vi.fn>> = {};
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.maybeSingle = vi.fn(() => Promise.resolve({ data: piece, error: fetchError }));
  const table = {
    select: vi.fn(() => selectChain),
    update: vi.fn((vals: Record<string, unknown>) => ((recorded.update = vals), updateChain)),
  };
  const supabase = {
    from: vi.fn(() => table),
    __recorded: recorded,
    __table: table,
    __updateChain: updateChain,
  };
  return supabase as never;
}

const deps = (supabase: unknown) => ({ supabase, ai: { run: vi.fn() } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue(new Array(1024).fill(0.2));
});

describe('slugify', () => {
  it('lowercases and hyphenates, trimming non-alphanumerics', () => {
    expect(slugify('Seeing like a vendor')).toBe('seeing-like-a-vendor');
    expect(slugify('  The comfortable question!  ')).toBe('the-comfortable-question');
  });
  it('falls back to "untitled" for empty input', () => {
    expect(slugify('   ')).toBe('untitled');
  });
});

describe('approvePiece', () => {
  it('embeds the body then atomically sets approved + slug + embedding, guarded on pending|rejected', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# Seeing like a vendor\n\nThe submarine...', state: 'pending_review' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });

    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), '# Seeing like a vendor\n\nThe submarine...');
    const rec = (supabase as never as { __recorded: { update: Record<string, unknown>; eqs: unknown[][]; ins: unknown[][] } }).__recorded;
    expect(rec.update).toMatchObject({ state: 'approved', slug: 'seeing-like-a-vendor' });
    expect((rec.update.embedding as number[]).length).toBe(1024);
    expect(rec.update.decided_at).toEqual(expect.any(String));
    // guarded: only flips a row still in pending_review or rejected
    expect(rec.eqs).toContainEqual(['id', 'p1']);
    expect(rec.ins).toContainEqual(['state', ['pending_review', 'rejected']]);
    expect(out).toEqual({ ok: true, id: 'p1', slug: 'seeing-like-a-vendor' });
  });

  it('approves a REJECTED piece (operator re-decision), embedding it', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nx', state: 'rejected' }, updateResult: { id: 'p1' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });
    expect(mockEmbed).toHaveBeenCalled();
    expect(out).toEqual({ ok: true, id: 'p1', slug: 't' });
  });

  it('is an idempotent no-op for an already-approved piece (no re-embed, no update)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: 'x', state: 'approved', slug: 'existing' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });
    expect(out).toEqual({ ok: true, id: 'p1', slug: 'existing' });
    expect(mockEmbed).not.toHaveBeenCalled();
    expect((supabase as never as { __table: { update: ReturnType<typeof vi.fn> } }).__table.update).not.toHaveBeenCalled();
  });

  it('throws when the piece does not exist', async () => {
    await expect(approvePiece(deps(makeSupabase({ piece: undefined })), { id: 'ghost' })).rejects.toThrow(/ghost/);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('throws when the guarded update flips nothing (lost the race)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nx', state: 'pending_review' }, updateResult: null });
    await expect(approvePiece(deps(supabase), { id: 'p1' })).rejects.toThrow(/p1/);
  });

  it('requires an id', async () => {
    await expect(approvePiece(deps(makeSupabase()), { id: '' })).rejects.toThrow(/id/);
  });
});

describe('rejectPiece', () => {
  it('sets state=rejected + decided_at and CLEARS embedding+slug, guarded on pending|approved', async () => {
    const supabase = makeSupabase({ updateResult: { id: 'p1' } });
    const out = await rejectPiece(deps(supabase), { id: 'p1' });

    expect(mockEmbed).not.toHaveBeenCalled();
    const rec = (supabase as never as { __recorded: { update: Record<string, unknown>; eqs: unknown[][]; ins: unknown[][] } }).__recorded;
    expect(rec.update).toMatchObject({ state: 'rejected', embedding: null, slug: null });
    expect(rec.update.decided_at).toEqual(expect.any(String));
    expect(rec.ins).toContainEqual(['state', ['pending_review', 'approved']]);
    expect(out).toEqual({ ok: true, id: 'p1' });
  });

  it('throws when the piece is missing or already rejected', async () => {
    await expect(rejectPiece(deps(makeSupabase({ updateResult: null })), { id: 'p1' })).rejects.toThrow(/p1/);
  });

  it('requires an id', async () => {
    await expect(rejectPiece(deps(makeSupabase()), { id: '  ' })).rejects.toThrow(/id/);
  });
});
