// ABOUT: Relay session orchestrator — the manual Stage-1 trigger (mind rented, memory owned)
// ABOUT: Assembles the voice, runs one Managed-Agent session on a stimulus, finalizes the decision
// Run with: npx tsx scripts/relay-session.ts <reader_id>
//
// This is the thin I/O glue: the testable logic lives in src/lib/relay/{persona,session-readout}.ts.
// It creates (once, idempotently) the three Anthropic resources — environment, vault, agent — then
// per call: fetch the stimulus, run a session, and POST the backend-observed verdict to the bridge.
// All durable relay_* state stays behind the bridge; this orchestrator never writes relay_* directly.

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { assembleSystemPrompt, PERSONA_FILES } from '../src/lib/relay/persona';
import { selectExemplar, renderExemplarSection } from '../src/lib/relay/exemplars';
import { formatStimulus } from '../src/lib/relay/session-run';
import { readSession, renderTrace, type MaEvent } from '../src/lib/relay/session-readout';
import { loadDevVars, bridgeBase } from './relay-env';

const env = loadDevVars();
const API_KEY = env.ANTHROPIC_API_KEY;
// The agent's /mcp token (stored in the vault for the Managed Agent to use) — distinct from the
// control token below, which gates the gate-bypassing /decision route this orchestrator calls.
const BRIDGE_TOKEN = env.RELAY_BRIDGE_TOKEN;
const CONTROL_TOKEN = env.RELAY_CONTROL_TOKEN;
const BRIDGE_BASE = bridgeBase(env);
const BRIDGE_MCP_URL = `${BRIDGE_BASE}/mcp`;
const MA = 'https://api.anthropic.com/v1';
const MODEL = 'claude-opus-4-8';
const IDS_PATH = path.join(process.cwd(), '.relay-agent-ids.json');

