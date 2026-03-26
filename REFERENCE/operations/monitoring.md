# Monitoring & Observability
REFERENCE > Operations > Monitoring

Production logs, metrics, debugging, and observability for the Ansible AI Reader system.

## When to Read This
- Investigating production issues
- Monitoring system health
- Debugging worker behavior
- Analyzing performance
- Setting up alerts

## Related Documentation
- [Deployment](./deployment.md) - Production deployment
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Architecture - Workers](../architecture/workers.md) - 3-worker system design
- [Technical Debt](../technical-debt.md) - Known issues

---

## Overview

Ansible AI Reader consists of 3 Cloudflare Workers, each with its own logs and metrics:
1. **Main app** - Web UI and API routes
2. **Queue consumer** - Async summary generation
3. **Cron worker** - Hourly auto-sync trigger

Each worker can be monitored independently via Wrangler CLI or Cloudflare Dashboard.

---

## Viewing Worker Logs

### Via Wrangler CLI (Recommended)

**Main app logs:**
```bash
npx wrangler tail
```

**Consumer worker logs:**
```bash
npx wrangler tail --config wrangler-consumer.toml
```

**Cron worker logs:**
```bash
npx wrangler tail --config wrangler-cron.toml
```

**Filtering logs:**
```bash
# Filter by log level
npx wrangler tail --format pretty --status error

# Filter by specific text
npx wrangler tail | grep "Sync completed"

# Save logs to file
npx wrangler tail > logs.txt
```

### Via Cloudflare Dashboard

1. Go to Workers & Pages → Select worker
2. Click "Logs" tab for real-time logs
3. Click "Metrics" tab for performance data

**Advantages:**
- Visual interface
- Historical data (24-48 hours)
- Performance graphs
- Request filtering

**Disadvantages:**
- Requires dashboard access
- Limited search capabilities
- No grep/filtering

---

## Log Patterns by Worker

### Main App Logs

**Successful sync:**
```
[Reader] Fetching page 1 (cursor: null)
[Reader] Fetched 20 items
[Reader] Creating job for item abc123
[Queue] Enqueued job xyz789
[Sync] Sync abc-def completed: 20 items, 20 jobs
```

**API request:**
```
[API] GET /api/reader/items (200) - 45ms
[API] POST /api/reader/sync (200) - 1234ms
```

**Authentication:**
```
[Auth] Session validated for user abc123
[Auth] Magic link sent to user@example.com
```

**Errors:**
```
[Error] Failed to fetch Reader items: Network error
[Error] RLS policy violation: User xyz789
```

### Consumer Worker Logs

**Successful job processing:**
```
[Consumer] Processing job abc123 for item def456
[Reader] Fetching full content for item def456
[Perplexity] Generating summary (sonar-pro)
[Perplexity] Summary generated (1234 tokens)
[Job] Job abc123 completed successfully
```

**Errors:**
```
[Consumer] Job abc123 failed: Perplexity API error
[Consumer] Retry attempt 2/3 for job abc123
[Consumer] Job abc123 moved to DLQ after 3 failures
```

**Token usage:**
```
[Perplexity] Token usage: 1234 input, 567 output, 1801 total
[Sync] Total tokens for sync: 45000
```

### Cron Worker Logs

**Successful trigger:**
```
[Cron] Auto-sync triggered
[Cron] Calling /api/cron/auto-sync
[Cron] Auto-sync completed: {users_processed: 5, syncs_triggered: 4}
```

**Errors:**
```
[Cron] Auto-sync failed: Invalid CRON_SECRET
[Cron] Auto-sync endpoint returned 500
```

---

## Key Metrics to Monitor

### Main App Metrics

**Request Metrics:**
- **Request count**: Should match user activity
- **Response time**: p50 < 100ms, p99 < 500ms
- **Error rate**: < 1% (exclude 401/403 auth errors)
- **Status codes**: Track 4xx and 5xx rates

