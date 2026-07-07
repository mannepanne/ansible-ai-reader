// ABOUT: Report the outcome of triggered Relay runs — for each reader_id, its latest verdict
// ABOUT: (wrote/declined), a failure breadcrumb, or "no verdict yet" (still running / not started).
// Usage: NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/relay-run-status.ts <reader_id...>

import { createClient } from '@supabase/supabase-js';
import { loadDevVars } from './relay-env';

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.error('usage: tsx scripts/relay-run-status.ts <reader_id...>');
    process.exit(1);
  }
  const env = loadDevVars();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: decisions } = await db
    .from('relay_decisions')
    .select('verdict, piece_id, degraded, created_at, stimulus_ref')
    .order('created_at', { ascending: false })
    .limit(60);
  const { data: fails } = await db
    .from('sync_log')
    .select('errors, created_at')
    .eq('sync_type', 'relay_session_failed')
    .order('created_at', { ascending: false })
    .limit(40);

  let decided = 0;
  ids.forEach((id, i) => {
    const d = (decisions ?? []).find((x: any) => (x.stimulus_ref ?? []).includes(id));
    const f = (fails ?? []).find((x: any) => x.errors?.reader_id === id);
    const n = String(i + 1).padStart(2, '0');
    if (d) {
      decided++;
      const piece = d.piece_id ? `  piece:${String(d.piece_id).slice(0, 8)}` : '';
      const deg = d.degraded ? `  degraded:${d.degraded}` : '';
      console.log(`OK  ${n} ${id}  ${String(d.verdict).toUpperCase()}${piece}${deg}`);
    } else if (f) {
      console.log(`ERR ${n} ${id}  FAILED: ${f.errors?.error}`);
    } else {
      console.log(`..  ${n} ${id}  (no verdict yet)`);
    }
  });
  console.log(`\n${decided}/${ids.length} decided`);
})();
