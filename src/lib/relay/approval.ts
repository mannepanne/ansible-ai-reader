// ABOUT: Relay approval — the human gate's promote-to-recallable step (and its reject twin)
// ABOUT: approve embeds the body (sealed fn) then atomically flips a pending piece to approved

import type { ToolDeps } from './tools';
import { embed } from './embed';

// Derive a URL-safe slug from a piece title. Not enforced unique in Stage 1 (the blog deploy,
// built later, can dedup); collisions are benign while pieces only live behind the gate.
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

function titleFromBody(body: string): string {
  for (const line of body.split('\n')) {
    const m = line.match(/^#+\s+(.*\S)\s*$/);
    if (m) return m[1].trim();
  }
  return body.split('\n').map((l) => l.trim()).find(Boolean) ?? 'untitled';
}

/**
 * Approve a piece (from pending_review OR rejected — the operator may re-decide): embed its body with
 * the ONE sealed embed fn (so self-vectors match the recall path), then a single guarded update sets
 * state=approved + slug + embedding + decided_at together. The `.in('state', [...])` guard keeps the
 * operation re-drivable — there is never an approved-but-unembedded window, and a racing change errors
 * cleanly rather than double-publishing. An already-approved piece is an idempotent no-op (no re-embed).
 * `approved` = embedded + recallable-as-self.
 */
export async function approvePiece(
  deps: ToolDeps,
  args: { id: string },
): Promise<{ ok: true; id: string; slug: string }> {
  const id = args?.id?.trim();
  if (!id) {
    throw new Error('approve: id is required');
  }

  const { data: piece, error: fetchError } = await deps.supabase
    .from('relay_pieces')
    .select('id, body, state, slug')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) {
    throw new Error(`approve: ${fetchError.message}`);
  }
  if (!piece) {
    throw new Error(`approve: no piece found for id ${id}`);
  }
  if (piece.state === 'approved') {
    return { ok: true, id, slug: (piece.slug as string) ?? '' };
  }

  const embedding = await embed(deps.ai, piece.body as string);
  const slug = slugify(titleFromBody(piece.body as string));

  const { data: updated, error: updateError } = await deps.supabase
    .from('relay_pieces')
    .update({ state: 'approved', slug, embedding, decided_at: new Date().toISOString() })
    .eq('id', id)
    .in('state', ['pending_review', 'rejected'])
    .select('id')
    .maybeSingle();
  if (updateError) {
    throw new Error(`approve: ${updateError.message}`);
  }
  if (!updated) {
    throw new Error(`approve: piece ${id} could not be approved (state changed under us?)`);
  }

  return { ok: true, id, slug };
}

/**
 * Reject a piece (from pending_review OR approved — the operator may un-approve). Clearing embedding +
 * slug makes a previously-approved piece stop being recallable and preserves the "rejected = never
 * embedded" invariant. Guarded with `.in('state', [...])` for the same re-drivability as approve.
 */
export async function rejectPiece(deps: ToolDeps, args: { id: string }): Promise<{ ok: true; id: string }> {
  const id = args?.id?.trim();
  if (!id) {
    throw new Error('reject: id is required');
  }

  const { data: updated, error } = await deps.supabase
    .from('relay_pieces')
    .update({ state: 'rejected', embedding: null, slug: null, decided_at: new Date().toISOString() })
    .eq('id', id)
    .in('state', ['pending_review', 'approved'])
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`reject: ${error.message}`);
  }
  if (!updated) {
    throw new Error(`reject: piece ${id} not found or already rejected`);
  }

  return { ok: true, id };
}
