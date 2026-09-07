// ABOUT: Replays the Fika cron's read path for one user against the database in .dev.vars, read-only
// ABOUT: Usage: npm run fika:diagnose [user-id] — the check unit tests cannot make: does PostgREST accept our queries?

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database.types';
import { loadDevVars } from './relay-env';
// Read functions only, imported by name: a write path added here would show up as a new import in review
import {
  listFikaUsers,
  getBatchByDate,
  getMostRecentBatch,
  listCandidates,
  listRecentlyBatchedIds,
  loadEmailItems,
  countUnread,
  listReadingEvents,
} from '../src/lib/fika/store';
import { localParts, shouldSend, addDays } from '../src/lib/fika/schedule';
import { selectBatch } from '../src/lib/fika/select-batch';
import { weekLowerBound } from '../src/lib/fika/reading-days';

const vars = loadDevVars();
const db = createClient<Database>(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const now = new Date();
let failures = 0;

/** Runs one read; a throw or a failed shape check is a FAIL, since an embed that PostgREST accepts
 *  but keys differently would surface as an empty array, not an error. */
async function step<T>(name: string, fn: () => Promise<T>, check?: (result: T) => string | null): Promise<T | undefined> {
  try {
    const result = await fn();
    const problem = check?.(result) ?? null;
    if (problem) {
      failures++;
      console.log(`FAIL ${name}: ${problem}`);
    } else {
      console.log(`OK   ${name}`);
    }
    return result;
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function main() {
  const users = await step('listFikaUsers', () => listFikaUsers(db));
  const user = process.argv[2] ? users?.find((u) => u.id === process.argv[2]) : users?.[0];
  if (!user) {
    console.log(`No matching user with Fika on (${users?.length ?? 0} found).`);
    process.exitCode = 1;
    return;
  }
  const userId = user.id;
  console.log('user:', { id: userId, fikaHour: user.fikaHour, timeZone: user.timeZone, weeklyTarget: user.weeklyTarget });
  const { date: localDate, hour } = localParts(now, user.timeZone);
  console.log('local now:', { localDate, hour });

  const existing = await step(
    'getBatchByDate',
    () => getBatchByDate(db, userId, localDate),
    (batch) => (batch && batch.itemIds.length === 0 ? 'batch row exists but the embed returned no items' : null)
  );
  console.log("today's batch:", existing ? { id: existing.id, sentAt: existing.sentAt, sendAttempts: existing.sendAttempts, itemIds: existing.itemIds } : null);
  const todaysBatch = existing ? { sentAt: existing.sentAt, sendAttempts: existing.sendAttempts } : null;
  console.log('shouldSend:', shouldSend({ now, timeZone: user.timeZone, fikaHour: user.fikaHour, todaysBatch }));

  const previous = await step(
    'getMostRecentBatch',
    () => getMostRecentBatch(db, userId),
    (batch) => (batch && batch.items.length === 0 ? 'batch row exists but the embed returned no items' : null)
  );
  console.log('most recent batch:', previous ? { id: previous.id, items: previous.items } : null);
  const candidates = await step('listCandidates', () => listCandidates(db, userId));
  console.log('candidates:', candidates?.length);
  const excludedIds = await step('listRecentlyBatchedIds', () => listRecentlyBatchedIds(db, userId, addDays(localDate, -14)));
  console.log('recently batched:', excludedIds ? [...excludedIds] : undefined);
  if (candidates && excludedIds) {
    const selected = selectBatch({ previous: previous ?? null, candidates, excludedIds, now });
    console.log('selectBatch:', selected);
    const ids = existing && existing.itemIds.length > 0 ? existing.itemIds : selected.map((s) => s.itemId);
    const items = await step('loadEmailItems', () => loadEmailItems(db, userId, ids), (rows) =>
      rows.length === ids.length ? null : `asked for ${ids.length} items, got ${rows.length}`
    );
    console.log('email items:', items?.map((i) => ({ id: i.id, hasSummary: Boolean(i.shortSummary), tags: i.tags.length })));
  }
  const unread = await step('countUnread', () => countUnread(db, userId));
  console.log('unread:', unread);
  const events = await step('listReadingEvents', () => listReadingEvents(db, userId, weekLowerBound(now, user.timeZone)));
  console.log('reading events this week:', events?.length);

  console.log(failures === 0 ? '\nAll reads passed.' : `\n${failures} read(s) failed.`);
  console.log('Reads only: this does not test Resend, the send window, or the email render.');
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('fika:diagnose crashed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
