// ABOUT: Admin API route to delete all data for a given email (GDPR compliance)
// ABOUT: Requires authenticated admin session; cascades through all analytics tables

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify admin role
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Cascade delete: events → sessions → captures (order matters for referential integrity)
  const [eventsResult, sessionsResult, capturesResult] = await Promise.all([
    db.from('demo_events').delete().eq('email', email),
    db.from('demo_sessions').delete().eq('email', email),
    db.from('email_captures').delete().eq('email', email),
  ]);

  if (eventsResult.error || sessionsResult.error || capturesResult.error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
