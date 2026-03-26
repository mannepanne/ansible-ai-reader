# Deployment Guide

**When to read this:** Deploying to production, setting up CI/CD, or troubleshooting deployment issues.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [environment-setup.md](./environment-setup.md) - API keys and environment configuration
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions

---

## Architecture Overview

Ansible AI Reader deploys to **Cloudflare Workers** (NOT Cloudflare Pages - this is a common confusion point).

### Three Separate Workers

1. **`ansible-ai-reader`** (Main Application)
   - Next.js 15 application built with OpenNext for Cloudflare
   - Handles web UI and API routes
   - Produces messages to Cloudflare Queue for async processing
   - Deployment URL: https://ansible-ai-reader.herrings.workers.dev
   - Custom domain: https://ansible.hultberg.org

2. **`ansible-queue-consumer`** (Queue Consumer)
   - Processes summary generation jobs from the queue
   - Fetches content from Readwise Reader API
   - Generates AI summaries via Perplexity API
   - Stores results in Supabase
   - Deployment URL: https://ansible-queue-consumer.herrings.workers.dev

3. **`ansible-ai-reader-cron`** (Cron Trigger)
   - Triggers automated syncing every hour
   - Calls `/api/cron/auto-sync` endpoint with CRON_SECRET
   - Separate worker because OpenNext doesn't support scheduled() function
   - No deployment URL (cron-only, no HTTP endpoints)

### Why Workers, Not Pages?

OpenNext (the Next.js → Cloudflare adapter) deploys to **Cloudflare Workers**, not Pages:
- Provides full server-side rendering support
- Enables API routes with dynamic functionality
- Supports Cloudflare bindings (Queues, KV, etc.)
- Deploys using `wrangler deploy` command

**Common mistake:** Creating a Pages project - this is not needed and will create confusion with duplicate resources.

---

## Automatic Deployment (CI/CD)

### GitHub Actions Workflow

Every push to the `main` branch automatically:
1. Runs all tests (`npm test -- --run`)
2. Runs type checking (`npx tsc --noEmit`)
3. Builds the application (`npm run build:worker`)
4. Deploys consumer worker (`wrangler deploy --config wrangler-consumer.toml`)
5. Deploys main application (`wrangler deploy`)

**Workflow file:** `.github/workflows/deploy.yml`

### Required GitHub Secrets

Set these in your repository settings at:
https://github.com/mannepanne/ansible-ai-reader/settings/secrets/actions

| Secret Name | Purpose | Where to get it |
|-------------|---------|-----------------|
| `CLOUDFLARE_API_TOKEN` | Authenticate deployments to Cloudflare | Cloudflare Dashboard → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (both workers) | Your `.dev.vars` file |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase public API key (main app) | Your `.dev.vars` file |
| `SUPABASE_SECRET_KEY` | Supabase service role key (both workers) | Your `.dev.vars` file |
| `READER_API_TOKEN` | Readwise Reader API token (both workers) | Your `.dev.vars` file |
| `PERPLEXITY_API_KEY` | Perplexity AI API key (consumer worker) | Your `.dev.vars` file |
| `RESEND_API_KEY` | Resend email API key (main app) | Your `.dev.vars` file |

**Note:** All secrets except `CLOUDFLARE_API_TOKEN` should match the values in your local `.dev.vars` file.

### Setting Up GitHub Secrets

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret from the table above:
   - Name: Exact name from table (case-sensitive)
   - Value: Copy from `.dev.vars` or Cloudflare dashboard
   - Click "Add secret"
4. Repeat for all 7 secrets

### Testing the Workflow

After setting up secrets:
1. Make any small change to the codebase
2. Commit and push to `main` branch
3. Go to Actions tab in GitHub to watch the deployment
4. Both workers will be automatically deployed on success

---

## Manual Deployment

Use manual deployment for testing or if CI/CD is not set up.

### Prerequisites

