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
3. Review summaries, add notes, and rate items (interesting/not interesting)
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

**Current Status:** ✅ Fully functional application with a comprehensive test suite passing (95%+ coverage)

**Complete architecture:** [REFERENCE/architecture/](./REFERENCE/architecture/) - worker system (3 core + relay bridge), database schema, auth patterns

## Finding Documentation

Documentation is organized by **function** (what you're trying to do), not build chronology:

### 📐 Understanding the System
**[REFERENCE/architecture/](./REFERENCE/architecture/)** - How it works
- System overview (worker architecture: 3 core + relay bridge, tech stack)
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
- Deployment (4-worker setup, CI/CD, secrets)
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
- **Architecture decisions?** → [decisions/](./REFERENCE/decisions/) - ADRs explaining why things are this way

**Other important docs:**
- **Known issues?** → [GitHub Issues — technical-debt label](https://github.com/mannepanne/ansible-ai-reader/issues?q=is%3Aissue+label%3Atechnical-debt+is%3Aopen)
- **Project outline** → [SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)

## Development Workflow

**ALL code changes require a feature branch + PR.** See [.claude/CLAUDE.md](./.claude/CLAUDE.md) for branching rules and Definition of Done.

**Implementation steps:**
1. Create feature branch (`feature/name` or `fix/name`)
2. Write or review spec in `SPECIFICATIONS/`
3. Run `/review-spec <spec-file>` for new specs (catches bad assumptions before code)
4. Implement with tests: `npm test && npx tsc --noEmit`
5. Run `/review-pr` (smart triage) or `/review-pr-team` (force full review)
6. Wait for approval, then merge (auto-deploys via CI/CD)

## Testing

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

**Coverage target:** 95%+ lines/functions/statements, 90%+ branches. **Current status:** full suite passing — run `npm test` for the live count (avoid hardcoding it here, it drifts on every test-adding PR).

**See:** [REFERENCE/development/testing-strategy.md](./REFERENCE/development/testing-strategy.md)

## TypeScript Configuration

- Target: ESNext for Next.js/Cloudflare Workers runtime
- Strict mode enabled
- Path alias: `@/` maps to `./src/` (Next.js convention)
- React 19 and Next.js 15 types included
- Configured with `@cloudflare/next-on-pages` adapter

## Implementation History

All 5 foundation phases complete (March–April 2026). Active feature work in [SPECIFICATIONS/](./SPECIFICATIONS/), archived phases in [SPECIFICATIONS/ARCHIVE/](./SPECIFICATIONS/ARCHIVE/). Formal launch checklist on hold: [future-launch.md](./SPECIFICATIONS/future-launch.md).

---

**Practice:** Keep CLAUDE.md files short (<300 lines). Details go in REFERENCE/ subdirectories. CLAUDE.md works as a "library index" - find the right context when needed, minimize token usage.
