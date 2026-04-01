# Technical Debt Tracker

**When to read this:** Planning refactors, reviewing known issues, or documenting accepted shortcuts.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [testing-strategy.md](./development/testing-strategy.md) - Testing strategy
- [troubleshooting.md](./operations/troubleshooting.md) - Common issues and solutions

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


### TD-005: No Cost Monitoring for Perplexity API
- **Location:** No implementation exists — deferred from Phase 4, carried through Phase 5
- **Issue:** There is no cost tracking for Perplexity API usage. Token counts are not logged, there is no cost report endpoint, and no billing alerts. The only visibility into API spend is the Perplexity dashboard directly.
- **Why accepted:** Single-user MVP with low item counts. Perplexity spend is small ($3-15/month estimated) and manually checkable. Cost tracking adds complexity without near-term payoff.
- **Risk:** **Low** - No financial risk for a single user at current scale. Becomes higher risk if usage grows significantly or multiple users are added.
- **Future fix:** If costs become material, implement:
  1. Log token usage per request to `sync_log` table
  2. `GET /api/cost-report` endpoint with daily/monthly aggregates
  3. Billing alerts at configurable thresholds ($20, $50, $100/month)
  4. Cost summary UI in Settings or a dedicated dashboard
- **Phase introduced:** Deferred from Phase 4, carried through Phase 5
- **Related spec items:** `SPECIFICATIONS/ARCHIVE/05-notes-rating-polish.md` (original scope)

---

### TD-004: Missing Custom Summary Prompt UI
- **Location:** `src/app/settings/page.tsx` - Settings page only shows sync interval, not prompt editor
- **Issue:** API fully supports custom summary prompts (`PATCH /api/settings` with Zod validation), but Settings page UI doesn't expose this capability. Users cannot customize AI summary behavior via UI.
- **Why accepted:** Automated sync settings were higher priority. API implementation was completed to validate the pattern, but UI was deferred.
- **Risk:** **Low** - Users can still get summaries with system default prompt. Custom prompts are a nice-to-have for personalization, not critical for core workflow.
- **Future fix:** Add to Settings page:
  1. Textarea for custom prompt editing
  2. Display default prompt as placeholder
  3. Character counter (10-2000 chars)
  4. Info text explaining how prompts affect summaries
  5. "Reset to default" button
- **Phase introduced:** Phase 5 (Notes & Rating) - API completed, UI deferred
- **Specification:** `SPECIFICATIONS/07-summary-prompt-ui.md` (active spec for implementation)
- **Database:** `users.summary_prompt TEXT` field exists and is used by Perplexity API when not null

---

### Example Format: TD-006: Description
- **Location:** `src/path/to/file.ts` - `functionName()`
- **Issue:** Clear description of the limitation or shortcut
- **Why accepted:** Reason for accepting this debt (e.g., runtime constraints, time pressure, lack of alternative)
- **Risk:** Low/Medium/High - Impact assessment
- **Future fix:** Proposed solution when time/resources allow
- **Phase introduced:** Phase number when this was added

---

## Resolved Items

### TD-003: Reference Documentation May Need Consolidation
- **Resolved:** April 1, 2026
- **Resolution:** REFERENCE/ was reorganised into function-based subdirectories (architecture, features, operations, development, patterns, decisions). Phase implementation docs moved to SPECIFICATIONS/ARCHIVE/implementation/ as historical records. The discoverability concern no longer applies.

---

## Notes

- Items are prefixed TD-NNN for easy reference in code comments and PR reviews
- When adding new debt, include: location, issue description, why accepted, risk level, and proposed future fix
- Review this list at the start of each development phase to see if any items should be addressed
- Low-risk items can remain indefinitely; High-risk items should be addressed within 2-3 phases
