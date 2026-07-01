// ABOUT: Admin API route to trigger a Relay session — enqueues a run on the relay queue (async)
// ABOUT: Admin-gated; the relay-session consumer worker runs the session and finalizes via the bridge

import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';

interface RelayQueue {
  send: (message: unknown) => Promise<void>;
}

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

  let body: { readerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const readerId = body.readerId?.trim();
  if (!readerId) {
    return NextResponse.json({ error: 'readerId is required' }, { status: 400 });
  }

  // Fast feedback: reject an unknown or summary-less item up front rather than as a silent consumer
  // breadcrumb the operator would have to go hunting for.
  const db = createServiceRoleClient();
  const { data: item } = await db
    .from('reader_items')
    .select('reader_id, title, short_summary')
    .eq('reader_id', readerId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: `No reader_item with reader_id ${readerId}` }, { status: 404 });
  }
  if (!item.short_summary?.trim()) {
    return NextResponse.json({ error: 'That item has no summary yet — nothing for Relay to react to' }, { status: 400 });
  }

  // The queue binding only exists in the Workers runtime — local `next dev` can't enqueue.
  let queue: RelayQueue | undefined;
  try {
    queue = (getCloudflareContext().env as { RELAY_QUEUE?: RelayQueue }).RELAY_QUEUE;
  } catch {
    /* local dev: bindings not available */
  }
  if (!queue) {
    return NextResponse.json(
      { error: 'Relay queue is not available in this environment — trigger sessions in production' },
      { status: 503 },
    );
  }

  await queue.send({ readerId });
  return NextResponse.json({ queued: true, readerId, title: item.title }, { status: 202 });
}
