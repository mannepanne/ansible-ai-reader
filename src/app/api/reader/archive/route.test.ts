// ABOUT: Tests for Reader archive API endpoint
// ABOUT: Validates authentication, validation, and the mapping of helper outcomes to responses

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockClient = { auth: { getUser: mockGetUser }, from: vi.fn() };

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => mockClient),
}));

const mockArchiveItemForUser = vi.fn();
vi.mock('@/lib/archive', () => ({
  archiveItemForUser: (...args: unknown[]) => mockArchiveItemForUser(...args),
}));

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/reader/archive', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/reader/archive', () => {
  const originalEnv = process.env.READER_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READER_API_TOKEN = 'test-reader-token';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  afterEach(() => {
    process.env.READER_API_TOKEN = originalEnv;
  });

  it('archives item successfully via the shared helper with reason user', async () => {
    mockArchiveItemForUser.mockResolvedValue({ ok: true, readerDeleted: false, alreadyArchived: false });

    const response = await POST(makeRequest({ itemId: 'item-123' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, readerDeleted: false });
    expect(mockArchiveItemForUser).toHaveBeenCalledWith(mockClient, {
      userId: 'user-123',
      itemId: 'item-123',
      reason: 'user',
      readerApiToken: 'test-reader-token',
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(401);
    expect(mockArchiveItemForUser).not.toHaveBeenCalled();
  });

  it('returns 400 when itemId is missing', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing itemId parameter' });
  });

  it('returns 404 when item not found', async () => {
    mockArchiveItemForUser.mockResolvedValue({ ok: false, error: 'not_found' });
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Item not found' });
  });

  it('returns 500 when READER_API_TOKEN not configured', async () => {
    delete process.env.READER_API_TOKEN;
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Reader API not configured' });
    expect(mockArchiveItemForUser).not.toHaveBeenCalled();
  });

  it('returns 500 with the Reader message when Reader API fails', async () => {
    mockArchiveItemForUser.mockResolvedValue({ ok: false, error: 'reader_failed', message: 'Rate limited' });
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Rate limited' });
  });

  it('returns 500 with requiresRefresh when database update fails after Reader archive', async () => {
    mockArchiveItemForUser.mockResolvedValue({
      ok: false,
      error: 'db_failed',
      message: 'Item archived in Reader but failed to update local database. Please refresh the page.',
      requiresRefresh: true,
    });
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ requiresRefresh: true });
  });

  it('reports readerDeleted when the item was already deleted in Reader (404)', async () => {
    mockArchiveItemForUser.mockResolvedValue({ ok: true, readerDeleted: true, alreadyArchived: false });
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, readerDeleted: true });
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetUser.mockRejectedValue(new Error('auth exploded'));
    const response = await POST(makeRequest({ itemId: 'item-123' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
