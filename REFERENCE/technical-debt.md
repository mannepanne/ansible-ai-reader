# Technical Debt Tracker

**When to read this:** Planning refactors, reviewing known issues, or documenting accepted shortcuts.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [testing-strategy.md](./testing-strategy.md) - Testing strategy
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions

---

Tracks known limitations, shortcuts, and deferred improvements in the codebase.
Items here are accepted risks or pragmatic choices made during development, not bugs.

---

## Active Technical Debt

### TD-001: No Automatic User Record Creation
- **Location:** Auth flow - missing database trigger or signup callback
- **Issue:** Users created in Supabase Auth (`auth.users`) are not automatically added to custom `users` table. Currently requires manual SQL insert for each new user.
- **Why accepted:** Single-user MVP development - not blocking initial testing. Proper multi-user onboarding was out of scope for Phase 2-4.
- **Risk:** **High** - Blocks multi-user production deployment. Any new user will encounter foreign key errors when trying to sync.
- **Future fix:** Implement one of:
  1. **Database trigger** (recommended): Postgres trigger on `auth.users` insert that creates matching `users` record
  2. **Signup callback handler**: API route that handles post-signup to create user record
  3. **Middleware check**: On first authenticated request, check if user exists and create if missing
- **Phase introduced:** Phase 2 (Authentication)
- **Related issue:** Manual workaround documented in session summary (2026-03-15)

**Manual workaround** (single user testing):
```sql
-- Get user ID from auth.users
SELECT id, email FROM auth.users;

-- Insert into custom users table
INSERT INTO users (id, email, created_at)
VALUES ('<user-id-from-above>', '<email>', NOW());
```

---

### TD-002: Wasteful Tag Regeneration (Re-generates Summaries)
- **Location:** `src/app/api/reader/regenerate-tags/route.ts` - job creation logic (lines 65-75)
- **Issue:** Tag regeneration uses `'summary_generation'` job type, which regenerates BOTH summary AND tags via Perplexity API. Since summaries already exist and are correct, this wastes ~80% of API credits for these operations.
- **Why accepted:** Simpler implementation - reuses existing job type and worker logic. Adding a separate `'tag_generation'` job type would require worker modifications and testing.
- **Cost impact:** ~$0.001 per item for full summary generation vs ~$0.0002 for tags-only. For 100 items: $0.10 vs $0.02.
- **Risk:** **Low** - Works correctly, just costs more. Not critical for MVP with low item counts.
- **Future fix:** Implement one of:
  1. **New job type** (recommended): Add `'tag_generation'` job type and modify worker to handle tags-only processing with cheaper Perplexity prompt
  2. **Smart worker**: Modify worker to check if `short_summary` exists and skip summary generation if present
  3. **Separate endpoint**: Create distinct API for tags-only regeneration with optimized worker
- **Phase introduced:** UI Design & Tag Regeneration (2026-03-15)
- **Related code:** `workers/consumer.ts` - processSummaryGeneration(), `src/lib/perplexity-api.ts` - generateSummary()

---

### TD-003: Reference Documentation May Need Consolidation
- **Location:** `REFERENCE/` directory - multiple phase implementation docs
- **Issue:** We now have 6+ implementation docs (phase-1-1, phase-1-2, phase-1-3-1, phase-1-3-2, phase-2, phase-3, automated-sync-implementation). As more features are added, finding the right doc may become harder. Some docs overlap (e.g., automated-sync spans PRs #33-#35 but phase docs exist separately).
- **Why accepted:** Current structure works well for linear development. Each doc was written during active development and serves its purpose. Reorganizing mid-project could break context and references.
- **Risk:** **Low** - Documentation is thorough and well-linked. CLAUDE.md navigation index helps discoverability. Only becomes an issue at scale (15+ implementation docs).
- **Future fix:** Consider one of:
  1. **Feature-based organization**: Group by feature (Authentication, Syncing, Summaries) instead of phases
  2. **Consolidate completed phases**: Merge phase-1-* docs into single phase-1-complete.md
  3. **Add cross-references**: Improve linking between related docs (e.g., automated-sync → phase-2 for auth patterns)
  4. **Do nothing**: Current structure may be optimal for this project size
- **Phase introduced:** Phase 5 (Notes & Rating) - noticed during automated-sync documentation
- **Related:** PR #36 review suggested updating CLAUDE.md test counts, highlighting that summary stats need manual updates

---

### Example Format: TD-004: Description
- **Location:** `src/path/to/file.ts` - `functionName()`
- **Issue:** Clear description of the limitation or shortcut
- **Why accepted:** Reason for accepting this debt (e.g., runtime constraints, time pressure, lack of alternative)
- **Risk:** Low/Medium/High - Impact assessment
- **Future fix:** Proposed solution when time/resources allow
- **Phase introduced:** Phase number when this was added

---

## Resolved Items

*(Move items here when addressed, with resolution notes)*

---

## Notes

- Items are prefixed TD-NNN for easy reference in code comments and PR reviews
- When adding new debt, include: location, issue description, why accepted, risk level, and proposed future fix
- Review this list at the start of each development phase to see if any items should be addressed
- Low-risk items can remain indefinitely; High-risk items should be addressed within 2-3 phases
