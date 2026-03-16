# Troubleshooting Guide

**When to read this:** Debugging issues, fixing deployment problems, or resolving API integration errors.

**Related Documents:**
- [CLAUDE.md](../CLAUDE.md) - Project navigation index
- [environment-setup.md](./environment-setup.md) - Environment and secrets configuration
- [technical-debt.md](./technical-debt.md) - Known limitations and issues

---

Common issues and solutions for local development and deployment.

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

### Dependency issues
```bash
rm -rf node_modules package-lock.json
npm install
```

### Database connection issues
- Verify Supabase URL and keys in `.dev.vars`
- Check Supabase project is not paused (free tier pauses after inactivity)
- Test connection with Supabase client directly

## Deployment Issues

### Wrangler authentication errors
```bash
npx wrangler login
```

### Build failures with @cloudflare/next-on-pages
- Check Next.js version compatibility (14+)
- Verify all dependencies support edge runtime
- Review build output for unsupported APIs (e.g., fs, path)

### Production environment variables not set
```bash
npx wrangler secret list  # Check which secrets are configured
npx wrangler secret put SECRET_NAME  # Add missing secrets
```

## API Integration Issues

### Readwise Reader API
- Check token is valid at readwise.io/reader_api
- Verify token has permission to read items
- Rate limits: Check response headers for limits

### Perplexity API
- Verify API key is active
- Check billing/quota status
- Monitor token usage for costs

### Supabase Auth
- Verify Resend SMTP is configured in Supabase dashboard
- Check Resend domain is verified
- Test magic link emails in spam/junk folders

#### Magic links contain localhost:3000 in production
**Symptoms:** Magic link emails sent from production contain `redirect_to=http://localhost:3000` despite Site URL being set to production domain.

**Root cause:** Supabase Site URL setting has a caching/state bug where the first change doesn't always persist.

**Solution:** Change the Site URL field multiple times in the Supabase dashboard (Authentication → URL Configuration → Site URL). Toggle between localhost and production URL a few times until the change takes effect.

**Verification:**
1. Enable Cloudflare observability in `wrangler.toml`: `[observability] enabled = true`
2. Check logs to verify your code is sending correct `emailRedirectTo` parameter
3. Test magic link email - the `redirect_to` parameter should match your production URL
4. If still showing localhost, try changing Site URL again in Supabase dashboard

---

**Note:** This document will be updated with actual issues and solutions as they are encountered during development.