**API Endpoints:**
- `/api/reader/sync`: Long-running (1-30s), should succeed
- `/api/reader/items`: Fast (<100ms), high frequency
- `/api/settings`: Fast (<100ms), low frequency
- `/api/cron/auto-sync`: Hourly, should succeed

**Resource Usage:**
- **CPU time**: < 50ms per request (Workers limit: 50ms/10ms burst)
- **Memory**: < 128MB (Workers limit: 128MB)
- **Duration**: < 30s for sync operations

### Consumer Worker Metrics

**Queue Processing:**
- **Messages processed**: Should increase steadily during syncs
- **Processing time**: 2-5s per job (depends on article length)
- **Success rate**: > 95%
- **Retry rate**: < 5%
- **DLQ messages**: Should be 0 (investigate if >0)

**API Integration:**
- **Reader API calls**: Success rate > 99%
- **Perplexity API calls**: Success rate > 98%
- **Token usage**: Monitor for cost management

**Resource Usage:**
- **CPU time**: 10-30ms per job
- **Memory**: < 128MB
- **Queue depth**: Should stay near 0 (spike during syncs is normal)

### Cron Worker Metrics

**Schedule Execution:**
- **Runs per day**: Should be 24 (hourly)
- **Success rate**: > 99%
- **Duration**: < 5s per run
- **Users processed**: Varies (depends on sync_interval settings)

**Resource Usage:**
- **CPU time**: < 10ms
- **Memory**: Minimal
- **HTTP requests**: 1 per run (to /api/cron/auto-sync)

---

## Debugging Production Issues

### Step 1: Identify the Worker

**Symptom: UI not loading**
→ Check main app logs

**Symptom: Summaries not generating**
→ Check consumer worker logs

**Symptom: Auto-sync not running**
→ Check cron worker logs

### Step 2: Check Recent Deployments

```bash
# List recent deployments
npx wrangler deployments list
npx wrangler deployments list --config wrangler-consumer.toml
npx wrangler deployments list --config wrangler-cron.toml

# Check for failed deployments
```

If issue started after deployment, consider rollback.

### Step 3: Review Error Logs

```bash
# Filter for errors
npx wrangler tail --status error

# Save last 100 errors
npx wrangler tail --status error > errors.log
```

**Common error patterns:**
- `RLS policy violation` → Check user permissions
- `Invalid API token` → Verify secrets
- `Rate limit exceeded` → Check API limits
- `Queue send failed` → Check queue binding

### Step 4: Check External Dependencies

**Supabase:**
1. Go to Supabase Dashboard → Logs
2. Check for database errors
3. Verify project is not paused (free tier)

**Perplexity:**
1. Go to Perplexity Dashboard
2. Check API status and quotas
3. Verify billing is active

**Readwise Reader:**
1. Test API access: `curl -H "Authorization: Token YOUR_TOKEN" https://readwise.io/api/v3/list/`
2. Check rate limit headers

### Step 5: Test End-to-End

**Manual sync:**
1. Log in to application
2. Click "Sync" button
3. Watch browser console and network tab
4. Check Cloudflare logs in parallel

**Automated sync:**
1. Check a user has `sync_interval > 0`
2. Wait for next hour (or trigger manually)
3. Monitor cron worker logs
4. Verify sync triggered in main app logs

---

## Performance Debugging

### Slow API Responses

**Identify bottleneck:**
```bash
# Monitor request duration
npx wrangler tail | grep "ms"
```

**Common causes:**
- Slow database queries (add indexes)
- External API timeouts (check rate limits)
- Large response payloads (add pagination)

**Fix:**
1. Add database indexes on frequently queried columns
2. Implement caching for static data
3. Optimize query patterns (reduce N+1 queries)

### High CPU Usage

**Symptoms:**
- Workers hitting CPU time limits
- Frequent 503 errors
- Slow response times

**Debugging:**
1. Check CPU time in Cloudflare metrics
2. Review code for expensive operations
3. Profile hot paths

**Fix:**
- Move heavy computation to queue consumer
- Optimize algorithms (reduce complexity)
- Cache expensive operations

### Memory Issues

