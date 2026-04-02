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

### TD-006: Prompt Constants Duplicated Between UI and API
- **Location:** `src/app/settings/SettingsContent.tsx:13-29` and `src/lib/perplexity-api.ts:319-337`
- **Issue:** `SYSTEM_MESSAGE` and `USER_MESSAGE_TEMPLATE` are defined as string constants in the Settings UI component to display in the "Full Prompt" tab, but the actual prompt strings are hardcoded inside `generateSummary()` in `perplexity-api.ts`. If the prompts change in the API module and the UI constants aren't updated, the Full Prompt tab silently shows stale content.
- **Why accepted:** The hardcoded prompt architecture pre-dates the Full Prompt tab. Exporting constants from `perplexity-api.ts` would require restructuring the module and re-testing. Accepted as a low-risk pragmatic choice for a single-user tool where prompt changes are rare and would be caught in code review.
- **Risk:** **Low** - Incorrect display only; no functional impact on actual summary generation.
- **Future fix:** Export `SYSTEM_MESSAGE` and `USER_MESSAGE_TEMPLATE` from `perplexity-api.ts` and import them in `SettingsContent.tsx`. This creates a single source of truth.
- **Introduced:** April 2026 (PR #68 - Full Prompt tab feature)

---

### TD-007: SummaryCard Component Size and Inline Style Complexity
- **Location:** `src/components/SummaryCard.tsx` - entire file (~680 lines)
- **Issue:** SummaryCard has grown through multiple feature additions (notes, ratings, tabs, commentariat, expand state) into a large single-file component with inline style objects defined inline throughout render. Inline styles make visual changes harder to track, and the component combines display logic, async action handlers, and tab state that could be split across smaller components.
- **Why accepted:** Each feature addition was incremental and correct. No single addition crossed a refactor threshold on its own. Splitting prematurely would have added complexity without benefit during active development.
- **Risk:** **Low** - Works correctly and is well-tested. Complexity creep only starts to matter when adding new features or debugging layout issues.
- **Future fix:** When next touching the card UI for a significant change:
  1. Extract a `CommentariatTab` component
  2. Extract a `SummaryTab` component  
  3. Move inline styles to CSS modules or Tailwind classes
  4. Keep `SummaryCard` as a thin orchestration shell with shared state
- **Introduced:** April 2026 (PR #71 - Commentariat feature, flagged in architecture review)

---

### TD-008: `sync_log.items_created` Misused for On-Demand Operations
- **Location:** `src/app/api/reader/commentariat/route.ts:139`, `src/app/api/reader/regenerate-summary/route.ts:139`
- **Issue:** Both on-demand routes insert `items_created: 1` into `sync_log` when logging token usage. No `reader_items` row is created — a summary or commentariat is updated. The field is semantically incorrect.
- **Why accepted:** The on-demand routes reuse the `sync_log` table for token tracking (the most pragmatic approach given the table already exists). Adding a new field or table just for this distinction was out of scope.
- **Risk:** **Low** - No functional impact. The field is currently used for reporting only and the incorrect value would only matter if someone queries `items_created` to count actual item creations.
- **Future fix:** Either add a separate `items_updated` column to `sync_log`, or change the on-demand routes to use `items_created: 0`.
- **Introduced:** April 2026 (PR #71, PR #76)

---

### TD-009: `sync_log.errors` Column Typed as `number` but Used as Object
- **Location:** `src/app/api/reader/commentariat/route.ts:131`, `src/app/api/reader/regenerate-summary/route.ts:140` — both insert JSON token usage objects into `errors`
- **Issue:** The TypeScript type for `sync_log` (if/when it's defined) shows `errors?: number`, but both on-demand routes insert a structured object `{ reader_item_id, token_usage: { ... } }`. This is a schema mismatch that works at runtime (Postgres accepts JSONB) but is misleading.
- **Why accepted:** The field is effectively untyped at the DB level and no runtime validation enforces the type. The mismatch is harmless today.
- **Risk:** **Low** - Works correctly. Would become a problem if strict TypeScript types are enforced on Supabase-generated types or if code tries to do arithmetic on the field.
- **Future fix:** Rename the column to `metadata` (or similar) and update its type to `jsonb` explicitly, then align TypeScript types.
- **Introduced:** April 2026 (PR #71, PR #76)

---

### Example Format: TD-XXX: Description
- **Location:** `src/path/to/file.ts` - `functionName()`
- **Issue:** Clear description of the limitation or shortcut
- **Why accepted:** Reason for accepting this debt (e.g., runtime constraints, time pressure, lack of alternative)
- **Risk:** Low/Medium/High - Impact assessment
- **Future fix:** Proposed solution when time/resources allow
- **Phase introduced:** Phase number when this was added

---

## Resolved Items

### TD-004: Missing Custom Summary Prompt UI
- **Resolved:** April 2026 (PR #65, #68)
- **Resolution:** Full implementation shipped — custom prompt textarea, character counter, reset button, validation, and a Full Prompt tab showing the system and user message templates sent to Perplexity. The entire chain is now wired: UI → API → queue consumer → Perplexity.

---

### TD-003: Reference Documentation May Need Consolidation
- **Resolved:** April 1, 2026
- **Resolution:** REFERENCE/ was reorganised into function-based subdirectories (architecture, features, operations, development, patterns, decisions). Phase implementation docs moved to SPECIFICATIONS/ARCHIVE/implementation/ as historical records. The discoverability concern no longer applies.

---

## Notes

- Items are prefixed TD-NNN for easy reference in code comments and PR reviews
- When adding new debt, include: location, issue description, why accepted, risk level, and proposed future fix
- Review this list at the start of each development phase to see if any items should be addressed
- Low-risk items can remain indefinitely; High-risk items should be addressed within 2-3 phases
