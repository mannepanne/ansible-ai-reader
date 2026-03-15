# Phase 4 Deployment & Testing Checklist

Quick guide to deploy Phase 4 (Perplexity Integration) and test summary generation.

## Prerequisites

- [ ] Perplexity API account with API key
- [ ] Access to Supabase dashboard
- [ ] Cloudflare Workers access via wrangler CLI

---

## Step 1: Database Migration

Run the Phase 4 migration to add summary columns to `reader_items` table.

### Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the sidebar
4. Copy contents of `supabase/migrations/20260315_add_summaries_tags.sql`
5. Paste into editor and click **Run**
6. Verify: Check that `reader_items` table now has:
   - `short_summary` (text, nullable)
   - `tags` (text[], default empty array)
   - `perplexity_model` (varchar(50), nullable)

### Via Supabase CLI (Alternative)

```bash
# Link to your project if not already done
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

---

## Step 2: Get Perplexity API Key

1. Go to https://www.perplexity.ai/settings/api
2. Sign up / log in
3. Create new API key (starts with `pplx-`)
4. Copy the key - you'll need it for both local and production

---

## Step 3: Local Testing Setup

### 3.1 Update .dev.vars

Add PERPLEXITY_API_KEY to your `.dev.vars` file:

```bash
# Existing variables
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
RESEND_API_KEY=re_xxxxxxxxx
READER_API_TOKEN=your_reader_token

# Phase 4: Add this
PERPLEXITY_API_KEY=pplx-xxxxx
```

### 3.2 Test Queue Consumer Locally

Open **two terminal windows**:

**Terminal 1 - Start Queue Consumer:**
```bash
npm run dev:consumer
```

You should see:
```
⛅️ wrangler 3.x.x
------------------
⎔ Starting local server...
Ready on http://127.0.0.1:8787
```

**Terminal 2 - Start Next.js App:**
```bash
npm run dev
```

### 3.3 Test the Flow

1. Open browser to http://localhost:8788
2. Log in with magic link
3. Click "Sync Reader" button
4. Watch **Terminal 1** (consumer) for job processing logs:
   ```
   [Queue Consumer] Processing job: job-abc123
   [Perplexity API] Generated summary for: Article Title (920 tokens)
   [Queue Consumer] Job completed: job-abc123
   ```

5. Check the UI - items should show:
   - Blue-tinted summary box with bullet points
   - Tag chips below summary
   - Model name in metadata line

### 3.4 Verify in Database

Check Supabase Table Editor:
- Go to `reader_items` table
- Verify items have `short_summary`, `tags`, and `perplexity_model` populated

---

## Step 4: Production Deployment

### 4.1 Set Production Secrets

Set PERPLEXITY_API_KEY for the queue consumer worker:

```bash
# Consumer worker needs this
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
# Enter: pplx-xxxxx when prompted
```

Verify it's set:
```bash
npx wrangler secret list --config wrangler-consumer.toml
```

You should see:
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
READER_API_TOKEN
PERPLEXITY_API_KEY  ← Should be here now
```

### 4.2 Deploy Consumer Worker

```bash
npx wrangler deploy --config wrangler-consumer.toml
```

You should see:
```
✨ Deployment complete
✨ Worker: ansible-queue-consumer
✨ URL: https://ansible-queue-consumer.your-subdomain.workers.dev
```

### 4.3 Deploy Main App

```bash
npm run deploy
```

This deploys the Next.js app with Phase 4 changes (already on main branch).

### 4.4 Verify Queue Binding

Check that the consumer is connected to the right queue:

```bash
npx wrangler queues consumer list ansible-processing-queue
```

You should see:
```
Consumer Name: ansible-queue-consumer
```

---

## Step 5: Production Testing

1. Go to https://ansible.hultberg.org
2. Log in
3. Click "Sync Reader"
4. Wait for sync to complete (poll every 2 seconds)
5. Check that items show summaries and tags

### Monitor Consumer Logs

```bash
npx wrangler tail ansible-queue-consumer
```

You should see jobs being processed in real-time.

### Check for Errors

If summaries aren't generating:

1. **Check consumer logs:**
   ```bash
   npx wrangler tail ansible-queue-consumer
   ```

2. **Check queue has messages:**
   ```bash
   # View queue metrics in Cloudflare dashboard
   # Queues → ansible-processing-queue → Metrics
   ```

3. **Verify PERPLEXITY_API_KEY is set:**
   ```bash
   npx wrangler secret list --config wrangler-consumer.toml
   ```

4. **Check processing_jobs table:**
   - Go to Supabase Table Editor
   - Check `processing_jobs` for `status = 'failed'`
   - Look at `error_message` column for clues

---

## Step 6: Cost Monitoring (Manual for Now)

Cost monitoring dashboard is deferred to Phase 5, but you can manually check token usage:

### Query Token Usage

Run this in Supabase SQL Editor:

```sql
SELECT
  created_at,
  errors->>'reader_item_id' as item_id,
  errors->'token_usage'->>'total_tokens' as tokens,
  errors->'token_usage'->>'model' as model,
  errors->'token_usage'->>'content_truncated' as truncated
FROM sync_log
WHERE sync_type = 'summary_generation'
ORDER BY created_at DESC
LIMIT 20;
```

### Estimate Cost

Perplexity pricing (as of 2026-03):
- **sonar**: $0.10 per 1M tokens (both prompt + completion)
- **sonar-pro**: $1.00 per 1M tokens

Example:
- 100 articles × 920 tokens avg = 92,000 tokens
- Cost: 92,000 / 1,000,000 × $0.10 = **$0.0092** (~1 cent)

---

## Troubleshooting

### "Consumer not processing jobs"

**Check queue binding:**
```bash
npx wrangler queues consumer list ansible-processing-queue
```

If empty, the consumer isn't bound to the queue. Check `wrangler-consumer.toml` has:
```toml
[[queues.consumers]]
queue = "ansible-processing-queue"
```

### "Perplexity API error"

**Check API key is valid:**
```bash
# Test with curl
curl https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer pplx-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"sonar","messages":[{"role":"user","content":"test"}]}'
```

Should return a valid response, not 401.

### "Summaries not showing in UI"

**Check migration ran:**
```sql
-- In Supabase SQL Editor
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'reader_items'
  AND column_name IN ('short_summary', 'tags', 'perplexity_model');
```

Should return 3 rows. If not, re-run migration.

---

## Expected Results

After successful deployment, when you sync Reader items:

1. **Backend**: Jobs enqueued to `ansible-processing-queue`
2. **Consumer**: Processes jobs in batches (up to 10 at a time)
3. **Perplexity**: Generates summaries and tags
4. **Database**: Updates `reader_items` with `short_summary`, `tags`, `perplexity_model`
5. **UI**: Displays summaries in blue boxes, tags as chips

**Timeline**: ~2-5 seconds per article (depends on content length and queue load)

---

## Next Steps

Once summaries are working:
- Monitor costs for a few days
- Test with different article types (short, long, technical, etc.)
- Report any failed summaries or quality issues
- Move to Phase 5 for cost monitoring dashboard and retry UI

---

**Questions?** See [troubleshooting.md](./REFERENCE/troubleshooting.md) or [environment-setup.md](./REFERENCE/environment-setup.md).