1. Install Wrangler CLI: `npm install` (installs as dev dependency)
2. Authenticate with Cloudflare: `npx wrangler login`
3. Ensure `.dev.vars` file exists with all required secrets (see [environment-setup.md](./environment-setup.md))

### Deployment Steps

#### 1. Build the Application

```bash
npm run build:worker
```

This runs OpenNext to build the Next.js app for Cloudflare Workers.

**Output:** `.open-next/` directory with built assets and worker code

#### 2. Set Production Secrets (First-Time Only)

**For consumer worker (4 secrets):**

```bash
# Supabase configuration
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --config wrangler-consumer.toml
npx wrangler secret put SUPABASE_SECRET_KEY --config wrangler-consumer.toml

# API tokens
npx wrangler secret put READER_API_TOKEN --config wrangler-consumer.toml
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
```

**For main app (5 secrets):**

```bash
# Supabase configuration
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY

# API tokens
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put READER_API_TOKEN
```

When prompted, paste the value from your `.dev.vars` file.

#### 3. Deploy Consumer Worker

```bash
npm run deploy:consumer
```

Or directly:
```bash
npx wrangler deploy --config wrangler-consumer.toml
```

**Output:** Consumer worker deployed to https://ansible-queue-consumer.herrings.workers.dev

#### 4. Deploy Main Application

```bash
npm run deploy
```

Or directly:
```bash
npx wrangler deploy
```

**Output:** Main app deployed to https://ansible-ai-reader.herrings.workers.dev

#### 5. Verify Deployment

Test the deployment:
1. Visit https://ansible-ai-reader.herrings.workers.dev
2. Log in with magic link
3. Sync items from Readwise
4. Verify summaries are generated

---

## Custom Domain Setup

To use https://ansible.hultberg.org instead of the `herrings.workers.dev` subdomain:

### 1. Add Custom Domain in Cloudflare

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select `ansible-ai-reader` worker
3. Go to Settings → Triggers → Custom Domains
4. Add custom domain: `ansible.hultberg.org`
5. Cloudflare will automatically configure DNS

### 2. Update Supabase Configuration

Update the "Site URL" in Supabase to use the custom domain:

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Set "Site URL" to: `https://ansible.hultberg.org`
3. Update "Redirect URLs" to include: `https://ansible.hultberg.org/api/auth/callback`

### 3. Test Custom Domain

1. Visit https://ansible.hultberg.org
2. Test magic link authentication
3. Verify all functionality works

---

## Configuration Files

### Main App: `wrangler.toml`

```toml
name = "ansible-ai-reader"
main = ".open-next/worker.js"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[[queues.producers]]
queue = "ansible-processing-queue"
binding = "PROCESSING_QUEUE"
```

**Key points:**
- Uses `.open-next/worker.js` as entry point (built by OpenNext)
- Assets directory for static files (CSS, JS, images)
- Queue producer binding to send messages

### Consumer Worker: `wrangler-consumer.toml`

```toml
name = "ansible-queue-consumer"
main = "workers/consumer.ts"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[[queues.consumers]]
queue = "ansible-processing-queue"
max_batch_size = 1
max_batch_timeout = 30
```

**Key points:**
- Separate worker from main app
- Consumes from `ansible-processing-queue`
- Processes one message at a time (`max_batch_size = 1`)

---

## Package.json Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run build:worker` | `npx opennextjs-cloudflare build` | Build Next.js for Cloudflare Workers |
| `npm run deploy` | `wrangler deploy` | Deploy main application |
| `npm run deploy:consumer` | `wrangler deploy --config wrangler-consumer.toml` | Deploy consumer worker |

---

## Troubleshooting

### Error: "Worker not found" when setting secrets

**Cause:** Worker hasn't been deployed yet

**Fix:** Deploy the worker first, then set secrets:
```bash
npx wrangler deploy --config wrangler-consumer.toml
echo "your-key" | npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
```

### Error: "Project not found" (Pages)

**Cause:** You're trying to deploy to Cloudflare Pages instead of Workers

