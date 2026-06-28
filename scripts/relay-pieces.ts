// ABOUT: Relay viewer — read-only operator view of the narrator's pieces and decision log
// ABOUT: Prints pending pieces in full (to read before approving) plus a compact history
// Run with: npx tsx scripts/relay-pieces.ts          (pending pieces + recent decisions)
//           npx tsx scripts/relay-pieces.ts --all     (every piece, bodies included)

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadDevVars(): Record<string, string> {
  const p = path.join(process.cwd(), '.dev.vars');
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const [k, ...v] = t.split('=');
      if (k && v.length) vars[k.trim()] = v.join('=').trim();
    }
  }
  return vars;
}

const env = loadDevVars();
const showAll = process.argv.includes('--all');

function fmtDate(s: string): string {
  return s?.replace('T', ' ').replace(/\..*$/, ' UTC') ?? '';
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pieces, error: pErr } = await sb
    .from('relay_pieces')
    .select('id, state, created_at, summary, concepts, links, body, slug, deployed_at')
    .order('created_at', { ascending: false });
  if (pErr) throw new Error(`relay_pieces: ${pErr.message}`);

  const { data: decisions, error: dErr } = await sb
    .from('relay_decisions')
    .select('verdict, piece_id, reason, degraded, stimulus_ref, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (dErr) throw new Error(`relay_decisions: ${dErr.message}`);

  const all = pieces ?? [];
  const byState = all.reduce<Record<string, number>>((m, p) => ((m[p.state] = (m[p.state] ?? 0) + 1), m), {});
  console.log(`\n📚 relay_pieces: ${all.length} total — ${JSON.stringify(byState)}`);

  const toShow = showAll ? all : all.filter((p) => p.state === 'pending_review');
  console.log(showAll ? '\nAll pieces (newest first):' : `\n${toShow.length} awaiting review (newest first):`);

  for (const p of toShow) {
    console.log('\n' + '═'.repeat(78));
    console.log(`id: ${p.id}   state: ${p.state}   ${fmtDate(p.created_at)}`);
    if (p.slug) console.log(`slug: ${p.slug}${p.deployed_at ? `   deployed: ${fmtDate(p.deployed_at)}` : ''}`);
    console.log(`summary: ${p.summary ?? '(none)'}`);
    console.log(`concepts: ${(p.concepts ?? []).join(' · ') || '(none)'}`);
    console.log(`recalled: ${(p.links ?? []).length} memory id(s)`);
    console.log('─'.repeat(78));
    console.log(p.body);
  }

  console.log('\n' + '═'.repeat(78));
  console.log(`🗳️  decision log (last ${decisions?.length ?? 0}):`);
  for (const d of decisions ?? []) {
    const piece = d.piece_id ? d.piece_id.slice(0, 8) : '—';
    const deg = d.degraded ? ` [degraded:${d.degraded}]` : '';
    console.log(`  ${fmtDate(d.created_at)}  ${d.verdict.toUpperCase().padEnd(8)} piece:${piece}  stim:${JSON.stringify(d.stimulus_ref)}${deg}`);
    if (d.verdict === 'declined' && d.reason) console.log(`      reason: ${d.reason.slice(0, 140)}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