const MA_HEADERS: Record<string, string> = {
  'x-api-key': API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'content-type': 'application/json',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ma(method: string, p: string, body?: unknown): Promise<any> {
  const res = await fetch(`${MA}${p}`, {
    method,
    headers: MA_HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`MA ${method} ${p} → ${res.status}: ${await res.text()}`);
  return res.status === 202 ? null : res.json();
}

type Ids = { environment_id?: string; vault_id?: string; agent_id?: string; agent_version?: number };
const loadIds = (): Ids => (fs.existsSync(IDS_PATH) ? JSON.parse(fs.readFileSync(IDS_PATH, 'utf-8')) : {});
const saveIds = (ids: Ids) => fs.writeFileSync(IDS_PATH, JSON.stringify(ids, null, 2));

// versionIndex picks the curated style exemplar (Channel 1) from exemplars.ts, not the static craft doc,
// so the on-page anchor can vary as the approved corpus grows. The exemplar is baked into the agent
// resource here at provision time, so a running (prod-orchestrator) session never re-rotates it — it is
// fixed per agent version. Because ensureResources re-pushes on every CLI run (see its note), each
// re-push may land a different exemplar once more than one is curated.
function buildSystemPrompt(versionIndex: number): string {
  const dir = path.join(process.cwd(), 'relay-agent');
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf-8');
  const cadence = `${read(PERSONA_FILES.cadence).trim()}\n\n${renderExemplarSection(selectExemplar(versionIndex))}`;
  return assembleSystemPrompt({
    trunk: read(PERSONA_FILES.trunk),
    grain: read(PERSONA_FILES.grain),
    rings: read(PERSONA_FILES.rings),
    cadence,
    coda: read(PERSONA_FILES.coda),
  });
}

const MCP_SERVERS = [{ type: 'url', url: BRIDGE_MCP_URL, name: 'relay-bridge' }];
// All five tools enabled and always_allow (unattended — never block on a confirmation). research +
// ingest_reference are the Stage 2.1 fact-grounding pair: research fetches verbatim sourced facts, and
// ingest_reference keeps a worthwhile source so today's checking becomes tomorrow's recall.
const TOOLSET = {
  type: 'mcp_toolset',
  mcp_server_name: 'relay-bridge',
  default_config: { enabled: false, permission_policy: { type: 'always_allow' } },
  configs: [
    { name: 'recall', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'fetch', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'write_pending', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'research', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'ingest_reference', enabled: true, permission_policy: { type: 'always_allow' } },
  ],
};

// Create the three reusable resources once; keep the agent's voice current on every run. NOTE: the
// update currently bumps the agent version each run even when the prompt is unchanged, because the
// tools array round-trips non-identically (the API echoes normalized permission_policy/configs that
// differ from what we send). Cosmetic — the running config is correct; only the version number drifts.
async function ensureResources(system: string): Promise<Ids> {
  const ids = loadIds();
  if (!ids.environment_id) {
    console.log('  creating environment (cloud, limited networking, MCP egress allowed)...');
    const e = await ma('POST', '/environments', {
      name: 'relay-bridge',
      config: {
        type: 'cloud',
        networking: { type: 'limited', allowed_hosts: [], allow_mcp_servers: true, allow_package_managers: false },
      },
    });
    ids.environment_id = e.id;
    saveIds(ids);
  }
  if (!ids.vault_id) {
    console.log('  creating vault + static_bearer credential (keyed to the /mcp URL)...');
    const v = await ma('POST', '/vaults', { display_name: 'relay-bridge' });
    ids.vault_id = v.id;
    saveIds(ids);
    await ma('POST', `/vaults/${v.id}/credentials`, {
      display_name: 'relay bridge bearer',
      auth: { type: 'static_bearer', mcp_server_url: BRIDGE_MCP_URL, token: BRIDGE_TOKEN },
    });
  }
  if (!ids.agent_id) {
    console.log('  creating agent (the voice)...');
    const a = await ma('POST', '/agents', { name: 'Relay', model: MODEL, system, mcp_servers: MCP_SERVERS, tools: [TOOLSET] });
    ids.agent_id = a.id;
    ids.agent_version = a.version;
    saveIds(ids);
  } else {
    const a = await ma('POST', `/agents/${ids.agent_id}`, {
      version: ids.agent_version,
      system,
      mcp_servers: MCP_SERVERS,
      tools: [TOOLSET],
    });
    if (a.version !== ids.agent_version) console.log(`  agent voice updated → version ${a.version}`);
    ids.agent_version = a.version;
    saveIds(ids);
  }
  return ids;
}

async function fetchStimulus(readerId: string): Promise<string> {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('reader_items')
    .select('title, short_summary, commentariat_summary, tags, document_note')
    .eq('reader_id', readerId)
    .maybeSingle();
  if (error) throw new Error(`stimulus: ${error.message}`);
  if (!data) throw new Error(`stimulus: no reader_item with reader_id ${readerId}`);
  // Share the assembler with the DO path (formatStimulus) so both triggers enrich identically —
  // no second copy of the summary-guard or the tags/note ordering to drift out of sync.
  return formatStimulus(data);
}

// Fail fast if the bridge's decision-finalize route is not deployed, BEFORE we spend a session we
// could not finalize. A body missing started_at returns 400 (validation) when the route is live,
// 404 when it is not — and finalizeDecision throws on the missing field before any DB write, so the
// probe has no side effect.
async function preflightBridge() {
  const res = await fetch(`${BRIDGE_BASE}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${CONTROL_TOKEN}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.status === 404) {
    throw new Error('bridge /decision route not found (404) — deploy the bridge first: npm run deploy:relay-bridge');
  }
  if (res.status === 401) {
    throw new Error('bridge rejected the control bearer (401) — check RELAY_CONTROL_TOKEN');
  }
  if (res.status !== 400) {
    console.warn(`  preflight: /decision returned ${res.status} (expected 400) — proceeding anyway`);
  }
}

async function main() {
  const readerId = process.argv[2];
  if (!readerId) {
    console.error('Usage: npx tsx scripts/relay-session.ts <reader_id>');
    process.exit(1);
  }

  await preflightBridge();
  console.log('Assembling the voice + ensuring Anthropic resources...');
  // Index by the agent version as it stands BEFORE this run's update bump, so version N carries the
  // exemplar chosen at index N-1 (a harmless off-by-one — the mapping just needs to be deterministic).
  const priorIds = loadIds();
  const system = buildSystemPrompt(priorIds.agent_version ?? 0);
  const ids = await ensureResources(system);
  console.log(`  agent=${ids.agent_id} v${ids.agent_version} env=${ids.environment_id} vault=${ids.vault_id}`);

  console.log(`\nFetching stimulus for reader_id ${readerId}...`);
  const stimulus = await fetchStimulus(readerId);
  console.log(`  stimulus: ${stimulus.slice(0, 120).replace(/\n/g, ' ')}...`);

  // T0: a backward margin absorbs orchestrator↔DB clock skew. Safe because Stage-1 sessions are
  // serial and manual — no other session writes a piece in this window. The decision-finalize route
  // links any pending_review piece created at/after T0 to this session.
  const startedAt = new Date(Date.now() - 30_000).toISOString();

  console.log('\nCreating session + sending the stimulus...');
  const session = await ma('POST', '/sessions', {
    agent: ids.agent_id,
    environment_id: ids.environment_id,
    vault_ids: [ids.vault_id],
    title: `Relay — ${readerId}`,
  });
  const sid = session.id;
  await ma('POST', `/sessions/${sid}/events?beta=true`, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: `Today's desk:\n\n${stimulus}` }] }],
  });
  console.log(`  session ${sid} — polling`);

  let status: string | null = null;
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    status = (await ma('GET', `/sessions/${sid}`)).status;
    process.stdout.write('.');
    if (status === 'idle' || status === 'terminated') break;
  }
  console.log(`\n  final status: ${status}`);

  if (status === 'terminated') {
    console.error('❌ session terminated (unrecoverable error). No decision recorded (crash = no row).');
    process.exit(1);
  }

  const events = ((await ma('GET', `/sessions/${sid}/events?beta=true`)).data ?? []) as MaEvent[];

  // Persist the raw transcript and show the reasoning trace — the recall queries it composed, the
  // neighbours it got back, and its narration are the window into how it decided to write or stay silent.
  const dir = path.join(process.cwd(), 'relay-sessions');
  fs.mkdirSync(dir, { recursive: true });
  const transcriptPath = path.join(dir, `${sid}.json`);
  fs.writeFileSync(transcriptPath, JSON.stringify(events, null, 2));
  console.log('\n──────── reasoning ────────');
  console.log(renderTrace(events));
  console.log(`\n(full transcript saved: ${path.relative(process.cwd(), transcriptPath)})`);

  const readout = readSession(events);

  console.log('\nFinalizing decision (backend-observed, via the bridge)...');
  const res = await fetch(`${BRIDGE_BASE}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${CONTROL_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      stimulus_ref: [readerId],
      started_at: startedAt,
      reason: readout.closingText,
      degraded: readout.degraded,
      sources: readout.sources,
    }),
  });
  if (!res.ok) throw new Error(`decision finalize → ${res.status}: ${await res.text()}`);
  const decision = (await res.json()) as { verdict: string; piece_id: string | null };

  console.log('\n──────── outcome ────────');
  console.log(`verdict:   ${decision.verdict}`);
  console.log(`piece_id:  ${decision.piece_id ?? '(none — silence)'}`);
  if (readout.degraded) console.log(`degraded:  ${readout.degraded}`);
  if (readout.sources.length) console.log(`sources:   ${readout.sources.length} consulted`);
  console.log(`\nclosing text:\n${readout.closingText ?? '(none)'}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
