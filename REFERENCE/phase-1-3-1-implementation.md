# Phase 1.3.1 Implementation - Basic Cloudflare Deployment

**When to read this:** Understanding Cloudflare Workers deployment, environment variable configuration, or production setup.

**Status:** ✅ Complete (PR pending)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [phase-1-1-implementation.md](./phase-1-1-implementation.md) - Next.js scaffolding
- [phase-1-2-implementation.md](./phase-1-2-implementation.md) - Database setup
- [01-foundation.md](./../SPECIFICATIONS/01-foundation.md) - Full Phase 1 specification

---

## What Was Built

Phase 1.3.1 configured Cloudflare Workers deployment and deployed the Next.js app to production on a temporary `*.workers.dev` domain.

### Technology Stack

- **Cloudflare Workers** - Serverless compute platform
- **@opennextjs/cloudflare** - Next.js adapter for Cloudflare Workers
- **Wrangler CLI** - Cloudflare Workers deployment tool

---

## Deployment Configuration

### wrangler.toml

**Location:** `/wrangler.toml`

**Configuration:**
```toml
name = "ansible-ai-reader"
main = ".open-next/worker.js"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

**Key decisions:**
- All environment variables managed as Cloudflare secrets (not in wrangler.toml)
- Avoids committing sensitive data to git
- Consistent management across all env vars (public and secret)

---

## Environment Variables

All environment variables are set as Cloudflare secrets using the Wrangler CLI.

### Required Secrets

**Phase 1.3.1 secrets:**
1. `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
2. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Client-safe Supabase key
3. `SUPABASE_SECRET_KEY` - Server-side Supabase key (bypasses RLS)
4. `RESEND_API_KEY` - Resend email API key (for Phase 2)

### Setting Secrets

**Command:**
```bash
wrangler secret put <KEY_NAME>
```

**Example session:**
```bash
# Set Supabase URL
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
# Paste: https://your-project-id.supabase.co

# Set Supabase publishable key
wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# Paste: eyJhbGc... (from Supabase Dashboard)

# Set Supabase secret key
wrangler secret put SUPABASE_SECRET_KEY
# Paste: eyJhbGc... (service role key from Supabase Dashboard)

# Set Resend API key (for Phase 2)
wrangler secret put RESEND_API_KEY
# Paste: re_... (from resend.com)
```

### Verifying Secrets

**List configured secrets:**
```bash
wrangler secret list
```

**Output:**
```
┌──────────────────────────────────────────┬────────────┐
│ Name                                     │ Type       │
├──────────────────────────────────────────┼────────────┤
│ NEXT_PUBLIC_SUPABASE_URL                 │ secret_text│
│ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY     │ secret_text│
│ SUPABASE_SECRET_KEY                      │ secret_text│
│ RESEND_API_KEY                           │ secret_text│
└──────────────────────────────────────────┴────────────┘
```

---

## Build Process

### Build Command

```bash
npm run build:worker
```

**What it does:**
1. Runs `next build` to compile the Next.js app
2. Runs `@opennextjs/cloudflare build` to bundle for Workers
3. Outputs to `.open-next/` directory:
   - `worker.js` - Worker entry point
   - `assets/` - Static assets

**Build output:**
```
Route (app)                                 Size  First Load JS
┌ ○ /                                      120 B         102 kB
└ ○ /_not-found                            998 B         103 kB
+ First Load JS shared by all             102 kB

○  (Static)  prerendered as static content
```

### Build Artifacts

```
.open-next/
├── worker.js              # Cloudflare Worker entry point
├── assets/                # Static assets (CSS, JS, images)
├── cache/                 # Next.js cache
└── server-functions/      # Server-side functions
```

---

## Deployment

### Deploy to Cloudflare Workers

**Command:**
```bash
npx wrangler deploy
```

**What happens:**
1. Uploads worker.js and assets to Cloudflare
2. Deploys to `ansible-ai-reader.workers.dev` (or custom subdomain)
3. Returns deployment URL

