# CLAUDE.md

Navigation index and quick reference for working with this project.

## Rules of Engagement

Collaboration principles and ways of working: @.claude/CLAUDE.md
When asked to remember anything, add project memory in this CLAUDE.md (project root), not @.claude/CLAUDE.md.

## Project Overview

**Ansible** is an AI-powered system for **depth-of-engagement triage** of content saved to Readwise Reader. It generates AI summaries of unread items, enabling you to decide what deserves full reading versus consuming just the key takeaways.

**Name inspiration:** Ursula Le Guin's ansible (instant communication device) + Book of Thoth (universal knowledge)

**Core workflow:**
1. Sync unread items from Readwise Reader
2. Generate AI summaries via Perplexity API
3. Review summaries, add notes, and rate interest (0-5)
4. Archive items (syncs back to Reader) or read in full

**Full specification:** [ansible-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)

## Architecture Overview

**Stack:**
- **Framework**: Next.js 15 (App Router), React 19
- **Runtime**: Cloudflare Workers (via `@cloudflare/next-on-pages`)
- **Database**: Supabase (PostgreSQL + Auth)
- **Queues**: Cloudflare Queues (async job processing)
- **UI**: ReactMarkdown for formatted summaries
- **Email**: Resend (magic link authentication)
- **Domain**: ansible.hultberg.org

**Key Integrations:**
- Readwise Reader API (fetch/sync articles)
- Perplexity API (sonar-pro model for AI summaries)
- Supabase Auth (magic links via Resend)

**Current Status:** ✅ Fully functional application with 237 tests passing (95%+ coverage)

**Complete architecture:** [REFERENCE/architecture/](./REFERENCE/architecture/) - 3-worker system, database schema, auth patterns

## Finding Documentation

