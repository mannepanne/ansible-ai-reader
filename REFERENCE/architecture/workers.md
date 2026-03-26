# Workers
REFERENCE > Architecture > Workers

Detailed documentation of the 3-worker Cloudflare Workers architecture.

## Why 3 Workers?

We deploy **three separate Cloudflare Workers** because of OpenNext limitations:

**OpenNext** (`@cloudflare/next-on-pages`) adapts Next.js for Cloudflare Workers but only generates **HTTP request handlers**. It doesn't support:
- `scheduled()` function for cron triggers
- Long-running background tasks

**Solution:** Deploy specialized workers for different concerns.

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
# Deploy all 3 workers
npm run deploy                                      # Main worker
npx wrangler deploy --config wrangler-consumer.toml  # Consumer
npx wrangler deploy --config wrangler-cron.toml      # Cron
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
