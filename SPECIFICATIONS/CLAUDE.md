# Implementation Specifications Library

Auto-loaded when working with files in this directory. Forward-looking plans for features being built.

## Active Implementation Phases

Development is organized into 6 sequential phases. Each phase includes scope, acceptance criteria, testing strategy, and PR workflow.

**Current phase:** Phase 3 (Reader Integration) - Next

**Completed phases:**
- ✅ **Phase 1: Foundation** - Moved to [ARCHIVE/](./ARCHIVE/) (Completed Mar 10, 2026)
  - All sub-phases complete (1.1, 1.2, 1.3.1, 1.3.2, 1.3.3)
  - 4 PRs merged (#2, #5, #6, #7)
  - Production deployment live at ansible.hultberg.org

- ✅ **Phase 2: Authentication** - Moved to [ARCHIVE/](./ARCHIVE/) (Completed Mar 12, 2026)
  - Magic link authentication with Supabase Auth + Resend SMTP
  - PR #8 merged
  - 22 new tests (64 total passing)

### Phase Files (Read in Order)

1. ✅ **[01-foundation.md](./ARCHIVE/01-foundation.md)** - Week 1-2 (Archived)
   Next.js + Cloudflare + Supabase setup, database schema, basic deployment

2. ✅ **[02-authentication.md](./ARCHIVE/02-authentication.md)** - Week 2 (Archived)
   Magic link authentication with Supabase Auth + Resend

3. **[03-reader-integration.md](./03-reader-integration.md)** - Week 3 (Next)
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
