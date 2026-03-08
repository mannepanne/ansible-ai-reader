# Environment & Secrets Setup

**When to read this:** Setting up local development, configuring secrets, or deploying to production.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions
- [ansible-outline.md](./../SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md) - Master specification

---

Configuration guide for API keys and local development environment.

## Required Environment Variables

Configuration will be stored in:
- **Local development:** `.dev.vars` file (git-ignored)
- **Production:** Cloudflare Workers secrets (via `wrangler secret put`)

### Expected Environment Variables

#### SUPABASE_URL
Supabase project URL for database and authentication.
```bash
npx wrangler secret put SUPABASE_URL
# Enter: https://xxxxx.supabase.co
```

#### SUPABASE_ANON_KEY
Supabase anonymous/public key for client-side operations.
```bash
npx wrangler secret put SUPABASE_ANON_KEY
# Enter: your Supabase anon key
```

#### SUPABASE_SERVICE_ROLE_KEY
Supabase service role key for server-side operations (bypasses RLS).
```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Enter: your Supabase service role key
```

#### READWISE_READER_TOKEN
Readwise Reader API token for fetching unread items.
```bash
npx wrangler secret put READWISE_READER_TOKEN
# Enter: your Reader API token from readwise.io/reader_api
```

#### PERPLEXITY_API_KEY
Perplexity API key for generating AI summaries.
```bash
npx wrangler secret put PERPLEXITY_API_KEY
# Enter: your Perplexity API key
```

#### RESEND_API_KEY
Resend API key for sending magic link emails.
```bash
npx wrangler secret put RESEND_API_KEY
# Enter: re_xxxxxxxxx (your Resend API key)
```

### Verifying Secrets
```bash
npx wrangler secret list               # List configured secrets
npx wrangler secret delete SECRET_NAME # Remove a secret
```

## Local Development with .dev.vars

Create a `.dev.vars` file in project root (already in `.gitignore`):
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
READWISE_READER_TOKEN=your-reader-token
PERPLEXITY_API_KEY=your-perplexity-key
RESEND_API_KEY=re_your_resend_key
```

Next.js automatically loads `.env.local` or use `wrangler dev` which loads `.dev.vars`.

## Third-Party Service Setup

### Supabase
1. Create project at supabase.com
2. Set up database schema (see [ansible-outline.md](./../SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md))
3. Enable Row Level Security (RLS) policies
4. Configure Resend SMTP for magic link emails (Settings → Auth → Email Provider)

### Readwise Reader
1. Get API token from readwise.io/reader_api
2. Token allows reading unread items and archiving

### Perplexity
1. Get API key from docs.perplexity.ai
2. Pay-as-you-go pricing (~$3-15/month for personal use)

### Resend
1. Create account at resend.com
2. Verify sending domain (ansible@hultberg.org)
3. Get API key for SMTP integration

---

**Note:** This document will be updated with actual configuration details as the project is built.
