// ABOUT: Tests for the admin analytics page
// ABOUT: Validates auth guard, admin-role guard, and AdminContent rendering

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LandingStats, DemoStats, RelayStats } from '@/components/admin/types';

// --- Service-role query recorder -------------------------------------------------------------
// The page fires ~25 Supabase queries through one client. Rather than one canned response for all
// of them, every query is recorded (table, filters, head/data) and answered by the handlers a test
// registers with `respond()`. Later registrations win, so a test can layer an override on top of
// the shared fixture. Unanswered queries resolve to the "no rows" shape.

interface QueryFilter {
  op: 'eq' | 'in';
  column: string;
  value: unknown;
}

interface RecordedQuery {
  table: string;
  columns: string;
  head: boolean;
  filters: QueryFilter[];
  maybeSingle: boolean;
  limit: number | null;
}

interface QueryResult {
  count?: number | null;
  data?: unknown;
  error?: null;
}

type QueryHandler = (q: RecordedQuery) => QueryResult | undefined;

const db = vi.hoisted(() => ({
  issued: [] as RecordedQuery[],
  handlers: [] as QueryHandler[],
}));

const NO_ROWS: QueryResult = { count: null, data: null, error: null };

function resolveQuery(q: RecordedQuery): QueryResult {
  for (let i = db.handlers.length - 1; i >= 0; i--) {
    const result = db.handlers[i](q);
    if (result) return result;
  }
  return NO_ROWS;
}

function makeQuery(table: string) {
  const q: RecordedQuery = { table, columns: '', head: false, filters: [], maybeSingle: false, limit: null };
  db.issued.push(q);
  const builder = {
    select(columns: string, opts?: { head?: boolean }) {
      q.columns = columns;
      q.head = !!opts?.head;
      return builder;
    },
    eq(column: string, value: unknown) {
      q.filters.push({ op: 'eq', column, value });
      return builder;
    },
    in(column: string, value: unknown) {
      q.filters.push({ op: 'in', column, value });
      return builder;
    },
    order() {
      return builder;
    },
    limit(n: number) {
      q.limit = n;
      return builder;
    },
    maybeSingle() {
      q.maybeSingle = true;
      return builder;
    },
    then(onFulfilled: (r: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolveQuery(q)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function respond(handler: QueryHandler) {
  db.handlers.push(handler);
}

/** The value of the first eq/in filter on `column`, or undefined when the query has none. */
function filterValue(q: RecordedQuery, column: string): unknown {
  return q.filters.find((f) => f.column === column)?.value;
}

function queriesFor(table: string): RecordedQuery[] {
  return db.issued.filter((q) => q.table === table);
}

// Mock Next.js navigation
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error(`redirect:${url}`); },
}));

// Mock Supabase server client
const mockGetSession = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
    from: () => ({ select: mockSelect }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => makeQuery(table),
  })),
}));

// Mock AdminContent — captures the props the page computed so tests can assert on the built stats
interface AdminContentProps {
  userEmail: string;
  landingStats: LandingStats;
  demoStats: DemoStats;
  relayStats: RelayStats;
}
const capturedProps = vi.fn<(props: AdminContentProps) => void>();
vi.mock('@/components/admin/AdminContent', () => ({
  default: function AdminContentStub(props: AdminContentProps) {
    capturedProps(props);
    return <div data-testid="admin-content">Admin dashboard for {props.userEmail}</div>;
  },
}));

import AdminPage from './page';

// --- Fixtures --------------------------------------------------------------------------------

/** Sign in as an admin; pass `null` for a session whose user has no email. */
function signInAsAdmin(email: string | null = 'admin@example.com') {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'admin-1', email: email ?? undefined } } },
  });
  mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
}

/** Render the page and return the props handed to AdminContent. */
async function renderAdminPage(): Promise<AdminContentProps> {
  const result = await AdminPage();
  render(result as React.ReactElement);
  expect(capturedProps).toHaveBeenCalledTimes(1);
  return capturedProps.mock.calls[0][0];
}

const PIECE_COLUMNS = 'id, body, summary, concepts, links, verification_status, review_note, original_body, created_at';

