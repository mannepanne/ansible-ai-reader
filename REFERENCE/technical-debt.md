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

### TD-010: Unified User Identity Across Demo and Ansible Sign-Up
- **Location:** `src/app/api/admin/delete-user-data/route.ts`, `src/app/admin/page.tsx`, `supabase/migrations/`
- **Issue:** User identity is currently split across two separate systems with no link between them:
  1. **Demo/landing data** — email stored in `email_captures`, sessions in `demo_sessions`, events in `demo_events`
  2. **Ansible user** — record in `users` table, account in Supabase Auth (`auth.users`)

  These two records can share the same email address but there is no foreign key, join, or reference connecting them. This creates two problems:

  **GDPR completeness:** The current GDPR delete (`DELETE /api/admin/delete-user-data`) only removes demo analytics data. It does not delete the `users` record or Supabase Auth account. A full right-to-erasure request from someone who is both a demo visitor AND a full Ansible user requires additional manual steps.

  **Funnel analytics gap:** There is no way to trace the journey of a person who visits the landing page → submits their email → uses the demo → later signs up for Ansible. These are currently three disconnected data points. Understanding conversion from demo visitor to paying user is impossible without a unified identity.

- **Why accepted:** At the current pre-launch single-user stage, no visitors have converted to full Ansible users. The demo and auth systems were built independently and linking them was out of scope. GDPR risk is low with zero external users.
- **Risk:** **Medium** — Becomes a real GDPR compliance gap the moment external users exist. Also permanently loses funnel conversion data if not addressed before launch.
- **Future fix:** When implementing user onboarding for launch, address both concerns together:
  1. **Link identities on sign-up:** When a user signs up for Ansible with the same email they used for the demo, add a `demo_email` or `linked_at` reference (or simply match on email in queries). This enables full funnel tracking.
  2. **Extend GDPR delete:** Update `delete-user-data` to also delete the `users` row and call the Supabase Admin API to delete the `auth.users` record when one exists.
  3. **Extend admin dashboard:** Add a unified user view that shows the full journey — landing page visit → email capture → demo sessions → Ansible sign-up date — for any email address.
  4. **Protect against dangling data:** Ensure that archiving a user (Ansible account deletion) also cascades to demo analytics, and vice versa.
- **Introduced:** April 2026 (PR #85 — admin dashboard, surfaced during post-merge review)

---

### TD-012: Production Schema Diverges From `supabase/migrations/`
- **Location:** Production Supabase project (`spqenzpdmatmuvrllskf`) vs `supabase/migrations/*.sql`
- **Issue:** The migration files in this repo describe a database that does not match the live production schema. Two concrete forms of drift:
  1. **No application enum types in production.** Migration `20260309000001_initial_schema.sql` declares `CREATE TYPE job_type_enum`, `job_status_enum`, `sync_status_enum`, etc., and uses them as column types (e.g. `job_type job_type_enum NOT NULL`). The live `public` schema contains zero application enum types. The corresponding columns are plain `text` (verified: `processing_jobs.job_type` and `processing_jobs.status` both `data_type = text`). Inserting any string value succeeds — there is no Postgres-level validation that values come from the intended set.
  2. **Empty migration ledger.** `supabase_migrations.schema_migrations` is empty even though all 9 application tables (`users`, `reader_items`, `processing_jobs`, `sync_log`, `email_captures`, `demo_sessions`, `demo_events`, `page_events`, `item_signals`) exist and are populated. `supabase db push` against this database lists all 15 migrations as pending and would attempt to re-run them; most are not idempotent (`CREATE TYPE`, `CREATE TABLE` without `IF NOT EXISTS`) and would fail.
- **Concrete consequence (current PR):** Migration `20260509_add_tags_generation_job_type.sql` is a no-op against production. Running its `ALTER TYPE job_type_enum ADD VALUE IF NOT EXISTS 'tags_generation'` errors with `42704: type "job_type_enum" does not exist`. PR #103 ships safely without applying it because the consumer dispatches on a string compare and the column accepts any text value — but the ADR's "deploy ordering: migration before worker" guidance does not apply on this database.
- **Why accepted:** Drift discovered while shipping PR #103 (May 2026). The runtime is unaffected and the on-the-fly fix scope (either backfilling enums + converting columns, or stripping the migrations and rewriting affected ADR sections) is materially larger than the PR itself. Both the design intent (enum-typed columns for safety) and the documented contract (migration-per-job-type) remain correct as forward guidance — they're just not enforced on this instance.
- **Risk:** **Medium** —
  - **Data integrity (low-medium):** Without enum types, an enqueue route that bypasses the Zod validation can write any string into `job_type` or `status`. Today the only writers are well-validated API routes, so this is latent rather than active.
  - **Migration tooling (medium):** Cannot run `supabase db push` against prod safely. Schema changes must continue to be applied via dashboard SQL editor. Each new migration adds ledger drift.
  - **Documentation honesty (medium):** ADRs and feature docs describe enum-typed schema. Anyone diagnosing prod from the docs alone will be misled.
- **Future fix (two viable directions, pick one):**
  1. **Reconcile prod toward the migrations:** Create the missing enum types, convert affected columns (`ALTER TABLE ... ALTER COLUMN ... TYPE ... USING ...::text::enum_name`), populate the migration ledger via `supabase migration repair --status applied <timestamp>` for each historical migration. Restores the design intent and unlocks `supabase db push`. Higher-effort.
  2. **Reconcile the migrations toward prod:** Rewrite affected migration files to declare `text` columns (or use `CHECK (value IN (...))` constraints), drop the enum-related ADR guidance, document that prod is text-typed. Lower-effort, preserves working state, gives up the type-safety the original schema author wanted.
- **Introduced:** Pre-existing — surfaced May 2026 during PR #103 attempt to apply the new enum migration. Likely originated when the initial schema was applied manually via dashboard SQL editor with the `CREATE TYPE` statements skipped or modified.

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

### TD-002: Wasteful Tag Regeneration (Re-generates Summaries)
- **Resolved:** May 2026
- **Resolution:** Added a dedicated `tags_generation` job type. The "Regenerate Tags" endpoint now enqueues this lighter job, and the queue consumer dispatches to a tags-only path that reads the existing `short_summary` from the DB, calls a focused `generateTags()` Perplexity prompt, and updates only the `tags` column. The user's existing summary is preserved verbatim, and prompt-token usage drops by ~95% versus the previous `summary_generation` reuse. Migration `20260509_add_tags_generation_job_type.sql` adds the enum value.

---

### TD-011: Root README links point at pre-refactor REFERENCE/ paths

- **Resolved:** April 2026 (PR #99, post-rollout cleanup sweep)
- **Resolution:** Five `[text](path)` links and one bare-path mention in a code-block comment updated to the functional REFERENCE/ subdirectory structure: `REFERENCE/architecture/overview.md`, `REFERENCE/development/testing-strategy.md`, `REFERENCE/operations/deployment.md`, `REFERENCE/operations/troubleshooting.md`, `REFERENCE/operations/environment-setup.md`.

---

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
