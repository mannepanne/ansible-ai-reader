# Archived Implementation Documentation

**Status:** Historical reference only
**Date archived:** March 27, 2026

## What's Here

Phase-based implementation documentation from the original development process. These docs were organized chronologically (by build order) and have been superseded by functional documentation.

### Archived Files

**Phase Implementation Docs:**
- `phase-1-1-implementation.md` - Next.js scaffolding & build setup
- `phase-1-2-implementation.md` - Database schema & Supabase clients
- `phase-1-3-1-implementation.md` - Cloudflare deployment & secrets
- `phase-1-3-2-implementation.md` - Queues infrastructure
- `phase-1-completion-summary.md` - Phase 1 high-level overview
- `phase-2-implementation.md` - Magic link auth, Supabase SSR clients
- `phase-3-implementation.md` - Reader API client, sync operations, queue consumer
- `automated-sync-implementation.md` - Automated sync (cron worker)

**Original Architecture:**
- `architecture.md` - Original architecture overview (before functional reorganization)

## Why Archived?

These docs were valuable during development but had organizational issues:

**Problems:**
- Organized by **when** features were built (not what you're trying to do)
- Hard to find information (need to remember which phase something was in)
- Links to phase docs scattered throughout codebase
- Long files mixing multiple concerns
- Phase numbers irrelevant after completion

**Solution:**
Documentation reorganized into **functional categories** in `REFERENCE/`:
- `architecture/` - How the system works
- `features/` - User-facing functionality
- `operations/` - Deployment and maintenance
- `development/` - Contributing code
- `patterns/` - Implementation patterns

## Finding Current Documentation

**Instead of reading these archived docs, use the functional documentation:**

### Architecture & System Design
👉 [REFERENCE/architecture/](../../../REFERENCE/architecture/)
- System overview, 3-worker architecture
- Database schema and RLS policies
- Authentication patterns
- API design conventions

### Features & Functionality
👉 [REFERENCE/features/](../../../REFERENCE/features/)
- Reader sync workflow
- AI summary generation
- Automated syncing
- User settings
- Tag generation

### Deployment & Operations
👉 [REFERENCE/operations/](../../../REFERENCE/operations/)
- Deployment guide (3-worker setup)
- Environment configuration
- Monitoring and debugging
- Troubleshooting

### Development Workflow
👉 [REFERENCE/development/](../../../REFERENCE/development/)
- Local development setup
- Testing strategy
- Code conventions
- PR review workflow

### Implementation Patterns
👉 [REFERENCE/patterns/](../../../REFERENCE/patterns/)
- Service role client (RLS bypass)
- API validation (Zod, security)
- Queue processing
- Error handling

## When to Reference These Docs

**Rarely needed, but useful for:**
- Understanding historical context ("why did we build it this way?")
- Researching specific implementation decisions from development
- Comparing current vs original architecture
- Learning from the development process

**For everything else:** Use the functional documentation in `REFERENCE/`

## Documentation Reorganization

**Context:** The documentation refactor (March 26-27, 2026) shifted from phase-based to functional organization to improve discoverability and reduce token usage.

**PRs involved:**
- #47 - Infrastructure and indexes
- #48 - Architecture content extraction
- #49 - Features content extraction
- #50 - Operations docs reorganization
- #51 - Development docs reorganization
- #52 - Pattern documentation
- #53 - Archive phase docs and update root CLAUDE.md

**See:** `REFERENCE/documentation-refactor-plan.md` for complete details
