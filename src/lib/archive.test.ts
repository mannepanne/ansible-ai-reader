// @vitest-environment node
// ABOUT: Tests for the shared archive helper
// ABOUT: Reader-first ordering, 404 handling, idempotence, DB failure reporting

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { archiveItemForUser } from './archive';

const mockArchiveItem = vi.fn();
vi.mock('@/lib/reader-api', () => ({
  archiveItem: (...args: unknown[]) => mockArchiveItem(...args),
  ReaderAPIError: class ReaderAPIError extends Error {
    constructor(message: string, public statusCode?: number, public retryable = false) {
      super(message);
      this.name = 'ReaderAPIError';
    }
  },
}));

import { ReaderAPIError } from '@/lib/reader-api';

function makeDb(row: Record<string, unknown> | null, updateError: { message: string } | null = null) {
  const single = vi.fn().mockResolvedValue(row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } });
  const updateEqUser = vi.fn().mockResolvedValue({ error: updateError });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: updateEqUser }) });
  const db = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }),
      update,
    }),
  };
  return { db: db as never, update, updateEqUser };
}

const base = { userId: 'user-1', itemId: 'item-1', reason: 'user' as const, readerApiToken: 'tok', now: new Date('2026-09-06T07:00:00Z') };
const unarchived = { id: 'item-1', reader_id: 'r-1', archived: false, archived_at: null, reader_deleted: false };

describe('archiveItemForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives in Reader, then writes archived, archived_at, archive_reason and reader_deleted', async () => {
    mockArchiveItem.mockResolvedValue(undefined);
    const { db, update, updateEqUser } = makeDb(unarchived);

    const result = await archiveItemForUser(db, base);

    expect(result).toEqual({ ok: true, readerDeleted: false, alreadyArchived: false });
    expect(mockArchiveItem).toHaveBeenCalledWith('tok', 'r-1');
    expect(update).toHaveBeenCalledWith({
      archived: true,
      archived_at: '2026-09-06T07:00:00.000Z',
      archive_reason: 'user',
      reader_deleted: false,
    });
    expect(updateEqUser).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('writes the drift reason when asked', async () => {
    mockArchiveItem.mockResolvedValue(undefined);
    const { db, update } = makeDb(unarchived);
    await archiveItemForUser(db, { ...base, reason: 'drift' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ archive_reason: 'drift' }));
  });

  it('returns not_found when the item is missing or belongs to someone else', async () => {
    const { db } = makeDb(null);
    expect(await archiveItemForUser(db, base)).toEqual({ ok: false, error: 'not_found' });
    expect(mockArchiveItem).not.toHaveBeenCalled();
  });

  it('is idempotent: an archived item returns ok with no Reader call and no write', async () => {
    const { db, update } = makeDb({ ...unarchived, archived: true, archived_at: '2026-09-01T00:00:00Z', reader_deleted: true });
    expect(await archiveItemForUser(db, base)).toEqual({ ok: true, readerDeleted: true, alreadyArchived: true });
    expect(mockArchiveItem).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('treats a Reader 404 as deleted-in-Reader and still archives locally', async () => {
    mockArchiveItem.mockRejectedValue(new ReaderAPIError('Item not found in Reader', 404));
    const { db, update } = makeDb(unarchived);
    expect(await archiveItemForUser(db, base)).toEqual({ ok: true, readerDeleted: true, alreadyArchived: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ reader_deleted: true }));
  });

  it('reports other Reader failures without touching the database', async () => {
    mockArchiveItem.mockRejectedValue(new ReaderAPIError('Rate limited', 429, true));
    const { db, update } = makeDb(unarchived);
    expect(await archiveItemForUser(db, base)).toEqual({ ok: false, error: 'reader_failed', message: 'Rate limited' });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports non-Error throws with a generic message', async () => {
    mockArchiveItem.mockRejectedValue('boom');
    const { db } = makeDb(unarchived);
    expect(await archiveItemForUser(db, base)).toEqual({ ok: false, error: 'reader_failed', message: 'Failed to archive in Reader' });
  });

  it('reports a local write failure after a successful Reader archive as requiring refresh', async () => {
    mockArchiveItem.mockResolvedValue(undefined);
    const { db } = makeDb(unarchived, { message: 'db down' });
    const result = await archiveItemForUser(db, base);
    expect(result).toMatchObject({ ok: false, error: 'db_failed', requiresRefresh: true });
  });
});
