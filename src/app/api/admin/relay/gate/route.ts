// ABOUT: Admin API route for the Relay engagement-gate enable toggle (Stage 2.3b, default-off).
// ABOUT: PATCH flips the owner's flag. Admin-gated; writes the owner's users row via service role.
// ABOUT: The read side is server-rendered into the admin page (RelayStats.engagementGate), so no GET here.

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';

/** Returns an error response if the caller is not an authenticated admin, else null. */
async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();
  if (!userData?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function PATCH(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;

  const ownerId = process.env.RELAY_OWNER_USER_ID;
  if (!ownerId) {
    return NextResponse.json({ error: 'RELAY_OWNER_USER_ID is not configured' }, { status: 503 });
  }

  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Read the prior state so we can detect the OFF→ON transition (for the backlog baseline below).
  const { data: prev } = await db
    .from('users')
    .select('relay_engagement_gate_enabled')
    .eq('id', ownerId)
    .maybeSingle();
  const wasEnabled = !!prev?.relay_engagement_gate_enabled;

  const { error } = await db
    .from('users')
    .update({ relay_engagement_gate_enabled: body.enabled })
    .eq('id', ownerId);
  if (error) {
    return NextResponse.json({ error: 'Failed to update gate', detail: error.message }, { status: 500 });
  }

  // On OFF→ON, baseline-stamp all currently-archived, not-yet-evaluated owner items as "seen" so
  // enabling means "react to archives from here forward" — not a burst of every engaged archive
  // accumulated while the gate was off. The migration does this once at deploy; this does it at the
  // real start moment, every time the operator turns the gate on. New archives after this stay NULL
  // and fire normally. Guarded on `!wasEnabled` so a redundant ON→ON PATCH never stamps live pending
  // items (which must keep their NULL marker so they still fire).
  if (body.enabled && !wasEnabled) {
    const { error: stampError } = await db
      .from('reader_items')
      .update({ relay_triggered_at: new Date().toISOString() })
      .eq('user_id', ownerId)
      .eq('archived', true)
      .is('relay_triggered_at', null);
    if (stampError) {
      // Non-fatal: the flag is already flipped. Worst case is the backlog fires next sync (the
      // pre-baseline behaviour) — log it, but still report the toggle succeeded.
      console.error('[Relay gate] enabled, but backlog baseline-stamp failed:', stampError);
    }
  }

  return NextResponse.json({ enabled: body.enabled });
}
