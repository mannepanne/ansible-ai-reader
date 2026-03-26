# Local Development
REFERENCE > Development > Local Development

Setting up and working with the Ansible AI Reader project locally.

## When to Read This
- First-time project setup
- Running the application locally
- Debugging during development
- Understanding the dev workflow
- Testing changes before pushing

## Related Documentation
- [Environment Setup](../operations/environment-setup.md) - API keys and secrets
- [Testing Strategy](./testing-strategy.md) - Running tests
- [Code Conventions](./code-conventions.md) - Coding standards
- [Architecture - Workers](../architecture/workers.md) - Understanding the 3-worker system

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/mannepanne/ansible-ai-reader.git
cd ansible-ai-reader

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys

# 4. Run Next.js dev server
npm run dev

# Open http://localhost:3000
```

---

## Prerequisites

### Required Software

- **Node.js 20+** (LTS recommended)
- **npm** (comes with Node.js)
- **Git**

### Optional Tools

- **Wrangler CLI** (included in node_modules)
- **PostgreSQL client** (for database inspection)

### API Keys Needed

See [Environment Setup](../operations/environment-setup.md) for obtaining these:

1. **Supabase** - Database and auth (3 keys)
2. **Resend** - Email for magic links
3. **Readwise Reader** - Article syncing
4. **Perplexity** - AI summaries
5. **CRON_SECRET** - Auto-sync authentication

---

## Environment Configuration

### Create .dev.vars File

Create `.dev.vars` in project root (already in `.gitignore`):

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
```

**Generate CRON_SECRET:**
```bash
openssl rand -hex 32
```

### Validate Configuration

Environment variables are validated at startup. Missing variables will show clear error messages pointing to the [Environment Setup](../operations/environment-setup.md) guide.

---

## Development Servers

### Option 1: Next.js Dev Server (Recommended)

**Best for:** UI development, API routes, most features

```bash
npm run dev
```

- Hot reload for code changes
- Fast refresh for React components
- TypeScript type checking
- Opens at http://localhost:3000

