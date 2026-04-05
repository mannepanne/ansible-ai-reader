# Environment & Secrets Setup
REFERENCE > Operations > Environment Setup

Configuration guide for API keys, secrets, and local development environment.

## When to Read This
- Setting up local development
- Configuring production secrets
- Adding new API integrations
- Troubleshooting missing environment variables

## Related Documentation
- [Deployment](./deployment.md) - Production deployment and secrets management
- [Troubleshooting](./troubleshooting.md) - Common configuration issues
- [Architecture - Database](../architecture/database-schema.md) - Database setup and migrations

---

## Required Environment Variables

Configuration is stored in:
- **Local development:** `.dev.vars` file (git-ignored)
- **Production:** Cloudflare Workers secrets (via `wrangler secret put`)

### Core Infrastructure Variables

#### NEXT_PUBLIC_SUPABASE_URL
Supabase project URL for database and authentication.

**Where to find:** Supabase Dashboard → Project Settings → API → Project URL

**Required for:** All 3 workers (main app, consumer, cron)

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
# Enter: https://xxxxx.supabase.co

npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --config wrangler-consumer.toml
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --config wrangler-cron.toml
```

#### NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
Supabase publishable (anon) key for client-side operations.

**Where to find:** Supabase Dashboard → Project Settings → API → Project API keys → anon/public

**Required for:** Main app only

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# Enter: eyJhbGc...
```

#### SUPABASE_SECRET_KEY
Supabase service role key for server-side operations (bypasses RLS).

**Where to find:** Supabase Dashboard → Project Settings → API → Project API keys → service_role

**Required for:** Main app and consumer worker

**⚠️ Warning:** This key bypasses Row Level Security. Never expose it to clients.

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
# Enter: eyJhbGc...

npx wrangler secret put SUPABASE_SECRET_KEY --config wrangler-consumer.toml
```

### Authentication Variables

#### RESEND_API_KEY
Resend API key for sending magic link emails.

**Where to find:** Resend Dashboard → API Keys

**Required for:** Main app only

```bash
npx wrangler secret put RESEND_API_KEY
# Enter: re_xxxxxxxxx
```

### Contact Form Variables

#### NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
Public site key for the Cloudflare Turnstile CAPTCHA widget on the `/contact` page.

**Where to find:** Cloudflare Dashboard → Turnstile → your site → Site Key

**⚠️ Build-time var — requires TWO registrations:**
`NEXT_PUBLIC_` variables are baked into the client bundle by Next.js at **build time**, not injected at runtime. This means it must be set in two places:

1. **Cloudflare Worker secret** (for `wrangler dev` / runtime):
   ```bash
   npx wrangler secret put NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
   ```

2. **GitHub Actions secret** (so the CI build step can bake it into the bundle):
   GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   Name: `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`

Without the GitHub secret, the production build will initialise the Turnstile widget with an empty string, making the contact form permanently un-submittable. The other `NEXT_PUBLIC_` vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) have the same requirement and are already set as GitHub secrets.

For local dev, use Cloudflare's always-pass test key: `1x00000000000000000000AA`

**Required for:** Main app only

#### CLOUDFLARE_TURNSTILE_SECRET_KEY
Secret key used server-side to verify Turnstile tokens with Cloudflare's siteverify API.

**Where to find:** Cloudflare Dashboard → Turnstile → your site → Secret Key

**⚠️ Warning:** Never expose this to the client. For local dev, use test key: `1x0000000000000000000000000000000AA`

**Required for:** Main app only

```bash
npx wrangler secret put CLOUDFLARE_TURNSTILE_SECRET_KEY
```

#### RESEND_FROM_EMAIL
The verified sender address used in the `from` field when sending contact form emails via Resend.

**Value:** Must be an address on a domain verified in your Resend account (e.g. `ansible@hultberg.org`)

**Required for:** Main app only

```bash
npx wrangler secret put RESEND_FROM_EMAIL
# Enter: ansible@hultberg.org
```

#### CONTACT_EMAIL
Recipient address for contact form submissions. Never sent to the client — lives only in the server-side worker.

**Required for:** Main app only

```bash
npx wrangler secret put CONTACT_EMAIL
# Enter: your-email@example.com
```

### Integration Variables

#### READER_API_TOKEN
Readwise Reader API token for fetching unread items and archiving.

**Where to find:** https://readwise.io/access_token

**Required for:** Main app and consumer worker

```bash
# For main Next.js worker
npx wrangler secret put READER_API_TOKEN
# Enter: your Reader API token

