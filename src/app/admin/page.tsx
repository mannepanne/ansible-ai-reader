// ABOUT: Admin analytics dashboard page — server component
// ABOUT: Guards access by auth session + is_admin flag; fetches analytics via service role

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import AdminContent from '@/components/admin/AdminContent';
import type { LandingStats, DemoStats, RelayStats } from '@/components/admin/types';

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
    relayPendingResult,
    relayPendingCountResult,
    relayApprovedCountResult,
    relayRejectedCountResult,
    relayWroteCountResult,
    relayDeclinedCountResult,
    relayDecisionsResult,
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
    db
      .from('relay_pieces')
      .select('id, body, summary, concepts, links, created_at')
      .order('created_at', { ascending: false })
      .eq('state', 'pending_review'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'pending_review'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'approved'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'rejected'),
    db.from('relay_decisions').select('*', { count: 'exact', head: true }).eq('verdict', 'wrote'),
    db.from('relay_decisions').select('*', { count: 'exact', head: true }).eq('verdict', 'declined'),
    db
      .from('relay_decisions')
      .select('verdict, piece_id, reason, degraded, stimulus_ref, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
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

  // Enrich the decision log: look up what the material was (reader_items titles behind each
  // stimulus_ref) and, for 'wrote' verdicts, a summary of the piece that resulted.
  const decisionRows = (relayDecisionsResult.data ?? []) as Array<{
    verdict: 'wrote' | 'declined';
    piece_id: string | null;
    reason: string | null;
    degraded: string | null;
    stimulus_ref: string[] | null;
    created_at: string;
  }>;
  const stimulusIds = [...new Set(decisionRows.flatMap((d) => d.stimulus_ref ?? []))];
  const wrotePieceIds = [...new Set(decisionRows.map((d) => d.piece_id).filter((x): x is string => !!x))];

  const [titlesResult, pieceSummaryResult] = await Promise.all([
    stimulusIds.length
      ? db.from('reader_items').select('reader_id, title').in('reader_id', stimulusIds)
      : Promise.resolve({ data: [] as { reader_id: string; title: string }[] }),
    wrotePieceIds.length
      ? db.from('relay_pieces').select('id, summary').in('id', wrotePieceIds)
      : Promise.resolve({ data: [] as { id: string; summary: string | null }[] }),
  ]);
  const titleByReaderId = new Map(
    ((titlesResult.data ?? []) as { reader_id: string; title: string }[]).map((r) => [r.reader_id, r.title]),
  );
  const summaryByPieceId = new Map(
    ((pieceSummaryResult.data ?? []) as { id: string; summary: string | null }[]).map((p) => [p.id, p.summary]),
  );

  // Build relay stats — pending pieces (read-only operator view) + decision log + per-state counts.
  const relayStats: RelayStats = {
    counts: {
      pendingReview: relayPendingCountResult.count ?? 0,
      approved: relayApprovedCountResult.count ?? 0,
      rejected: relayRejectedCountResult.count ?? 0,
      wrote: relayWroteCountResult.count ?? 0,
      declined: relayDeclinedCountResult.count ?? 0,
    },
    pending: (relayPendingResult.data ?? []).map((p: {
      id: string;
      body: string;
      summary: string | null;
      concepts: string[] | null;
      links: unknown[] | null;
      created_at: string;
    }) => ({
      id: p.id,
      body: p.body,
      summary: p.summary,
      concepts: p.concepts ?? [],
      recalledCount: (p.links ?? []).length,
      createdAt: p.created_at,
    })),
    decisions: decisionRows.map((d) => ({
      verdict: d.verdict,
      pieceId: d.piece_id,
      reason: d.reason,
      degraded: d.degraded,
      stimulusRef: d.stimulus_ref ?? [],
      stimulusTitles: (d.stimulus_ref ?? []).map((rid) => titleByReaderId.get(rid) ?? rid),
      pieceSummary: d.piece_id ? summaryByPieceId.get(d.piece_id) ?? null : null,
      createdAt: d.created_at,
    })),
  };

  return (
    <AdminContent
      userEmail={session.user.email ?? ''}
      landingStats={landingStats}
      demoStats={demoStats}
      relayStats={relayStats}
    />
  );
}
