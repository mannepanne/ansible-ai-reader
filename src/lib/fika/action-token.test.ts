// @vitest-environment node
// ABOUT: Tests for Fika action tokens
// ABOUT: Round-trip, tamper, expiry, malformed input, and constant-time compare

import { describe, it, expect } from 'vitest';
import {
  signActionToken,
  verifyActionToken,
  timingSafeEqual,
  ACTION_TOKEN_TTL_SECONDS,
  type ActionTokenPayload,
} from './action-token';

const SECRET = 'test-secret-that-is-long-enough';
const NOW = Date.UTC(2026, 8, 6, 7, 0, 0); // 2026-09-06T07:00Z

function payload(overrides: Partial<ActionTokenPayload> = {}): ActionTokenPayload {
  return {
    userId: 'user-1',
    itemId: 'item-1',
    batchId: 'batch-1',
    action: 'archive',
    exp: Math.floor(NOW / 1000) + ACTION_TOKEN_TTL_SECONDS,
    ...overrides,
  };
}

describe('action tokens', () => {
  it('round-trips a payload', async () => {
    const token = await signActionToken(payload(), SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const result = await verifyActionToken(token, SECRET, NOW);
    expect(result).toEqual({ ok: true, payload: payload() });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signActionToken(payload(), 'other-secret');
    expect(await verifyActionToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a payload that was edited after signing', async () => {
    const token = await signActionToken(payload({ action: 'read' }), SECRET);
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify(payload({ action: 'archive' }))).toString('base64url');
    expect(await verifyActionToken(`${forgedBody}.${sig}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an expired token, and accepts one a second before expiry', async () => {
    const exp = Math.floor(NOW / 1000) + 60;
    const token = await signActionToken(payload({ exp }), SECRET);
    expect(await verifyActionToken(token, SECRET, NOW + 60_000)).toEqual({ ok: false, reason: 'expired' });
    expect((await verifyActionToken(token, SECRET, NOW + 59_000)).ok).toBe(true);
  });

  it('rejects malformed tokens without throwing', async () => {
    for (const bad of ['', 'abc', 'a.b.c', '!!!.###', '.', 'AAAA.']) {
      const result = await verifyActionToken(bad, SECRET, NOW);
      expect(result.ok).toBe(false);
      expect(['malformed', 'bad_signature']).toContain((result as { reason: string }).reason);
    }
  });

  it('rejects a correctly signed body that is not a payload', async () => {
    // Sign an arbitrary JSON body with the real secret, then check the shape validation catches it.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const body = enc.encode(JSON.stringify({ hello: 'world' }));
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
    const token = `${Buffer.from(body).toString('base64url')}.${Buffer.from(sig).toString('base64url')}`;
    expect(await verifyActionToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });

    const notJson = enc.encode('not json');
    const sig2 = new Uint8Array(await crypto.subtle.sign('HMAC', key, notJson));
    const token2 = `${Buffer.from(notJson).toString('base64url')}.${Buffer.from(sig2).toString('base64url')}`;
    expect(await verifyActionToken(token2, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects unknown actions even when signed', async () => {
    const token = await signActionToken({ ...payload(), action: 'delete' as never }, SECRET);
    expect(await verifyActionToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('requires a secret', async () => {
    await expect(signActionToken(payload(), '')).rejects.toThrow('secret');
    await expect(verifyActionToken('a.b', '')).rejects.toThrow('secret');
  });

  it('timingSafeEqual compares bytes and lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});
