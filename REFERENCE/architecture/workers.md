# Workers
REFERENCE > Architecture > Workers

Detailed documentation of the Cloudflare Workers architecture: three core workers, plus a fourth for the Relay subsystem.

## Why Separate Workers?

We deploy **three core Cloudflare Workers** because of OpenNext limitations:

**OpenNext** (`@cloudflare/next-on-pages`) adapts Next.js for Cloudflare Workers but only generates **HTTP request handlers**. It doesn't support:
- `scheduled()` function for cron triggers
- Long-running background tasks

**Solution:** Deploy specialized workers for different concerns.

A **fourth worker — the Relay Bridge** (`wrangler-relay-bridge.toml`) — is split out for a *different* reason: it is the owned-memory gateway and sole writer of the `relay_*` tables for the Relay subsystem, deliberately isolated as a "swappable seam" (see the end of this doc and `SPECIFICATIONS/relay/stage-1-technical-spec.md`). It is not driven by OpenNext limitations.

## Worker 1: Main App (`wrangler.toml`)

### Purpose
The primary Next.js application serving UI and API routes.

### Configuration
```toml
name = "ansible-ai-reader"
main = ".open-next/worker.js"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[[queues.producers]]
queue = "ansible-processing-queue"
binding = "PROCESSING_QUEUE"
```

### Responsibilities
- **Serve UI**: All Next.js pages (/, /summaries, /settings)
- **API Routes**:
  - `/api/auth/*` - Authentication (login, callback, logout)
  - `/api/reader/*` - Reader operations (sync, items, archive, status, retry)
  - `/api/settings` - User settings (GET/PATCH)
  - `/api/cron/auto-sync` - Automated sync handler (called by cron worker)
  - `/api/jobs` - Manual job creation (testing)
- **Queue Producer**: Enqueues jobs to `ansible-processing-queue`
- **Session Management**: Cookie-based authentication via middleware

### Bindings
- `ASSETS` - Static files from `.open-next/assets`
- `PROCESSING_QUEUE` - Producer for Cloudflare Queue

### Deployment
```bash
npm run deploy  # Runs: wrangler deploy
```

**Domain:** ansible.hultberg.org

## Worker 2: Queue Consumer (`wrangler-consumer.toml`)

### Purpose
Process async jobs from Cloudflare Queues (AI summary generation).

### Configuration
```toml
name = "ansible-ai-reader-consumer"
main = "workers/consumer.ts"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "ansible-processing-dlq"
```

### Responsibilities
- **Consume Queue Messages**: Receive batches from `ansible-processing-queue`
- **Fetch Content**: Get full article content from Readwise Reader API
- **Generate Summaries**: Call Perplexity API (sonar-pro model)
- **Parse Results**: Extract summary and tags from markdown response
- **Update Database**: Store results in `reader_items` table
- **Track Progress**: Update `jobs` table status
- **Handle Failures**: Retry failed jobs (max 3 attempts), send to DLQ

### Queue Configuration
- **Batch Size**: Up to 10 messages per batch
- **Timeout**: 30 seconds per batch
- **Retries**: 3 attempts before moving to Dead Letter Queue
- **DLQ**: `ansible-processing-dlq` for permanently failed jobs

### Processing Flow
```
1. Receive batch of job messages
2. For each job:
   a. Update job status = 'processing'
   b. Fetch full content from Reader API
   c. Truncate if > 30k characters
   d. Call Perplexity API for summary + tags
   e. Parse markdown response
   f. Update reader_items with summary/tags
   g. Update job status = 'completed'
   h. Track token usage in sync_log
3. On error:
   - Log error message to jobs table
   - Increment attempts counter
   - If attempts < 3: Retry (automatic)
   - If attempts >= 3: Move to DLQ
```

### Deployment
```bash
npx wrangler deploy --config wrangler-consumer.toml
```

### Monitoring
Check consumer logs:
```bash
npx wrangler tail ansible-ai-reader-consumer
```

## Worker 3: Cron (`wrangler-cron.toml`)

### Purpose
Trigger automated syncs hourly for users who have enabled scheduled syncing.

### Configuration
```toml
name = "ansible-ai-reader-cron"
main = "workers/cron.ts"
compatibility_date = "2026-03-06"

[observability]
enabled = true

[triggers]
crons = ["0 * * * *"]  # Every hour at minute 0
```

### Responsibilities
- **Run Hourly**: Cloudflare executes `scheduled()` function every hour
- **Trigger Sync**: Call `/api/cron/auto-sync` endpoint on main worker
- **Authentication**: Pass `x-cron-secret` header for security

### Implementation
```typescript
export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const response = await fetch(
      'https://ansible.hultberg.org/api/cron/auto-sync',
      {
        method: 'GET',
        headers: {
          'x-cron-secret': env.CRON_SECRET,
        },
      }
    );

    const result = await response.json();
    console.log('[Cron Worker] Auto-sync completed:', result);
  },
};
```

