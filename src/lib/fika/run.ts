// ABOUT: Runs Fika for one user: decide, select or reuse today's batch, render, send, record
// ABOUT: Orchestration only; every decision is in a pure module and every write goes through store.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldSend, localParts, addDays, daysBetween } from './schedule';
import { selectBatch } from './select-batch';
import { readingDays, weekLowerBound } from './reading-days';
import { renderFikaEmail, type FikaEmailItem } from './email';
import { signActionToken, ACTION_TOKEN_TTL_SECONDS, type FikaAction } from './action-token';
import { sendViaResend, type SendEmailInput, type SendEmailResult } from './send';
import * as store from './store';
import type { FikaUser } from './store';

export interface RunDeps {
  now: Date;
  actionSecret: string;
  siteUrl: string;
  fromEmail: string;
  resendApiKey: string;
  /** Injectable for tests; defaults to the Resend sender */
  sendEmail?: (input: SendEmailInput) => Promise<SendEmailResult>;
}

export type RunOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'empty' }
  | { status: 'sent'; batchId: string; itemCount: number }
  | { status: 'send_failed'; batchId: string; attempts: number; message: string };

/** Days a batched item stays excluded from re-selection */
export const BATCH_EXCLUSION_DAYS = 14;

export function actionUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/fika/act?t=${encodeURIComponent(token)}`;
}

export function dateLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

export async function runFikaForUser(db: SupabaseClient, user: FikaUser, deps: RunDeps): Promise<RunOutcome> {
  const { now } = deps;
  const { date: localDate } = localParts(now, user.timeZone);
  const existing = await store.getBatchByDate(db, user.id, localDate);

  const decision = shouldSend({
    now,
    timeZone: user.timeZone,
    fikaHour: user.fikaHour,
    todaysBatch: existing ? { sentAt: existing.sentAt, sendAttempts: existing.sendAttempts } : null,
  });
  if (!decision.send) return { status: 'skipped', reason: decision.reason };

  // Reuse an unsent batch from earlier today (a failed send) so the day's Fika never changes.
  let batchId: string;
  let itemIds: string[];
  if (existing) {
    batchId = existing.id;
    itemIds = existing.itemIds;
  } else {
    const [previous, candidates, excludedIds] = await Promise.all([
      store.getMostRecentBatch(db, user.id),
      store.listCandidates(db, user.id),
      store.listRecentlyBatchedIds(db, user.id, addDays(localDate, -BATCH_EXCLUSION_DAYS)),
    ]);
    const selected = selectBatch({ previous, candidates, excludedIds, now });
    if (selected.length === 0) return { status: 'empty' };
    batchId = await store.createBatch(db, user.id, localDate, selected);
    itemIds = selected.map((s) => s.itemId);
  }

  const [items, unreadCount, events] = await Promise.all([
    store.loadEmailItems(db, user.id, itemIds),
    store.countUnread(db, user.id),
    store.listReadingEvents(db, user.id, weekLowerBound(now, user.timeZone)),
  ]);
  if (items.length === 0) return { status: 'empty' };

  const exp = Math.floor(now.getTime() / 1000) + ACTION_TOKEN_TTL_SECONDS;
  const token = (itemId: string, action: FikaAction) =>
    signActionToken({ userId: user.id, itemId, batchId, action, exp }, deps.actionSecret).then((t) =>
      actionUrl(deps.siteUrl, t)
    );

  const emailItems: FikaEmailItem[] = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      author: item.author,
      source: item.source,
      wordCount: item.wordCount,
      savedDaysAgo: daysBetween(localParts(new Date(item.createdAt), user.timeZone).date, localDate),
      summaryMarkdown: item.shortSummary,
      proseSummary: null,
      tags: item.tags,
      actions: {
        interesting: await token(item.id, 'interesting'),
        notInteresting: await token(item.id, 'not_interesting'),
        archive: await token(item.id, 'archive'),
        read: await token(item.id, 'read'),
      },
      openInAnsibleUrl: `${deps.siteUrl}/summaries#${item.id}`,
    }))
  );

  const week = readingDays({ events, timeZone: user.timeZone, now, target: user.weeklyTarget });
  const email = renderFikaEmail({
    items: emailItems,
    dateLabel: dateLabel(now, user.timeZone),
    week,
    unreadCount,
    settingsUrl: `${deps.siteUrl}/settings`,
    sendTimeLabel: `${String(user.fikaHour).padStart(2, '0')}:00`,
  });

  const send = deps.sendEmail ?? sendViaResend;
  const result = await send({
    apiKey: deps.resendApiKey,
    from: deps.fromEmail,
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (result.ok) {
    await store.markSent(db, batchId, now.toISOString(), result.id);
    return { status: 'sent', batchId, itemCount: items.length };
  }

  const attempts = (existing?.sendAttempts ?? 0) + 1;
  await store.recordSendAttempt(db, batchId, attempts);
  return { status: 'send_failed', batchId, attempts, message: result.message };
}
