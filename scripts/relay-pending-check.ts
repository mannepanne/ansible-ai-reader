// ABOUT: List the most recent relay_pieces (any state) with timestamps — to spot an orphaned piece
// ABOUT: (written mid-session but never linked to a decision). Usage: tsx scripts/relay-pending-check.ts

import { createClient } from '@supabase/supabase-js';
import { loadDevVars } from './relay-env';

(async () => {
  const env = loadDevVars();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await db
    .from('relay_pieces')
    .select('id, state, created_at, body, links')
    .order('created_at', { ascending: false })
    .limit(10);
  for (const p of data ?? []) {
    const title = (p.body as string).split('\n').map((l) => l.trim()).find(Boolean) ?? '(no body)';
    const recall = Array.isArray(p.links) ? p.links.length : 0;
    console.log(
      `${p.created_at}  ${String(p.state).padEnd(14)} ${String(p.id).slice(0, 8)}  recall:${recall}  ${title.replace(/^#+\s*/, '').slice(0, 52)}`,
    );
  }
})();
