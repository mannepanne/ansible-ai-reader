// ABOUT: Shared config for the Relay operator CLIs — parses .dev.vars and resolves the bridge URL
// ABOUT: One place for the loader + the default bridge host, so the three relay:* scripts don't drift

import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_BRIDGE_URL = 'https://ansible-relay-bridge.herrings.workers.dev';

export function loadDevVars(): Record<string, string> {
  const p = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(p)) {
    console.error('❌ .dev.vars not found');
    process.exit(1);
  }
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

export function bridgeBase(vars: Record<string, string>): string {
  return vars.RELAY_BRIDGE_URL || DEFAULT_BRIDGE_URL;
}