const pendingPiece = {
  id: 'piece-1',
  body: '# Seeing like a vendor',
  summary: 'On sovereignty.',
  concepts: ['sovereignty'],
  links: [
    { type: 'source', ref: 'https://a.example', title: 'Source A' },
    { type: 'source', ref: 'https://b.example' },
    { type: 'recall', ref: 'memory-1', title: 'Memory one' },
    { id: 'legacy-memory' }, // Stage-1 shape: bare {id} = recall link
    { type: 'source' }, // no ref → dropped
    null,
    'junk',
    { foo: 1 },
  ],
  verification_status: 'sourced',
  review_note: 'Sharp.',
  original_body: '# Seeing like a vendor (draft)',
  created_at: '2026-05-03T09:00:00Z',
};

const bareApprovedPiece = {
  id: 'piece-2',
  body: 'A bare piece.',
  summary: null,
  concepts: null,
  links: null,
  verification_status: null,
  review_note: null,
  original_body: null,
  created_at: '2026-05-01T09:00:00Z',
};

const decisions = [
  { id: 'dec-1', verdict: 'wrote', piece_id: 'piece-1', reason: null, degraded: null, stimulus_ref: ['r1', 'r2'], sources: [{ quote: 'q', source_url: 'https://s', source_title: 'S' }], created_at: '2026-05-03T10:00:00Z' },
  { id: 'dec-2', verdict: 'declined', piece_id: null, reason: 'Nothing to add', degraded: 'no_research', stimulus_ref: ['r-gone'], sources: null, created_at: '2026-05-02T10:00:00Z' },
  { id: 'dec-3', verdict: 'wrote', piece_id: 'piece-2', reason: null, degraded: null, stimulus_ref: null, sources: null, created_at: '2026-05-01T10:00:00Z' },
  // Re-decided piece-1 (approve→reject→approve) — same stimulus, second decision row
  { id: 'dec-4', verdict: 'wrote', piece_id: 'piece-1', reason: null, degraded: null, stimulus_ref: ['r1', 'r2'], sources: [], created_at: '2026-04-30T10:00:00Z' },
];

const gateSkips = [
  { id: 'item-9', reader_id: 'r9', title: 'Skipped thing', relay_gate_code: 'no_signal', relay_gate_signals: null, relay_triggered_at: '2026-05-02T12:00:00Z' },
  { id: 'item-8', reader_id: 'r8', title: null, relay_gate_code: 'vetoed', relay_gate_signals: ['highlight'], relay_triggered_at: '2026-04-29T12:00:00Z' },
];

const stimulusItems = [
  { reader_id: 'r1', title: 'First article', short_summary: 'Summary one', commentariat_summary: null, tags: null, document_note: null, reader_note: null },
  // No title and no summary: contributes a Reader link but no stimulus text
  { reader_id: 'r2', title: null, short_summary: null, commentariat_summary: null, tags: null, document_note: null, reader_note: null },
];