**Limitations:**
- Queue consumer not running (summaries won't generate)
- Cron not running (auto-sync won't trigger)

### Option 2: Wrangler Dev Server

**Best for:** Testing Worker-specific features, queue processing

```bash
npm run dev:worker
```

- Runs in Cloudflare Workers environment
- More similar to production
- Slower hot reload

**Limitations:**
- Queue consumer still separate
- Requires building on changes

### Option 3: Full 3-Worker Dev Setup

**For:** Testing complete system including queue processing

**Terminal 1 - Main app:**
```bash
npm run dev
```

**Terminal 2 - Queue consumer:**
```bash
npm run dev:consumer
```

**Terminal 3 - Cron worker (optional):**
```bash
npm run dev:cron
```

**Note:** Cron worker only needed for testing automated sync. Manual syncs work without it.

---

## Development Workflow

### Standard Feature Development

1. **Create feature branch:**
   ```bash
   git checkout -b feature/feature-name
   ```

2. **Check specifications:**
   - Review `SPECIFICATIONS/` for relevant specs
   - Understand requirements and acceptance criteria

3. **Write tests first (TDD):**
   ```bash
   npm run test:watch
   ```
   - Write failing tests
   - Implement feature to make tests pass
   - Refactor while keeping tests green

4. **Run type checking:**
   ```bash
   npx tsc --noEmit
   ```

5. **Test manually:**
   - Start dev server: `npm run dev`
   - Test in browser: http://localhost:3000
   - Check console for errors

6. **Pre-commit checks:**
   ```bash
   npm test                  # All tests pass
   npx tsc --noEmit         # Type check
   git status               # Verify changes
   git diff                 # Review changes
   ```

7. **Create PR:**
   ```bash
   git add .
   git commit -m "Descriptive commit message"
   git push -u origin feature/feature-name
   gh pr create
   ```

8. **Review:**
   - Use `/review-pr` for quick validation
   - Use `/review-pr-team` for critical changes
   - Address feedback
   - Merge when approved

### Bug Fix Workflow

1. **Reproduce bug:**
   - Write failing test that demonstrates the bug
   - Verify test fails

2. **Fix bug:**
   - Implement fix
   - Verify test passes

3. **Add edge cases:**
   - Write additional tests for related edge cases
   - Prevent regression

4. **Follow standard workflow** (steps 6-8 above)

---

## Running Tests

### Watch Mode (Development)

```bash
npm run test:watch
```

- Watches for file changes
- Runs affected tests automatically
- Great for TDD workflow

### Single Run

```bash
npm test
```

- Runs all tests once
- Used in CI/CD
- Exit code indicates pass/fail

### Coverage Report

```bash
npm run test:coverage
```

- Generates coverage report
- Opens HTML report: `coverage/index.html`
- Target: 95%+ lines/functions/statements

### Specific Test File

```bash
npm test -- reader.test.ts
```

---

## Database Management

### Supabase Dashboard

Access your Supabase project:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Use SQL Editor for queries
4. Check Table Editor for data

### Running Migrations

Migrations are in `supabase/migrations/`:

```bash
# Apply all migrations (via Supabase Dashboard)
# Go to Database → Migrations → Run migrations
```

### Inspecting Data

```sql
-- Check users
SELECT * FROM users;

-- Check reader items
SELECT * FROM reader_items WHERE user_id = 'your-user-id';

-- Check jobs
SELECT * FROM jobs WHERE status = 'pending';

-- Check sync logs
SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 10;
```

---

## Debugging

### Browser DevTools

**Console errors:**
- Check browser console for JavaScript errors
- Look for network errors in Network tab

**React DevTools:**
- Install React DevTools extension
- Inspect component state and props

### Server Logs

**Next.js dev server:**
- Check terminal running `npm run dev`
- Look for API route errors
- Check for build errors

**Worker logs:**
```bash
# Consumer worker
npm run dev:consumer
# Watch logs in terminal

# Main app (Wrangler)
npm run dev:worker
# Watch logs in terminal
```

### Common Issues

**Port already in use:**
```bash
# Kill existing process
pkill -f next
# Or use different port
PORT=3001 npm run dev
```

**TypeScript errors:**
```bash
# Check all type errors
npx tsc --noEmit

# Clear cache
rm -rf .next
npm run dev
```

**Environment variables not loading:**
- Restart dev server after changing `.dev.vars`
- For Next.js, use `.env.local` instead
- Verify no trailing whitespace in values

**Database connection errors:**
- Check Supabase project is not paused (free tier)
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Test connection in Supabase Dashboard

---

## Hot Reload and Caching

### What Auto-Reloads

**Next.js dev server:**
- ✅ React components
- ✅ API routes
- ✅ Utilities and lib files
- ✅ TypeScript changes

**Requires manual restart:**
- ❌ `.dev.vars` changes
- ❌ `next.config.js` changes
- ❌ TypeScript config changes

### Clearing Caches

```bash
# Next.js cache
rm -rf .next

# Node modules (if needed)
rm -rf node_modules package-lock.json
npm install

# TypeScript cache
rm -rf .tsbuildinfo
```

---

## Testing Production-Like Behavior

### Build and Preview

```bash
# Build for production
npm run build:worker

# Deploy to preview (requires Wrangler login)
npx wrangler deploy --dry-run

# Check build output
ls -la .open-next/
```

### Local Workers Environment

```bash
# Run in Workers environment locally
npm run dev:worker

# Test with real queue processing
npm run dev:consumer
```

---

## Git Workflow

### Branch Naming

- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

### Commit Messages

**Format:**
```
Brief summary of change (50 chars or less)

Optional detailed explanation of why the change was needed.
Reference issues or requirements if relevant.

🤖 Generated with Claude Code

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Examples:**
```
Add automated sync settings UI

- Sync interval slider (0-24 hours)
- Custom summary prompt textarea
- Settings persistence in database

🤖 Generated with Claude Code

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Pre-Commit Checklist

Before committing:
- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] No secrets in code: `git diff`
- [ ] No debug code (console.logs, commented code)
- [ ] Git status clean: `git status`

---

## IDE Configuration

### VS Code (Recommended)

**Extensions:**
- ESLint
- Prettier (optional)
- TypeScript and JavaScript Language Features
- React DevTools

**Settings (.vscode/settings.json):**
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other IDEs

- Ensure TypeScript language server is enabled
- Configure path aliases (`@/` → `./src/`)
- Enable ESLint integration

---

## Performance Tips

**Faster builds:**
- Use Next.js dev server (not Wrangler) for UI work
- Only run worker dev when testing Worker-specific features

**Faster tests:**
- Use watch mode: `npm run test:watch`
- Run specific files: `npm test -- filename.test.ts`

**Faster hot reload:**
- Keep dev server running
- Only restart when changing config files

---

## Related Documentation

- [Environment Setup](../operations/environment-setup.md) - API keys and secrets
- [Testing Strategy](./testing-strategy.md) - Writing and running tests
- [Code Conventions](./code-conventions.md) - Coding standards
- [PR Review Workflow](./pr-review-workflow.md) - Creating and reviewing PRs
- [Architecture - Workers](../architecture/workers.md) - Understanding the 3-worker system
- [Operations - Deployment](../operations/deployment.md) - Production deployment
