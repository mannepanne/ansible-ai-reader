# Troubleshooting Guide
REFERENCE > Operations > Troubleshooting

Common issues and solutions for development, deployment, and production.

## When to Read This
- Debugging application issues
- Fixing deployment problems
- Resolving API integration errors
- Investigating production incidents

## Related Documentation
- [Deployment](./deployment.md) - Deployment configuration and steps
- [Environment Setup](./environment-setup.md) - Secrets and configuration
- [Monitoring](./monitoring.md) - Production logs and debugging
- [Technical Debt](../technical-debt.md) - Known limitations and issues

---

## Local Development Issues

### Port already in use
```bash
# Kill existing Next.js dev server
pkill -f next

# Or kill Wrangler dev server
pkill -f wrangler
```

### TypeScript errors
```bash
npx tsc --noEmit
```

### Environment variables not loading
- Check `.dev.vars` exists and has correct format
- Restart dev server after changing `.dev.vars`
- For Next.js, use `.env.local` instead of `.dev.vars`
- Verify no trailing whitespace or quotes around values

### Dependency issues
```bash
rm -rf node_modules package-lock.json
npm install
```

### Database connection issues
- Verify Supabase URL and keys in `.dev.vars`
- Check Supabase project is not paused (free tier pauses after inactivity)
- Test connection with Supabase client directly
- Verify RLS policies aren't blocking queries

---

## Deployment Issues

### Wrangler authentication errors
```bash
npx wrangler login
```

If login fails:
- Clear browser cookies for Cloudflare
- Try incognito/private browsing mode
- Use `npx wrangler whoami` to verify authentication

### Build failures with @cloudflare/next-on-pages
- Check Next.js version compatibility (15+)
- Verify all dependencies support edge runtime
- Review build output for unsupported APIs (e.g., fs, path)
- Clear `.open-next/` directory and rebuild

### Production environment variables not set
```bash
# Check which secrets are configured
npx wrangler secret list
npx wrangler secret list --config wrangler-consumer.toml
npx wrangler secret list --config wrangler-cron.toml

# Add missing secrets
npx wrangler secret put SECRET_NAME
npx wrangler secret put SECRET_NAME --config wrangler-consumer.toml
```

### Error: "Worker not found" when setting secrets
**Cause:** Worker hasn't been deployed yet

**Fix:** Deploy the worker first, then set secrets:
```bash
npx wrangler deploy --config wrangler-consumer.toml
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
```

### Error: "Project not found" (Pages)
**Cause:** Trying to deploy to Cloudflare Pages instead of Workers

**Fix:** Use `wrangler deploy` (NOT `wrangler pages deploy`):
```bash
npm run deploy  # Uses wrangler deploy
```

### Build directory not found: `.open-next/worker`
**Cause:** Build hasn't been run or was cleaned

**Fix:** Run build before deploy:
```bash
npm run build:worker && npm run deploy
```

---

## API Integration Issues

### Readwise Reader API

**Error: "Invalid Reader API token"**
- Check token is valid at https://readwise.io/access_token
- Verify token has permission to read items
- Ensure token is set in both main app and consumer worker

**Error: "Rate limit exceeded" (429)**
- Reader API rate limits: 20 requests/minute
- Check response headers for retry-after
- Wait before retrying (implemented in API client)

**Items not syncing**
- Verify Reader token is configured
- Check Cloudflare logs for errors: `npx wrangler tail`
- Test Reader API directly: `curl -H "Authorization: Token YOUR_TOKEN" https://readwise.io/api/v3/list/`

### Perplexity API

**Error: "Invalid API key"**
- Verify API key is active at https://www.perplexity.ai/settings/api
- Check billing/quota status
- Ensure key is set in consumer worker: `npx wrangler secret list --config wrangler-consumer.toml`

**Summaries not generating**
- Check Perplexity API key is valid
- Verify queue consumer is running and processing jobs
- Monitor consumer logs: `npx wrangler tail --config wrangler-consumer.toml`
- Check job status in database

**High token usage / unexpected costs**
- Monitor token usage for costs
- Check for long articles (>30k chars are truncated)
- Verify prompt isn't unnecessarily long
- Look for repeated regenerations

### Supabase Auth

