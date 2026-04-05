// ABOUT: Admin API route to export all data for a given email (GDPR data portability)
// ABOUT: Requires authenticated admin session; returns JSON file attachment

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
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

  // Fetch all data for this email from analytics tables (no FK dependencies, safe to parallelize)
  const [capturesResult, sessionsResult, eventsResult] = await Promise.all([
    db.from('email_captures').select('*').eq('email', email),
    db.from('demo_sessions').select('*').eq('email', email),
    db.from('demo_events').select('*').eq('email', email),
  ]);

  if (capturesResult.error || sessionsResult.error || eventsResult.error) {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }

  const exportData = {
    email,
    exportedAt: new Date().toISOString(),
    emailCaptures: capturesResult.data ?? [],
    demoSessions: sessionsResult.data ?? [],
    demoEvents: eventsResult.data ?? [],
  };

  const filename = `ansible-data-${email.replace(/[^a-zA-Z0-9]/g, '_')}.json`;

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
