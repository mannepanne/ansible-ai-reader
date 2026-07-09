// ABOUT: Tests for the RelayAgent admin tab — sub-tabs, expand/collapse, and approve/reject re-decisions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelayAgent from './RelayAgent';
import type { RelayStats, RelayPieceRow } from './types';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const piece = (id: string, title: string, summary: string, over: Partial<RelayPieceRow> = {}): RelayPieceRow => ({
  id,
  body: `# ${title}\n\n${summary} body text here.`,
  summary,
  concepts: ['x'],
  recalledCount: 2,
  verificationStatus: 'unverified',
  sourceLinks: [],
  reviewNote: null,
  originalBody: null,
  createdAt: '2026-06-28T10:00:00Z',
  ...over,
});

const stats: RelayStats = {
  counts: { pendingReview: 1, approved: 1, rejected: 1, wrote: 2, declined: 1 },
  pending: [piece('p-pending', 'Pending Piece', 'pending summary')],
  approved: [piece('p-approved', 'Approved Piece', 'approved summary')],
  rejected: [piece('p-rejected', 'Rejected Piece', 'rejected summary')],
  decisions: [
    {
      verdict: 'declined',
      pieceId: null,
      reason: 'No power asymmetry here.',
      degraded: null,
      stimulusRef: ['r2'],
      stimulusTitles: ['A neutral changelog'],
      pieceSummary: null,
      sources: [],
      createdAt: '2026-06-28T12:00:00Z',
    },
  ],
};

