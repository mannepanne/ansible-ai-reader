// @vitest-environment node
// ABOUT: Tests for the per-user Fika run
// ABOUT: Skip reasons, batch reuse vs creation, empty states, token links, send success and failure

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFikaForUser, actionUrl, dateLabel } from './run';
import * as store from './store';
import { verifyActionToken } from './action-token';

vi.mock('./store');

const db = {} as never;
const user = { id: 'u1', email: 'me@example.com', fikaHour: 7, timeZone: 'Europe/London', weeklyTarget: 5 };
// 07:30 London (BST) on Sunday 2026-09-06
const now = new Date('2026-09-06T06:30:00Z');
const deps = {
  now,
  actionSecret: 'secret',
  siteUrl: 'https://app.test',
  fromEmail: 'fika@app.test',
  resendApiKey: 'rk',
  sendEmail: vi.fn(),
};

const storedItem = (id: string, createdAt: string) => ({
  id,
  title: `Title ${id}`,
  url: `https://example.com/${id}`,
  author: 'A',
  source: 'S',
  wordCount: 440,
  createdAt,
  shortSummary: '- one\n- two',
  tags: ['t'],
});

describe('runFikaForUser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.getBatchByDate).mockResolvedValue(null);
    vi.mocked(store.getMostRecentBatch).mockResolvedValue(null);
    vi.mocked(store.listCandidates).mockResolvedValue([
      { id: 'old', createdAt: '2026-07-01T00:00:00Z' },
      { id: 'new', createdAt: '2026-09-05T10:00:00Z' },
    ]);
    vi.mocked(store.listRecentlyBatchedIds).mockResolvedValue(new Set());
    vi.mocked(store.createBatch).mockResolvedValue('batch-1');
    vi.mocked(store.addBatchItems).mockResolvedValue();
    vi.mocked(store.loadEmailItems).mockImplementation(async (_db, _u, ids) =>
      ids.map((id) => storedItem(id, id === 'old' ? '2026-07-01T00:00:00Z' : '2026-09-05T10:00:00Z'))
    );
    vi.mocked(store.countUnread).mockResolvedValue(41);
    vi.mocked(store.listReadingEvents).mockResolvedValue([{ at: '2026-09-01T09:00:00Z' }]);
    vi.mocked(store.markSent).mockResolvedValue();
    vi.mocked(store.recordSendAttempt).mockResolvedValue();
    deps.sendEmail.mockResolvedValue({ ok: true, id: 'msg-1' });
  });

  it('skips outside the window without touching selection', async () => {
    const early = { ...deps, now: new Date('2026-09-06T05:30:00Z') }; // 06:30 London
    expect(await runFikaForUser(db, user, early)).toEqual({ status: 'skipped', reason: 'before_window' });
    expect(store.listCandidates).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('skips when today is already sent', async () => {
    vi.mocked(store.getBatchByDate).mockResolvedValue({ id: 'b', sentAt: '2026-09-06T06:01:00Z', sendAttempts: 1, itemIds: ['old'] });
    expect(await runFikaForUser(db, user, deps)).toEqual({ status: 'skipped', reason: 'already_sent' });
  });

  it('selects, creates a batch, renders signed links, sends, and marks sent', async () => {
    const outcome = await runFikaForUser(db, user, deps);

    expect(outcome).toEqual({ status: 'sent', batchId: 'batch-1', itemCount: 2 });
    expect(store.getBatchByDate).toHaveBeenCalledWith(db, 'u1', '2026-09-06');
    expect(store.listRecentlyBatchedIds).toHaveBeenCalledWith(db, 'u1', '2026-08-23');
    expect(store.createBatch).toHaveBeenCalledWith(db, 'u1', '2026-09-06', [
      { itemId: 'old', slot: 1, carriedFrom: null },
      { itemId: 'new', slot: 2, carriedFrom: null },
    ]);
    expect(store.markSent).toHaveBeenCalledWith(db, 'batch-1', now.toISOString(), 'msg-1');
    // The attempt is counted before the send, so a bookkeeping failure after a successful send cannot loop
    expect(store.recordSendAttempt).toHaveBeenCalledWith(db, 'batch-1', 1);
    expect(vi.mocked(store.recordSendAttempt).mock.invocationCallOrder[0]).toBeLessThan(deps.sendEmail.mock.invocationCallOrder[0]);

    const sent = deps.sendEmail.mock.calls[0][0];
    expect(sent.to).toBe('me@example.com');
    expect(sent.from).toBe('fika@app.test');
    expect(sent.subject).toBe('Ansible Fika: Your two items to go');
    expect(sent.unsubscribeUrl).toBe('https://app.test/settings');
    expect(sent.html).toContain('Sunday 6 September');
    expect(sent.html).toContain('saved 67 days ago');
    expect(sent.html).toContain('saved yesterday');
    expect(sent.html).toContain('41 unread');
    expect(sent.html).toContain('1 of 5 reading days this week');
    expect(sent.html).toContain('Sent at 07:00');
    expect(sent.html).toContain('href="https://app.test/summaries#old"');

    // Every action link carries a valid token for the right item and action
    const links = [...sent.html.matchAll(/href="https:\/\/app\.test\/fika\/act\?t=([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
    expect(links).toHaveLength(8);
    const verified = await Promise.all(links.map((t) => verifyActionToken(t, 'secret', now.getTime())));
    const summary = verified.map((v) => (v.ok ? `${v.payload.itemId}:${v.payload.action}:${v.payload.batchId}` : 'bad'));
    expect(summary).toEqual([
      'old:interesting:batch-1',
      'old:not_interesting:batch-1',
      'old:archive:batch-1',
      'old:read:batch-1',
      'new:interesting:batch-1',
      'new:not_interesting:batch-1',
      'new:archive:batch-1',
      'new:read:batch-1',
    ]);
  });

  it('reuses an unsent batch from earlier today instead of selecting again', async () => {
    vi.mocked(store.getBatchByDate).mockResolvedValue({ id: 'b-retry', sentAt: null, sendAttempts: 1, itemIds: ['new'] });
    const outcome = await runFikaForUser(db, user, deps);
    expect(outcome).toEqual({ status: 'sent', batchId: 'b-retry', itemCount: 1 });
    expect(store.createBatch).not.toHaveBeenCalled();
    expect(store.loadEmailItems).toHaveBeenCalledWith(db, 'u1', ['new']);
  });

  it('returns empty and creates nothing when there are no candidates', async () => {
    vi.mocked(store.listCandidates).mockResolvedValue([]);
    expect(await runFikaForUser(db, user, deps)).toEqual({ status: 'empty' });
    expect(store.createBatch).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('returns empty when the batch items no longer exist', async () => {
    vi.mocked(store.loadEmailItems).mockResolvedValue([]);
    expect(await runFikaForUser(db, user, deps)).toEqual({ status: 'empty' });
  });

  it('re-selects into a half-created batch that has no items instead of reporting empty', async () => {
    vi.mocked(store.getBatchByDate).mockResolvedValue({ id: 'b-half', sentAt: null, sendAttempts: 0, itemIds: [] });
    const outcome = await runFikaForUser(db, user, deps);
    expect(outcome).toEqual({ status: 'sent', batchId: 'b-half', itemCount: 2 });
    expect(store.createBatch).not.toHaveBeenCalled();
    expect(store.addBatchItems).toHaveBeenCalledWith(db, 'b-half', [
      { itemId: 'old', slot: 1, carriedFrom: null },
      { itemId: 'new', slot: 2, carriedFrom: null },
    ]);
  });

  it('records an attempt and reports failure when Resend rejects', async () => {
    deps.sendEmail.mockResolvedValue({ ok: false, status: 500, message: 'Resend responded 500' });
    const outcome = await runFikaForUser(db, user, deps);
    expect(outcome).toEqual({ status: 'send_failed', batchId: 'batch-1', attempts: 1, message: 'Resend responded 500' });
    expect(store.recordSendAttempt).toHaveBeenCalledWith(db, 'batch-1', 1);
    expect(store.markSent).not.toHaveBeenCalled();
  });

  it('does not resend when the send succeeded but marking it sent throws', async () => {
    vi.mocked(store.markSent).mockRejectedValue(new Error('db down'));
    await expect(runFikaForUser(db, user, deps)).rejects.toThrow('db down');
    // The attempt was recorded before Resend was called, so the next tick sees attempts = 1, not 0
    expect(store.recordSendAttempt).toHaveBeenCalledWith(db, 'batch-1', 1);
  });

  it('counts attempts on top of an existing unsent batch', async () => {
    vi.mocked(store.getBatchByDate).mockResolvedValue({ id: 'b', sentAt: null, sendAttempts: 2, itemIds: ['old'] });
    deps.sendEmail.mockResolvedValue({ ok: false, status: null, message: 'net' });
    expect(await runFikaForUser(db, user, deps)).toMatchObject({ status: 'send_failed', attempts: 3 });
    expect(store.recordSendAttempt).toHaveBeenCalledWith(db, 'b', 3);
  });

  it('passes carry-forward through to the new batch', async () => {
    vi.mocked(store.getMostRecentBatch).mockResolvedValue({
      id: 'b-yesterday',
      items: [{ itemId: 'old', slot: 1, archived: false, deleted: false }],
    });
    await runFikaForUser(db, user, deps);
    expect(store.createBatch).toHaveBeenCalledWith(db, 'u1', '2026-09-06', [
      { itemId: 'old', slot: 1, carriedFrom: 'b-yesterday' },
      { itemId: 'new', slot: 2, carriedFrom: null },
    ]);
  });
});

describe('helpers', () => {
  it('builds the action url and a readable date label', () => {
    expect(actionUrl('https://a.b', 'x.y=')).toBe('https://a.b/fika/act?t=x.y%3D');
    expect(dateLabel(now, 'Europe/London')).toBe('Sunday 6 September');
    expect(dateLabel(new Date('2026-09-06T22:30:00Z'), 'Europe/Stockholm')).toBe('Monday 7 September');
  });
});
