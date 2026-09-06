// ABOUT: POST target for the Fika email's action links (the GET landing page auto-submits here)
// ABOUT: Verifies the signed token, then does exactly what the web card does: rate, archive, or click through

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { verifyActionToken, type ActionTokenPayload } from '@/lib/fika/action-token';
import { archiveItemForUser } from '@/lib/archive';
import { renderFikaPage, type FikaPageInput } from '@/lib/fika/pages';

const SITE_URL = () => process.env.SITE_URL ?? 'https://ansible.hultberg.org';

function page(status: number, input: Omit<FikaPageInput, 'linkHref' | 'linkLabel'> & Partial<FikaPageInput>) {
  return new NextResponse(
    renderFikaPage({
      linkHref: `${SITE_URL()}/summaries`,
      linkLabel: 'Open Ansible',
      ...input,
    }),
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

async function readToken(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { t?: unknown };
      return typeof body?.t === 'string' ? body.t : null;
    }
    const form = await request.formData();
    const t = form.get('t');
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/fika/act
 *
 * Body: form field or JSON property `t`, a token from `signActionToken`.
 * No session: the token is the credential (fourth client type, see authentication.md).
 *
 * Responses are small HTML pages, except `read`, which records a click-through and
 * redirects (303) to the article. Archive and ratings are idempotent.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.FIKA_ACTION_SECRET;
    if (!secret) {
      console.error('[Fika act] FIKA_ACTION_SECRET not configured');
      return page(500, { heading: 'Fika is not set up yet', detail: 'The action links are not configured on the server.', tone: 'error' });
    }

    const token = await readToken(request);
    if (!token) return page(400, { heading: 'Missing link', detail: 'This request had no action token.', tone: 'error' });

    const verified = await verifyActionToken(token, secret);
    if (!verified.ok) {
      console.warn(`[Fika act] Token rejected: ${verified.reason}`);
      return page(403, {
        heading: 'This link has expired',
        detail: 'Open Ansible to act on the item instead.',
        tone: 'error',
      });
    }

    const payload: ActionTokenPayload = verified.payload;
    const db = createServiceRoleClient();

    const { data: item, error: itemError } = await db
      .from('reader_items')
      .select('id, title, url, rating')
      .eq('id', payload.itemId)
      .eq('user_id', payload.userId)
      .maybeSingle();

    if (itemError || !item) {
      return page(404, { heading: 'This item is no longer in Ansible', detail: 'It may have been removed since the email was sent.', tone: 'error' });
    }

    switch (payload.action) {
      case 'read': {
        // Validate first: a click that goes nowhere must not count as a click-through
        if (!/^https?:\/\//.test(item.url)) {
          return page(400, { heading: 'This item has no readable link', itemTitle: item.title, tone: 'error' });
        }
        const { error } = await db.from('item_signals').insert({
          user_id: payload.userId,
          item_id: payload.itemId,
          signal_type: 'click_through',
          source: 'fika',
        });
        if (error) console.error('[Fika act] Failed to record click_through:', error);
        return NextResponse.redirect(item.url, 303);
      }

      case 'interesting':
      case 'not_interesting': {
        const value = payload.action === 'interesting' ? 4 : 1;
        const label = payload.action === 'interesting' ? 'Marked as interesting' : 'Marked as not for me';
        if (item.rating === value) {
          return page(200, { heading: label, itemTitle: item.title, detail: 'It already was.' });
        }
        const { error } = await db.from('reader_items').update({ rating: value }).eq('id', payload.itemId).eq('user_id', payload.userId);
        if (error) {
          console.error('[Fika act] Failed to update rating:', error);
          return page(500, { heading: 'Could not save the rating', itemTitle: item.title, tone: 'error' });
        }
        const { error: signalError } = await db.from('item_signals').insert({
          user_id: payload.userId,
          item_id: payload.itemId,
          signal_type: value === 4 ? 'rated_interesting' : 'rated_not_interesting',
          source: 'fika',
        });
        if (signalError) console.error('[Fika act] Failed to record rating signal:', signalError);
        return page(200, { heading: label, itemTitle: item.title, detail: 'It stays in your list until you archive it.' });
      }

      case 'archive': {
        const readerApiToken = process.env.READER_API_TOKEN;
        if (!readerApiToken) {
          console.error('[Fika act] READER_API_TOKEN not configured');
          return page(500, { heading: 'Could not archive', detail: 'Reader is not configured on the server.', itemTitle: item.title, tone: 'error' });
        }
        const outcome = await archiveItemForUser(db, {
          userId: payload.userId,
          itemId: payload.itemId,
          reason: 'user',
          readerApiToken,
        });
        if (!outcome.ok) {
          if (outcome.error === 'not_found') {
            return page(404, { heading: 'This item is no longer in Ansible', tone: 'error' });
          }
          console.error('[Fika act] Archive failed:', outcome.message);
          return page(500, { heading: 'Could not archive', itemTitle: item.title, detail: outcome.message, tone: 'error' });
        }
        return page(200, {
          heading: outcome.alreadyArchived ? 'Already archived' : 'Archived',
          itemTitle: item.title,
          detail: outcome.readerDeleted ? 'It had already been removed from Reader.' : 'In Ansible and in Reader.',
        });
      }
    }
  } catch (error) {
    console.error('[Fika act] Unexpected error:', error);
    return page(500, { heading: 'Something went wrong', detail: 'Open Ansible to act on the item instead.', tone: 'error' });
  }
}
