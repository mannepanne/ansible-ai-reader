// ABOUT: Admin API route to approve/reject a Relay pending piece — proxies to the bridge control plane
// ABOUT: Admin-gated; the bridge (sole relay_* writer) does the embed+promote using RELAY_CONTROL_TOKEN

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const DEFAULT_BRIDGE_URL = 'https://ansible-relay-bridge.herrings.workers.dev';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userData } = await supabase.from('users').select('is_admin').eq('id', session.user.id).single();
  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'id and action (approve|reject) are required' }, { status: 400 });
  }

  // The gate-bypassing control plane uses the operator token, never the agent's bridge token.
  const token = process.env.RELAY_CONTROL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'RELAY_CONTROL_TOKEN is not configured' }, { status: 500 });
  }
  const base = process.env.RELAY_BRIDGE_URL || DEFAULT_BRIDGE_URL;

  // Writes stay behind the bridge (the sole relay_* writer); this route only proxies, admin-gated.
  const bridgeRes = await fetch(`${base}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const text = await bridgeRes.text();
  if (!bridgeRes.ok) {
    return NextResponse.json({ error: `bridge ${action} failed`, detail: text }, { status: 502 });
  }
  return NextResponse.json(JSON.parse(text), { status: 200 });
}