describe('RelayAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('approves a pending piece: posts to the review route and refreshes server state', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'p-pending', slug: 's' }), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    expect(screen.getByText('Pending Piece')).toBeDefined(); // title shown even when collapsed
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/admin/relay/review');
    expect(JSON.parse(opts.body as string)).toEqual({ id: 'p-pending', action: 'approve' });
  });

  it('surfaces a bridge error and does not refresh', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'x', detail: 'piece is not pending_review' }), { status: 502 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/not pending_review/)).toBeDefined();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('expands a collapsed piece to reveal its body', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    expect(screen.queryByText(/pending summary body text here/)).toBeNull(); // collapsed by default
    await user.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText(/pending summary body text here/)).toBeDefined();
  });

  it('offers contextual re-decision buttons: Approved → Reject, Rejected → Approve', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.click(screen.getByRole('tab', { name: /^approved$/i }));
    expect(screen.getByText('Approved Piece')).toBeDefined();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();

    await user.click(screen.getByRole('tab', { name: /^rejected$/i }));
    expect(screen.getByText('Rejected Piece')).toBeDefined();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
  });

  it('renders the five widgets and the decision log on its sub-tab', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    expect(screen.getByText('Declined')).toBeDefined();
    expect(screen.getByText('Wrote')).toBeDefined();

    expect(screen.queryByText(/No power asymmetry here/)).toBeNull();
    await user.click(screen.getByRole('tab', { name: /decision log/i }));
    expect(screen.getByText(/No power asymmetry here/)).toBeDefined(); // reasoning
    expect(screen.getByText(/A neutral changelog/)).toBeDefined(); // the material decided on
  });

  it('paginates the decision log at ten per page', async () => {
    const many: RelayStats = {
      ...stats,
      decisions: Array.from({ length: 12 }, (_, i) => ({
        verdict: 'declined' as const,
        pieceId: null,
        reason: `reason ${i}`,
        degraded: null,
        stimulusRef: [`r${i}`],
        stimulusTitles: [`Material ${i}`],
        pieceSummary: null,
        sources: [],
        createdAt: `2026-06-28T12:${String(i).padStart(2, '0')}:00Z`,
      })),
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={many} />);
    await user.click(screen.getByRole('tab', { name: /decision log/i }));

    expect(screen.getByText(/Material 0/)).toBeDefined();
    expect(screen.getByText(/Page 1 of 2/)).toBeDefined();
    expect(screen.queryByText(/Material 10/)).toBeNull(); // second page not shown yet

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Page 2 of 2/)).toBeDefined();
    expect(screen.getByText(/Material 10/)).toBeDefined();
    expect(screen.queryByText(/Material 0/)).toBeNull(); // first-page item gone
  });

  it('triggers a session: posts the reader_id to the run route and shows a queued message', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ queued: true, readerId: 'abc123', title: 'Seeing like a vendor' }), { status: 202 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.type(screen.getByPlaceholderText('reader_id'), 'abc123');
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => expect(screen.getByRole('status')).toBeDefined());
    expect(screen.getByText(/Session queued/)).toBeDefined();
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/admin/relay/run');
    expect(JSON.parse(opts.body as string)).toEqual({ readerId: 'abc123' });
  });

  it('surfaces grounding: a sourced badge and clickable source links on a grounded piece', async () => {
    const grounded: RelayStats = {
      ...stats,
      pending: [
        piece('p-grounded', 'Grounded Piece', 'grounded summary', {
          verificationStatus: 'sourced',
          sourceLinks: [{ type: 'source', ref: 'https://reuters.com/x', title: 'Reuters report' }],
        }),
      ],
    };
    render(<RelayAgent stats={grounded} />);

    expect(screen.getByText(/sourced/i)).toBeDefined();
    const link = screen.getByRole('link', { name: /Reuters report/ });
    expect(link.getAttribute('href')).toBe('https://reuters.com/x');
  });

  it('renders a javascript:-scheme source link inert (no dangerous href)', async () => {
    const malicious: RelayStats = {
      ...stats,
      pending: [
        piece('p-xss', 'Injected Piece', 'summary', {
          verificationStatus: 'sourced',
          // A prompt-injection-supplied link the agent could emit into write_pending.
          sourceLinks: [{ type: 'source', ref: 'javascript:alert(document.cookie)', title: 'totally safe' }],
        }),
      ],
    };
    render(<RelayAgent stats={malicious} />);
    const link = screen.getByText('totally safe').closest('a')!;
    // The label still renders, but href is omitted so the javascript: URL can never execute on click.
    expect(link.getAttribute('href')).toBeNull();
  });

  it('shows an unverified badge on a piece with no source links', async () => {
    render(<RelayAgent stats={stats} />);
    expect(screen.getByText(/unverified/i)).toBeDefined();
  });

  it('surfaces research sources on a decision in the log', async () => {
    const withSources: RelayStats = {
      ...stats,
      decisions: [
        {
          ...stats.decisions[0],
          sources: [{ quote: 'a verbatim fact', source_url: 'https://ft.com/y', source_title: 'FT analysis' }],
        },
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={withSources} />);
    await user.click(screen.getByRole('tab', { name: /decision log/i }));
    const link = screen.getByRole('link', { name: /FT analysis/ });
    expect(link.getAttribute('href')).toBe('https://ft.com/y');
  });

  it('shows an empty state for a list with no pieces', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={{ ...stats, approved: [] }} />);
    await user.click(screen.getByRole('tab', { name: /^approved$/i }));
    expect(screen.getByText(/No approved pieces/i)).toBeDefined();
  });

  // --- Stage 2.2a: taste-signal capture ---

  it('captures a reject reason: posts the note to the review route', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'p-pending' }), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.type(screen.getByLabelText(/review note/i), 'announced-turn tell in para 3');
    await user.click(screen.getByRole('button', { name: /^reject$/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)).toEqual({
      id: 'p-pending',
      action: 'reject',
      note: 'announced-turn tell in para 3',
    });
  });

  it('approve-with-edit: edits the body and posts edited_body on approval', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'p-pending', slug: 's' }), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const editor = screen.getByLabelText(/edit piece body/i);
    await user.clear(editor);
    await user.type(editor, '# Pending Piece\n\nfixed prose.');
    await user.click(screen.getByRole('button', { name: /approve with edit/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body).toMatchObject({ id: 'p-pending', action: 'approve', edited_body: '# Pending Piece\n\nfixed prose.' });
  });

  it('renders a captured note and the original→edited delta on a decided piece', async () => {
    const withSignal: RelayStats = {
      ...stats,
      rejected: [
        piece('p-noted', 'Noted Piece', 'summary', {
          reviewNote: 'too abstract in the middle',
          originalBody: '# Noted Piece\n\nthe original clumsy prose.',
        }),
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={withSignal} />);
    await user.click(screen.getByRole('tab', { name: /^rejected/i }));

    expect(screen.getByText(/too abstract in the middle/)).toBeDefined(); // the note, visible
    expect(screen.getByText('✎ edited')).toBeDefined(); // the signal badge
    await user.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText(/original — before your edit/i)).toBeDefined();
  });

  it('filters the rejected list to only noted/edited pieces', async () => {
    const mixed: RelayStats = {
      ...stats,
      rejected: [
        piece('p-plain', 'Plain Reject', 'no signal'),
        piece('p-noted', 'Noted Reject', 'has signal', { reviewNote: 'weak close' }),
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={mixed} />);
    await user.click(screen.getByRole('tab', { name: /^rejected/i }));

    expect(screen.getByText('Plain Reject')).toBeDefined();
    expect(screen.getByText('Noted Reject')).toBeDefined();
    await user.click(screen.getByRole('checkbox', { name: /only noted \/ edited/i }));
    expect(screen.queryByText('Plain Reject')).toBeNull(); // filtered out
    expect(screen.getByText('Noted Reject')).toBeDefined();
  });

  it('badges the rejected sub-tab with the count of noted/edited pieces', async () => {
    const mixed: RelayStats = {
      ...stats,
      rejected: [piece('p-noted', 'Noted Reject', 'x', { reviewNote: 'weak close' })],
    };
    render(<RelayAgent stats={mixed} />);
    expect(screen.getByRole('tab', { name: /rejected · ✎1/i })).toBeDefined();
  });
});
