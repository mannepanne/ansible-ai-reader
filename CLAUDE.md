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
- **Framework**: Next.js 15+ (App Router)
- **Styling**: Tailwind CSS 4.0
- **Database**: Supabase (Postgres + Auth)
- **Email**: Resend (magic link authentication)
- **Deployment**: Cloudflare Workers (via `@opennextjs/cloudflare`)
- **Domain**: ansible.hultberg.org

**Key Integrations:**
- Readwise Reader API (fetch/sync articles)
- Perplexity API (generate summaries)
- Supabase Auth (magic links via Resend)

**Current Status:** ✅ Phase 1 Complete - Ready for Phase 2 (Authentication)

## Implementation Phases

Development is organized into 6 numbered phases with clear deliverables, testing requirements, and PR workflows:

1. ✅ **Phase 1: Foundation** - [Archived](./SPECIFICATIONS/ARCHIVE/01-foundation.md) - Completed Mar 10, 2026
2. **Phase 2: Authentication** - [02-authentication.md](./SPECIFICATIONS/02-authentication.md) - Magic link with Supabase Auth (Next)
3. **Phase 3: Reader Integration** - [03-reader-integration.md](./SPECIFICATIONS/03-reader-integration.md) - Fetch and sync unread items
4. **Phase 4: Perplexity Integration** - [04-perplexity-integration.md](./SPECIFICATIONS/04-perplexity-integration.md) - Auto-generate summaries and tags
5. **Phase 5: Notes & Rating** - [05-notes-rating-polish.md](./SPECIFICATIONS/05-notes-rating-polish.md) - Document notes, ratings, settings
6. **Phase 6: Launch** - [06-launch.md](./SPECIFICATIONS/06-launch.md) - Documentation, monitoring, final testing

**Current phase:** Phase 2 (Authentication) - Ready to start

**Phase 1 Summary (Completed):**
- ✅ **Phase 1.1** - Next.js scaffolding (PR #2)
- ✅ **Phase 1.2** - Database setup (PR #5)
- ✅ **Phase 1.3.1** - Cloudflare deployment (PR #6)
- ✅ **Phase 1.3.2** - Queues producer (PR #7)
- ✅ **Phase 1.3.3** - Domain & secrets (concurrent with 1.3.1)
- **Deliverables:** Next.js 15 + Cloudflare Workers + Supabase + Queues + 26 tests passing

### SPECIFICATIONS/
- **Implementation phases** (numbered files) - Active work-in-progress
- **ORIGINAL\_IDEA/** - Master spec and naming inspiration
- **ARCHIVE/** - Completed specs (move here when phase complete)

### REFERENCE/
How-it-works documentation for implemented features:

**Phase 1 Implementation Docs:**
- [phase-1-1-implementation.md](./REFERENCE/phase-1-1-implementation.md) - Next.js scaffolding & build setup
- [phase-1-2-implementation.md](./REFERENCE/phase-1-2-implementation.md) - Database schema & Supabase clients
- [phase-1-3-1-implementation.md](./REFERENCE/phase-1-3-1-implementation.md) - Cloudflare deployment & secrets
- [phase-1-3-2-implementation.md](./REFERENCE/phase-1-3-2-implementation.md) - Queues infrastructure & getCloudflareContext

**General Docs:**
- [testing-strategy.md](./REFERENCE/testing-strategy.md) - Testing philosophy and approach
- [technical-debt.md](./REFERENCE/technical-debt.md) - Known issues and accepted risks
- [environment-setup.md](./REFERENCE/environment-setup.md) - API keys and environment configuration
- [troubleshooting.md](./REFERENCE/troubleshooting.md) - Common issues and solutions

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

1. Create feature branch: `git checkout -b feature/feature-name`
2. Check `SPECIFICATIONS/` for relevant specs
3. Implement with tests: `npm test && npx tsc --noEmit`
4. Create PR for review:
  - **`/review-pr`** - Fast single-reviewer (regular PRs, 1-2 min)
  - **`/review-pr-team`** - Multi-perspective agent team (critical changes, 5-10 min)
  - **See:** [pr-review-workflow.md](./REFERENCE/pr-review-workflow.md) for complete guide

## TypeScript Configuration

- Target: ESNext for Next.js/Cloudflare Workers runtime
- Strict mode enabled
- Path alias: `@/` maps to `./src/` (Next.js convention)
- React 19 and Next.js 15 types included
- Configured with `@opennextjs/cloudflare` adapter

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
- **Setting up environment?** → [environment-setup.md](./REFERENCE/environment-setup.md)
- **Testing strategy?** → [testing-strategy.md](./REFERENCE/testing-strategy.md)
- **Known issues?** → [technical-debt.md](./REFERENCE/technical-debt.md)
- **Getting unstuck?** → [troubleshooting.md](./REFERENCE/troubleshooting.md)
