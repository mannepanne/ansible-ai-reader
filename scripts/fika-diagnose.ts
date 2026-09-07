// ABOUT: Replays the Fika cron's read path for one user against the database in .dev.vars, read-only
// ABOUT: Usage: npm run fika:diagnose [user-id] — the check unit tests cannot make: does PostgREST accept our queries?

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as store from '../src/lib/fika/store';
import { localParts, shouldSend, addDays } from '../src/lib/fika/schedule';
import { selectBatch } from '../src/lib/fika/select-batch';
import { weekLowerBound } from '../src/lib/fika/reading-days';

for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const now = new Date();

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    console.log(`OK   ${name}:`, JSON.stringify(result)?.slice(0, 200));
    return result;
  } catch (error) {
    console.log(`FAIL ${name}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function main() {
  const users = await step('listFikaUsers', () => store.listFikaUsers(db));
  const user = process.argv[2] ? users?.find((u) => u.id === process.argv[2]) : users?.[0];
  if (!user) {
    console.log('No matching user with Fika on.');
    return;
  }
  const userId = user.id;
  console.log('user:', { id: userId, fikaHour: user.fikaHour, timeZone: user.timeZone, weeklyTarget: user.weeklyTarget });
  const { date: localDate, hour } = localParts(now, user.timeZone);
  console.log('local now:', { localDate, hour });

  const existing = await step('getBatchByDate', () => store.getBatchByDate(db, userId, localDate));
  const todaysBatch = existing ? { sentAt: existing.sentAt, sendAttempts: existing.sendAttempts } : null;
  console.log('shouldSend:', shouldSend({ now, timeZone: user.timeZone, fikaHour: user.fikaHour, todaysBatch }));

  const previous = await step('getMostRecentBatch', () => store.getMostRecentBatch(db, userId));
  const candidates = await step('listCandidates', () => store.listCandidates(db, userId));
  const excludedIds = await step('listRecentlyBatchedIds', () =>
    store.listRecentlyBatchedIds(db, userId, addDays(localDate, -14))
  );
  if (candidates && excludedIds) {
    const selected = selectBatch({ previous: previous ?? null, candidates, excludedIds, now });
    console.log('selectBatch:', selected);
    const ids = existing && existing.itemIds.length > 0 ? existing.itemIds : selected.map((s) => s.itemId);
    await step('loadEmailItems', () => store.loadEmailItems(db, userId, ids));
  }
  await step('countUnread', () => store.countUnread(db, userId));
  await step('listReadingEvents', () => store.listReadingEvents(db, userId, weekLowerBound(now, user.timeZone)));
}

main();
