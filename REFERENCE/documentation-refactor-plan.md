# Documentation Refactor Plan

Created: March 26, 2026
Status: In Progress

## Executive Summary

Comprehensive documentation review and refactor to:
1. **Shift from phase-based to functional organization** - Organize by purpose, not build chronology
2. **Optimize for discoverability** - Make it easy to find information from logical entry points
3. **Split large files** into focused, single-purpose documents
4. **Improve navigation** with CLAUDE.md indexes throughout the tree
5. **Update for recent features** (automated sync, settings, 3-worker architecture)

## Core Principle: Function Over Chronology

**Problem**: Current REFERENCE/ docs are organized by implementation phases (phase-1, phase-2, etc.). This made sense during development but is confusing for new developers.

**Solution**: Reorganize by **what the docs help you do**:
- Understanding the system → `architecture/`
- Working with features → `features/`
- Deploying/maintaining → `operations/`
- Contributing code → `development/`
- Learning patterns → `patterns/`

**Keep phase docs only in SPECIFICATIONS/ARCHIVE/** as historical record.

## Recent Changes Requiring Documentation Updates

### Major Features Added (Mar 15-26, 2026)
1. **Automated Scheduled Syncing** (3-part feature)
   - Database schema changes (sync_interval, last_auto_sync_at)
   - Cron handler endpoint (`/api/cron/auto-sync`)
   - Settings UI for configuration
   - Separate cron worker (3-worker architecture)

2. **Settings System**
   - Settings API (`/api/settings` GET/PATCH)
   - Settings page UI
   - Sync interval configuration (0-24 hours)
   - Summary prompt customization (10-2000 chars)
   - Prompt injection prevention
   - Service role client pattern for RLS bypass

3. **Architecture Evolution**
   - **3-worker system**: Main app, queue consumer, cron trigger
   - Service role client for RLS bypass
   - Node.js runtime (removed edge runtime)

### Bug Fixes & Improvements
- Fixed archived items reappearing (#15)
- Moved "Regenerate Tags" button to header (#14)
- Fixed RLS policy violation in settings save (#41)
- Better error diagnostics throughout

## Current Documentation Issues

### 1. Outdated References
- **CLAUDE.md**: Says "Phase 4 Complete" but doesn't mention Phase 5 progress
- **CLAUDE.md**: References phase-4-implementation.md which doesn't exist
- **architecture.md**: Needs update for 3-worker system
- **Test counts**: Need verification (was 237, likely higher now)

### 2. Missing Documentation
- **phase-4-implementation.md**: Referenced but doesn't exist
- **settings-implementation.md**: Settings system not documented in REFERENCE/
- **service-role-pattern.md**: Important security pattern not documented

### 3. Files Too Large (>400 lines)
| File | Lines | Action |
|------|-------|--------|
| phase-3-implementation.md | 1052 | **SPLIT** into sections |
| ARCHIVE/04-perplexity-integration.md | 804 | Leave (archived) |
| ARCHIVE/03-reader-integration.md | 803 | Leave (archived) |
| phase-2-implementation.md | 552 | Consider splitting |
| automated-sync-implementation.md | 456 | **UPDATE** and possibly split |
| deployment-guide.md | 429 | **REVIEW** for clarity |

### 4. Poor Cross-Linking
- Phase docs reference each other but links not always updated
- CLAUDE.md has good index but some links stale
- REFERENCE/CLAUDE.md could be better organized

## Proposed Refactor

### Step 1: Create New Structure & CLAUDE.md Indexes
**Goal**: Set up directories and navigation before moving content

1. ⬜ Create directory structure:
   ```bash
   mkdir -p REFERENCE/{architecture,features,operations,development,patterns}
   ```

2. ⬜ Create CLAUDE.md in each subdirectory with:
   - Purpose of this section
   - List of docs (with one-line descriptions)
   - Links to related sections
   - Common questions this section answers

3. ⬜ Update root `REFERENCE/CLAUDE.md`:
   - Replace phase-based organization with functional sections
   - Add "Finding What You Need" guide
   - Link to subdirectory indexes

### Step 2: Extract & Reorganize Content
**Goal**: Move content from phase docs to functional docs

1. ⬜ **Extract from phase-1/2/3 docs → architecture/**:
   - Database schema → `architecture/database-schema.md`
   - Worker setup → `architecture/workers.md`
   - Auth system → `architecture/authentication.md`
   - System overview → `architecture/overview.md`

2. ⬜ **Extract from phase-3 (1052 lines!) → features/**:
   - Reader sync implementation → `features/reader-sync.md`
   - Queue processing → `patterns/queue-processing.md`

3. ⬜ **Extract from phase-4 + automated-sync → features/**:
   - AI summaries → `features/ai-summaries.md`
   - Automated sync → `features/automated-sync.md`
   - Settings system → `features/settings.md`
   - Tags → `features/tags.md`

4. ⬜ **Reorganize operational docs → operations/**:
   - Move deployment-guide.md → `operations/deployment.md`
   - Move environment-setup.md → `operations/environment-setup.md`
   - Move troubleshooting.md → `operations/troubleshooting.md`
   - Create `operations/monitoring.md` (observability, logs)

5. ⬜ **Reorganize development docs → development/**:
   - Move testing-strategy.md → `development/testing-strategy.md`
   - Move pr-review-workflow.md → `development/pr-review-workflow.md`
   - Extract code conventions from root CLAUDE.md → `development/code-conventions.md`
   - Create `development/local-development.md`

### Step 3: Document New Patterns
**Goal**: Capture important patterns not yet documented

1. ⬜ **patterns/service-role-client.md**:
   - What: Service role client bypasses RLS
   - When: Use when you've verified auth at API level
   - Why: Cookie-based auth doesn't pass JWT to Postgres
   - How: Code examples from settings API
   - Security: Why this is safe

2. ⬜ **patterns/api-validation.md**:
   - Zod schema patterns
   - Prompt injection prevention
   - HTML stripping
   - Error responses

3. ⬜ **patterns/error-handling.md**:
   - Consistent error format
   - Logging strategy
   - User-friendly messages
   - Debugging with Cloudflare logs

### Step 4: Update Root CLAUDE.md
**Goal**: Make the primary entry point excellent

1. ⬜ Remove phase-based content
2. ⬜ Add functional sections with clear use cases:
   - "Understanding the System" → architecture/
   - "Working with Features" → features/
   - "Deploying & Operating" → operations/
   - "Contributing Code" → development/
   - "Learning Patterns" → patterns/
3. ⬜ Add "Quick Start" paths for common tasks
4. ⬜ Update test counts and current status

### Step 5: Cross-Link & Verify
**Goal**: Ensure everything is findable from multiple entry points

1. ⬜ Add "Related Documentation" to every doc
2. ⬜ Verify all links work
3. ⬜ Test navigation by trying to find information:
   - "How do I deploy a worker?"
   - "Why are we using service role client?"
   - "How does automated sync work?"
   - "What's the database schema?"
4. ⬜ Add breadcrumbs to each doc showing path from root

### Step 6: Clean Up
**Goal**: Remove outdated content, archive phase docs

1. ⬜ Move phase-*.md to `SPECIFICATIONS/ARCHIVE/implementation/`
2. ⬜ Update links that pointed to phase docs
3. ⬜ Add note in archived docs pointing to functional equivalents
4. ⬜ Verify no broken links remain

## Proposed File Structure (Functional Organization)

```
REFERENCE/
├── CLAUDE.md (📍 PRIMARY ENTRY POINT - functional index)
│
├── architecture/
│   ├── CLAUDE.md (links to all architecture docs)
│   ├── overview.md (system overview, tech stack, 3-worker design)
│   ├── database-schema.md (tables, relationships, RLS policies)
│   ├── workers.md (main app, queue consumer, cron worker)
│   ├── authentication.md (Supabase Auth, magic links, sessions)
│   └── api-design.md (REST conventions, error handling)
│
├── features/
│   ├── CLAUDE.md (links to all feature docs)
│   ├── reader-sync.md (how Reader integration works)
│   ├── ai-summaries.md (Perplexity, content truncation, tokens)
│   ├── automated-sync.md (cron system, sync intervals)
│   ├── settings.md (user preferences, validation, UI)
│   └── tags.md (AI tag generation, regeneration)
│
├── operations/
│   ├── CLAUDE.md (links to all ops docs)
│   ├── deployment.md (how to deploy all 3 workers)
│   ├── environment-setup.md (secrets, API keys, .dev.vars)
│   ├── monitoring.md (logs, observability, debugging)
│   └── troubleshooting.md (common issues, solutions)
│
├── development/
│   ├── CLAUDE.md (links to all dev docs)
│   ├── testing-strategy.md (TDD, coverage, patterns)
│   ├── code-conventions.md (ABOUT comments, naming, etc)
│   ├── pr-review-workflow.md (when to use /review-pr vs /review-pr-team)
│   └── local-development.md (running locally, dev workflow)
│
└── patterns/
    ├── CLAUDE.md (links to all pattern docs)
    ├── service-role-client.md (RLS bypass, when/why/how)
    ├── queue-processing.md (async jobs, retries, poison messages)
    ├── api-validation.md (Zod schemas, prompt injection prevention)
    └── error-handling.md (consistent error responses, logging)
```

### Key Navigation Paths

**"I want to understand the system"**
→ `REFERENCE/CLAUDE.md` → `architecture/overview.md` → specific architecture docs

**"How does [feature] work?"**
→ `REFERENCE/CLAUDE.md` → `features/CLAUDE.md` → `features/[feature].md`

**"I need to deploy"**
→ `REFERENCE/CLAUDE.md` → `operations/deployment.md`

**"Something broke"**
→ `REFERENCE/CLAUDE.md` → `operations/troubleshooting.md`

**"I'm contributing code"**
→ `REFERENCE/CLAUDE.md` → `development/CLAUDE.md` → specific guides

**"Why are we doing X this way?"**
→ `REFERENCE/CLAUDE.md` → `patterns/CLAUDE.md` → `patterns/[X].md`

## Discoverability Principles

### 1. Multiple Entry Points
Every piece of information should be findable from:
- Root `CLAUDE.md` (primary entry point)
- Subdirectory `CLAUDE.md` (secondary entry points)
- Related docs (cross-links)
- Root README.md (for GitHub visitors)

### 2. Clear Signposting
Each doc should answer:
- **What is this?** (one sentence at top)
- **When do I need this?** (use cases)
- **What else should I read?** (related docs)

### 3. Lazy Loading Pattern
CLAUDE.md files are always loaded. They should:
- Be <300 lines
- Link to detailed docs (which are loaded on-demand)
- Provide enough context to know if you need the detail

### 4. Answer-First Structure
Docs should be organized by questions users ask:
- ✅ "How do I deploy the cron worker?"
- ❌ "Phase 3.2: Cron Worker Implementation"

### 5. Breadcrumbs
Every doc shows its place in the hierarchy:
```markdown
# Database Schema
REFERENCE > Architecture > Database Schema
```

## Success Criteria

**Structure**:
- [ ] All referenced docs exist
- [ ] No file >500 lines (except archived specs)
- [ ] Subdirectory CLAUDE.md files exist and are <300 lines
- [ ] Every doc has breadcrumb showing hierarchy

**Navigation**:
- [ ] Can find any feature doc from root CLAUDE.md in <3 clicks
- [ ] Every doc has "Related Documentation" section
- [ ] Cross-links verified and working
- [ ] Phase-based navigation replaced with functional navigation

**Content**:
- [ ] All recent features documented (automated sync, settings, 3-worker system)
- [ ] Service role client pattern documented
- [ ] Test counts accurate (~293 tests)
- [ ] Current status accurate (Phase 5 active)
- [ ] All "gotchas" and security patterns documented

**Usability Test** (try to answer these quickly):
- [ ] "How do I deploy the cron worker?" → `operations/deployment.md`
- [ ] "Why service role client?" → `patterns/service-role-client.md`
- [ ] "How does automated sync work?" → `features/automated-sync.md`
- [ ] "What's the database schema?" → `architecture/database-schema.md`
- [ ] "How do I run tests?" → `development/testing-strategy.md`

## Example CLAUDE.md Structure

Each subdirectory needs a concise index. Example:

```markdown
# Features Documentation
REFERENCE > Features

How-it-works documentation for user-facing features.

## When to Read This
- Understanding how a specific feature works
- Debugging feature behavior
- Extending an existing feature

## Feature Documentation

### Reader Integration
- **[reader-sync.md](./reader-sync.md)** - How we fetch and sync articles from Readwise Reader

### AI Features
- **[ai-summaries.md](./ai-summaries.md)** - Perplexity API integration, content truncation, token tracking
- **[tags.md](./tags.md)** - AI-generated tags and regeneration

### Automation
- **[automated-sync.md](./automated-sync.md)** - Scheduled syncing system (cron, intervals, settings)

### User Preferences
- **[settings.md](./settings.md)** - User settings API and UI (sync intervals, summary prompts)

## Related Documentation
- [Architecture Overview](../architecture/overview.md) - System design
- [API Design](../architecture/api-design.md) - REST conventions
- [Patterns](../patterns/CLAUDE.md) - Common implementation patterns
```

## Implementation Notes

- Keep archived specs as-is (historical record in SPECIFICATIONS/ARCHIVE/)
- Phase docs stay in REFERENCE temporarily during refactor, then archive to SPECIFICATIONS/ARCHIVE/implementation/
- Update as we go - this is a significant refactor, will take multiple PRs
- Test navigation after each major step
- Each doc should be valuable on its own (not require reading 5 other docs first)
- Use consistent formatting: breadcrumb → summary → use cases → sections → related docs
