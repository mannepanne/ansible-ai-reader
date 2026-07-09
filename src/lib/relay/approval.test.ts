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

const recOf = (supabase: unknown) =>
  (supabase as never as { __recorded: { update: Record<string, unknown>; eqs: unknown[][]; ins: unknown[][] } }).__recorded;
const updateFnOf = (supabase: unknown) =>
  (supabase as never as { __table: { update: ReturnType<typeof vi.fn> } }).__table.update;

describe('approvePiece', () => {
  it('embeds the body then atomically sets approved + slug + embedding, guarded on pending|rejected', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# Seeing like a vendor\n\nThe submarine...', state: 'pending_review' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });

    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), '# Seeing like a vendor\n\nThe submarine...');
    const rec = recOf(supabase);
    expect(rec.update).toMatchObject({ state: 'approved', slug: 'seeing-like-a-vendor' });
    expect((rec.update.embedding as number[]).length).toBe(1024);
    expect(rec.update.decided_at).toEqual(expect.any(String));
    // guarded: only flips a row still in pending_review or rejected
    expect(rec.eqs).toContainEqual(['id', 'p1']);
    expect(rec.ins).toContainEqual(['state', ['pending_review', 'rejected']]);
    // no note / no edit → those columns are not written
    expect(rec.update).not.toHaveProperty('review_note');
    expect(rec.update).not.toHaveProperty('body');
    expect(rec.update).not.toHaveProperty('original_body');
    expect(out).toEqual({ ok: true, id: 'p1', slug: 'seeing-like-a-vendor' });
  });

  it('approves a REJECTED piece (operator re-decision), embedding it', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nx', state: 'rejected' }, updateResult: { id: 'p1' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });
    expect(mockEmbed).toHaveBeenCalled();
    expect(out).toEqual({ ok: true, id: 'p1', slug: 't' });
  });

  it('persists a review_note alongside the approval transition', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nx', state: 'pending_review' } });
    await approvePiece(deps(supabase), { id: 'p1', note: '  kept, but the 2nd para is soft  ' });
    expect(recOf(supabase).update).toMatchObject({ state: 'approved', review_note: 'kept, but the 2nd para is soft' });
  });

  // --- approve-with-edit (§B) ---
  it('approve-with-edit: stores original_body (write-once), replaces body, embeds the EDITED text', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\noriginal prose', state: 'pending_review', original_body: null } });
    await approvePiece(deps(supabase), { id: 'p1', edited_body: '# T\n\nedited prose' });
    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), '# T\n\nedited prose');
    expect(recOf(supabase).update).toMatchObject({ state: 'approved', body: '# T\n\nedited prose', original_body: '# T\n\noriginal prose' });
  });

  it('approve-with-edit: original_body is WRITE-ONCE — a re-approve edit does not clobber the first draft', async () => {
    // piece was edited before (original_body already set), rejected, now re-approved with a NEW edit
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nsecond prose', state: 'rejected', original_body: '# T\n\nfirst draft' } });
    await approvePiece(deps(supabase), { id: 'p1', edited_body: '# T\n\nthird prose' });
    expect(recOf(supabase).update).toMatchObject({ body: '# T\n\nthird prose' });
    expect(recOf(supabase).update).not.toHaveProperty('original_body'); // not re-written
  });

  it('approve-with-edit: an edit equal to the stored body is a plain approve (no original_body, embeds body)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nsame', state: 'pending_review', original_body: null } });
    await approvePiece(deps(supabase), { id: 'p1', edited_body: '# T\n\nsame' });
    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), '# T\n\nsame');
    expect(recOf(supabase).update).not.toHaveProperty('original_body');
    expect(recOf(supabase).update).not.toHaveProperty('body');
  });

  it('approve-with-edit: an empty/whitespace edited_body is ignored (plain approve of the stored body)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: '# T\n\nkeep me', state: 'pending_review', original_body: null } });
    await approvePiece(deps(supabase), { id: 'p1', edited_body: '   ' });
    expect(mockEmbed).toHaveBeenCalledWith(expect.anything(), '# T\n\nkeep me');
    expect(recOf(supabase).update).not.toHaveProperty('original_body');
  });

  // --- already-approved (§C truth table) ---
  it('is an idempotent no-op for an already-approved piece with no note/edit (no re-embed, no update)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: 'x', state: 'approved', slug: 'existing' } });
    const out = await approvePiece(deps(supabase), { id: 'p1' });
    expect(out).toEqual({ ok: true, id: 'p1', slug: 'existing' });
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(updateFnOf(supabase)).not.toHaveBeenCalled();
  });

  it('already-approved + note: persists the note in place, no re-embed, edit IGNORED', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', body: 'x', state: 'approved', slug: 'existing' } });
    const out = await approvePiece(deps(supabase), { id: 'p1', note: 'second para is soft', edited_body: '# T\n\nrewrite' });
    expect(out).toEqual({ ok: true, id: 'p1', slug: 'existing' });
    expect(mockEmbed).not.toHaveBeenCalled();
    const rec = recOf(supabase);
    expect(rec.update).toEqual({ review_note: 'second para is soft' }); // ONLY the note, no state/body/embedding
    expect(rec.eqs).toContainEqual(['id', 'p1']);
    expect(rec.ins).toEqual([]); // in-place: not the guarded transition
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
    const supabase = makeSupabase({ piece: { id: 'p1', state: 'pending_review' }, updateResult: { id: 'p1' } });
    const out = await rejectPiece(deps(supabase), { id: 'p1' });

    expect(mockEmbed).not.toHaveBeenCalled();
    const rec = recOf(supabase);
    expect(rec.update).toMatchObject({ state: 'rejected', embedding: null, slug: null });
    expect(rec.update.decided_at).toEqual(expect.any(String));
    expect(rec.ins).toContainEqual(['state', ['pending_review', 'approved']]);
    expect(out).toEqual({ ok: true, id: 'p1' });
  });

  it('persists a review_note (the reject reason) on the transition', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', state: 'pending_review' }, updateResult: { id: 'p1' } });
    await rejectPiece(deps(supabase), { id: 'p1', note: '  announced-turn tell in para 3  ' });
    expect(recOf(supabase).update).toMatchObject({ state: 'rejected', review_note: 'announced-turn tell in para 3' });
  });

  it('already-rejected + note: persists the note in place, no state churn', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', state: 'rejected' }, updateResult: { id: 'p1' } });
    const out = await rejectPiece(deps(supabase), { id: 'p1', note: 'still too abstract' });
    const rec = recOf(supabase);
    expect(rec.update).toEqual({ review_note: 'still too abstract' });
    expect(rec.ins).toEqual([]); // in-place, not the guarded transition
    expect(out).toEqual({ ok: true, id: 'p1' });
  });

  it('already-rejected + no note: idempotent no-op (does NOT throw — softened from before)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', state: 'rejected' } });
    const out = await rejectPiece(deps(supabase), { id: 'p1' });
    expect(out).toEqual({ ok: true, id: 'p1' });
    expect(updateFnOf(supabase)).not.toHaveBeenCalled();
  });

  it('throws when the piece does not exist', async () => {
    await expect(rejectPiece(deps(makeSupabase({ piece: undefined })), { id: 'ghost' })).rejects.toThrow(/ghost/);
  });

  it('throws when the guarded update flips nothing (lost the race)', async () => {
    const supabase = makeSupabase({ piece: { id: 'p1', state: 'pending_review' }, updateResult: null });
    await expect(rejectPiece(deps(supabase), { id: 'p1' })).rejects.toThrow(/p1/);
  });

  it('requires an id', async () => {
    await expect(rejectPiece(deps(makeSupabase()), { id: '  ' })).rejects.toThrow(/id/);
  });
});