/** A populated analytics dataset covering every table the page reads. */
function installPopulatedFixture() {
  respond((q) => {
    if (q.table !== 'page_events') return undefined;
    switch (filterValue(q, 'event_type')) {
      case 'landing_page_view':
        return q.head ? { count: 120 } : { data: [{ visitor_id: 'v1' }, { visitor_id: 'v2' }, { visitor_id: 'v1' }] };
      case 'privacy_page_view':
        return { count: 18 };
      case 'demo_signup':
        return { count: 15 };
      case 'nav_click':
        return {
          data: [
            { event_data: { label: 'features' } },
            { event_data: { label: 'features' } },
            { event_data: { label: 'features' } },
            { event_data: { label: 'pricing' } },
            { event_data: null },
            { event_data: {} },
          ],
        };
      default:
        return undefined;
    }
  });
  respond((q) => q.table === 'email_captures'
    ? {
        data: [
          { id: 'cap-1', email: 'a@example.com', source: 'hero', created_at: '2026-04-01T09:00:00Z' },
          { id: 'cap-2', email: 'b@example.com', source: 'hero', created_at: '2026-04-02T09:00:00Z' },
          { id: 'cap-3', email: 'a@example.com', source: 'cta', created_at: '2026-04-03T09:00:00Z' },
        ],
      }
    : undefined);
  respond((q) => {
    if (q.table !== 'demo_sessions') return undefined;
    return q.head
      ? { count: 22 }
      : {
          data: [
            { session_id: 'sess-1', email: 'a@example.com', started_at: '2026-04-01T10:00:00Z', last_active_at: '2026-04-01T10:05:00Z', total_events: 12 },
            // last_active_at before started_at (clock skew) — duration must clamp to 0
            { session_id: 'sess-2', email: null, started_at: '2026-04-02T14:00:00Z', last_active_at: '2026-04-02T13:59:00Z', total_events: 4 },
          ],
        };
  });
  respond((q) => {
    if (q.table !== 'demo_events') return undefined;
    return q.head
      ? { count: 187 }
      : { data: [{ event_type: 'tab_switch' }, { event_type: 'expand' }, { event_type: 'tab_switch' }] };
  });
  respond((q) => {
    if (q.table !== 'relay_pieces') return undefined;
    if (filterValue(q, 'id')) {
      // Summary lookup for wrote verdicts — piece-2 deliberately absent
      return { data: [{ id: 'piece-1', summary: 'On sovereignty.' }] };
    }
    switch (filterValue(q, 'state')) {
      case 'pending_review':
        return q.head ? { count: 1 } : { data: [pendingPiece] };
      case 'approved':
        return q.head ? { count: 3 } : { data: [bareApprovedPiece] };
      case 'rejected':
        return q.head ? { count: 2 } : { data: [] };
      default:
        return undefined;
    }
  });
  respond((q) => {
    if (q.table !== 'relay_decisions') return undefined;
    switch (filterValue(q, 'verdict')) {
      case 'wrote':
        return { count: 5 };
      case 'declined':
        return { count: 4 };
      default:
        return { data: decisions };
    }
  });
  respond((q) => {
    if (q.table !== 'reader_items') return undefined;
    if (filterValue(q, 'reader_id')) return { data: stimulusItems };
    if (filterValue(q, 'relay_gate_code') === 'reacted') return { count: 6 };
    return q.head ? { count: 7 } : { data: gateSkips };
  });
}

// --- Tests -----------------------------------------------------------------------------------

