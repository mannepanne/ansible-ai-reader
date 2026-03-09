# Implementation Specifications Library

Auto-loaded when working with files in this directory. Forward-looking plans for features being built.

## Active Implementation Phases

Development is organized into 6 sequential phases. Each phase includes scope, acceptance criteria, testing strategy, and PR workflow.

**Current phase:** Phase 1.2 complete - Phase 1.3 next

**Phase 1 breakdown:**
- ✅ Phase 1.1 - Next.js scaffolding (PR #2, merged Mar 9 2026)
- ✅ Phase 1.2 - Supabase database setup (PR pending)
- 🔄 Phase 1.3 - Cloudflare Queues and deployment (Issue #4)

### Phase Files (Read in Order)

1. **[01-foundation.md](./01-foundation.md)** - Week 1-2
   Next.js + Cloudflare + Supabase setup, database schema, basic deployment

2. **[02-authentication.md](./02-authentication.md)** - Week 2
   Magic link authentication with Supabase Auth + Resend

3. **[03-reader-integration.md](./03-reader-integration.md)** - Week 3
   Readwise Reader API integration, fetch and sync unread items

4. **[04-perplexity-integration.md](./04-perplexity-integration.md)** - Week 3-4
   Auto-generate summaries and tags via Perplexity API

5. **[05-notes-rating-polish.md](./05-notes-rating-polish.md)** - Week 4-5
   Document notes, rating system, user settings, UI polish

6. **[06-launch.md](./06-launch.md)** - Week 5
   Documentation, monitoring, final testing, production readiness

### Supporting Documentation

**[ORIGINAL_IDEA/](./ORIGINAL_IDEA/)**
- `ansible-outline.md` - Master specification and product vision
- `Naming-the-Ansible-of-Thoth.md` - Project naming inspiration

**[ARCHIVE/](./ARCHIVE/)**
- Completed specifications (moved here when phase is done)

## When Specs Move to Archive

After completing a phase and merging the PR:
1. Move the phase file to `ARCHIVE/`
2. Update implementation docs in `REFERENCE/` if needed
3. Update this index to reflect current phase
