// ABOUT: Signed, expiring tokens for the Fika email's action links
// ABOUT: HMAC-SHA256 over a small JSON payload via Web Crypto; verified with a constant-time compare

export const FIKA_ACTIONS = ['interesting', 'not_interesting', 'archive', 'read'] as const;
export type FikaAction = (typeof FIKA_ACTIONS)[number];

export interface ActionTokenPayload {
  userId: string;
  itemId: string;
  batchId: string;
  action: FikaAction;
  /** Expiry as unix seconds */
  exp: number;
}

export type VerifyResult =
  | { ok: true; payload: ActionTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/** Default token lifetime: 7 days, deliberately longer than a batch so an old email still works */
export const ACTION_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

/** Constant-time byte comparison: runs over the full length regardless of where a mismatch occurs */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function isPayload(value: unknown): value is ActionTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === 'string' &&
    typeof v.itemId === 'string' &&
    typeof v.batchId === 'string' &&
    typeof v.action === 'string' &&
    (FIKA_ACTIONS as readonly string[]).includes(v.action) &&
    typeof v.exp === 'number' &&
    Number.isFinite(v.exp)
  );
}

/**
 * Produces `<base64url payload>.<base64url signature>`.
 */
export async function signActionToken(payload: ActionTokenPayload, secret: string): Promise<string> {
  if (!secret) throw new Error('Action token secret is required');
  const body = encoder.encode(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${toBase64Url(body)}.${toBase64Url(sig)}`;
}

/**
 * Verifies signature first, then expiry, so an attacker learns nothing about payload validity
 * from an unsigned token. `nowMs` is injectable for tests.
 */
export async function verifyActionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now()
): Promise<VerifyResult> {
  if (!secret) throw new Error('Action token secret is required');
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };

  const body = fromBase64Url(parts[0]);
  const providedSig = fromBase64Url(parts[1]);
  if (!body || !providedSig || body.length === 0) return { ok: false, reason: 'malformed' };

  const expectedSig = await hmac(secret, body);
  if (!timingSafeEqual(expectedSig, providedSig)) return { ok: false, reason: 'bad_signature' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(body));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!isPayload(parsed)) return { ok: false, reason: 'malformed' };

  if (parsed.exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, payload: parsed };
}