describe('AdminPage', () => {
  const originalOwnerId = process.env.RELAY_OWNER_USER_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    db.issued.length = 0;
    db.handlers.length = 0;
    delete process.env.RELAY_OWNER_USER_ID;
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalOwnerId === undefined) {
      delete process.env.RELAY_OWNER_USER_ID;
    } else {
      process.env.RELAY_OWNER_USER_ID = originalOwnerId;
    }
  });

  describe('access guards', () => {
    it('redirects to / when unauthenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await expect(AdminPage()).rejects.toThrow('redirect:/');
      expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('redirects to /summaries when authenticated but not admin', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
      });
      mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });

      await expect(AdminPage()).rejects.toThrow('redirect:/summaries');
      expect(mockRedirect).toHaveBeenCalledWith('/summaries');
    });

    it('redirects to /summaries when the user row is missing', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
      });
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(AdminPage()).rejects.toThrow('redirect:/summaries');
    });

    it('renders AdminContent when authenticated and admin', async () => {
      signInAsAdmin();

      const result = await AdminPage();
      const { getByTestId } = render(result as React.ReactElement);

      expect(getByTestId('admin-content')).toBeDefined();
      expect(screen.getByText(/admin dashboard for admin@example.com/i)).toBeDefined();
    });

    it('passes an empty userEmail when the session has no email', async () => {
      signInAsAdmin(null);

      const props = await renderAdminPage();

      expect(props.userEmail).toBe('');
    });
  });

  describe('when every analytics query returns no rows', () => {
    beforeEach(() => signInAsAdmin());

    it('reports zeroed landing stats', async () => {
      const { landingStats } = await renderAdminPage();

      expect(landingStats).toEqual({
        totalVisits: 0,
        uniqueVisitors: 0,
        privacyPageViews: 0,
        demoSessions: 0,
        totalSignups: 0,
        navClicks: [],
        signupSources: [],
      });
    });

    it('reports zeroed demo stats with an average duration of 0', async () => {
      const { demoStats } = await renderAdminPage();

      expect(demoStats).toEqual({
        emailCaptureCount: 0,
        sessionCount: 0,
        totalInteractions: 0,
        avgDurationSeconds: 0,
        eventTypeBreakdown: [],
        sessions: [],
        emailCaptures: [],
      });
    });

    it('reports zeroed relay counts, no pieces, and an empty activity log', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.counts).toEqual({
        pendingReview: 0, approved: 0, rejected: 0, wrote: 0, declined: 0, gatePass: 0, gateSkip: 0,
      });
      expect(relayStats.pending).toEqual([]);
      expect(relayStats.approved).toEqual([]);
      expect(relayStats.rejected).toEqual([]);
      expect(relayStats.activity).toEqual([]);
    });

    it('skips the stimulus and piece-summary lookups when there are no decisions', async () => {
      await renderAdminPage();

      expect(queriesFor('reader_items').some((q) => filterValue(q, 'reader_id'))).toBe(false);
      expect(queriesFor('relay_pieces').some((q) => filterValue(q, 'id'))).toBe(false);
    });
  });

  describe('landing stats', () => {
    beforeEach(() => {
      signInAsAdmin();
      installPopulatedFixture();
    });

    it('counts visits, unique visitors, privacy views, demo sessions and signups', async () => {
      const { landingStats } = await renderAdminPage();

      expect(landingStats.totalVisits).toBe(120);
      expect(landingStats.uniqueVisitors).toBe(2);
      expect(landingStats.privacyPageViews).toBe(18);
      expect(landingStats.demoSessions).toBe(22);
      expect(landingStats.totalSignups).toBe(15);
    });

    it('tallies nav clicks by label, most-clicked first, bucketing unlabelled clicks as unknown', async () => {
      const { landingStats } = await renderAdminPage();

      expect(landingStats.navClicks).toEqual([
        { label: 'features', count: 3 },
        { label: 'unknown', count: 2 },
        { label: 'pricing', count: 1 },
      ]);
    });

    it('tallies signup sources from email captures', async () => {
      const { landingStats } = await renderAdminPage();

      expect(landingStats.signupSources).toEqual([
        { source: 'hero', count: 2 },
        { source: 'cta', count: 1 },
      ]);
    });
  });

  describe('demo stats', () => {
    beforeEach(() => {
      signInAsAdmin();
      installPopulatedFixture();
    });

    it('counts distinct captured emails, sessions and interactions', async () => {
      const { demoStats } = await renderAdminPage();

      expect(demoStats.emailCaptureCount).toBe(2);
      expect(demoStats.sessionCount).toBe(22);
      expect(demoStats.totalInteractions).toBe(187);
    });

    // Known cap: the email-capture count, signup sources, and average duration are derived from row
    // fetches limited to the most recent 100 and 200 rows, so past those caps they describe the
    // recent window, not all time. Pinned here so a change in either direction is a visible decision.
    it('derives email-capture and session aggregates from row fetches capped at 100 and 200', async () => {
      await renderAdminPage();

      expect(queriesFor('email_captures').map((q) => q.limit)).toEqual([100]);
      expect(queriesFor('demo_sessions').filter((q) => !q.head).map((q) => q.limit)).toEqual([200]);
    });

    it('derives session duration from start/last-active, clamping negative durations to 0', async () => {
      const { demoStats } = await renderAdminPage();

      expect(demoStats.sessions).toEqual([
        { sessionId: 'sess-1', email: 'a@example.com', startedAt: '2026-04-01T10:00:00Z', durationSeconds: 300, totalEvents: 12 },
        { sessionId: 'sess-2', email: null, startedAt: '2026-04-02T14:00:00Z', durationSeconds: 0, totalEvents: 4 },
      ]);
      expect(demoStats.avgDurationSeconds).toBe(150);
    });

    it('breaks down event types, most frequent first', async () => {
      const { demoStats } = await renderAdminPage();

      expect(demoStats.eventTypeBreakdown).toEqual([
        { eventType: 'tab_switch', count: 2 },
        { eventType: 'expand', count: 1 },
      ]);
    });

    it('lists email captures in camelCase form', async () => {
      const { demoStats } = await renderAdminPage();

      expect(demoStats.emailCaptures).toEqual([
        { id: 'cap-1', email: 'a@example.com', source: 'hero', createdAt: '2026-04-01T09:00:00Z' },
        { id: 'cap-2', email: 'b@example.com', source: 'hero', createdAt: '2026-04-02T09:00:00Z' },
        { id: 'cap-3', email: 'a@example.com', source: 'cta', createdAt: '2026-04-03T09:00:00Z' },
      ]);
    });
  });

  describe('relay pieces', () => {
    beforeEach(() => {
      signInAsAdmin();
      installPopulatedFixture();
    });

    it('fetches pieces and counts per gate state', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.counts).toEqual({
        pendingReview: 1, approved: 3, rejected: 2, wrote: 5, declined: 4, gatePass: 6, gateSkip: 7,
      });
      const pieceQueries = queriesFor('relay_pieces').filter((q) => !q.head && q.columns === PIECE_COLUMNS);
      expect(pieceQueries.map((q) => filterValue(q, 'state'))).toEqual(['pending_review', 'approved', 'rejected']);
      expect(relayStats.pending.map((p) => p.id)).toEqual(['piece-1']);
      expect(relayStats.approved.map((p) => p.id)).toEqual(['piece-2']);
      expect(relayStats.rejected).toEqual([]);
    });

    it('surfaces source links as provenance and counts recall links, dropping malformed entries', async () => {
      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.pending;

      expect(piece.sourceLinks).toEqual([
        { type: 'source', ref: 'https://a.example', title: 'Source A' },
        { type: 'source', ref: 'https://b.example', title: undefined },
      ]);
      // recall + legacy {id} count; ref-less, null, string and unknown-shape entries do not
      expect(piece.recalledCount).toBe(2);
    });

    it('carries body, summary, concepts, verification status and review fields through', async () => {
      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.pending;

      expect(piece).toMatchObject({
        id: 'piece-1',
        body: '# Seeing like a vendor',
        summary: 'On sovereignty.',
        concepts: ['sovereignty'],
        verificationStatus: 'sourced',
        reviewNote: 'Sharp.',
        originalBody: '# Seeing like a vendor (draft)',
        createdAt: '2026-05-03T09:00:00Z',
      });
    });

    it('defaults a bare piece to no links, no concepts, unverified and null review fields', async () => {
      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.approved;

      expect(piece).toMatchObject({
        id: 'piece-2',
        concepts: [],
        recalledCount: 0,
        verificationStatus: 'unverified',
        sourceLinks: [],
        reviewNote: null,
        originalBody: null,
      });
    });

    it('reconstructs the stimulus and Reader links from the decision that produced the piece', async () => {
      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.pending;

      expect(piece.readerLinks).toEqual([
        { readerId: 'r1', title: 'First article', url: 'https://read.readwise.io/read/r1' },
        { readerId: 'r2', title: 'r2', url: 'https://read.readwise.io/read/r2' },
      ]);
      expect(piece.stimulus).toContain('Title: First article');
      expect(piece.stimulus).toContain('Summary one');
    });

    it('gives a piece with no stimulus_ref on its decision an empty stimulus view', async () => {
      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.approved;

      expect(piece.stimulus).toBeNull();
      expect(piece.readerLinks).toEqual([]);
    });

    it('gives a piece with no decision row an empty stimulus view', async () => {
      respond((q) => (q.table === 'relay_decisions' && !q.head ? { data: [] } : undefined));

      const { relayStats } = await renderAdminPage();
      const [piece] = relayStats.pending;

      expect(piece.stimulus).toBeNull();
      expect(piece.readerLinks).toEqual([]);
    });
  });

  describe('relay activity log', () => {
    beforeEach(() => {
      signInAsAdmin();
      installPopulatedFixture();
    });

    it('looks up stimulus items once with deduplicated reader ids', async () => {
      await renderAdminPage();

      const lookups = queriesFor('reader_items').filter((q) => filterValue(q, 'reader_id'));
      expect(lookups).toHaveLength(1);
      expect(filterValue(lookups[0], 'reader_id')).toEqual(['r1', 'r2', 'r-gone']);
    });

    it('looks up piece summaries only for the deduplicated wrote verdicts', async () => {
      await renderAdminPage();

      const lookups = queriesFor('relay_pieces').filter((q) => filterValue(q, 'id'));
      expect(lookups).toHaveLength(1);
      expect(filterValue(lookups[0], 'id')).toEqual(['piece-1', 'piece-2']);
    });

    it('merges decisions and gate skips newest-first', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity.map((a) => `${a.kind}:${a.id}`)).toEqual([
        'decision:dec-1',
        'gate_skip:item-9',
        'decision:dec-2',
        'decision:dec-3',
        'decision:dec-4',
        'gate_skip:item-8',
      ]);
    });

    it('enriches a wrote decision with stimulus titles, piece summary and sources', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity[0]).toEqual({
        kind: 'decision',
        id: 'dec-1',
        verdict: 'wrote',
        pieceId: 'piece-1',
        reason: null,
        degraded: null,
        stimulusRef: ['r1', 'r2'],
        stimulusTitles: ['First article', ''], // r2 has no title → empty string
        pieceSummary: 'On sovereignty.',
        sources: [{ quote: 'q', source_url: 'https://s', source_title: 'S' }],
        createdAt: '2026-05-03T10:00:00Z',
      });
    });

    it('falls back to the reader id as title when the stimulus item is gone', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity[2]).toMatchObject({
        id: 'dec-2',
        verdict: 'declined',
        pieceId: null,
        reason: 'Nothing to add',
        degraded: 'no_research',
        stimulusTitles: ['r-gone'],
        pieceSummary: null,
        sources: [],
      });
    });

    it('reports a null piece summary when the written piece is not found', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity[3]).toMatchObject({
        id: 'dec-3',
        pieceId: 'piece-2',
        stimulusRef: [],
        stimulusTitles: [],
        pieceSummary: null,
      });
    });

    it('maps gate skips with their code, signals and item title', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity[1]).toEqual({
        kind: 'gate_skip',
        id: 'item-9',
        createdAt: '2026-05-02T12:00:00Z',
        code: 'no_signal',
        signals: [],
        stimulusRef: 'r9',
        stimulusTitle: 'Skipped thing',
      });
      expect(relayStats.activity[5]).toEqual({
        kind: 'gate_skip',
        id: 'item-8',
        createdAt: '2026-04-29T12:00:00Z',
        code: 'vetoed',
        signals: ['highlight'],
        stimulusRef: 'r8',
        stimulusTitle: null,
      });
    });

    it('degrades to reader ids and null summaries when the enrichment lookups return no data', async () => {
      // Supabase returns data: null (not []) on a failed query — the log must still render
      respond((q) => (q.table === 'reader_items' && filterValue(q, 'reader_id') ? { data: null } : undefined));
      respond((q) => (q.table === 'relay_pieces' && filterValue(q, 'id') ? { data: null } : undefined));

      const { relayStats } = await renderAdminPage();

      expect(relayStats.activity[0]).toMatchObject({
        id: 'dec-1',
        stimulusTitles: ['r1', 'r2'],
        pieceSummary: null,
      });
      expect(relayStats.pending[0].readerLinks.map((l) => l.title)).toEqual(['r1', 'r2']);
      expect(relayStats.pending[0].stimulus).toBeNull();
    });

    it('only fetches no_signal and vetoed items as gate skips', async () => {
      await renderAdminPage();

      const skipQueries = queriesFor('reader_items').filter((q) => !q.head && filterValue(q, 'relay_gate_code'));
      expect(skipQueries).toHaveLength(1);
      expect(filterValue(skipQueries[0], 'relay_gate_code')).toEqual(['no_signal', 'vetoed']);
    });
  });

  describe('engagement gate toggle', () => {
    beforeEach(() => signInAsAdmin());

    it('reports the gate unconfigured without reading users when RELAY_OWNER_USER_ID is unset', async () => {
      const { relayStats } = await renderAdminPage();

      expect(relayStats.engagementGate).toEqual({ enabled: false, ownerConfigured: false });
      expect(queriesFor('users')).toEqual([]);
    });

    it('reads the flag from the owner row when RELAY_OWNER_USER_ID is set', async () => {
      vi.stubEnv('RELAY_OWNER_USER_ID', 'owner-1');
      respond((q) => (q.table === 'users' ? { data: { relay_engagement_gate_enabled: true } } : undefined));

      const { relayStats } = await renderAdminPage();

      expect(relayStats.engagementGate).toEqual({ enabled: true, ownerConfigured: true });
      const [ownerQuery] = queriesFor('users');
      expect(filterValue(ownerQuery, 'id')).toBe('owner-1');
      expect(ownerQuery.maybeSingle).toBe(true);
    });

    it('reports the gate disabled but configured when the owner row has the flag off', async () => {
      vi.stubEnv('RELAY_OWNER_USER_ID', 'owner-1');
      respond((q) => (q.table === 'users' ? { data: { relay_engagement_gate_enabled: false } } : undefined));

      const { relayStats } = await renderAdminPage();

      expect(relayStats.engagementGate).toEqual({ enabled: false, ownerConfigured: true });
    });

    it('reports the gate disabled but configured when the owner row is missing', async () => {
      vi.stubEnv('RELAY_OWNER_USER_ID', 'owner-1');

      const { relayStats } = await renderAdminPage();

      expect(relayStats.engagementGate).toEqual({ enabled: false, ownerConfigured: true });
    });
  });

  describe('schema nullability', () => {
    beforeEach(() => {
      signInAsAdmin();
      installPopulatedFixture();
    });

    it('counts nav clicks whose event_data is not an object with a string label as unknown', async () => {
      respond((q) => (q.table === 'page_events' && filterValue(q, 'event_type') === 'nav_click'
        ? { data: [{ event_data: 'features' }, { event_data: { label: 5 } }, { event_data: [1, 2] }, { event_data: { label: 'docs' } }] }
        : undefined));

      const { landingStats } = await renderAdminPage();

      expect(landingStats.navClicks).toEqual([
        { label: 'unknown', count: 3 },
        { label: 'docs', count: 1 },
      ]);
    });

    it('tolerates null timestamps and counts on older session and capture rows', async () => {
      respond((q) => (q.table === 'demo_sessions' && !q.head
        ? {
            data: [
              { session_id: 'sess-old', email: null, started_at: null, last_active_at: null, total_events: null },
              // Only one timestamp present: no duration can be derived, and it must not become a huge number
              { session_id: 'sess-half', email: null, started_at: null, last_active_at: '2026-04-02T14:00:00Z', total_events: 3 },
            ],
          }
        : undefined));
      respond((q) => (q.table === 'email_captures'
        ? { data: [{ id: 'cap-old', email: 'old@example.com', source: 'hero', created_at: null }] }
        : undefined));

      const { demoStats } = await renderAdminPage();

      expect(demoStats.sessions).toEqual([
        { sessionId: 'sess-old', email: null, startedAt: '', durationSeconds: 0, totalEvents: 0 },
        { sessionId: 'sess-half', email: null, startedAt: '', durationSeconds: 0, totalEvents: 3 },
      ]);
      expect(demoStats.avgDurationSeconds).toBe(0);
      expect(demoStats.emailCaptures).toEqual([{ id: 'cap-old', email: 'old@example.com', source: 'hero', createdAt: '' }]);
    });

    it('treats a piece whose links column is not an array as having no links', async () => {
      respond((q) => (q.table === 'relay_pieces' && filterValue(q, 'state') === 'pending_review' && !q.head
        ? { data: [{ ...pendingPiece, links: 'not-an-array', created_at: null }] }
        : undefined));

      const { relayStats } = await renderAdminPage();

      expect(relayStats.pending).toHaveLength(1);
      expect(relayStats.pending[0]).toMatchObject({ sourceLinks: [], recalledCount: 0, createdAt: '' });
    });
  });
});
