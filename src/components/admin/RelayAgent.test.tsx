// ABOUT: Tests for the RelayAgent admin tab — sub-tabs, expand/collapse, and approve/reject re-decisions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelayAgent from './RelayAgent';
import type { RelayStats, RelayPieceRow, RelayActivityRow } from './types';

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
  stimulus: null,
  readerLinks: [],
  createdAt: '2026-06-28T10:00:00Z',
  ...over,
});

const stats: RelayStats = {
  counts: { pendingReview: 1, approved: 1, rejected: 1, wrote: 2, declined: 1, gatePass: 3, gateSkip: 4 },
  pending: [piece('p-pending', 'Pending Piece', 'pending summary')],
  approved: [piece('p-approved', 'Approved Piece', 'approved summary')],
  rejected: [piece('p-rejected', 'Rejected Piece', 'rejected summary')],
  activity: [
    {
      kind: 'decision',
      id: 'dec-1',
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
  engagementGate: { enabled: false, ownerConfigured: true },
};

type DecisionRow = Extract<RelayActivityRow, { kind: 'decision' }>;
type SkipRow = Extract<RelayActivityRow, { kind: 'gate_skip' }>;

const decision = (id: string, over: Partial<DecisionRow> = {}): DecisionRow => ({
  ...(stats.activity[0] as DecisionRow),
  id,
  ...over,
});

const skip = (id: string, over: Partial<SkipRow> = {}): SkipRow => ({
  kind: 'gate_skip',
  id,
  createdAt: '2026-06-28T13:00:00Z',
  code: 'no_signal',
  signals: [],
  stimulusRef: 'r-skip',
  stimulusTitle: 'A skipped item',
  ...over,
});

const mockFetch = () => fetch as ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
// A gateway-style failure: the status is an error and the body is not JSON at all.
const textResponse = (text: string, status: number) => new Response(text, { status });

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

  it('renders the widgets (incl. gate outcomes) and the activity log on its sub-tab', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    expect(screen.getByText('Declined')).toBeDefined();
    expect(screen.getByText('Wrote')).toBeDefined();
    expect(screen.getByText('Gate pass')).toBeDefined(); // 2.3c gate-outcome widgets
    expect(screen.getByText('Not reacted')).toBeDefined();

    expect(screen.queryByText(/No power asymmetry here/)).toBeNull();
    await user.click(screen.getByRole('tab', { name: /activity log/i }));
    expect(screen.getByText(/No power asymmetry here/)).toBeDefined(); // reasoning
    expect(screen.getByText(/A neutral changelog/)).toBeDefined(); // the material decided on
  });

  it('paginates the activity log at ten per page', async () => {
    const many: RelayStats = {
      ...stats,
      // 12 entries loaded but 20 total in the DB (counts) — models the 200-cap truncation the footer warns about.
      counts: { ...stats.counts, wrote: 0, declined: 20, gateSkip: 0 },
      activity: Array.from({ length: 12 }, (_, i) => ({
        kind: 'decision' as const,
        id: `dec-${i}`,
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
    await user.click(screen.getByRole('tab', { name: /activity log/i }));

    expect(screen.getByText(/Material 0/)).toBeDefined();
    expect(screen.getByText(/Page 1 of 2/)).toBeDefined();
    expect(screen.getByText(/showing 12 of 20 activity entries/)).toBeDefined(); // cap footer: loaded vs true total
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

  it('shows the reconstructed stimulus and a Reader deep-link on a piece', async () => {
    const withStimulus: RelayStats = {
      ...stats,
      pending: [
        piece('p-stim', 'Reviewed Piece', 'summary', {
          stimulus: 'Title: Faith in the Possible\n\nSummary:\nTech as faith.\n\nNote:\nWho wields it?',
          readerLinks: [
            { readerId: 'r9', title: 'Faith in the Possible', url: 'https://read.readwise.io/read/r9' },
          ],
        }),
      ],
    };
    render(<RelayAgent stats={withStimulus} />);

    // the Reader deep-link is clickable and points at the Reader app
    const link = screen.getByRole('link', { name: /Faith in the Possible/ });
    expect(link.getAttribute('href')).toBe('https://read.readwise.io/read/r9');
    // the reconstructed stimulus is present and honestly labelled (not "as sent")
    expect(screen.getByText(/reconstructed \(current logic\)/i)).toBeDefined();
    expect(screen.getByText(/Note:\s*Who wields it\?/)).toBeDefined();
  });

  it('surfaces research sources on a decision in the log', async () => {
    const decisionRow = stats.activity[0] as Extract<RelayActivityRow, { kind: 'decision' }>;
    const withSources: RelayStats = {
      ...stats,
      activity: [
        {
          ...decisionRow,
          sources: [{ quote: 'a verbatim fact', source_url: 'https://ft.com/y', source_title: 'FT analysis' }],
        },
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={withSources} />);
    await user.click(screen.getByRole('tab', { name: /activity log/i }));
    const link = screen.getByRole('link', { name: /FT analysis/ });
    expect(link.getAttribute('href')).toBe('https://ft.com/y');
  });

  // --- Stage 2.3c: gate skips in the activity log ---

  it('renders a gate skip as "not reacted" with its reason and the signals present', async () => {
    const withSkip: RelayStats = {
      ...stats,
      engagementGate: { enabled: true, ownerConfigured: true },
      activity: [
        {
          kind: 'gate_skip',
          id: 'ri-1',
          createdAt: '2026-06-28T13:00:00Z',
          code: 'vetoed',
          signals: ['highlight'],
          stimulusRef: 'r9',
          stimulusTitle: 'A vetoed essay on trust',
        },
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={withSkip} />);
    await user.click(screen.getByRole('tab', { name: /activity log/i }));

    // "not reacted" appears twice: the gate-outcome StatCard label AND this card's badge.
    expect(screen.getAllByText(/not reacted/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/A vetoed essay on trust/)).toBeDefined();
    expect(screen.getByText(/vetoed \(rated/)).toBeDefined(); // reason derived from the code
    expect(screen.getByText(/highlight/)).toBeDefined(); // the overridden signal is still shown
  });

  it('shows "signals: none" for a no-signal skip', async () => {
    const withSkip: RelayStats = {
      ...stats,
      engagementGate: { enabled: true, ownerConfigured: true },
      activity: [
        {
          kind: 'gate_skip',
          id: 'ri-2',
          createdAt: '2026-06-28T13:00:00Z',
          code: 'no_signal',
          signals: [],
          stimulusRef: 'r10',
          stimulusTitle: 'An unremarkable archive',
        },
      ],
    };
    const user = userEvent.setup();
    render(<RelayAgent stats={withSkip} />);
    await user.click(screen.getByRole('tab', { name: /activity log/i }));

    expect(screen.getByText(/no engagement signal/i)).toBeDefined();
    expect(screen.getByText(/none/)).toBeDefined();
  });

  it('explains the empty gate section when the engagement gate is off', async () => {
    const user = userEvent.setup();
    render(<RelayAgent stats={{ ...stats, activity: [], engagementGate: { enabled: false, ownerConfigured: true } }} />);
    await user.click(screen.getByRole('tab', { name: /activity log/i }));
    expect(screen.getByText(/engagement gate is off/i)).toBeDefined();
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

  describe('review failures', () => {
    it('falls back to the error field when the bridge gives no detail', async () => {
      mockFetch().mockResolvedValue(jsonResponse({ error: 'bridge unreachable' }, 502));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.click(screen.getByRole('button', { name: /^approve$/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
      expect(screen.getByText('bridge unreachable')).toBeDefined();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('reports the action and status when the error body is not JSON', async () => {
      mockFetch().mockResolvedValue(textResponse('<html>Bad Gateway</html>', 502));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.click(screen.getByRole('button', { name: /^reject$/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
      expect(screen.getByText('reject failed (502)')).toBeDefined();
    });

    it('stringifies a non-Error failure from fetch', async () => {
      mockFetch().mockRejectedValue('network down');
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.click(screen.getByRole('button', { name: /^approve$/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
      expect(screen.getByText('network down')).toBeDefined();
    });

    it('clears a previous error when the next review succeeds', async () => {
      mockFetch()
        .mockResolvedValueOnce(jsonResponse({ error: 'first try failed' }, 500))
        .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.click(screen.getByRole('button', { name: /^approve$/i }));
      await waitFor(() => expect(screen.getByText('first try failed')).toBeDefined());

      await user.click(screen.getByRole('button', { name: /^approve$/i }));
      await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('sub-tabs', () => {
    it('returns to the pending list when Awaiting review is clicked from another tab', async () => {
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.click(screen.getByRole('tab', { name: /^approved$/i }));
      expect(screen.queryByText('Pending Piece')).toBeNull();

      await user.click(screen.getByRole('tab', { name: /awaiting review/i }));
      expect(screen.getByText('Pending Piece')).toBeDefined();
      expect(screen.getByRole('tab', { name: /awaiting review/i }).getAttribute('aria-selected')).toBe('true');
    });

    it('omits the pending count from the tab label when nothing awaits review', () => {
      render(<RelayAgent stats={{ ...stats, pending: [] }} />);
      expect(screen.getByRole('tab', { name: /awaiting review/i }).textContent).toBe('Awaiting review');
    });

    it('shows the pending count on the tab label when pieces await review', () => {
      render(<RelayAgent stats={stats} />);
      expect(screen.getByRole('tab', { name: /awaiting review \(1\)/i })).toBeDefined();
    });

    it('badges the approved sub-tab with the count of noted/edited pieces', () => {
      const approved: RelayStats = {
        ...stats,
        approved: [
          piece('p-a1', 'Edited Approve', 'x', { originalBody: '# Edited Approve\n\nbefore.' }),
          piece('p-a2', 'Plain Approve', 'y'),
        ],
      };
      render(<RelayAgent stats={approved} />);
      expect(screen.getByRole('tab', { name: /approved · ✎1/i })).toBeDefined();
    });
  });

  describe('piece titles', () => {
    it('uses the first non-blank line as the title when the body has no heading, and keeps the body intact', async () => {
      const headless: RelayStats = {
        ...stats,
        pending: [piece('p-headless', 'ignored', 'summary', { body: '\n  A plain opening line  \n\nrest of the prose.' })],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={headless} />);

      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('A plain opening line');
      await user.click(screen.getByRole('button', { name: /expand/i }));
      // Nothing was stripped: the opening line is still part of the rendered body.
      expect(screen.getAllByText(/A plain opening line/).length).toBe(2);
      expect(screen.getByText(/rest of the prose/)).toBeDefined();
    });

    it('finds a heading that is not on the first line and drops everything up to it from the body', async () => {
      const late: RelayStats = {
        ...stats,
        pending: [piece('p-late', 'ignored', 'summary', { body: 'stray preamble\n\n## Real Title\n\nthe body.' })],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={late} />);

      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Real Title');
      await user.click(screen.getByRole('button', { name: /expand/i }));
      expect(screen.getByText(/the body\./)).toBeDefined();
      expect(screen.queryByText(/stray preamble/)).toBeNull();
    });

    it('labels an empty body "(untitled)"', () => {
      render(<RelayAgent stats={{ ...stats, pending: [piece('p-empty', 'ignored', 'summary', { body: '   \n\n' })] }} />);
      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('(untitled)');
    });
  });

  describe('piece metadata and links', () => {
    it('omits the concept suffix when a piece has no concepts', () => {
      render(<RelayAgent stats={{ ...stats, pending: [piece('p-nc', 'No Concepts', 'summary', { concepts: [] })] }} />);
      expect(screen.getByText(/recalled 2$/)).toBeDefined();
      expect(screen.queryByText(/recalled 2 ·/)).toBeNull();
    });

    it('separates multiple source links and falls back to the URL when a link has no title', () => {
      const multi: RelayStats = {
        ...stats,
        pending: [
          piece('p-multi', 'Multi Source', 'summary', {
            sourceLinks: [
              { type: 'source', ref: 'https://reuters.com/a', title: 'Reuters' },
              { type: 'source', ref: 'https://ft.com/b' },
            ],
          }),
        ],
      };
      render(<RelayAgent stats={multi} />);
      expect(screen.getByRole('link', { name: 'Reuters' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'https://ft.com/b' }).getAttribute('href')).toBe('https://ft.com/b');
      expect(screen.getByText(/sources:/).parentElement?.textContent).toContain(' · ');
    });

    it('separates multiple Reader deep-links', () => {
      const multi: RelayStats = {
        ...stats,
        pending: [
          piece('p-readers', 'Two Readers', 'summary', {
            readerLinks: [
              { readerId: 'r1', title: 'First article', url: 'https://read.readwise.io/read/r1' },
              { readerId: 'r2', title: 'Second article', url: 'https://read.readwise.io/read/r2' },
            ],
          }),
        ],
      };
      render(<RelayAgent stats={multi} />);
      expect(screen.getByRole('link', { name: 'First article' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Second article' })).toBeDefined();
      expect(screen.getByText(/in Reader:/).parentElement?.textContent).toContain(' · ');
    });

    it('renders an unparseable source ref inert (no href)', () => {
      const broken: RelayStats = {
        ...stats,
        pending: [piece('p-bad-url', 'Bad URL', 'summary', { sourceLinks: [{ type: 'source', ref: 'not a url', title: 'garbled' }] })],
      };
      render(<RelayAgent stats={broken} />);
      expect(screen.getByText('garbled').closest('a')!.getAttribute('href')).toBeNull();
    });
  });

  describe('RunControl', () => {
    it('runs on Enter in the reader_id field, but not when the field is empty', async () => {
      mockFetch().mockResolvedValue(jsonResponse({ queued: true, readerId: 'abc123' }, 202));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);
      const input = screen.getByPlaceholderText('reader_id');

      await user.type(input, '{Enter}');
      expect(fetch).not.toHaveBeenCalled();

      await user.type(input, 'abc123{Enter}');
      await waitFor(() => expect(screen.getByText(/Session queued/)).toBeDefined());
      expect(JSON.parse(mockFetch().mock.calls[0][1].body as string)).toEqual({ readerId: 'abc123' });
      // No title came back, so the message does not name the material.
      expect(screen.queryByText(/queued for/)).toBeNull();
      expect((input as HTMLInputElement).value).toBe(''); // cleared after a successful run
    });

    it('surfaces the run route error and keeps the reader_id for a retry', async () => {
      mockFetch().mockResolvedValue(jsonResponse({ error: 'unknown reader_id' }, 404));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.type(screen.getByPlaceholderText('reader_id'), 'nope');
      await user.click(screen.getByRole('button', { name: /^run$/i }));

      await waitFor(() => expect(screen.getByText('unknown reader_id')).toBeDefined());
      expect((screen.getByPlaceholderText('reader_id') as HTMLInputElement).value).toBe('nope');
    });

    it('reports the status when the run route error body is not JSON', async () => {
      mockFetch().mockResolvedValue(textResponse('Internal Server Error', 500));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.type(screen.getByPlaceholderText('reader_id'), 'abc');
      await user.click(screen.getByRole('button', { name: /^run$/i }));

      await waitFor(() => expect(screen.getByText('run failed (500)')).toBeDefined());
    });

    it('stringifies a non-Error run failure', async () => {
      mockFetch().mockRejectedValue('socket hang up');
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);

      await user.type(screen.getByPlaceholderText('reader_id'), 'abc');
      await user.click(screen.getByRole('button', { name: /^run$/i }));

      await waitFor(() => expect(screen.getByText('socket hang up')).toBeDefined());
    });
  });

  describe('activity log cards', () => {
    it('shows what a wrote decision produced, with degraded marker, truncated reasoning and researched sources', async () => {
      const longReason = 'r'.repeat(300);
      const wrote: RelayStats = {
        ...stats,
        activity: [
          decision('dec-wrote', {
            verdict: 'wrote',
            pieceId: 'p-x',
            pieceSummary: 'A piece about vendor lock-in',
            degraded: 'no-research',
            reason: longReason,
            sources: [
              { quote: 'q1', source_url: 'https://ft.com/y', source_title: 'FT analysis' },
              { quote: 'q2', source_url: 'https://reuters.com/z', source_title: '' },
            ],
          }),
        ],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={wrote} />);
      await user.click(screen.getByRole('tab', { name: /activity log/i }));

      expect(screen.getByText(/A piece about vendor lock-in/)).toBeDefined();
      expect(screen.getByText(/degraded: no-research/)).toBeDefined();
      const reasoning = screen.getByText(/reasoning:/).parentElement!.textContent!;
      expect(reasoning).toContain('r'.repeat(280) + '…');
      expect(reasoning).not.toContain('r'.repeat(281));
      expect(screen.getByRole('link', { name: 'FT analysis' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'https://reuters.com/z' })).toBeDefined(); // untitled → URL
      expect(screen.getByText(/researched:/).parentElement?.textContent).toContain(' · ');
    });

    it('omits the wrote line and the reasoning when a decision carries neither', async () => {
      const sparse: RelayStats = {
        ...stats,
        activity: [
          decision('dec-a', { verdict: 'wrote', pieceSummary: null, reason: null }),
          decision('dec-b', { verdict: 'wrote', pieceSummary: 'made a piece', reason: null }),
        ],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={sparse} />);
      await user.click(screen.getByRole('tab', { name: /activity log/i }));

      expect(screen.getAllByText(/wrote:/)).toHaveLength(1); // only the decision with a summary
      expect(screen.queryByText(/reasoning:/)).toBeNull();
    });

    it('names the material by reader refs when titles are unresolved, else "(unknown stimulus)"', async () => {
      const unresolved: RelayStats = {
        ...stats,
        activity: [
          decision('dec-refs', { stimulusTitles: [], stimulusRef: ['r1', 'r2'], reason: null }),
          decision('dec-none', { stimulusTitles: [], stimulusRef: [], reason: null }),
        ],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={unresolved} />);
      await user.click(screen.getByRole('tab', { name: /activity log/i }));

      expect(screen.getByText(/r1, r2/)).toBeDefined();
      expect(screen.getByText(/\(unknown stimulus\)/)).toBeDefined();
    });

    it('renders an unlabelled signal code raw and falls back from title to ref to "(unknown item)"', async () => {
      const skips: RelayStats = {
        ...stats,
        engagementGate: { enabled: true, ownerConfigured: true },
        activity: [
          skip('ri-raw', { signals: ['mystery_code'], stimulusTitle: null, stimulusRef: 'r77' }),
          skip('ri-blank', { stimulusTitle: null, stimulusRef: '' }),
        ],
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={skips} />);
      await user.click(screen.getByRole('tab', { name: /activity log/i }));

      expect(screen.getByText(/mystery_code/)).toBeDefined();
      expect(screen.getByText(/r77/)).toBeDefined();
      expect(screen.getByText(/\(unknown item\)/)).toBeDefined();
    });

    it('goes back a page with Prev', async () => {
      const many: RelayStats = {
        ...stats,
        activity: Array.from({ length: 11 }, (_, i) => decision(`dec-${i}`, { stimulusTitles: [`Material ${i}`] })),
      };
      const user = userEvent.setup();
      render(<RelayAgent stats={many} />);
      await user.click(screen.getByRole('tab', { name: /activity log/i }));

      expect((screen.getByRole('button', { name: /prev/i }) as HTMLButtonElement).disabled).toBe(true);
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByText(/Page 2 of 2/)).toBeDefined();
      expect((screen.getByRole('button', { name: /next/i }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByRole('button', { name: /prev/i }));
      expect(screen.getByText(/Page 1 of 2/)).toBeDefined();
      expect(screen.getByText(/Material 0/)).toBeDefined();
    });
  });

  describe('GateToggle (engagement-gate, 2.3b)', () => {
    const switchName = /engagement-gated auto-trigger/i;

    it('renders the auto-trigger switch OFF by default', () => {
      render(<RelayAgent stats={stats} />);
      const sw = screen.getByRole('switch', { name: switchName });
      expect(sw.getAttribute('aria-checked')).toBe('false');
      expect((sw as HTMLButtonElement).disabled).toBe(false);
    });

    it('flips the switch ON and PATCHes the gate route', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ enabled: true }), { status: 200 }),
      );
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);
      await user.click(screen.getByRole('switch', { name: switchName }));

      await waitFor(() =>
        expect(screen.getByRole('switch', { name: switchName }).getAttribute('aria-checked')).toBe('true'),
      );
      const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/admin/relay/gate');
      expect((opts as RequestInit).method).toBe('PATCH');
      expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ enabled: true });
    });

    it('disables the switch and explains when the owner is unconfigured', () => {
      render(<RelayAgent stats={{ ...stats, engagementGate: { enabled: false, ownerConfigured: false } }} />);
      const sw = screen.getByRole('switch', { name: switchName });
      expect((sw as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/RELAY_OWNER_USER_ID is not configured/i)).toBeDefined();
    });

    it('reflects an already-ON gate from server state', () => {
      render(<RelayAgent stats={{ ...stats, engagementGate: { enabled: true, ownerConfigured: true } }} />);
      expect(screen.getByRole('switch', { name: switchName }).getAttribute('aria-checked')).toBe('true');
    });

    it('shows the gate route error and leaves the switch where it was', async () => {
      mockFetch().mockResolvedValue(jsonResponse({ error: 'settings table unavailable' }, 500));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);
      await user.click(screen.getByRole('switch', { name: switchName }));

      await waitFor(() => expect(screen.getByText('settings table unavailable')).toBeDefined());
      expect(screen.getByRole('switch', { name: switchName }).getAttribute('aria-checked')).toBe('false');
    });

    it('reports the status when the gate route error body is not JSON', async () => {
      mockFetch().mockResolvedValue(textResponse('Bad Gateway', 502));
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);
      await user.click(screen.getByRole('switch', { name: switchName }));

      await waitFor(() => expect(screen.getByText('toggle failed (502)')).toBeDefined());
    });

    it('stringifies a non-Error toggle failure', async () => {
      mockFetch().mockRejectedValue('offline');
      const user = userEvent.setup();
      render(<RelayAgent stats={stats} />);
      await user.click(screen.getByRole('switch', { name: switchName }));

      await waitFor(() => expect(screen.getByText('offline')).toBeDefined());
    });
  });

  it('shows a dash for a piece with no timestamp instead of throwing on an invalid date', () => {
    render(<RelayAgent stats={{ ...stats, pending: [piece('p-old', 'Undated Piece', 'summary', { createdAt: '' })] }} />);

    expect(screen.getByText('Undated Piece')).toBeDefined();
    expect(screen.getByText(/— UTC · recalled/)).toBeDefined();
  });
});