**Magic links not arriving**
- Verify Resend SMTP is configured in Supabase dashboard
- Check Resend domain is verified
- Test magic link emails in spam/junk folders
- Verify sender email (`noreply@hultberg.org`) is configured

**Magic links contain localhost:3000 in production**
**Symptoms:** Magic link emails sent from production contain `redirect_to=http://localhost:3000` despite Site URL being set to production domain.

**Root cause:** Supabase Site URL setting has a caching/state bug where the first change doesn't always persist.

**Solution:** Change the Site URL field multiple times in the Supabase dashboard (Authentication → URL Configuration → Site URL). Toggle between localhost and production URL a few times until the change takes effect.

**Verification:**
1. Enable Cloudflare observability in `wrangler.toml`: `[observability] enabled = true`
2. Check logs to verify your code is sending correct `emailRedirectTo` parameter
3. Test magic link email - the `redirect_to` parameter should match your production URL
4. If still showing localhost, try changing Site URL again in Supabase dashboard

**Authentication errors in production**
**Cause:** Environment variables not set or Site URL misconfigured in Supabase

**Fix:**
1. Verify all secrets are set: `npx wrangler secret list`
2. Check Supabase Site URL matches deployment URL
3. Verify redirect URLs include `/api/auth/callback`
4. Test magic link flow end-to-end

---

## Database Issues

### RLS policy violations

**Error: "new row violates row-level security policy"**
**Cause:** Trying to insert/update data without proper RLS permissions

**Common scenarios:**
1. **Settings save failing:** Use service role client to bypass RLS (see [service-role-client pattern](../patterns/service-role-client.md))
2. **User doesn't exist:** Ensure user record exists in `users` table before other operations
3. **Wrong user context:** Verify auth.uid() matches the user_id you're inserting

**Fix:**
```typescript
// For trusted server operations, use service role client
const serviceClient = createServiceRoleClient();
await serviceClient.from('users').upsert({ id: userId, ... });
```

### Foreign key violations

**Error: "insert or update on table violates foreign key constraint"**
**Cause:** Trying to reference a user that doesn't exist

**Fix:** Ensure user record exists first:
```typescript
// In API route after auth check
const { data: user } = await supabase
  .from('users')
  .select('id')
  .eq('id', session.user.id)
  .single();

if (!user) {
  // Create user record
  await serviceClient.from('users').insert({
    id: session.user.id,
    email: session.user.email,
  });
}
```

### Unique constraint violations

**Error: "duplicate key value violates unique constraint"**
**Cause:** Trying to insert a record that already exists

**Fix:** Use upsert pattern:
```typescript
await supabase.from('reader_items').upsert({
  user_id: userId,
  reader_id: readerItemId,
  // ... other fields
}, {
  onConflict: 'user_id,reader_id'
});
```

---

## Queue Processing Issues

### Consumer worker not processing jobs

**Cause:** Missing secrets, queue binding, or worker not deployed

**Fix:**
1. Verify worker is deployed: `npx wrangler deployments list --config wrangler-consumer.toml`
2. Check secrets: `npx wrangler secret list --config wrangler-consumer.toml`
3. Verify queue exists: `npx wrangler queues list`
4. Check queue binding in `wrangler-consumer.toml`
5. Monitor logs: `npx wrangler tail --config wrangler-consumer.toml`

### Jobs stuck in "pending" status

**Symptoms:** Sync completes but summaries never generate

**Debugging:**
1. Check consumer worker logs for errors
2. Verify Perplexity API key is set
3. Test Reader API access (consumer fetches full content)
4. Check database for job status and error messages

**Fix:**
```bash
# Check consumer logs
npx wrangler tail --config wrangler-consumer.toml

# Verify secrets
npx wrangler secret list --config wrangler-consumer.toml

# Test queue is receiving messages
npx wrangler queues list
```

### Dead letter queue messages

**Cause:** Jobs failed after 3 retry attempts

**Investigation:**
1. Check dead letter queue: `npx wrangler queues list`
2. Review failed job logs
3. Identify pattern in failures (API errors, timeouts, parsing errors)

**Fix:** Address root cause and re-enqueue failed jobs (manual intervention required)

---

## Automated Sync Issues

