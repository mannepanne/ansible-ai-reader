// ABOUT: Tests for the RelayAgent admin tab — approve/reject proxy calls and optimistic list update

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelayAgent from './RelayAgent';
import type { RelayStats } from './types';

const stats: RelayStats = {
  counts: { pendingReview: 1, approved: 0, rejected: 0 },
  pending: [
    {
      id: 'piece-1',
      body: '# Title\n\nbody text',
      summary: 'a summary',
      concepts: ['x'],
      recalledCount: 2,
      createdAt: '2026-06-28T10:00:00Z',
    },
  ],
  decisions: [],
};

describe('RelayAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('approves a piece: posts to the review route and removes it from the list', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'piece-1', slug: 'title' }), { status: 200 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    expect(screen.getByText('a summary')).toBeDefined();
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(screen.queryByText('a summary')).toBeNull());
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/admin/relay/review');
    expect(JSON.parse(opts.body as string)).toEqual({ id: 'piece-1', action: 'approve' });
  });

  it('surfaces a bridge error and keeps the piece in the list', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'bridge approve failed', detail: 'piece is not pending_review' }), { status: 502 }),
    );
    const user = userEvent.setup();
    render(<RelayAgent stats={stats} />);

    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/not pending_review/)).toBeDefined();
    expect(screen.getByText('a summary')).toBeDefined(); // still present
  });

  it('shows an empty state when there are no pending pieces', () => {
    render(<RelayAgent stats={{ ...stats, pending: [], counts: { pendingReview: 0, approved: 1, rejected: 0 } }} />);
    expect(screen.getByText(/No pieces awaiting review/i)).toBeDefined();
  });
});
