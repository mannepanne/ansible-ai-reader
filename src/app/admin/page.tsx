// ABOUT: Admin analytics dashboard page — server component
// ABOUT: Guards access by auth session + is_admin flag; fetches analytics via service role

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import AdminContent from '@/components/admin/AdminContent';
import type { LandingStats, DemoStats } from '@/components/admin/types';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  // Check admin role — users can read their own row via RLS
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (!userData?.is_admin) {
    redirect('/summaries');
  }

  // Fetch all analytics data with service role (bypasses RLS)
  const db = createServiceRoleClient();

  const [
    landingVisitsResult,
    visitorIdsResult,
    privacyViewsResult,
    signupsResult,
    navClicksResult,
    emailCapturesResult,
    sessionCountResult,
    interactionsResult,
    sessionsResult,
    eventTypesResult,
  ] = await Promise.all([
    db.from('page_events').select('*', { count: 'exact', head: true }).eq('event_type', 'landing_page_view'),
    db.from('page_events').select('visitor_id').eq('event_type', 'landing_page_view'),
    db.from('page_events').select('*', { count: 'exact', head: true }).eq('event_type', 'privacy_page_view'),
    db.from('page_events').select('*', { count: 'exact', head: true }).eq('event_type', 'demo_signup'),
    db.from('page_events').select('event_data').eq('event_type', 'nav_click'),
    db.from('email_captures').select('id, email, source, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('demo_sessions').select('*', { count: 'exact', head: true }),
    db.from('demo_events').select('*', { count: 'exact', head: true }),
    db.from('demo_sessions')
      .select('session_id, email, started_at, last_active_at, total_events')
      .order('started_at', { ascending: false })
      .limit(200),
    db.from('demo_events').select('event_type'),
  ]);

  // Build landing stats
  const uniqueVisitors = new Set(
    (visitorIdsResult.data ?? []).map((r: { visitor_id: string }) => r.visitor_id)
  ).size;

  const navClickCounts: Record<string, number> = {};
  (navClicksResult.data ?? []).forEach((e: { event_data: Record<string, unknown> | null }) => {
    const label = (e.event_data?.label as string) ?? 'unknown';
    navClickCounts[label] = (navClickCounts[label] ?? 0) + 1;
  });

  const sourceCounts: Record<string, number> = {};
  const capturedEmails = new Set<string>();
  (emailCapturesResult.data ?? []).forEach((e: { id: string; email: string; source: string; created_at: string }) => {
    sourceCounts[e.source] = (sourceCounts[e.source] ?? 0) + 1;
    capturedEmails.add(e.email);
  });

  const landingStats: LandingStats = {
    totalVisits: landingVisitsResult.count ?? 0,
    uniqueVisitors,
    privacyPageViews: privacyViewsResult.count ?? 0,
    demoSessions: sessionCountResult.count ?? 0,
    totalSignups: signupsResult.count ?? 0,
    navClicks: Object.entries(navClickCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    signupSources: Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count })),
  };

  // Build demo stats
  const eventTypeCounts: Record<string, number> = {};
  (eventTypesResult.data ?? []).forEach((e: { event_type: string }) => {
    eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] ?? 0) + 1;
  });

  const sessions = (sessionsResult.data ?? []).map((s: {
    session_id: string;
    email: string | null;
    started_at: string;
    last_active_at: string;
    total_events: number;
  }) => {
    const durationMs = new Date(s.last_active_at).getTime() - new Date(s.started_at).getTime();
    return {
      sessionId: s.session_id,
      email: s.email,
      startedAt: s.started_at,
      durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
      totalEvents: s.total_events,
    };
  });

  const avgDurationSeconds = sessions.length > 0
    ? Math.round(sessions.reduce((acc: number, s: { durationSeconds: number }) => acc + s.durationSeconds, 0) / sessions.length)
    : 0;

  const emailCaptures = (emailCapturesResult.data ?? []).map((e: {
    id: string;
    email: string;
    source: string;
    created_at: string;
  }) => ({
    id: e.id,
    email: e.email,
    source: e.source,
    createdAt: e.created_at,
  }));

  const demoStats: DemoStats = {
    emailCaptureCount: capturedEmails.size,
    sessionCount: sessionCountResult.count ?? 0,
    totalInteractions: interactionsResult.count ?? 0,
    avgDurationSeconds,
    eventTypeBreakdown: Object.entries(eventTypeCounts)
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count),
    sessions,
    emailCaptures,
  };

  return (
    <AdminContent
      userEmail={session.user.email ?? ''}
      landingStats={landingStats}
      demoStats={demoStats}
    />
  );
}
