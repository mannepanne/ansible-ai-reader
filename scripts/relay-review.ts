// ABOUT: Relay review CLI — approve or reject a pending piece through the bridge (the human gate)
// ABOUT: approve embeds it and makes it recallable-as-self; reject marks it, never embedded
// Run with: npm run relay:approve <piece_id>   |   npm run relay:reject <piece_id>

import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  const action = process.argv[2];
  const id = process.argv[3];
  if ((action !== 'approve' && action !== 'reject') || !id) {
    console.error('Usage: npm run relay:approve <piece_id>   |   npm run relay:reject <piece_id>');
    process.exit(1);
  }

  const env = loadDevVars();
  const base = env.RELAY_BRIDGE_URL || 'https://ansible-relay-bridge.herrings.workers.dev';

  const res = await fetch(`${base}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RELAY_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const bodyText = await res.text();
  if (res.status === 404) {
    throw new Error(`bridge /${action} route not found (404) — deploy the bridge first: npm run deploy:relay-bridge`);
  }
  if (!res.ok) {
    throw new Error(`${action} → ${res.status}: ${bodyText}`);
  }

  const result = JSON.parse(bodyText) as { id: string; slug?: string };
  if (action === 'approve') {
    console.log(`✅ approved ${result.id} (slug: ${result.slug}) — embedded and now recallable as self.`);
  } else {
    console.log(`🗑️  rejected ${result.id} — marked rejected, never embedded, never recalled.`);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
