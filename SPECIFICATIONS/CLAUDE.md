# Implementation Specifications Library

Auto-loaded when working with files in this directory. Forward-looking plans for features being built.

## Active Implementation Phases

Development followed 6 sequential phases (all complete). Active work is now feature-by-feature.

**Completed phases:**
- ✅ **Phase 1: Foundation** - [ARCHIVE/01-foundation.md](./ARCHIVE/01-foundation.md) (Mar 10, 2026)
- ✅ **Phase 2: Authentication** - [ARCHIVE/02-authentication.md](./ARCHIVE/02-authentication.md) (Mar 12, 2026)
- ✅ **Phase 3: Reader Integration** - [ARCHIVE/03-reader-integration.md](./ARCHIVE/03-reader-integration.md) (Mar 14, 2026)
- ✅ **Phase 4: Perplexity Integration** - [ARCHIVE/04-perplexity-integration.md](./ARCHIVE/04-perplexity-integration.md) (Mar 15, 2026)
- ✅ **Phase 5: Notes & Rating** - [ARCHIVE/05-notes-rating-polish.md](./ARCHIVE/05-notes-rating-polish.md) (Apr 1, 2026)

**Current application status:** Fully functional MVP — 360 tests, 95%+ coverage, live at ansible.hultberg.org

### Active Feature Specs

- **[07-summary-prompt-ui.md](./07-summary-prompt-ui.md)** - Custom summary prompt editor in Settings (TD-004)

### On Hold / Future

- **[future-launch.md](./future-launch.md)** - Formal launch checklist, monitoring, user guide (not on active roadmap)

### Supporting Documentation

**[ORIGINAL_IDEA/](./ORIGINAL_IDEA/)**
- `ansible-outline.md` - Master specification and product vision
- `Naming-the-Ansible-of-Thoth.md` - Project naming inspiration

**[ARCHIVE/](./ARCHIVE/)**
- Completed specifications (moved here when phase is done)

**[REFERENCE/decisions/](../REFERENCE/decisions/)** - Architecture Decision Records
- Search here BEFORE making architectural decisions (library choice, patterns, API design)
- Follow existing ADRs unless new information invalidates reasoning
- Document new architectural decisions here (prevents re-debating settled choices)
- See [ADR guidance](../REFERENCE/decisions/CLAUDE.md) for when and how to create ADRs

## When Specs Move to Archive

After completing a phase and merging the PR:
1. Move the phase file to `ARCHIVE/`
2. Update implementation docs in `REFERENCE/` if needed
3. Update this index to reflect current phase
