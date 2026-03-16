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

**Current Status:** ✅ Phase 4 Complete - Fully functional application with 237 tests passing

**Complete architecture diagram:** [REFERENCE/architecture.md](./REFERENCE/architecture.md)

## Implementation Phases

Development is organized into 6 numbered phases with clear deliverables, testing requirements, and PR workflows:

1. ✅ **Phase 1: Foundation** - [Archived](./SPECIFICATIONS/ARCHIVE/01-foundation.md) - Completed Mar 10, 2026
2. ✅ **Phase 2: Authentication** - [Archived](./SPECIFICATIONS/ARCHIVE/02-authentication.md) - Completed Mar 12, 2026
3. ✅ **Phase 3: Reader Integration** - [Archived](./SPECIFICATIONS/ARCHIVE/03-reader-integration.md) - Completed Mar 14, 2026
4. ✅ **Phase 4: Perplexity Integration** - [Archived](./SPECIFICATIONS/ARCHIVE/04-perplexity-integration.md) - Completed Mar 15, 2026 (237 tests)
5. 🚧 **Phase 5: Notes & Rating** - [05-notes-rating-polish.md](./SPECIFICATIONS/05-notes-rating-polish.md) - Document notes, ratings, settings
6. 📋 **Phase 6: Launch** - [06-launch.md](./SPECIFICATIONS/06-launch.md) - Documentation, monitoring, final testing

**Current phase:** Phase 4 Complete - Core functionality delivered, ready for Phase 5 (polish features)

### Phase Summaries

**Phase 1: Foundation (Completed Mar 10, 2026)**
- Next.js 15 + Cloudflare Workers + Supabase + Cloudflare Queues
- 26 tests passing with 95%+ coverage
- See: [phase-1-completion-summary.md](./REFERENCE/phase-1-completion-summary.md)

**Phase 2: Authentication (Completed Mar 12, 2026)**
- Magic link authentication with Supabase Auth + Resend SMTP
- Protected routes with middleware and session management
- 22 new tests (64 total passing)
- See: [phase-2-implementation.md](./REFERENCE/phase-2-implementation.md)

**Phase 3: Reader Integration (Completed Mar 14, 2026)**
- Reader API client with rate limiting and pagination
- Sync, archive, retry, and status polling endpoints
- Queue consumer worker for async processing
- Full UI implementation with real-time progress
- 56 new tests (120 total passing)
- See: [phase-3-implementation.md](./REFERENCE/phase-3-implementation.md)

**Phase 4: Perplexity Integration (Completed Mar 15, 2026)**
- AI summary generation via Perplexity API (sonar-pro model)
- Markdown-formatted summaries with ReactMarkdown rendering
- AI tag generation (3-10 tags per item)
- Tag regeneration for existing items
- Content truncation handling (30k char limit)
- Token usage tracking for cost monitoring
- 117 new tests (237 total passing)
- See: [phase-4-implementation.md](./REFERENCE/phase-4-implementation.md) *(to be created)*