**Symptoms:**
- Workers crashing with "Out of memory"
- 500 errors during large syncs

**Debugging:**
1. Check memory usage in Cloudflare metrics
2. Look for large data structures
3. Review pagination logic

**Fix:**
- Reduce batch sizes (sync fewer items per page)
- Stream large responses instead of buffering
- Clear unused variables

---

## Alerting & Notifications

### Cloudflare Workers Alerts (Paid Plans)

Configure alerts in Cloudflare Dashboard:
1. Workers & Pages → Select worker
2. Settings → Notifications
3. Set up alerts for:
   - Error rate > 5%
   - CPU time > 40ms average
   - Request rate spike (>10x baseline)

### Manual Monitoring

**Daily checks:**
- Review error logs: `npx wrangler tail --status error`
- Check queue depth: `npx wrangler queues list`
- Verify cron ran 24 times: Check cron logs

**Weekly checks:**
- Review Perplexity token usage and costs
- Check database size growth
- Verify all 3 workers are healthy

**Monthly checks:**
- Audit secrets and API keys
- Review technical debt backlog
- Check for Worker version updates

---

## Log Retention

**Cloudflare Workers:**
- Real-time: Live tail via Wrangler
- Historical: 24-48 hours in Dashboard
- Long-term: Export to external service (not implemented)

**Supabase:**
- Query logs: 7 days (free tier)
- Database logs: Available in Dashboard

**Future improvement:** Set up external logging service (e.g., Sentry, Datadog) for long-term retention and advanced querying.

---

## Useful Monitoring Commands

### Quick Health Check

```bash
# Check all workers are deployed
npx wrangler deployments list
npx wrangler deployments list --config wrangler-consumer.toml
npx wrangler deployments list --config wrangler-cron.toml

# Verify secrets are set
npx wrangler secret list
npx wrangler secret list --config wrangler-consumer.toml
npx wrangler secret list --config wrangler-cron.toml

# Check queue status
npx wrangler queues list
```

### Live Monitoring

```bash
# Monitor all workers in parallel (requires 3 terminals)
# Terminal 1: Main app
npx wrangler tail

# Terminal 2: Consumer
npx wrangler tail --config wrangler-consumer.toml

# Terminal 3: Cron
npx wrangler tail --config wrangler-cron.toml
```

### Debug Specific User

```bash
# Monitor logs for specific user ID
npx wrangler tail | grep "user-abc123"

# Check user's sync history in database
# (Use Supabase SQL Editor or psql)
SELECT * FROM sync_log
WHERE user_id = 'user-abc123'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Cost Monitoring

### Cloudflare Workers

**Free tier limits:**
- 100,000 requests/day
- 10ms CPU time per request
- 1000 Cron Triggers/day

**Paid plan ($5/month):**
- 10M requests included
- 30s CPU time per request
- Unlimited Cron Triggers

**Current usage:** Check Cloudflare Dashboard → Workers & Pages → Usage

### Perplexity API

**Token usage tracking:**
```sql
SELECT
  SUM(total_tokens_used) as total_tokens,
  COUNT(*) as total_syncs,
  AVG(total_tokens_used) as avg_tokens_per_sync
FROM sync_log
WHERE created_at > NOW() - INTERVAL '30 days';
```

**Estimated cost:**
- Model: sonar-pro (~$1 per 1M tokens)
- Average article: 1500-3000 tokens
- Cost per summary: ~$0.002-$0.003
- 1000 summaries: ~$2-$3

**Cost optimization:**
- Use shorter prompts (fewer tokens)
- Don't regenerate unnecessarily
- Monitor for anomalies (sudden spikes)

### Supabase

**Free tier limits:**
- 500MB database
- 2GB bandwidth/month
- 50,000 monthly active users

**Current usage:** Check Supabase Dashboard → Settings → Usage

---

## Related Documentation

- [Deployment](./deployment.md) - Production deployment configuration
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Architecture - Workers](../architecture/workers.md) - Understanding the 3-worker system
- [Technical Debt](../technical-debt.md) - Known issues and limitations
