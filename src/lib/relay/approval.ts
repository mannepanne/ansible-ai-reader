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
 * Approve a pending piece: embed its body with the ONE sealed embed fn (so self-vectors match the
 * recall path), then a single guarded update sets state=approved + slug + embedding + decided_at
 * together. The `.eq('state','pending_review')` guard means there is never an approved-but-unembedded
 * window and the operation is re-drivable — a second approve of an already-approved piece flips
 * nothing and errors cleanly rather than double-publishing. `approved` = embedded + recallable-as-self.
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
    .select('id, body, state')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) {
    throw new Error(`approve: ${fetchError.message}`);
  }
  if (!piece) {
    throw new Error(`approve: no piece found for id ${id}`);
  }
  if (piece.state !== 'pending_review') {
    throw new Error(`approve: piece ${id} is ${piece.state}, not pending_review`);
  }

  const embedding = await embed(deps.ai, piece.body as string);
  const slug = slugify(titleFromBody(piece.body as string));

  const { data: updated, error: updateError } = await deps.supabase
    .from('relay_pieces')
    .update({ state: 'approved', slug, embedding, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('state', 'pending_review')
    .select('id')
    .maybeSingle();
  if (updateError) {
    throw new Error(`approve: ${updateError.message}`);
  }
  if (!updated) {
    throw new Error(`approve: piece ${id} was not pending_review at write time (already decided?)`);
  }

  return { ok: true, id, slug };
}

/**
 * Reject a pending piece: state=rejected + decided_at, never embedded, never recallable. Guarded on
 * pending_review like approve. (A private calibration note is a later addition — needs a new column.)
 */
export async function rejectPiece(deps: ToolDeps, args: { id: string }): Promise<{ ok: true; id: string }> {
  const id = args?.id?.trim();
  if (!id) {
    throw new Error('reject: id is required');
  }

  const { data: updated, error } = await deps.supabase
    .from('relay_pieces')
    .update({ state: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('state', 'pending_review')
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`reject: ${error.message}`);
  }
  if (!updated) {
    throw new Error(`reject: piece ${id} not found or not pending_review`);
  }

  return { ok: true, id };
}
