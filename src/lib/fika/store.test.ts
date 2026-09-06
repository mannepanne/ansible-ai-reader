// @vitest-environment node
// ABOUT: Tests for the Fika data-access module
// ABOUT: Uses a thenable chain mock so each function's query shape and mapping is checked without a database

import { describe, it, expect, vi } from 'vitest';
import {
  listFikaUsers,
  getUserFikaSettings,
  getBatchByDate,
  getMostRecentBatch,
  listCandidates,
  listRecentlyBatchedIds,
  createBatch,
  addBatchItems,
  CANDIDATE_LIMIT,
  loadEmailItems,
  countUnread,
  listReadingEvents,
  recordSendAttempt,
  markSent,
} from './store';

type Result = { data?: unknown; error?: { message: string } | null; count?: number | null };

/** A query builder stand-in: every method returns the chain, awaiting it resolves the result */
function chain(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const target: Record<string, unknown> = { calls };
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: Result) => void) => resolve({ error: null, data: undefined, ...result });
      if (prop === 'calls') return calls;
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        return proxy;
      };
    },
  });
  return proxy as unknown as { calls: Array<[string, unknown[]]> } & Record<string, (...a: unknown[]) => unknown>;
}

function db(tables: Record<string, ReturnType<typeof chain> | Array<ReturnType<typeof chain>>>) {
  const queues = new Map(Object.entries(tables).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  return {
    from: vi.fn((table: string) => {
      const q = queues.get(table);
      if (!q || q.length === 0) throw new Error(`unexpected table ${table}`);
      return q.length > 1 ? q.shift() : q[0];
    }),
  } as never;
}

describe('store', () => {
  it('listFikaUsers maps rows and defaults', async () => {
    const users = chain({ data: [{ id: 'u1', email: 'a@b.c', fika_hour: 7, timezone: null, weekly_target: null }] });
    expect(await listFikaUsers(db({ users }))).toEqual([
      { id: 'u1', email: 'a@b.c', fikaHour: 7, timeZone: 'Europe/London', weeklyTarget: 5 },
    ]);
    expect(users.calls).toContainEqual(['not', ['fika_hour', 'is', null]]);
  });

  it('getUserFikaSettings returns null for a missing user and defaults otherwise', async () => {
    expect(await getUserFikaSettings(db({ users: chain({ data: null }) }), 'u1')).toBeNull();
    expect(await getUserFikaSettings(db({ users: chain({ data: { timezone: 'UTC', weekly_target: 3 } }) }), 'u1')).toEqual({
      timeZone: 'UTC',
      weeklyTarget: 3,
    });
  });

  it('getBatchByDate returns item ids in slot order', async () => {
    const batches = chain({
      data: { id: 'b1', sent_at: null, send_attempts: 1, fika_batch_items: [{ item_id: 'y', slot: 2 }, { item_id: 'x', slot: 1 }] },
    });
    expect(await getBatchByDate(db({ fika_batches: batches }), 'u1', '2026-09-06')).toEqual({
      id: 'b1',
      sentAt: null,
      sendAttempts: 1,
      itemIds: ['x', 'y'],
    });
    expect(batches.calls).toContainEqual(['eq', ['batch_date', '2026-09-06']]);
    expect(await getBatchByDate(db({ fika_batches: chain({ data: null }) }), 'u1', '2026-09-06')).toBeNull();
  });

  it('getMostRecentBatch derives archived and deleted from the embedded item', async () => {
    const batches = chain({
      data: {
        id: 'b0',
        fika_batch_items: [
          { item_id: 'a', slot: 1, reader_items: { archived: false, archived_at: null, reader_deleted: false } },
          { item_id: 'b', slot: 2, reader_items: { archived: true, archived_at: '2026-09-05T00:00:00Z', reader_deleted: false } },
          { item_id: 'c', slot: 2, reader_items: null },
          { item_id: 'd', slot: 1, reader_items: { archived: false, archived_at: null, reader_deleted: true } },
        ],
      },
    });
    expect(await getMostRecentBatch(db({ fika_batches: batches }), 'u1')).toEqual({
      id: 'b0',
      items: [
        { itemId: 'a', slot: 1, archived: false, deleted: false },
        { itemId: 'b', slot: 2, archived: true, deleted: false },
        { itemId: 'c', slot: 2, archived: false, deleted: true },
        { itemId: 'd', slot: 1, archived: false, deleted: true },
      ],
    });
    expect(batches.calls).toContainEqual(['order', ['batch_date', { ascending: false }]]);
    expect(await getMostRecentBatch(db({ fika_batches: chain({ data: null }) }), 'u1')).toBeNull();
  });

  it('listCandidates reads a bounded window from each end and de-duplicates the overlap', async () => {
    const oldest = chain({ data: [{ id: 'a', created_at: '2026-06-01T00:00:00Z' }, { id: 'b', created_at: '2026-07-01T00:00:00Z' }] });
    const newest = chain({ data: [{ id: 'c', created_at: '2026-09-01T00:00:00Z' }, { id: 'b', created_at: '2026-07-01T00:00:00Z' }] });
    const result = await listCandidates(db({ reader_items: [oldest, newest] }), 'u1');
    expect(result.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(oldest.calls).toContainEqual(['is', ['archived_at', null]]);
    expect(oldest.calls).toContainEqual(['eq', ['reader_deleted', false]]);
    expect(oldest.calls).toContainEqual(['not', ['short_summary', 'is', null]]);
    expect(oldest.calls).toContainEqual(['order', ['created_at', { ascending: true }]]);
    expect(oldest.calls).toContainEqual(['limit', [CANDIDATE_LIMIT]]);
    expect(newest.calls).toContainEqual(['order', ['created_at', { ascending: false }]]);
  });

  it('listCandidates surfaces an error from either end', async () => {
    await expect(listCandidates(db({ reader_items: [chain({}), chain({ error: { message: 'newest broke' } })] }), 'u1')).rejects.toThrow('newest broke');
  });

  it('listRecentlyBatchedIds flattens batch items into a set', async () => {
    const batches = chain({ data: [{ fika_batch_items: [{ item_id: 'a' }, { item_id: 'b' }] }, { fika_batch_items: [{ item_id: 'a' }] }] });
    const ids = await listRecentlyBatchedIds(db({ fika_batches: batches }), 'u1', '2026-08-23');
    expect([...ids].sort()).toEqual(['a', 'b']);
    expect(batches.calls).toContainEqual(['gte', ['batch_date', '2026-08-23']]);
  });

  it('createBatch inserts the batch then its items and returns the id', async () => {
    const batches = chain({ data: { id: 'new' } });
    const items = chain({});
    const id = await createBatch(db({ fika_batches: batches, fika_batch_items: items }), 'u1', '2026-09-06', [
      { itemId: 'x', slot: 1, carriedFrom: 'b0' },
      { itemId: 'y', slot: 2, carriedFrom: null },
    ]);
    expect(id).toBe('new');
    expect(batches.calls[0]).toEqual(['insert', [{ user_id: 'u1', batch_date: '2026-09-06' }]]);
    expect(items.calls[0]).toEqual([
      'insert',
      [
        [
          { batch_id: 'new', item_id: 'x', slot: 1, carried_from: 'b0' },
          { batch_id: 'new', item_id: 'y', slot: 2, carried_from: null },
        ],
      ],
    ]);
  });

  it('addBatchItems inserts into an existing batch', async () => {
    const items = chain({});
    await addBatchItems(db({ fika_batch_items: items }), 'b9', [{ itemId: 'z', slot: 1, carriedFrom: null }]);
    expect(items.calls[0]).toEqual(['insert', [[{ batch_id: 'b9', item_id: 'z', slot: 1, carried_from: null }]]]);
  });

  it('createBatch surfaces errors', async () => {
    await expect(createBatch(db({ fika_batches: chain({ data: null, error: { message: 'dup' } }) }), 'u1', 'd', [])).rejects.toThrow('dup');
    await expect(
      createBatch(db({ fika_batches: chain({ data: { id: 'n' } }), fika_batch_items: chain({ error: { message: 'bad' } }) }), 'u1', 'd', [])
    ).rejects.toThrow('bad');
  });

  it('loadEmailItems preserves the requested order, drops missing ids, and maps columns', async () => {
    const rows = chain({
      data: [
        { id: 'b', title: 'B', url: 'u', author: null, source: 's', word_count: 10, created_at: 'c', short_summary: null, tags: null },
        { id: 'a', title: 'A', url: 'u', author: 'x', source: null, word_count: null, created_at: 'c', short_summary: '- p', tags: ['t'] },
      ],
    });
    const result = await loadEmailItems(db({ reader_items: rows }), 'u1', ['a', 'gone', 'b']);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result[0]).toEqual({ id: 'a', title: 'A', url: 'u', author: 'x', source: null, wordCount: null, createdAt: 'c', shortSummary: '- p', tags: ['t'] });
    expect(result[1].tags).toEqual([]);
    expect(await loadEmailItems(db({}), 'u1', [])).toEqual([]);
  });

  it('countUnread uses the same filter as the summaries list', async () => {
    const items = chain({ count: 41 });
    expect(await countUnread(db({ reader_items: items }), 'u1')).toBe(41);
    expect(items.calls).toContainEqual(['is', ['archived_at', null]]);
    expect(await countUnread(db({ reader_items: chain({ count: null }) }), 'u1')).toBe(0);
  });

  it('listReadingEvents merges signals and non-drift archives', async () => {
    const signals = chain({ data: [{ created_at: 's1' }] });
    const archives = chain({ data: [{ archived_at: 'a1' }] });
    const events = await listReadingEvents(db({ item_signals: signals, reader_items: archives }), 'u1', 'since');
    expect(events).toEqual([{ at: 's1' }, { at: 'a1' }]);
    expect(archives.calls).toContainEqual(['or', ['archive_reason.is.null,archive_reason.eq.user']]);
    expect(signals.calls).toContainEqual(['gte', ['created_at', 'since']]);
  });

  it('recordSendAttempt and markSent update the batch row', async () => {
    const attempt = chain({});
    await recordSendAttempt(db({ fika_batches: attempt }), 'b1', 2);
    expect(attempt.calls[0]).toEqual(['update', [{ send_attempts: 2 }]]);
    const sent = chain({});
    await markSent(db({ fika_batches: sent }), 'b1', '2026-09-06T06:00:00Z', 'msg');
    expect(sent.calls[0]).toEqual(['update', [{ sent_at: '2026-09-06T06:00:00Z', resend_message_id: 'msg' }]]);
    await expect(markSent(db({ fika_batches: chain({ error: { message: 'x' } }) }), 'b1', 't', null)).rejects.toThrow('markSent');
  });

  it('propagates query errors with context', async () => {
    await expect(listFikaUsers(db({ users: chain({ error: { message: 'boom' } }) }))).rejects.toThrow('[Fika store] listFikaUsers: boom');
    await expect(countUnread(db({ reader_items: chain({ error: {} as never }) }), 'u')).rejects.toThrow('unknown error');
  });
});