### Cron triggers not firing

**Symptoms:** Automated syncs not running hourly

**Debugging:**
1. Verify cron worker is deployed: `npx wrangler deployments list --config wrangler-cron.toml`
2. Check cron schedule: Should be `"0 * * * *"` in `wrangler-cron.toml`
3. Monitor cron logs: `npx wrangler tail --config wrangler-cron.toml`
4. Verify CRON_SECRET matches in both workers

**Fix:**
```bash
# Verify cron worker deployment
npx wrangler deploy --config wrangler-cron.toml

# Check CRON_SECRET matches
npx wrangler secret list
npx wrangler secret list --config wrangler-cron.toml

# Monitor cron execution
npx wrangler tail --config wrangler-cron.toml
```

### Auto-sync endpoint returning errors

**Error: "Invalid cron secret"**
**Cause:** CRON_SECRET mismatch between workers

**Fix:**
```bash
# Regenerate secret
openssl rand -hex 32

# Set in both workers
npx wrangler secret put CRON_SECRET
npx wrangler secret put CRON_SECRET --config wrangler-cron.toml
```

**Error: "No users due for sync"**
**Cause:** Normal - means no users have auto-sync enabled or are due

**Verification:**
1. Check a user has `sync_interval > 0` in database
2. Verify `last_auto_sync_at` is old enough (or NULL)
3. Check logs for successful sync triggers

### Wrong sync frequency

**Symptoms:** Syncs running too often or not often enough

**Debugging:**
1. Check user's `sync_interval` setting in database
2. Verify `last_auto_sync_at` is being updated after each sync
3. Review auto-sync endpoint logic

**Fix:**
```sql
-- Check user's sync settings
SELECT id, sync_interval, last_auto_sync_at
FROM users
WHERE sync_interval > 0;

-- Manually trigger sync for testing
-- Call /api/cron/auto-sync with CRON_SECRET header
```

---

## GitHub Actions CI/CD Issues

### Deployment workflow fails

**Cause:** Missing GitHub secrets or incorrect secret names

**Fix:**
1. Verify secrets in repository Settings → Secrets and variables → Actions
2. Secret names must exactly match (case-sensitive):
   - `CLOUDFLARE_API_TOKEN`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `READER_API_TOKEN`
   - `PERPLEXITY_API_KEY`
   - `RESEND_API_KEY`
   - `CRON_SECRET`
3. Check Actions logs for specific error messages
4. Verify Cloudflare API token has correct permissions

### Tests fail in CI but pass locally

**Cause:** Environment differences or missing test data

**Fix:**
1. Check Node.js version matches local (20+)
2. Verify all dev dependencies are installed
3. Run tests with same command as CI: `npm test -- --run`
4. Check for timing issues or race conditions

### Build succeeds but deployment fails

**Cause:** Wrangler configuration or secrets issue

**Fix:**
1. Verify `wrangler.toml` files are committed
2. Check Cloudflare API token permissions
3. Ensure all three workers have secrets configured
4. Review deployment logs in GitHub Actions

---

## Performance Issues

### Slow page loads

**Debugging:**
1. Check Cloudflare Workers metrics (CPU time, memory)
2. Review database query performance
3. Monitor API response times
4. Check for rate limiting

**Fix:**
- Optimize database queries (add indexes)
- Cache frequently accessed data
- Reduce API calls where possible
- Use pagination for large datasets

### High Perplexity API costs

**Symptoms:** Unexpectedly high token usage

**Debugging:**
1. Check token usage in `sync_log` table
2. Look for long articles (>30k chars)
3. Verify content truncation is working
4. Check for repeated summary regenerations

**Fix:**
- Review and optimize summary prompt (shorter = fewer tokens)
- Don't regenerate unnecessarily
- Monitor token usage per sync
- Consider rate limiting regenerations

---

## Related Documentation

- [Deployment](./deployment.md) - Deployment configuration and process
- [Environment Setup](./environment-setup.md) - Secrets and API keys
- [Monitoring](./monitoring.md) - Production logs and observability
- [Technical Debt](../technical-debt.md) - Known issues and limitations
- [Service Role Client Pattern](../patterns/service-role-client.md) - Bypassing RLS safely
