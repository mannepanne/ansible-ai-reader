// ABOUT: Tests for the Fika action endpoint
// ABOUT: Token gating, item ownership, each action's effect and idempotence, redirect for read

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { signActionToken, type ActionTokenPayload } from '@/lib/fika/action-token';

const mockDb = { from: vi.fn() };
vi.mock('@/utils/supabase/server', () => ({
  createServiceRoleClient: () => mockDb,
}));

const mockArchive = vi.fn();
vi.mock('@/lib/archive', () => ({
  archiveItemForUser: (...args: unknown[]) => mockArchive(...args),
}));

const SECRET = 'fika-secret';
const ITEM = { id: 'item-1', title: 'A title', url: 'https://example.com/a', rating: null as number | null };

function tokenFor(overrides: Partial<ActionTokenPayload> = {}) {
  return signActionToken(
    { userId: 'user-1', itemId: 'item-1', batchId: 'batch-1', action: 'archive', exp: Math.floor(Date.now() / 1000) + 3600, ...overrides },
    SECRET
  );
}

function formRequest(t: string | null) {
  const body = new URLSearchParams();
  if (t !== null) body.set('t', t);
  return new Request('http://localhost/api/fika/act', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/fika/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** reader_items select chain -> item; update/insert chains record calls */
function setupDb(item: typeof ITEM | null, opts: { updateError?: unknown; insertError?: unknown } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
  const updateEqUser = vi.fn().mockResolvedValue({ error: opts.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: updateEqUser }) });
  mockDb.from.mockImplementation((table: string) => {
    if (table === 'reader_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: item, error: null }) }) }),
        }),
        update,
      };
    }
    if (table === 'item_signals') return { insert };
    throw new Error(`unexpected table ${table}`);
  });
  return { insert, update };
}

describe('POST /api/fika/act', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIKA_ACTION_SECRET = SECRET;
    process.env.READER_API_TOKEN = 'reader-token';
    process.env.SITE_URL = 'https://app.test';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns 500 when the secret is not configured', async () => {
    Reflect.deleteProperty(process.env, 'FIKA_ACTION_SECRET');
    const res = await POST(formRequest('x'));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('not set up');
  });

  it('returns 400 when no token is supplied, for form and JSON bodies', async () => {
    expect((await POST(formRequest(null))).status).toBe(400);
    expect((await POST(jsonRequest({}))).status).toBe(400);
  });

  it('returns 403 with a friendly page for a bad or expired token and performs no write', async () => {
    const { insert } = setupDb(ITEM);
    const bad = await POST(formRequest('nope.nope'));
    expect(bad.status).toBe(403);
    expect(await bad.text()).toContain('This link has expired');

    const expired = await POST(formRequest(await tokenFor({ exp: Math.floor(Date.now() / 1000) - 1 })));
    expect(expired.status).toBe(403);
    expect(mockDb.from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 404 when the item is gone or belongs to another user', async () => {
    setupDb(null);
    const res = await POST(formRequest(await tokenFor()));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no longer in Ansible');
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it('archives through the shared helper with reason user and confirms', async () => {
    setupDb(ITEM);
    mockArchive.mockResolvedValue({ ok: true, readerDeleted: false, alreadyArchived: false });
    const res = await POST(formRequest(await tokenFor({ action: 'archive' })));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Archived');
    expect(html).toContain('A title');
    expect(html).toContain('href="https://app.test/summaries"');
    expect(mockArchive).toHaveBeenCalledWith(mockDb, { userId: 'user-1', itemId: 'item-1', reason: 'user', readerApiToken: 'reader-token' });
  });

  it('reports already-archived and reader-deleted outcomes, and archive failures', async () => {
    setupDb(ITEM);
    mockArchive.mockResolvedValueOnce({ ok: true, readerDeleted: true, alreadyArchived: true });
    let html = await (await POST(formRequest(await tokenFor()))).text();
    expect(html).toContain('Already archived');
    expect(html).toContain('removed from Reader');

    mockArchive.mockResolvedValueOnce({ ok: false, error: 'reader_failed', message: 'Rate limited' });
    const failed = await POST(formRequest(await tokenFor()));
    expect(failed.status).toBe(500);
    expect(await failed.text()).toContain('Rate limited');

    mockArchive.mockResolvedValueOnce({ ok: false, error: 'not_found' });
    expect((await POST(formRequest(await tokenFor()))).status).toBe(404);

    Reflect.deleteProperty(process.env, 'READER_API_TOKEN');
    const noToken = await POST(formRequest(await tokenFor()));
    expect(noToken.status).toBe(500);
    expect(await noToken.text()).toContain('Reader is not configured');
  });

  it('rates interesting, records a fika-sourced signal, and is idempotent', async () => {
    const { insert, update } = setupDb(ITEM);
    const res = await POST(jsonRequest({ t: await tokenFor({ action: 'interesting' }) }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Marked as interesting');
    expect(update).toHaveBeenCalledWith({ rating: 4 });
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', item_id: 'item-1', signal_type: 'rated_interesting', source: 'fika' });

    const { insert: insert2, update: update2 } = setupDb({ ...ITEM, rating: 4 });
    const again = await POST(formRequest(await tokenFor({ action: 'interesting' })));
    expect(await again.text()).toContain('It already was');
    expect(update2).not.toHaveBeenCalled();
    expect(insert2).not.toHaveBeenCalled();
  });

  it('rates not interesting and survives a signal insert failure', async () => {
    const { insert, update } = setupDb(ITEM, { insertError: { message: 'x' } });
    const res = await POST(formRequest(await tokenFor({ action: 'not_interesting' })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Marked as not for me');
    expect(update).toHaveBeenCalledWith({ rating: 1 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ signal_type: 'rated_not_interesting', source: 'fika' }));
  });

  it('returns 500 when the rating update fails', async () => {
    setupDb(ITEM, { updateError: { message: 'db' } });
    const res = await POST(formRequest(await tokenFor({ action: 'interesting' })));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('Could not save the rating');
  });

  it('records a fika click-through and redirects to the article on read', async () => {
    const { insert } = setupDb(ITEM);
    const res = await POST(formRequest(await tokenFor({ action: 'read' })));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://example.com/a');
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', item_id: 'item-1', signal_type: 'click_through', source: 'fika' });
  });

  it('still redirects when the click-through insert fails, and refuses a non-http url', async () => {
    setupDb(ITEM, { insertError: { message: 'x' } });
    expect((await POST(formRequest(await tokenFor({ action: 'read' })))).status).toBe(303);

    const { insert: insert2 } = setupDb({ ...ITEM, url: 'javascript:alert(1)' });
    const res = await POST(formRequest(await tokenFor({ action: 'read' })));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('no readable link');
    expect(insert2).not.toHaveBeenCalled(); // a click that went nowhere is not a signal
  });

  it('returns a friendly 500 page on unexpected errors', async () => {
    mockDb.from.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await POST(formRequest(await tokenFor()));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('Something went wrong');
  });
});