### Security
- **CRON_SECRET**: Shared secret between cron worker and main worker
- Main worker validates secret before processing auto-sync
- Prevents unauthorized triggering of automated syncs

### Deployment
```bash
npx wrangler deploy --config wrangler-cron.toml
```

**Secret Setup:**
```bash
npx wrangler secret put CRON_SECRET --name ansible-ai-reader-cron
# Use same value as main worker's CRON_SECRET
```

### Monitoring
Check cron execution logs:
```bash
npx wrangler tail ansible-ai-reader-cron
```

## Worker 4: Relay Bridge (`wrangler-relay-bridge.toml`)

### Purpose
The owned-memory gateway for the **Relay** subsystem (an autonomous-narrator experiment layered on Ansible). It is the **only** worker that touches the `relay_*` tables, and the deliberate "swappable seam": all of Relay's durable state lives behind it, so the agent harness (Anthropic Managed Agents now, Cloudflare Agents SDK later) can be swapped by rewriting only a thin adapter. Unlike the cron/consumer split, this isolation is *architectural intent*, not an OpenNext limitation.

### Configuration
```toml
name = "ansible-relay-bridge"
main = "workers/relay-bridge.ts"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"   # Workers AI bge-m3 embeddings, sealed inside the bridge
```

### Responsibilities
- **Back-fill** (`POST /backfill`): one-time seed of Ansible summaries into the reference corpus
- **MCP tool surface** (`POST /mcp`): a hand-rolled minimal MCP server (JSON-RPC over Streamable HTTP) exposing `recall` / `fetch` / `write_pending` / `ingest_reference` / `research` — the only agent-facing route. `research` (Stage 2.1 fact-grounding) runs a Perplexity `sonar` search and returns verbatim `{quote, source_url, source_title}` findings (never model prose); it fails **closed** (returns `degraded`) on any error or empty result, and `write_pending` derives a piece's `verification_status` (`sourced` when it carries a `type:'source'` link, else `unverified`) backend-side
- **Decision capture** (`POST /decision`): operator-only; records a session's backend-observed verdict (`wrote`/`declined`) into `relay_decisions`, deriving the piece id from DB state
- **Human gate** (`POST /approve`, `POST /reject`): operator-only; approve embeds the piece and promotes it to `state=approved` (recallable as self); reject marks it `rejected`, never embedded
- **Auth — two tokens**: `RELAY_BRIDGE_TOKEN` gates `/mcp` (held by the agent's vault) + `/backfill`; a separate `RELAY_CONTROL_TOKEN` gates the gate-bypassing control plane (`/decision`, `/approve`, `/reject`), so a compromise of the agent token cannot self-approve pieces. The check runs before any routing
- **DB access**: service-role Supabase client (bypasses the `relay_*` zero-policy RLS)

### Secrets
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RELAY_BRIDGE_TOKEN`, `RELAY_CONTROL_TOKEN`, `READER_API_TOKEN` (optional — without it the `fetch` tool degrades to summary-only), and `PERPLEXITY_API_KEY` (optional — without it the `research` tool fails closed to `degraded`). Set via `npx wrangler secret put <NAME> --config wrangler-relay-bridge.toml`.

### Deployment
```bash
npm run deploy:relay-bridge
```

See `SPECIFICATIONS/relay/stage-1-technical-spec.md` for the full design.

## Worker 5: Relay Session Consumer (`wrangler-relay-session.toml`)

### Purpose
Runs Relay sessions triggered from the admin tab. The **"Run a session"** control enqueues a
`reader_id` on `ansible-relay-queue` (the main app is a pure producer via the `RELAY_QUEUE` binding);
this consumer runs one Managed-Agent session per message — create session → send stimulus → poll to
`idle` → finalize the verdict through the **bridge** `/decision`. It holds the "mind" (Anthropic MA
API) so the user-facing app never does. Resource creation is not done here; it uses the existing
environment/vault/agent IDs (`[vars]`).

### Configuration
```
name = "ansible-relay-session-consumer"
main = "workers/relay-session-consumer.ts"

[[queues.consumers]]
queue = "ansible-relay-queue"
max_batch_size = 1
max_concurrency = 1     # SERIAL — required for correct T0 verdict attribution (see ADR)
max_retries = 0         # no retry — would spawn a duplicate agent session
dead_letter_queue = "ansible-relay-dlq"
```

### Responsibilities
- Fetch the stimulus (`reader_items`), run the session, poll to completion.
- On `idle`: finalize the verdict via the bridge (`stimulus_ref`, `started_at` stamped **in the
  consumer** right before create-session, `reason`, `degraded`).
- On non-completion/failure: a `sync_log` breadcrumb (`relay_session_failed`), no verdict, ack (no retry).

### Robustness — the "Canceled" invocation
Some long invocations get hard-**Canceled** by the platform at their *end* (an invocation-duration /
isolate-lifecycle limit, not CPU — it lands right after a successful finalize). The **piece is never
lost** (the agent writes it mid-session via `write_pending`); only the decision row can be. Mitigations:
- **Phase logging** with elapsed ms (`[relay reader=… +Nms] run start / session created / poll exit /
  finalizing / finalized / acked`) so `wrangler tail` shows exactly where a cancel lands.
- **Wall-clock poll deadline** (`RELAY_POLL_BUDGET_MS`, default 210 s) — the poll loop exits *under* the
  cancel point, turning a silent kill into a diagnosable breadcrumb + clean ack.
- `[limits] cpu_ms = 300000` — a hedge only (cause is not CPU).
- **Likely real fix (not yet built):** short invocations via a re-enqueue poll; **make cancels harmless**
  by stamping `stimulus_ref` onto the piece so orphaned pieces are reconcilable. Pending log confirmation.

### Secrets & config
Secrets: `ANTHROPIC_API_KEY`, `RELAY_CONTROL_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
Vars (in the toml): `RELAY_AGENT_ID`, `RELAY_ENV_ID`, `RELAY_VAULT_ID`, `RELAY_BRIDGE_URL`. Optional:
`RELAY_POLL_INTERVAL_MS`. **Prod-only:** the `RELAY_QUEUE` binding is absent under local `next dev`.

### Deployment
```bash
npm run deploy:relay-session   # requires: npx wrangler queues create ansible-relay-queue (+ ansible-relay-dlq)
```

See ADR `REFERENCE/decisions/2026-07-01-relay-session-trigger.md` for why serial + no-retry are correctness settings.

## Inter-Worker Communication

### Main → Queue Consumer
```
Main Worker
  → Enqueue message to PROCESSING_QUEUE
  → Consumer receives via [[queues.consumers]]
  → Consumer processes async
```

**Message Format:**
```typescript
{
  jobId: string;
  userId: string;
  readerItemId: string;
  syncLogId: string;
}
```

### Cron → Main Worker
```
Cron Worker (hourly trigger)
  → HTTP GET https://ansible.hultberg.org/api/cron/auto-sync
  → Header: x-cron-secret
  → Main worker processes auto-sync logic
```

## Secrets Management

All workers require secrets configured via `wrangler secret put`:

### Main Worker Secrets
```bash
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
wrangler secret put SUPABASE_SECRET_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put CRON_SECRET
```

### Consumer Worker Secrets
```bash
wrangler secret put NEXT_PUBLIC_SUPABASE_URL --name ansible-ai-reader-consumer
wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --name ansible-ai-reader-consumer
wrangler secret put SUPABASE_SECRET_KEY --name ansible-ai-reader-consumer
wrangler secret put PERPLEXITY_API_KEY --name ansible-ai-reader-consumer
wrangler secret put READWISE_ACCESS_TOKEN --name ansible-ai-reader-consumer
```

### Cron Worker Secrets
```bash
wrangler secret put CRON_SECRET --name ansible-ai-reader-cron
```

**Note:** CRON_SECRET must match between cron and main workers.

## Observability

All workers have observability enabled for real-time logs.

**View Logs:**
```bash
# Main worker
npx wrangler tail

# Consumer worker
npx wrangler tail ansible-ai-reader-consumer

# Cron worker
npx wrangler tail ansible-ai-reader-cron
```

**Cloudflare Dashboard:**
- Workers & Pages > ansible-ai-reader > Logs
- View real-time logs, errors, and performance metrics

## Deployment Strategy

### CI/CD (Main Worker Only)
GitHub Actions auto-deploys main worker on push to `main` branch.

**Manual Deployment (All Workers):**
```bash
# Deploy all 4 workers
npm run deploy                                       # Main worker
npx wrangler deploy --config wrangler-consumer.toml  # Consumer
npx wrangler deploy --config wrangler-cron.toml      # Cron
npm run deploy:relay-bridge                          # Relay bridge
```

**Why manual for consumer & cron?**
- Less frequent changes
- Explicit deployment control
- Avoid unnecessary deployments

## Troubleshooting

### Main Worker Issues
- **Build fails**: Check OpenNext compatibility, verify nodejs_compat flag
- **Assets not loading**: Verify assets directory exists in `.open-next/assets`
- **Queue errors**: Check PROCESSING_QUEUE binding configuration

### Consumer Worker Issues
- **Jobs stuck in processing**: Check worker logs for errors
- **DLQ filling up**: Investigate error patterns in failed jobs
- **Slow processing**: Perplexity API may be rate-limited

### Cron Worker Issues
- **Not triggering**: Verify cron schedule format, check Cloudflare dashboard
- **Auth errors**: Verify CRON_SECRET matches between workers
- **Auto-sync not working**: Check main worker `/api/cron/auto-sync` endpoint logs

## Related Documentation
- [Overview](./overview.md) - System architecture
- [Database Schema](./database-schema.md) - Database interactions
- [Deployment Guide](../operations/deployment.md) - How to deploy workers
- [Monitoring](../operations/monitoring.md) - Observability and debugging
- [Troubleshooting](../operations/troubleshooting.md) - Common issues
