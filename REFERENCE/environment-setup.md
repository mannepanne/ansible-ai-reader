# Environment & Secrets Setup

**When to read this:** Setting up local development, configuring secrets, or deploying to production.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions
- [phase-1-2-implementation.md](./phase-1-2-implementation.md) - Environment validation with Zod

---

Configuration guide for API keys and local development environment.

## Required Environment Variables

Configuration is stored in:
- **Local development:** `.dev.vars` file (git-ignored)
- **Production:** Cloudflare Workers secrets (via `wrangler secret put`)

### Phase 1 & 2 Variables (Currently Required)

#### NEXT_PUBLIC_SUPABASE_URL
Supabase project URL for database and authentication.

**Where to find:** Supabase Dashboard → Project Settings → API → Project URL

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
# Enter: https://xxxxx.supabase.co
```

#### NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
Supabase publishable (anon) key for client-side operations.

**Where to find:** Supabase Dashboard → Project Settings → API → Project API keys → anon/public

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# Enter: eyJhbGc...
```

#### SUPABASE_SECRET_KEY
Supabase service role key for server-side operations (bypasses RLS).

**Where to find:** Supabase Dashboard → Project Settings → API → Project API keys → service_role

**⚠️ Warning:** This key bypasses Row Level Security. Never expose it to clients.

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
# Enter: eyJhbGc...
```

#### RESEND_API_KEY
Resend API key for sending magic link emails (Phase 2).

**Where to find:** Resend Dashboard → API Keys

```bash
npx wrangler secret put RESEND_API_KEY
# Enter: re_xxxxxxxxx
```

### Phase 3 Variables (Reader Integration)

#### READER_API_TOKEN
Readwise Reader API token for fetching unread items and archiving.

**Where to find:** https://readwise.io/access_token

```bash
# For main Next.js worker
npx wrangler secret put READER_API_TOKEN
# Enter: your Reader API token

# For queue consumer worker (also needs it for Phase 4)
npx wrangler secret put READER_API_TOKEN --config wrangler-consumer.toml
```

### Phase 4 Variables (Perplexity Integration)

#### PERPLEXITY_API_KEY
Perplexity API key for generating AI summaries.

**Where to find:** https://www.perplexity.ai/settings/api

**Required for:** Queue consumer worker (processes summary generation jobs)

```bash
# Queue consumer needs this for AI summary generation
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler-consumer.toml
# Enter: pplx-...
```

**⚠️ Important:** The consumer worker will fail to process summaries without this key.

### Verifying Secrets

```bash
npx wrangler secret list               # List configured secrets
npx wrangler secret delete SECRET_NAME # Remove a secret

# For consumer worker
npx wrangler secret list --config wrangler-consumer.toml
```

---

## Local Development with .dev.vars

Create a `.dev.vars` file in project root (already in `.gitignore`):

```bash
# Phase 1 & 2 (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
RESEND_API_KEY=re_xxxxxxxxx

# Phase 3 (Reader Integration)
READER_API_TOKEN=your_reader_token

# Phase 4 (Perplexity Integration)
PERPLEXITY_API_KEY=pplx-xxxxx
```

**Usage:**
- Next.js dev server: `npm run dev` (uses `.env.local` if present)
- Cloudflare Workers dev: `npm run dev:worker` (uses `.dev.vars`)
- Queue consumer dev: `npm run dev:consumer` (uses `.dev.vars`)

---

## Third-Party Service Setup

### Supabase (Phase 1)

1. **Create Project:**
   - Go to https://supabase.com/dashboard
   - Create new project
   - Choose region (closest to users)

2. **Database Schema:**
   - Run initial schema from Phase 1.2
   - Run migrations from `supabase/migrations/`
   - See [phase-1-2-implementation.md](./phase-1-2-implementation.md) for schema details

3. **Row Level Security:**
   - All tables have RLS enabled
   - Policies ensure users can only access their own data
   - Service role key bypasses RLS for server operations

4. **Configure Resend SMTP (Phase 2):**
   - Settings → Authentication → Email Provider
   - Select "Custom SMTP"
   - Use Resend SMTP credentials

### Resend (Phase 2)

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

### Readwise Reader (Phase 3)

1. **Get API Token:**
   - Go to https://readwise.io/access_token
   - Copy your Reader API token
   - This token allows reading items and archiving

2. **API Limits:**
   - Fetch: 20 requests/minute
   - Update: 600 requests/hour
   - Rate limiting enforced via p-queue

### Perplexity (Phase 4)

1. **Get API Key:**
   - Go to https://www.perplexity.ai/settings/api
   - Sign up and create API key (starts with `pplx-`)

2. **Pricing:**
   - Pay-as-you-go
   - ~$3-15/month for personal use
   - Model: `sonar` (default, cost-effective)
   - Model: `sonar-pro` (optional, higher quality, 10x cost)

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

**Current validation (Phase 1 & 2):**
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

See REFERENCE/environment-setup.md for configuration details.
```

**Phase 3 & 4 Note:** Reader and Perplexity API keys are checked at runtime in the respective API routes and queue consumer.

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All Phase 1 & 2 secrets set via `wrangler secret put`
- [ ] Phase 3 secrets set (READER_API_TOKEN) if deploying Reader integration
- [ ] Phase 4 secrets set (PERPLEXITY_API_KEY) if deploying AI summaries
- [ ] Consumer worker secrets set (READER_API_TOKEN, PERPLEXITY_API_KEY)
- [ ] Supabase RLS policies verified
- [ ] Resend SMTP configured in Supabase
- [ ] Domain DNS configured for Resend
- [ ] Database migrations run in Supabase
- [ ] Verify secrets with `npx wrangler secret list`
- [ ] Verify consumer secrets with `npx wrangler secret list --config wrangler-consumer.toml`

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

**See Also:** [troubleshooting.md](./troubleshooting.md) for more common issues.