Documentation is organized by **function** (what you're trying to do), not build chronology:

### 📐 Understanding the System
**[REFERENCE/architecture/](./REFERENCE/architecture/)** - How it works
- System overview (3-worker architecture, tech stack)
- Database schema (tables, RLS policies)
- Workers (main app, queue consumer, cron)
- Authentication (magic links, 3 client types)
- API design (REST conventions)

### ✨ Working with Features
**[REFERENCE/features/](./REFERENCE/features/)** - User-facing functionality
- Reader sync (API integration, pagination, archiving)
- AI summaries (Perplexity, content truncation, token tracking)
- Automated sync (cron worker, intervals, settings)
- Settings (sync intervals, custom prompts)
- Tags (AI generation, regeneration)

### 🚀 Deploying & Operating
**[REFERENCE/operations/](./REFERENCE/operations/)** - Production deployment
- Deployment (3-worker setup, CI/CD, secrets)
- Environment setup (API keys, .dev.vars)
- Monitoring (logs, metrics, debugging)
- Troubleshooting (common issues, RLS errors, queue problems)

### 💻 Contributing Code
**[REFERENCE/development/](./REFERENCE/development/)** - Dev workflow
- Local development (setup, running tests, debugging)
- Testing strategy (TDD, 95%+ coverage, patterns)
- Code conventions (ABOUT comments, naming, style)
- PR review workflow (`/review-pr` vs `/review-pr-team`)

### 🏗️ Learning Patterns
**[REFERENCE/patterns/](./REFERENCE/patterns/)** - Implementation patterns
- Service role client (safely bypassing RLS)
- API validation (Zod, prompt injection prevention)
- Queue processing (retries, DLQ, monitoring)
- Error handling (logging, user messages, debugging)

## Quick Navigation

**Most common needs:**
- **"How do I deploy?"** → [REFERENCE/operations/deployment.md](./REFERENCE/operations/deployment.md)
- **"How do I run locally?"** → [REFERENCE/development/local-development.md](./REFERENCE/development/local-development.md)
- **"How does X work?"** → Browse [REFERENCE/](./REFERENCE/) by category above
- **"Something broke!"** → [REFERENCE/operations/troubleshooting.md](./REFERENCE/operations/troubleshooting.md)
- **"What are the conventions?"** → [REFERENCE/development/code-conventions.md](./REFERENCE/development/code-conventions.md)

**Planning new features:**
- **Active specs** → [SPECIFICATIONS/](./SPECIFICATIONS/) (numbered phases)
- **Completed specs** → [SPECIFICATIONS/ARCHIVE/](./SPECIFICATIONS/ARCHIVE/)
- **Implementation history** → [SPECIFICATIONS/ARCHIVE/implementation/](./SPECIFICATIONS/ARCHIVE/implementation/) (phase docs)

**Other important docs:**
- **Technical debt** → [REFERENCE/technical-debt.md](./REFERENCE/technical-debt.md)
- **Project outline** → [SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)

## Development Workflow

**⚠️ CRITICAL: ALL CODE CHANGES REQUIRE A FEATURE BRANCH + PR ⚠️**

### Step 0: Pre-Implementation Check (DO THIS FIRST!)

**BEFORE writing ANY code for features, bug fixes, or code changes:**

- [ ] Check current branch: `git branch` - Am I on main?
- [ ] Is this a code change? (not just documentation)
- [ ] If yes to both: **CREATE FEATURE BRANCH FIRST**
- [ ] Run: `git checkout -b feature/descriptive-name` or `fix/bug-name`

**If you cannot check all boxes, STOP and ask the user before proceeding.**

**The ONLY exceptions** (can commit to main without PR):
- Documentation-only changes (CLAUDE.md, README.md, SPECIFICATIONS/*.md)
- .gitignore or config file updates
- Emergency hotfixes (create retroactive PR immediately)

**If unsure, the answer is: YES, create a feature branch.**

---

### Implementation Steps

1. **Create feature branch** (see Step 0 above - ALREADY DONE)
2. **Check specifications:** Review `SPECIFICATIONS/` for relevant specs
3. **Implement with tests:** `npm test && npx tsc --noEmit`
4. **Create PR for review:**
   - **`/review-pr`** - Fast single-reviewer (regular PRs, 1-2 min)
   - **`/review-pr-team`** - Multi-perspective agent team (critical changes, 5-10 min)
   - **See:** [REFERENCE/development/pr-review-workflow.md](./REFERENCE/development/pr-review-workflow.md)
5. **Wait for approval:** Do not merge until PR is reviewed and approved
6. **Merge only after approval:** Once approved, merge to main (auto-deploys via CI/CD)

**Why this matters:**
- CI/CD automatically deploys from main to production
- Main branch must only contain reviewed, tested code
- PR reviews catch security issues, missing tests, and design problems

## Testing

Tests serve dual purpose:
1. **Validation** - Verify code works
2. **Directional Context** - Guide AI development

**Commands:**
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

**Coverage target:** 95%+ lines/functions/statements, 90%+ branches

**Current status:** 237 tests passing

**See:** [REFERENCE/development/testing-strategy.md](./REFERENCE/development/testing-strategy.md)

## TypeScript Configuration

- Target: ESNext for Next.js/Cloudflare Workers runtime
- Strict mode enabled
- Path alias: `@/` maps to `./src/` (Next.js convention)
- React 19 and Next.js 15 types included
- Configured with `@cloudflare/next-on-pages` adapter

## Implementation Phases

Development followed 6 sequential phases (all completed or in progress):

1. ✅ **Phase 1: Foundation** - [Archived](./SPECIFICATIONS/ARCHIVE/01-foundation.md) (Mar 10, 2026)
2. ✅ **Phase 2: Authentication** - [Archived](./SPECIFICATIONS/ARCHIVE/02-authentication.md) (Mar 12, 2026)
3. ✅ **Phase 3: Reader Integration** - [Archived](./SPECIFICATIONS/ARCHIVE/03-reader-integration.md) (Mar 14, 2026)
4. ✅ **Phase 4: Perplexity Integration** - [Archived](./SPECIFICATIONS/ARCHIVE/04-perplexity-integration.md) (Mar 15, 2026)
5. 🚧 **Phase 5: Notes & Rating** - [05-notes-rating-polish.md](./SPECIFICATIONS/05-notes-rating-polish.md)
6. 📋 **Phase 6: Launch** - [06-launch.md](./SPECIFICATIONS/06-launch.md)

**Implementation details:** [SPECIFICATIONS/ARCHIVE/implementation/](./SPECIFICATIONS/ARCHIVE/implementation/) (historical phase-based docs)

---

**Practice:** Keep CLAUDE.md files short (<300 lines). Details go in REFERENCE/ subdirectories. CLAUDE.md works as a "library index" - find the right context when needed, minimize token usage.