**Fix:** Use `wrangler deploy` (NOT `wrangler pages deploy`)

The correct command is:
```bash
npm run deploy  # Uses wrangler deploy
```

### Build directory not found: `.open-next/worker`

**Cause:** Build hasn't been run or was cleaned

**Fix:** Run build before deploy:
```bash
npm run build:worker && npm run deploy
```

### Authentication errors in production

**Cause:** Environment variables not set or Site URL misconfigured in Supabase

**Fix:**
1. Verify all secrets are set: `npx wrangler secret list`
2. Check Supabase Site URL matches deployment URL
3. Verify redirect URLs include `/api/auth/callback`

### Consumer worker not processing jobs

**Cause:** Missing PERPLEXITY_API_KEY secret or queue binding not configured

**Fix:**
1. Verify secret is set: `npx wrangler secret list --config wrangler-consumer.toml`
2. Check queue exists: `npx wrangler queues list`
3. Verify queue binding in `wrangler-consumer.toml`

### GitHub Actions deployment fails

**Cause:** Missing GitHub secrets or incorrect secret names

**Fix:**
1. Verify secrets are set in GitHub repo settings
2. Secret names must exactly match: `CLOUDFLARE_API_TOKEN`, `PERPLEXITY_API_KEY`
3. Check Actions logs for specific error messages

---

## Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally: `npm test -- --run`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build:worker`
- [ ] Database migrations applied in Supabase
- [ ] All secrets set in Cloudflare (see Required Secrets section)
- [ ] GitHub secrets configured (for CI/CD)
- [ ] Supabase Site URL updated to production domain
- [ ] Custom domain configured (if using ansible.hultberg.org)

After deployment:

- [ ] Main app loads at deployment URL
- [ ] Magic link authentication works
- [ ] Sync from Readwise succeeds
- [ ] Summary generation works
- [ ] No errors in Cloudflare Workers logs
- [ ] Custom domain works (if configured)

---

## Monitoring and Logs

### Viewing Worker Logs

**Via Wrangler CLI:**
```bash
# Main app logs
npx wrangler tail

# Consumer worker logs
npx wrangler tail --config wrangler-consumer.toml
```

**Via Cloudflare Dashboard:**
1. Go to Workers & Pages → Select worker
2. View "Logs" tab for real-time logs
3. Check "Metrics" tab for performance

### Key Metrics to Monitor

- **Request count**: Should match user activity
- **Error rate**: Should be <1%
- **CPU time**: Should be <50ms per request
- **Queue messages**: Should process within 30 seconds

---

## Rollback Procedure

If deployment causes issues:

### 1. Via Cloudflare Dashboard
1. Go to Workers & Pages → Select worker
2. Go to "Deployments" tab
3. Click "Rollback" on previous working version

### 2. Via Wrangler CLI
```bash
# List recent deployments
npx wrangler deployments list

# Rollback to specific version
npx wrangler rollback [deployment-id]
```

### 3. Emergency Fix
1. Fix the issue in code
2. Test locally: `npm run dev`
3. Deploy hotfix: `npm run build:worker && npm run deploy`

---

## Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| **URL** | http://localhost:3000 | https://ansible.hultberg.org |
| **Database** | Shared Supabase (same as prod)* | Supabase production |
| **API Keys** | From `.dev.vars` | From Wrangler secrets |
| **Deployment** | `npm run dev` | `wrangler deploy` via CI/CD |
| **Logs** | Terminal output | Cloudflare Workers logs |

*Note: Currently using shared database for dev/prod - see [technical-debt.md](./technical-debt.md) TD-001

---

## Next Steps

After successful deployment:

1. **Set up monitoring**: Configure alerts for errors and downtime
2. **Separate dev/prod databases**: Create dedicated Supabase project for development (see technical debt TD-001)
3. **Custom domain**: Configure ansible.hultberg.org if not done
4. **User onboarding**: Implement automatic user record creation (see technical debt TD-001)
5. **Cost monitoring**: Track Perplexity API usage and Cloudflare costs
