// ABOUT: Read the agent_session_runs ledger — the orchestrator's run state (running/wrote/declined/failed).
// ABOUT: Usage: NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/relay-runs.ts [limit]

import { createClient } from '@supabase/supabase-js';
import { loadDevVars } from './relay-env';

(async () => {
  const limit = Number(process.argv[2] ?? 10);
  const env = loadDevVars();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await db
    .from('agent_session_runs')
    .select('reader_id, session_id, state, attempt, piece_id, started_at, created_at, error')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('query error:', error.message);
    process.exit(1);
  }
  for (const r of data ?? []) {
    const piece = r.piece_id ? ` piece:${String(r.piece_id).slice(0, 8)}` : '';
    const err = r.error ? ` err:${r.error}` : '';
    console.log(`${r.created_at?.slice(0, 19)}  ${String(r.state).padEnd(9)} ${r.reader_id}  att:${r.attempt}${piece}${err}`);
  }
  const running = (data ?? []).filter((r: any) => r.state === 'running').length;
  console.log(`\n${data?.length ?? 0} runs · ${running} currently running`);
})();
