// ABOUT: Admin analytics dashboard page — server component
// ABOUT: Guards access by auth session + is_admin flag; fetches analytics via service role

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import AdminContent from '@/components/admin/AdminContent';
import { buildPieceStimulusView } from '@/lib/relay/review-stimulus';
import type { StimulusRow } from '@/lib/relay/session-run';
import type { LandingStats, DemoStats, RelayStats, RelayPieceRow, PieceLink, DecisionSource } from '@/components/admin/types';

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
    relayApprovedPiecesResult,
    relayRejectedPiecesResult,
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
      .select('id, body, summary, concepts, links, verification_status, review_note, original_body, created_at')
      .order('created_at', { ascending: false })
      .eq('state', 'pending_review'),
    db
      .from('relay_pieces')
      .select('id, body, summary, concepts, links, verification_status, review_note, original_body, created_at')
      .order('created_at', { ascending: false })
      .eq('state', 'approved'),
    db
      .from('relay_pieces')
      .select('id, body, summary, concepts, links, verification_status, review_note, original_body, created_at')
      .order('created_at', { ascending: false })
      .eq('state', 'rejected'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'pending_review'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'approved'),
    db.from('relay_pieces').select('*', { count: 'exact', head: true }).eq('state', 'rejected'),
    db.from('relay_decisions').select('*', { count: 'exact', head: true }).eq('verdict', 'wrote'),
    db.from('relay_decisions').select('*', { count: 'exact', head: true }).eq('verdict', 'declined'),
    db
      .from('relay_decisions')
      .select('verdict, piece_id, reason, degraded, stimulus_ref, sources, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
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
    sources: DecisionSource[] | null;
    created_at: string;
  }>;
  const stimulusIds = [...new Set(decisionRows.flatMap((d) => d.stimulus_ref ?? []))];
  const wrotePieceIds = [...new Set(decisionRows.map((d) => d.piece_id).filter((x): x is string => !!x))];

  // Select the full formatStimulus field-set (not just titles) so the review screen can RECONSTRUCT
  // the stimulus behind each piece — see mapPiece / review-stimulus.ts.
  type StimulusItemRow = StimulusRow & { reader_id: string };
  const [titlesResult, pieceSummaryResult] = await Promise.all([
    stimulusIds.length
      ? db
          .from('reader_items')
          .select('reader_id, title, short_summary, commentariat_summary, tags, document_note, reader_note')
          .in('reader_id', stimulusIds)
      : Promise.resolve({ data: [] as StimulusItemRow[] }),
    wrotePieceIds.length
      ? db.from('relay_pieces').select('id, summary').in('id', wrotePieceIds)
      : Promise.resolve({ data: [] as { id: string; summary: string | null }[] }),
  ]);
  const stimulusItemRows = (titlesResult.data ?? []) as StimulusItemRow[];
  const titleByReaderId = new Map(stimulusItemRows.map((r) => [r.reader_id, r.title ?? '']));
  const itemsByReaderId = new Map<string, StimulusRow>(
    stimulusItemRows.map((r) => [
      r.reader_id,
      {
        title: r.title,
        short_summary: r.short_summary,
        commentariat_summary: r.commentariat_summary,
        tags: r.tags,
        document_note: r.document_note,
        reader_note: r.reader_note,
      },
    ]),
  );
  // Which stimulus (reader_ids) each written piece came from — from the decision that finalized it.
  // A re-decided piece (approve→reject→approve) has several decision rows; last-write-wins is safe
  // here because the stimulus_ref is the same across them (the underlying item doesn't change).
  const stimulusRefByPieceId = new Map<string, string[]>(
    decisionRows
      .filter((d) => d.piece_id)
      .map((d) => [d.piece_id as string, d.stimulus_ref ?? []]),
  );
  const summaryByPieceId = new Map(
    ((pieceSummaryResult.data ?? []) as { id: string; summary: string | null }[]).map((p) => [p.id, p.summary]),
  );

  // Normalise a piece's links into tagged PieceLinks. New pieces store {type,ref,title?}; legacy
  // Stage-1 pieces stored bare {id} — treat those as recall links so old pieces still render.
  const normalizeLinks = (links: unknown[]): PieceLink[] =>
    links
      .map((l): PieceLink | null => {
        if (!l || typeof l !== 'object') return null;
        const o = l as Record<string, unknown>;
        if (o.type === 'source' || o.type === 'recall') {
          return { type: o.type, ref: String(o.ref ?? ''), title: typeof o.title === 'string' ? o.title : undefined };
        }
        if (typeof o.id === 'string') return { type: 'recall', ref: o.id };
        return null;
      })
      .filter((l): l is PieceLink => l !== null && l.ref !== '');

  const mapPiece = (p: {
    id: string;
    body: string;
    summary: string | null;
    concepts: string[] | null;
    links: unknown[] | null;
    verification_status: string | null;
    review_note: string | null;
    original_body: string | null;
    created_at: string;
  }): RelayPieceRow => {
    const links = normalizeLinks(p.links ?? []);
    const { stimulus, readerLinks } = buildPieceStimulusView(
      stimulusRefByPieceId.get(p.id) ?? [],
      itemsByReaderId,
    );
    return {
      id: p.id,
      body: p.body,
      summary: p.summary,
      concepts: p.concepts ?? [],
      recalledCount: links.filter((l) => l.type === 'recall').length,
      verificationStatus: p.verification_status ?? 'unverified',
      sourceLinks: links.filter((l) => l.type === 'source'),
      reviewNote: p.review_note ?? null,
      originalBody: p.original_body ?? null,
      stimulus,
      readerLinks,
      createdAt: p.created_at,
    };
  };

  // Read the Relay engagement-gate toggle state (Stage 2.3b, default-off). The flag lives on the
  // owner's row (single-owner system, keyed by RELAY_OWNER_USER_ID); the toggle renders disabled with
  // a note when the owner is unconfigured. Kept out of the big Promise.all above since it is conditional.
  const relayOwnerId = process.env.RELAY_OWNER_USER_ID;
  let engagementGate = { enabled: false, ownerConfigured: false };
  if (relayOwnerId) {
    const { data: ownerRow } = await db
      .from('users')
      .select('relay_engagement_gate_enabled')
      .eq('id', relayOwnerId)
      .maybeSingle();
    engagementGate = { enabled: !!ownerRow?.relay_engagement_gate_enabled, ownerConfigured: true };
  }

  // Build relay stats — pieces by gate state (read-only operator view) + decision log + counts.
  const relayStats: RelayStats = {
    counts: {
      pendingReview: relayPendingCountResult.count ?? 0,
      approved: relayApprovedCountResult.count ?? 0,
      rejected: relayRejectedCountResult.count ?? 0,
      wrote: relayWroteCountResult.count ?? 0,
      declined: relayDeclinedCountResult.count ?? 0,
    },
    pending: (relayPendingResult.data ?? []).map(mapPiece),
    approved: (relayApprovedPiecesResult.data ?? []).map(mapPiece),
    rejected: (relayRejectedPiecesResult.data ?? []).map(mapPiece),
    decisions: decisionRows.map((d) => ({
      verdict: d.verdict,
      pieceId: d.piece_id,
      reason: d.reason,
      degraded: d.degraded,
      stimulusRef: d.stimulus_ref ?? [],
      stimulusTitles: (d.stimulus_ref ?? []).map((rid) => titleByReaderId.get(rid) ?? rid),
      pieceSummary: d.piece_id ? summaryByPieceId.get(d.piece_id) ?? null : null,
      sources: d.sources ?? [],
      createdAt: d.created_at,
    })),
    engagementGate,
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