**Recent Improvements (Mar 16, 2026):**
- Fixed archived items reappearing bug (#15)
- Moved "Regenerate Tags" button to header (#14)
- Fixed magic link localhost issue (Supabase Site URL caching)
- Added ReactMarkdown rendering for beautiful summary formatting
- Created comprehensive architecture documentation

### SPECIFICATIONS/
- **Implementation phases** (numbered files) - Active work-in-progress
- **ORIGINAL\_IDEA/** - Master spec and naming inspiration
- **ARCHIVE/** - Completed specs (move here when phase complete)

### REFERENCE/
How-it-works documentation for implemented features:

**Essential Docs:**
- [architecture.md](./REFERENCE/architecture.md) - **START HERE** - Complete system architecture with Mermaid diagram
- [deployment-guide.md](./REFERENCE/deployment-guide.md) - Production deployment, CI/CD setup, Cloudflare Workers
- [testing-strategy.md](./REFERENCE/testing-strategy.md) - Testing philosophy, 237 tests, 95%+ coverage
- [environment-setup.md](./REFERENCE/environment-setup.md) - API keys and environment configuration
- [troubleshooting.md](./REFERENCE/troubleshooting.md) - Common issues and solutions (includes Supabase quirks)
- [technical-debt.md](./REFERENCE/technical-debt.md) - Known issues and accepted risks

**Implementation Documentation:**
- [phase-1-completion-summary.md](./REFERENCE/phase-1-completion-summary.md) - Phase 1 high-level overview
- [phase-1-1-implementation.md](./REFERENCE/phase-1-1-implementation.md) - Next.js scaffolding & build setup
- [phase-1-2-implementation.md](./REFERENCE/phase-1-2-implementation.md) - Database schema & Supabase clients
- [phase-1-3-1-implementation.md](./REFERENCE/phase-1-3-1-implementation.md) - Cloudflare deployment & secrets
- [phase-1-3-2-implementation.md](./REFERENCE/phase-1-3-2-implementation.md) - Queues infrastructure
- [phase-2-implementation.md](./REFERENCE/phase-2-implementation.md) - Magic link auth, Supabase SSR clients
- [phase-3-implementation.md](./REFERENCE/phase-3-implementation.md) - Reader API client, sync operations, queue consumer
- [pr-review-workflow.md](./REFERENCE/pr-review-workflow.md) - `/review-pr` and `/review-pr-team` skills

Practice is to aim to not allow CLAUDE.md files to grow very large (300+ lines), but keep CLAUDE.md files short and snappy, with relevant details broken out in separate reference files clearly linked with succinct summaries as above. CLAUDE.md files work as "library index" to find the right context when it's needed, and in that way minimise use of tokens.

## Code Conventions

### File Headers
```typescript
// ABOUT: Brief description of file purpose
// ABOUT: Key functionality or responsibility
```

### Naming
- Descriptive names: `AUTH_KV` not `KV1`
- TypeScript conventions: camelCase (variables), PascalCase (types)
- Avoid temporal references: no "new", "improved", "old"

### Comments
- Evergreen (describe what code does, not recent changes)
- Minimal (code should be self-documenting)
- Explain complex logic and non-obvious decisions

## Development Workflow

**CRITICAL: ALL changes to main MUST go through a pull request. NEVER merge or push directly to main.**

1. **Create feature branch:** `git checkout -b feature/feature-name`
2. **Check specifications:** Review `SPECIFICATIONS/` for relevant specs
3. **Implement with tests:** `npm test && npx tsc --noEmit`
4. **Create PR for review:**
   - **`/review-pr`** - Fast single-reviewer (regular PRs, 1-2 min)
   - **`/review-pr-team`** - Multi-perspective agent team (critical changes, 5-10 min)
   - **See:** [pr-review-workflow.md](./REFERENCE/pr-review-workflow.md) for complete guide
5. **Wait for approval:** Do not merge until PR is reviewed and approved
6. **Merge only after approval:** Once approved, merge to main (auto-deploys via CI/CD)

**Why this matters:**
- CI/CD automatically deploys from main to production
- Main branch must only contain reviewed, tested code
- PR reviews catch security issues, missing tests, and design problems

## TypeScript Configuration

- Target: ESNext for Next.js/Cloudflare Workers runtime
- Strict mode enabled
- Path alias: `@/` maps to `./src/` (Next.js convention)
- React 19 and Next.js 15 types included
- Configured with `@cloudflare/next-on-pages` adapter

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

**Coverage target:** 100% (enforced minimums: 95% lines/functions/statements, 90% branches)

**See:** [testing-strategy.md](./REFERENCE/testing-strategy.md) for complete details

## Quick Reference Links

**Planning & Specs:**
- **Project outline** → [ansible-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)
- **Naming inspiration** → [Naming-the-Ansible-of-Thoth.md](./SPECIFICATIONS/ORIGINAL_IDEA/Naming-the-Ansible-of-Thoth.md)
- **Implementation phases** → See section above or [SPECIFICATIONS/](./SPECIFICATIONS/)
- **Completed specs** → [ARCHIVE/](./SPECIFICATIONS/ARCHIVE/)

**Reference Docs:**
- **How does the system work?** → [architecture.md](./REFERENCE/architecture.md) - **START HERE**
- **Deploying to production?** → [deployment-guide.md](./REFERENCE/deployment-guide.md)
- **Setting up environment?** → [environment-setup.md](./REFERENCE/environment-setup.md)
- **Testing strategy?** → [testing-strategy.md](./REFERENCE/testing-strategy.md)
- **Known issues?** → [technical-debt.md](./REFERENCE/technical-debt.md)
- **Getting unstuck?** → [troubleshooting.md](./REFERENCE/troubleshooting.md)