# For queue consumer worker
npx wrangler secret put READER_API_TOKEN --config wrangler-consumer.toml
```

#### PERPLEXITY_API_KEY
Perplexity API key for generating AI summaries.

**Where to find:** https://www.perplexity.ai/settings/api

**Required for:** Queue consumer worker only

```bash
# Queue consumer needs this for AI summary generation
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
# Enter: pplx-...
```

**⚠️ Important:** The consumer worker will fail to process summaries without this key.

### Automation Variables

#### CRON_SECRET
Secret token for authenticating Cloudflare Cron Trigger requests to the auto-sync endpoint.

**How to generate:** Use a cryptographically secure random string:
```bash
openssl rand -hex 32
```

**Purpose:** Prevents unauthorized access to the `/api/cron/auto-sync` endpoint, which runs automated syncs for all users with auto-sync enabled.

**Required for:** Main app and cron worker

```bash
# Main Next.js worker (validates the secret)
npx wrangler secret put CRON_SECRET
# Enter: your generated secret (e.g., output from openssl rand -hex 32)

# Cron worker (sends the secret)
npx wrangler secret put CRON_SECRET --config wrangler-cron.toml
```

**⚠️ Security:** Keep this secret secure. If compromised, attackers could trigger expensive sync operations for all users.

### Verifying Secrets

```bash
# Main app
npx wrangler secret list

# Consumer worker
npx wrangler secret list --config wrangler-consumer.toml

# Cron worker
npx wrangler secret list --config wrangler-cron.toml

# Delete a secret
npx wrangler secret delete SECRET_NAME
npx wrangler secret delete SECRET_NAME --config wrangler-consumer.toml
```

---

## Local Development with .dev.vars

Create a `.dev.vars` file in project root (already in `.gitignore`):

```bash
# Core Infrastructure
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...

# Authentication
RESEND_API_KEY=re_xxxxxxxxx

# Integrations
READER_API_TOKEN=your_reader_token
PERPLEXITY_API_KEY=pplx-xxxxx

# Automation
CRON_SECRET=your_generated_secret

# Contact Form (use Cloudflare's always-pass test keys for local dev)
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
CLOUDFLARE_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
RESEND_FROM_EMAIL=ansible@hultberg.org
CONTACT_EMAIL=your-email@example.com
```

**Usage:**
- Next.js dev server: `npm run dev` (uses `.env.local` if present)
- Cloudflare Workers dev: `npm run dev:worker` (uses `.dev.vars`)
- Queue consumer dev: `npm run dev:consumer` (uses `.dev.vars`)
- Cron worker dev: `npm run dev:cron` (uses `.dev.vars`)

---

## Third-Party Service Setup

### Supabase

1. **Create Project:**
   - Go to https://supabase.com/dashboard
   - Create new project
   - Choose region (closest to users)

2. **Database Schema:**
   - Run migrations from `supabase/migrations/`
   - See [database-schema.md](../architecture/database-schema.md) for schema details

3. **Row Level Security:**
   - All tables have RLS enabled
   - Policies ensure users can only access their own data
   - Service role key bypasses RLS for server operations

4. **Configure Resend SMTP:**
   - Settings → Authentication → Email Provider
   - Select "Custom SMTP"
   - Use Resend SMTP credentials (see below)

### Resend

1. **Create Account:**
   - Go to https://resend.com
   - Sign up for free tier

2. **Verify Domain:**
   - Add domain: `hultberg.org`
   - Add DNS records as instructed
   - Wait for verification

3. **Get API Key:**
   - Dashboard → API Keys
   - Create new API key
   - Copy key (starts with `re_`)

4. **Configure in Supabase:**
   - Supabase → Settings → Authentication → Email Provider
   - SMTP Host: `smtp.resend.com`
   - SMTP Port: `465`
   - SMTP User: `resend`
   - SMTP Pass: Your Resend API key
   - Sender email: `noreply@hultberg.org`

### Cloudflare Turnstile

Used for CAPTCHA on the `/contact` page.

1. **Create a Turnstile site:**
   - Cloudflare Dashboard → Turnstile → Add site
   - Name: `Ansible`
   - Domain: `ansible.hultberg.org`
   - Widget type: Managed (recommended)

2. **Copy keys:**
   - Site Key → `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`
   - Secret Key → `CLOUDFLARE_TURNSTILE_SECRET_KEY`

3. **Local development:** Use the always-pass test keys (see `.dev.vars` example above) — no Cloudflare account needed locally.

### Readwise Reader

1. **Get API Token:**
   - Go to https://readwise.io/access_token
   - Copy your Reader API token
   - This token allows reading items and archiving

2. **API Limits:**
   - Fetch: 20 requests/minute
   - Update: 600 requests/hour
   - Rate limiting enforced via p-queue

### Perplexity

1. **Get API Key:**
   - Go to https://www.perplexity.ai/settings/api
   - Sign up and create API key (starts with `pplx-`)

2. **Pricing:**
   - Pay-as-you-go
   - ~$3-15/month for personal use
   - Model: `sonar-pro` (good balance of quality and cost)

3. **Rate Limits:**
   - 50 requests/minute (enforced via p-queue)
   - 90-second timeout per request

4. **Token Limits:**
   - Max input: ~4096 tokens (~30k characters)
   - Smart truncation applied automatically

---

## Environment Variable Validation

Environment variables are validated at startup using Zod.

**Validation file:** `src/lib/env.ts`

**Current validation:**
```typescript
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().startsWith('re_'),
});
```

**Missing variables error:**
If any required variable is missing, you'll see:
```
Missing required environment variables:
  NEXT_PUBLIC_SUPABASE_URL: Required
  RESEND_API_KEY: String must start with "re_"

