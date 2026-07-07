// ABOUT: Validate acceptance-run stimuli — for each reader_id, confirm it exists in reader_items
// ABOUT: with the summary (required) + commentariat (ideal) the Relay trigger needs.
// Usage: NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/relay-acceptance-check.ts <reader_id...>

import { createClient } from '@supabase/supabase-js';
import { loadDevVars } from './relay-env';

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.error('usage: tsx scripts/relay-acceptance-check.ts <reader_id...>');
    process.exit(1);
  }
  const env = loadDevVars();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('reader_items')
    .select('reader_id, title, short_summary, commentariat_summary')
    .in('reader_id', ids);
  if (error) {
    console.error('query error:', error.message);
    process.exit(1);
  }
  const byId = new Map((data ?? []).map((r: any) => [r.reader_id, r]));
  let missing = 0;
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) {
      console.log(`NOTFOUND   ${id}`);
      missing++;
      continue;
    }
    const sum = r.short_summary?.trim() ? 'sum:Y' : 'sum:-';
    const com = r.commentariat_summary?.trim() ? 'comm:Y' : 'comm:-';
    const ready = r.short_summary?.trim() ? 'READY     ' : 'NOSUMMARY ';
    console.log(`${ready} ${id}  ${sum} ${com}  ${(r.title ?? '(no title)').slice(0, 75)}`);
  }
  console.log(`\n${ids.length - missing}/${ids.length} found`);
})();
