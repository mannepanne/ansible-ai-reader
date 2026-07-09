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

// Trim an optional string arg (a reviewer note, or an edited body) to a non-empty value, or undefined.
// Used to treat blank/whitespace input as "not supplied" at every capture call site.
function trimToUndefined(s: unknown): string | undefined {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length ? t : undefined;
}

/**
 * Approve a piece per the Stage 2.2a review truth table (spec §C). Capture is decoupled from the transition guard:
 * a review action always records the human judgment, but the `.in('state', [...])` guard still prevents
 * double-*publishing* (double-embed), never the annotation.
 *
 * - pending_review | rejected → approved: embed the body with the ONE sealed fn (self-vectors match the
 *   recall path), then a single guarded update sets state + slug + embedding + decided_at (+ note/edit).
 * - **approve-with-edit** (§B): if `edited_body` is present, non-empty, and differs from the stored body,
 *   store the pre-edit body in `original_body` **write-once** (only when currently null — so a re-approve
 *   never clobbers the first draft), replace the body, and embed the EDITED text (what Magnus endorsed).
 * - already approved: no transition. With a note, persist it in place (no re-embed, edit ignored — we
 *   don't re-edit an endorsed body in 2.2a); without one, an idempotent no-op.
 */
export async function approvePiece(
  deps: ToolDeps,
  args: { id: string; note?: string; edited_body?: string },
): Promise<{ ok: true; id: string; slug: string }> {
  const id = args?.id?.trim();
  if (!id) {
    throw new Error('approve: id is required');
  }
  const note = trimToUndefined(args?.note);

  const { data: piece, error: fetchError } = await deps.supabase
    .from('relay_pieces')
    .select('id, body, state, slug, original_body')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) {
    throw new Error(`approve: ${fetchError.message}`);
  }
  if (!piece) {
    throw new Error(`approve: no piece found for id ${id}`);
  }

  const storedBody = piece.body as string;

  // Already approved: no re-publish. Persist a note in place if given (edit is ignored — §C), else no-op.
  if (piece.state === 'approved') {
    const slug = (piece.slug as string) ?? '';
    if (note) {
      const { error } = await deps.supabase
        .from('relay_pieces')
        .update({ review_note: note })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) {
        throw new Error(`approve: ${error.message}`);
      }
    }
    return { ok: true, id, slug };
  }

  // Transition pending_review | rejected → approved. Resolve the edit first (write-once original_body).
  const edited = trimToUndefined(args?.edited_body);
  const useEdit = edited !== undefined && edited !== storedBody;
  const finalBody = useEdit ? edited : storedBody;

  const embedding = await embed(deps.ai, finalBody);
  const slug = slugify(titleFromBody(finalBody));

  const update: Record<string, unknown> = { state: 'approved', slug, embedding, decided_at: new Date().toISOString() };
  if (note) update.review_note = note;
  if (useEdit) {
    update.body = finalBody;
    if (piece.original_body == null) update.original_body = storedBody; // write-once
  }

  const { data: updated, error: updateError } = await deps.supabase
    .from('relay_pieces')
    .update(update)
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
 * Reject a piece per the Stage 2.2a review truth table (spec §C).
 *
 * - pending_review | approved → rejected: clear embedding + slug (a previously-approved piece stops
 *   being recallable; preserves the "rejected = never embedded" invariant), set decided_at, guarded on
 *   `.in('state', [...])` for re-drivability. Persist the reject reason (`note`) if given.
 * - already rejected: no transition. With a note, persist it in place; without one, an **idempotent
 *   no-op** (softened from the old throw, so a re-reject never discards a note or errors on a re-run).
 */
export async function rejectPiece(
  deps: ToolDeps,
  args: { id: string; note?: string },
): Promise<{ ok: true; id: string }> {
  const id = args?.id?.trim();
  if (!id) {
    throw new Error('reject: id is required');
  }
  const note = trimToUndefined(args?.note);

  const { data: piece, error: fetchError } = await deps.supabase
    .from('relay_pieces')
    .select('id, state')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) {
    throw new Error(`reject: ${fetchError.message}`);
  }
  if (!piece) {
    throw new Error(`reject: no piece found for id ${id}`);
  }

  // Already rejected: no state churn. Persist a note in place if given, else an idempotent no-op.
  if (piece.state === 'rejected') {
    if (note) {
      const { error } = await deps.supabase
        .from('relay_pieces')
        .update({ review_note: note })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) {
        throw new Error(`reject: ${error.message}`);
      }
    }
    return { ok: true, id };
  }

  const update: Record<string, unknown> = { state: 'rejected', embedding: null, slug: null, decided_at: new Date().toISOString() };
  if (note) update.review_note = note;

  const { data: updated, error } = await deps.supabase
    .from('relay_pieces')
    .update(update)
    .eq('id', id)
    .in('state', ['pending_review', 'approved'])
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`reject: ${error.message}`);
  }
  if (!updated) {
    throw new Error(`reject: piece ${id} could not be rejected (state changed under us?)`);
  }

  return { ok: true, id };
}
