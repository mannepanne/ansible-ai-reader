# Phase 1.1 Implementation - Next.js Scaffolding

**When to read this:** Understanding the current Next.js setup, build process, or testing infrastructure.

**Status:** ✅ Complete (merged PR #2, Mar 9 2026)

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [testing-strategy.md](./testing-strategy.md) - Testing philosophy and approach
- [01-foundation.md](./../SPECIFICATIONS/01-foundation.md) - Full Phase 1 specification

---

## What Was Built

Phase 1.1 established the foundational Next.js application with Cloudflare Workers deployment support.

### Technology Stack

- **Next.js 15.5.12** with App Router
- **React 19** (automatic JSX transformation)
- **TypeScript 5** (strict mode enabled)
- **Tailwind CSS 4.0** (utility-first styling)
- **Vitest 2.x** (testing framework)
- **@opennextjs/cloudflare 1.17.1** (Cloudflare Workers adapter)
- **Wrangler 4.x** (Cloudflare deployment CLI)

### Project Structure

```
ansible-ai-reader/
├── src/
│   └── app/                    # Next.js App Router
│       ├── globals.css         # Tailwind base styles
│       ├── layout.tsx          # Root layout component
│       ├── layout.test.tsx     # Layout tests
│       ├── page.tsx            # Home page (hello world)
│       └── page.test.tsx       # Home page tests
├── .open-next/                 # Build output (gitignored)
├── open-next.config.ts         # OpenNext configuration
├── wrangler.toml               # Cloudflare Workers config
├── vitest.config.ts            # Test framework config
├── next.config.ts              # Next.js configuration
├── tailwind.config.ts          # Tailwind configuration
└── tsconfig.json               # TypeScript configuration
```

### Build Commands

```bash
# Development
npm run dev                      # Start Next.js dev server (localhost:3000)

# Testing
npm test                         # Run tests with Vitest
npm run test:watch              # Run tests in watch mode
npm run test:coverage           # Generate coverage report

# Production Build
npm run build                   # Build Next.js application
npm run build:worker            # Build Cloudflare Worker

# Type Checking
npx tsc --noEmit                # Run TypeScript type checking
```

### Build Process

1. **Next.js Build** (`npm run build`):
   - Compiles TypeScript to JavaScript
   - Generates optimized static assets
   - Creates production-ready bundles
   - Output: `.next/` directory

2. **Worker Build** (`npm run build:worker`):
   - Uses `@opennextjs/cloudflare` adapter
   - Transforms Next.js output for Cloudflare Workers
   - Bundles middleware and server functions
   - Output: `.open-next/worker.js`

### Testing Infrastructure

**Framework:** Vitest 2.x with jsdom environment

**Configuration highlights:**
- Coverage thresholds: 95% lines/functions/statements, 90% branches
- Automatic JSX transformation (esbuild)
- TypeScript path alias support (`@/` → `./src/`)
- Config files excluded from coverage

**Current tests:**
- `layout.test.tsx` - Root layout component (5 tests)
- `page.test.tsx` - Home page rendering (3 tests)
- **Total: 8 tests, 100% coverage on source files**

**Test commands:**
```bash
npm test                         # Run all tests once
npm run test:watch              # Watch mode (re-run on changes)
npm run test:coverage           # Generate coverage report (v8)
```

### TypeScript Configuration

**Key settings:**
- Target: `ESNext` (modern JavaScript features)
- Module: `esnext` with bundler resolution
- Strict mode: `true` (maximum type safety)
- Path alias: `@/*` maps to `./src/*`
- JSX: `preserve` (Next.js handles transformation)

**Type-checking:**
```bash
npx tsc --noEmit    # Check types without generating files
```

### Tailwind CSS Setup

**Version:** 4.0

**Configuration:**
- Content paths: `src/pages/**`, `src/components/**`, `src/app/**`
- Dark mode: `media` query based
- Custom CSS variables: `--background`, `--foreground`

**Global styles** (`src/app/globals.css`):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom CSS variables for theming */
```

### Cloudflare Workers Configuration

**Adapter:** `@opennextjs/cloudflare`

**wrangler.toml:**
```toml
name = "ansible-ai-reader"
main = ".open-next/worker.js"
compatibility_date = "2026-03-06"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

**open-next.config.ts:**
```typescript
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
```

**Deployment** (not yet configured):
```bash
npm run deploy    # Will deploy to Cloudflare Pages (requires setup)
```

---

## What's NOT Included (Phase 1.2 & 1.3)

Phase 1.1 is **scaffolding only**. Still needed:

- ❌ Supabase database (Phase 1.2)
- ❌ Database schema and migrations (Phase 1.2)
- ❌ Row-Level Security policies (Phase 1.2)
- ❌ Environment variable validation (Phase 1.2)
- ❌ Cloudflare Queues (Phase 1.3)
- ❌ Resend email configuration (Phase 1.3)
- ❌ Production deployment to ansible.hultberg.org (Phase 1.3)

**Next:** See [Issue #3](https://github.com/mannepanne/ansible-ai-reader/issues/3) (Phase 1.2) and [Issue #4](https://github.com/mannepanne/ansible-ai-reader/issues/4) (Phase 1.3)

---

## File Conventions

All TypeScript files include ABOUT comments:
```typescript
// ABOUT: Brief description of file purpose
// ABOUT: Key functionality or responsibility
```

Example:
```typescript
// ABOUT: Home page - Hello world for Phase 1
// ABOUT: Will be replaced with login redirect in Phase 2
```

---

## Known Issues & Limitations

**Vite CJS Deprecation Warning:**
```
The CJS build of Vite's Node API is deprecated.
```
- **Impact:** Warning only, tests work correctly
- **Fix:** Will be resolved when Vitest updates to Vite ESM API
- **Action:** No action needed, warning can be ignored

**jsdom HTML Nesting Warning:**
```
In HTML, <html> cannot be a child of <div>.
```
- **Impact:** Warning only, tests pass correctly
- **Cause:** Testing library renders components in isolation
- **Action:** No action needed, expected behavior for component tests

---

## Git Workflow

**Branch:** `phase-1-foundation` (now merged to `main`)
**PR:** #2 - "Phase 1.1: Next.js Scaffolding with Cloudflare Workers Support"
**Commits:** 2 commits (squashed on merge)

1. Initial scaffolding with OpenNext configuration
2. Coverage fixes (added layout tests, excluded config files)

---

## Coverage Report

**Final coverage (Phase 1.1):**
```
File               | % Stmts | % Branch | % Funcs | % Lines
-------------------|---------|----------|---------|--------
All files          |     100 |      100 |     100 |     100
 src/app           |     100 |      100 |     100 |     100
  layout.test.tsx  |     100 |      100 |     100 |     100
  layout.tsx       |     100 |      100 |     100 |     100
  page.test.tsx    |     100 |      100 |     100 |     100
  page.tsx         |     100 |      100 |     100 |     100
```

**Note:** Config files (*.config.ts) are excluded from coverage as they contain no testable logic.

---

## Next Steps

**Phase 1.2** (next): Supabase Database Setup
- Create Supabase project
- Implement database schema (4 tables)
- Add Row-Level Security policies
- Environment variable validation
- See [Issue #3](https://github.com/mannepanne/ansible-ai-reader/issues/3)

**Phase 1.3** (later): Cloudflare Queues and Deployment
- Configure Cloudflare Queues
- Set up Resend email
- Deploy to ansible.hultberg.org
- See [Issue #4](https://github.com/mannepanne/ansible-ai-reader/issues/4)
