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

### Example Format: TD-002: Description
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