**Expected output:**
```
Total Upload: XX.XX KiB / gzip: YY.YY KiB
Uploaded ansible-ai-reader (1.23 sec)
Published ansible-ai-reader (0.45 sec)
  https://ansible-ai-reader.your-subdomain.workers.dev
Current Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Verifying Deployment

**Manual verification:**
1. Open deployment URL in browser
2. Verify hello world page loads
3. Check browser console for errors
4. Verify no 404s or failed asset loads

**Expected result:**
- Page loads successfully
- "Hello World" heading visible
- No console errors
- All assets load (check Network tab)

---

## File Structure

```
ansible-ai-reader/
├── wrangler.toml                      # Cloudflare Workers config
├── .open-next/                        # Build output (gitignored)
│   ├── worker.js                      # Worker entry point
│   └── assets/                        # Static assets
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Hello world page
│   │   └── layout.tsx                # Root layout
│   └── lib/
│       ├── env.ts                    # Environment validation
│       └── supabase.ts               # Supabase clients
└── package.json
```

---

## Key Decisions

### 1. All Environment Variables as Secrets

**Decision:** Store ALL environment variables (including NEXT_PUBLIC_*) as Cloudflare secrets, not in wrangler.toml [vars].

**Rationale:**
- Avoids committing project-specific values to git
- Consistent management pattern for all env vars
- Easier to rotate secrets
- Follows principle of least privilege (no values in public repo)

**Trade-off:** Requires Wrangler CLI access to view/modify environment variables (can't see them in wrangler.toml).

### 2. Temporary *.workers.dev Domain

**Decision:** Deploy to Cloudflare's `*.workers.dev` subdomain initially, configure custom domain (ansible.hultberg.org) in Phase 1.3.3.

**Rationale:**
- Validates deployment works before DNS configuration
- Allows testing production environment early
- Separates deployment concerns from domain configuration
- Easier rollback if issues arise

---

## What's NOT Included (Future Phases)

Phase 1.3.1 is **basic deployment only**. Still needed:

- ❌ Cloudflare Queues configuration (Phase 1.3.2)
- ❌ Queue consumer implementation (Phase 1.3.2)
- ❌ Custom domain configuration (Phase 1.3.3)
- ❌ Production monitoring (Phase 6)
- ❌ CI/CD automation (Phase 6)

**Next:** Phase 1.3.2 - Cloudflare Queues infrastructure

---

## Common Issues

### Issue: "No Worker environment found"

**Cause:** Not authenticated with Wrangler CLI

**Fix:**
```bash
wrangler login
# Follow browser authentication flow
```

### Issue: "Missing environment variable" in production

**Cause:** Secret not set in Cloudflare Workers

**Fix:**
```bash
# List secrets to verify
wrangler secret list

# Set missing secret
wrangler secret put <KEY_NAME>
```

### Issue: Build fails with "Cannot find module"

**Cause:** Missing dependencies or incorrect imports

**Fix:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Verify build locally
npm run build:worker
```

### Issue: "Worker threw exception" in production

**Cause:** Runtime error (often environment variable related)

**Fix:**
1. Check Cloudflare Workers dashboard → Logs
2. Verify all required secrets are set
3. Test locally: `npx wrangler dev`
4. Check error message in logs for specific cause

---

## Deployment Workflow

**Complete deployment workflow:**

1. **Build locally:**
   ```bash
   npm run build:worker
   ```

2. **Authenticate with Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Set up secrets (first time only):**
   ```bash
   wrangler secret put NEXT_PUBLIC_SUPABASE_URL
   wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   wrangler secret put SUPABASE_SECRET_KEY
   wrangler secret put RESEND_API_KEY
   ```

4. **Deploy:**
   ```bash
   npx wrangler deploy
   ```

5. **Verify:**
   - Open deployment URL
   - Check page loads
   - Verify no console errors

6. **Monitor (optional):**
   ```bash
   wrangler tail  # Stream real-time logs
   ```

---

## Testing

**Manual testing performed:**
- ✅ Build completes without errors
- ✅ wrangler.toml configured correctly
- ✅ Environment variable documentation complete

**Automated tests:** Not applicable for Phase 1.3.1 (deployment configuration phase)

**Production testing (requires Magnus):**
- ⏳ Deploy to Cloudflare Workers
- ⏳ Verify hello world page loads
- ⏳ Verify no console errors
- ⏳ Verify environment variables accessible

---

## Next Steps

**Phase 1.3.2** (next): Cloudflare Queues Infrastructure
- Create `ansible-processing-queue`
- Implement queue producer (API endpoint)
- Implement queue consumer (processes jobs)
- Write tests for queue operations

**Phase 1.3.3** (after 1.3.2): Domain Configuration
- Configure ansible.hultberg.org custom domain
- Update DNS settings
- Final production verification

---

## Commands Reference

**Build:**
```bash
npm run build:worker              # Build for Cloudflare Workers
npm run dev                       # Local development server
```

**Deploy:**
```bash
wrangler login                    # Authenticate with Cloudflare
wrangler deploy                   # Deploy to Cloudflare Workers
wrangler tail                     # Stream real-time logs
wrangler dev                      # Test locally with Workers runtime
```

**Secrets:**
```bash
wrangler secret list              # List configured secrets
wrangler secret put <KEY>         # Set a secret
wrangler secret delete <KEY>      # Delete a secret
```

**Debugging:**
```bash
wrangler tail --format=pretty     # Pretty-printed logs
wrangler tail --status=error      # Only error logs
wrangler deploy --dry-run         # Test deployment without publishing
```

---

## Resources

**Documentation:**
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [@opennextjs/cloudflare](https://opennext.js.org/cloudflare)

**Dashboards:**
- [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Resend Dashboard](https://resend.com/dashboard)