See REFERENCE/operations/environment-setup.md for configuration details.
```

**Note:** Reader, Perplexity, and Cron secrets are checked at runtime in the respective API routes and workers.

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All core infrastructure secrets set via `wrangler secret put`
- [ ] Main app secrets set (10 secrets)
- [ ] `NEXT_PUBLIC_` vars also set as GitHub Actions secrets (baked at build time — see note above)
- [ ] Consumer worker secrets set (4 secrets)
- [ ] Cron worker secrets set (2 secrets)
- [ ] Supabase RLS policies verified
- [ ] Resend SMTP configured in Supabase
- [ ] Domain DNS configured for Resend
- [ ] Database migrations run in Supabase
- [ ] Verify all secrets: `npx wrangler secret list` (for each worker)
- [ ] CRON_SECRET matches in both main app and cron worker

---

## Secrets Summary by Worker

### Main App (`wrangler.toml`)
1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. `SUPABASE_SECRET_KEY`
4. `RESEND_API_KEY`
5. `READER_API_TOKEN`
6. `CRON_SECRET`
7. `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`
8. `CLOUDFLARE_TURNSTILE_SECRET_KEY`
9. `RESEND_FROM_EMAIL`
10. `CONTACT_EMAIL`

### Consumer Worker (`wrangler-consumer.toml`)
1. `NEXT_PUBLIC_SUPABASE_URL`
2. `SUPABASE_SECRET_KEY`
3. `READER_API_TOKEN`
4. `PERPLEXITY_API_KEY`

### Cron Worker (`wrangler-cron.toml`)
1. `CRON_SECRET`
2. `NEXT_PUBLIC_SUPABASE_URL`

---

## Troubleshooting

**Error: "Missing required environment variables"**
- Check `.dev.vars` file exists and has all required variables
- For production, verify secrets with `wrangler secret list`

**Error: "Invalid Reader API token"**
- Verify token at https://readwise.io/access_token
- Check token is set in both workers if using queue consumer

**Error: "SMTP configuration error"**
- Verify Resend API key in Supabase
- Check domain is verified in Resend
- Test with Supabase Auth test email

**Error: "CRON_SECRET mismatch"**
- Verify secret is identical in main app and cron worker
- Use `npx wrangler secret list` to check both workers
- Regenerate if needed using `openssl rand -hex 32`

**See Also:** [troubleshooting.md](./troubleshooting.md) for more common issues.

---

## Related Documentation

- [Deployment](./deployment.md) - Production deployment process
- [Monitoring](./monitoring.md) - Checking logs and debugging
- [Troubleshooting](./troubleshooting.md) - Common configuration issues
- [Architecture - Database](../architecture/database-schema.md) - Database schema and migrations
