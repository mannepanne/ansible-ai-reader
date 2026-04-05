# Feature: Public Landing Page, Demo & Admin Analytics

**Status**: ✅ Complete — Part A merged, Part B in PR #87 (reviewed, pending merge)
**Last Updated**: 2026-04-05
**Dependencies**: Phase 1 ✅ (Supabase schema), Phase 2 ✅ (Auth), Phase 3 ✅ (Reader integration)
**Source**: Imported from standalone prototype at `imported/project-837462e/`
**Tests**: 499 passing across 44 test files (was 461 before this feature)

---

## Overview

Replace the current minimal landing page with a polished marketing site — including an interactive demo behind an email capture gate, a privacy page, and an admin analytics dashboard accessible to designated admin users. All of this is hosted within the existing Ansible Next.js app at ansible.hultberg.org.

This is a **frontend-heavy feature** with modest backend additions (4 new Supabase tables, 1 new column, 3 new routes).

---

## What Already Exists

- `src/app/page.tsx` + `HomeContent.tsx` — current landing page (to be replaced)
- `src/components/Header.tsx` — receives `userEmail` as prop; easy to extend with `isAdmin`
- `users` table in Supabase — home for the new `is_admin` flag
- Service role client pattern (`src/utils/supabase/service.ts`) — used for admin data reads
- Next.js App Router server components — existing auth-check pattern to reuse for admin route guard
- `imported/project-837462e/` — source code for the new pages (UI, tracking logic, migrations)

---

## What Must Be Built

### Part A: Landing Page, Demo & Privacy (user-facing) ✅ Complete

1. ✅ Add Tailwind CSS + shadcn/ui to the project
2. ✅ New landing page (replaces `HomeContent.tsx`)
3. ✅ New `/demo` route — interactive static demo
4. ✅ New `/privacy` route — static privacy policy
5. ✅ Supabase migrations: 4 new analytics tables
6. ✅ Tracking hook (`useTracking.ts`) wired to those tables

### Part B: Admin Role & Analytics Dashboard ✅ Complete (PR #87 pending merge)

1. ✅ `is_admin` column on `users` table
2. ✅ Admin check in `Header.tsx` — conditional "Admin" link
3. ✅ New `/admin` route — analytics dashboard, protected by admin role
4. ✅ Seed Magnus as admin user

---

## Scope

---

### Part A1: Tailwind CSS + shadcn/ui ✅ Complete

The imported prototype uses Tailwind and shadcn/ui (Radix UI primitives). The existing Ansible app uses none of these. Adding them is safe — they are additive and won't affect any existing pages.

**Steps:**
- Install Tailwind CSS following the official Next.js guide
- Configure `tailwind.config.js` (include `./src/**/*.{ts,tsx}` in content paths)
- Add `globals.css` with Tailwind directives, or add directives to existing `src/app/globals.css`
- Install shadcn/ui and initialise with `npx shadcn@latest init`
- Add only the components actually used by the imported pages (see list below)

**shadcn components needed:** `button`, `input`, `label`, `tabs`, `badge`, `dialog`, `textarea`, `separator`, `scroll-area`

**Custom fonts:** Add DM Sans and Newsreader via `next/font/google` (not a CDN link — Next.js font optimisation is preferred).

**Do not** add Tailwind classes to any existing pages. The landing page and new routes use Tailwind; the app pages (`/summaries`, `/settings`) keep their existing inline styles.

---

### Part A2: New Landing Page (`src/app/page.tsx`) ✅ Complete

The current `page.tsx` + `HomeContent.tsx` is replaced. The new landing page is the full-page marketing experience from the prototype.

**Route behaviour (unchanged):**
- Authenticated users who visit `/` are redirected to `/summaries` (keep existing middleware behaviour)
- Unauthenticated users see the new landing page

**Page structure (from prototype `LandingPage.tsx`):**
- Animated NoiseField particle background
- Nav bar: logo + "Features", "How it works", "Try the demo" anchor links
- Hero section with email capture form (source: `"hero"`)
- Features section
- How it works section
- Second CTA section with email capture (source: `"cta"`)
- Footer: `Privacy` link (left) + `Login` link (right, subtle — for developer access)

**Email capture behaviour:**
- User enters email + checks consent checkbox
- On submit: insert into `email_captures` table (see Part A5)
- Store email in `localStorage` as `ansible_email`
- Redirect to `/demo`

**Developer Login link** (footer, right side):
- Subtle text link, same visual treatment as the Privacy link
- Links to `/login` or shows the existing magic-link form inline (TBD at implementation — either works)

**Files:**
- Delete: `src/app/HomeContent.tsx`, `src/app/HomeContent.test.tsx` ✅
- Replace: `src/app/page.tsx` ✅
- Create: `src/components/landing/LandingPage.tsx` ✅
- ~~Create: `src/components/landing/NoiseField.tsx`~~ — implemented inline in `LandingPage.tsx` (functionally equivalent)

---

### Part A3: Demo Page (`src/app/demo/page.tsx`) ✅ Complete

Static interactive demo — no real Readwise Reader connection. All article data is hardcoded.

**Access gate:**
- Check `localStorage` for `ansible_email`
- If missing, redirect to `/` (landing page) — user must submit email first
- If present, show the demo and associate events with that email

**Demo content (5 hardcoded articles from prototype):**
- EU AI Act analysis
- Semiconductor supply chain
- Mpox variant
- Carbon offsets
- Algorithm auditing

Each article has: title, source, pre-written short summary, pre-written commentary, pre-written tags.

**Interactions (all functional, all tracked):**
- Tab switching (Summary ↔ Commentary)
- Expand / collapse article
- Add note (textarea, component state only — not persisted)
- Reactions: "Interesting" / "Not interesting"
- Archive (removes from view)
- "Open in Reader" (shows a dialog explaining the real app opens it in Readwise Reader)
- Sync button (shows a dialog explaining real sync behaviour)

**Tracking:** Every interaction fires a `demo_events` insert via `useTracking` (see Part A5).

**Files:**
- `src/app/demo/page.tsx` ✅
- ~~`src/components/demo/DemoPage.tsx`~~ — implemented inline in `page.tsx`
- ~~`src/components/demo/DemoArticleCard.tsx`~~ — implemented inline in `page.tsx`

---

### Part A4: Privacy Page (`src/app/privacy/page.tsx`) ✅ Complete

Static page. Port directly from `PrivacyPage.tsx` in the prototype. No interactivity, no tracking.

**Content covers:**
- What data is collected (email, landing page events, demo engagement)
- No third-party analytics
- User rights (data export, deletion — handled via admin dashboard)
- Contact information

**Files:**
- `src/app/privacy/page.tsx` (server component, static)

---

### Part A5: Supabase Analytics Tables ✅ Complete

Four new tables, added via a single migration. These live in the existing Ansible Supabase project alongside the existing tables.

```sql
-- Email captures from the landing page
CREATE TABLE email_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL,          -- 'hero' | 'cta'
  consented boolean NOT NULL,
  consented_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Demo session metadata
CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  email text,
  started_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  total_events integer DEFAULT 0
);

-- Per-interaction events during demo
CREATE TABLE demo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  email text,
  event_type text NOT NULL,      -- 'tab_switch' | 'expand' | 'collapse' | 'archive' | 'add_note' | 'reaction' | 'reader_open' | 'sync_click'
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Landing page analytics events
CREATE TABLE page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,      -- anonymous UUID stored in localStorage
  session_id text NOT NULL,      -- 30-min session window
  event_type text NOT NULL,      -- 'landing_page_view' | 'nav_click' | 'privacy_page_view' | 'demo_signup'
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);
```

**RLS policies (same pattern as prototype):**
- `email_captures`: anon → INSERT only; authenticated admin → SELECT all
- `demo_sessions`: anon → INSERT + UPDATE own session; authenticated admin → SELECT all
- `demo_events`: anon → INSERT only; authenticated admin → SELECT all
- `page_events`: anon + authenticated → INSERT; authenticated admin → SELECT all

**RPC functions:**
- `email_exists(check_email text) RETURNS boolean` — privacy-safe check used by landing page to skip re-entry for returning visitors
- `increment_session_events(p_session_id text)` — atomically increments `demo_sessions.total_events`

**Migration file:** `supabase/migrations/20260402_add_landing_analytics.sql` ✅ (applied)
**Note:** Implementation also tracks `privacy_page_view` events (not listed in spec's event types above but included in migration and dashboard).

---

### Part A6: Tracking Hook (`src/hooks/useTracking.ts`) ✅ Complete (unit tests missing)

Port from `imported/project-837462e/src/hooks/useTracking.ts`. Minimal changes for Next.js (remove React Router deps, use Next.js `localStorage` guard pattern for SSR safety).

**Exports:**
```typescript
getSessionId(): string          // 30-min timeout session UUID
getVisitorId(): string          // persistent visitor UUID
captureEmail(email, source, consented): Promise<void>
verifyStoredEmail(): Promise<boolean>
getStoredEmail(): string | null
useTracking(email): object      // React hook — returns trackEvent()
usePageTracking(): void         // React hook — fires landing_page_view on mount
```

**Session logic:** Session ID stored in `sessionStorage`. Expires after 30 minutes of inactivity (checked on read). Visitor ID stored in `localStorage` — persists across sessions.

---

### Part B1: Admin Role on Users Table ✅ Complete

```sql
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Seed Magnus as admin (run once, idempotent)
UPDATE users SET is_admin = true WHERE email = 'magnus.hultberg@gmail.com';
```

**Migration file:** `supabase/migrations/20260402_add_admin_role.sql` ✅ (applied)
**Note:** RLS policy also prevents `is_admin` self-escalation — users cannot set their own admin flag via the public Supabase client.

**RLS:** No new policies needed. The `users` table already allows users to read their own row (`auth.uid() = id`). The `is_admin` field is just an additional column on that row.

---

### Part B2: Admin Link in Header ✅ Complete

`Header.tsx` receives a new optional prop:

```typescript
interface HeaderProps {
  // ... existing props
  isAdmin?: boolean;  // new
}
```

When `isAdmin` is true, render an "Admin" link in the header between Settings and the user email display:

```
[Ansible AI Reader]  [Sync]  [Tags]  [⚙️ Settings]  [Admin]  user@email  [Logout →]
```

The Admin link style should match the Settings link (bordered, subdued, same font size).

All pages that render `Header` pass `isAdmin` down from the server component that already checks auth. The pattern is: server component fetches `users.is_admin` alongside the existing session check, passes it as a prop to the client component tree.

---

### Part B3: Admin Analytics Page (`src/app/admin/page.tsx`) ✅ Complete (PR #87 pending merge)

**Route guard (server component):**
```typescript
// 1. Check Supabase session (existing pattern)
// 2. If no session → redirect('/') [Note: spec said '/login'; implementation uses '/' — intentional UX choice]
// 3. Query users.is_admin for current user
// 4. If is_admin is false → redirect('/summaries') ✅
// 5. Render AdminContent ✅
```

The data reads use the **service role client** (existing pattern in `src/utils/supabase/service.ts`) so RLS does not filter admin queries.

**Two tabs:**

**Tab 1: Landing Page**
- Total visits (count of `landing_page_view` events)
- Unique visitors (distinct `visitor_id` count)
- Privacy page views
- Total demo signups (count of `demo_signup` events)
- Conversion rate: visits → signups
- Navigation click breakdown (Features, How it works, Try Demo)
- Signup source breakdown (hero vs. cta)

**Tab 2: Demo**
- Email signups (count of `email_captures`)
- Demo sessions (count of `demo_sessions`)
- Total interactions (count of `demo_events`)
- Average session duration (`last_active_at - started_at` averaged)
- Event type breakdown (bar chart or table)
- Session table: email, start time, duration, total events

**Data management (per user):**
- Export user data → CSV download of `email_captures` + `demo_sessions` + `demo_events` for that email
- Delete user data → removes `email_captures` row + all associated `demo_sessions` and `demo_events` (GDPR)

**Files:**
- `src/app/admin/page.tsx` ✅ (server component — auth + admin guard)
- `src/components/admin/AdminContent.tsx` ✅ (client component — tabs)
- `src/components/admin/LandingAnalytics.tsx` ✅ (bar charts, dual conversion, nav clicks)
- `src/components/admin/DemoAnalytics.tsx` ✅ (email captures list, engagement chart, session table)
- `src/components/admin/ui.tsx` ✅ (shared StatCard, BarChart, formatDuration — added during redesign)
- `src/components/admin/types.ts` ✅
- `src/app/api/admin/delete-user-data/route.ts` ✅ (GDPR deletion)
- `src/app/api/admin/export-user-data/route.ts` ✅ (GDPR JSON export)

---

## Implementation Order

Implement in this order — each step is independently deployable:

1. **Tailwind + shadcn setup** (no visible change, purely additive)
2. **Supabase migrations** (Part A5 + Part B1 — run before any frontend uses them)
3. **Tracking hook** (Part A6 — no UI, just the hook)
4. **Privacy page** (Part A4 — trivial, good warm-up)
5. **Landing page** (Part A2 — replaces current home, biggest visible change)
6. **Demo page** (Part A3 — depends on landing page email capture working)
7. **Header admin link + Admin page** (Part B2 + B3 — last, as it depends on `is_admin` migration)

---

## Testing Strategy

**Current status: 499 tests passing** (44 test files)

### Unit tests

**`src/hooks/useTracking.test.ts`** ❌ Not created
- Hook is tested indirectly through `LandingPage.test.tsx` and `demo/page.test.tsx`
- Dedicated unit tests for `getSessionId()`, `getVisitorId()`, `captureEmail()` etc. were specified but not written
- Tracked as follow-up work

**`src/app/admin/page.test.tsx`** ✅
- Unauthenticated → redirect to `/` (spec said `/login`; implementation uses `/`)
- Authenticated non-admin → redirect to `/summaries`
- Authenticated admin → renders AdminContent

**`src/components/admin/AdminContent.test.tsx`** ✅
- Renders both tabs; tab switching works
- Landing tab: displays aggregated metrics
- Demo tab: displays session table, email captures
- Export and delete buttons present for email sessions only

**`src/components/admin/DemoAnalytics.test.tsx`** ✅
- Stat cards render with correct initial values
- Email captures list shows email + source
- Session durations formatted as `Xm Ys`
- GDPR delete decrements all 4 stat counters correctly
- Failed delete leaves stats unchanged
- Export triggers file download

**`src/components/admin/LandingAnalytics.test.tsx`** ✅ (added during redesign)
- All 4 stat cards render
- Dual conversion rates (vs visits + vs unique visitors)
- Bar chart items render with underscore → space formatting
- Signup source badges render
- Zero/empty states handled

**`src/app/api/admin/export-user-data/route.test.ts`** ✅
- 401 unauthenticated, 403 non-admin, 400 missing email, 500 DB error, 200 full data export

**`src/app/api/admin/delete-user-data/route.test.ts`** ✅
- Auth guards, cascading deletes across all 3 analytics tables

**`src/components/landing/LandingPage.test.tsx`** ✅
- Email form validation, consent checkbox, submit behaviour, footer links

**`src/app/demo/page.test.tsx`** ✅
- No stored email → redirect to `/`
- Stored email → renders demo with 5 articles
- Interactions fire tracking events

### No tests needed for:
- NoiseField animation (canvas/animation — not unit testable)
- `PrivacyPage.tsx` (static content)

---

## Schema Changes Summary

| Migration | Table | Change |
|-----------|-------|--------|
| `20260402_add_landing_analytics.sql` | `email_captures` | New table |
| `20260402_add_landing_analytics.sql` | `demo_sessions` | New table |
| `20260402_add_landing_analytics.sql` | `demo_events` | New table |
| `20260402_add_landing_analytics.sql` | `page_events` | New table |
| `20260402_add_admin_role.sql` | `users` | Add `is_admin boolean DEFAULT false` |

---

## Out of Scope

- **Real email notifications** to captured emails — this is a pre-launch waitlist feature, not a transactional email
- **Self-serve waitlist management** — admin does it manually via the dashboard
- **A/B testing** of landing page variants
- **Making the demo connect to a real Readwise account** — the demo is deliberately static
- **Multi-admin support** — just Magnus for now; `is_admin` is a flag not a role table

---

## Pre-commit Checklist

- [x] All tests passing (`npm test`) — 499 tests
- [x] Type checking passes (`npx tsc --noEmit`)
- [x] No `console.log` or debug code
- [x] No secrets in code
- [x] Tailwind not applied to any existing app pages
- [ ] `useTracking.test.ts` unit tests (tracked as follow-up)

---

## PR Workflow

- **PR A:** `feature/landing-page` ✅ Merged — Tailwind setup + privacy + landing + demo + tracking + analytics migrations
- **PR B:** `feature/admin-dashboard` ✅ Merged — `is_admin` migration + Header update + admin route
- **PR #85:** ✅ Merged — Admin dashboard implementation (GDPR export/delete, stat cards, session table)
- **PR #86:** ✅ Merged — GDPR data export endpoint
- **PR #87:** Pending merge — Admin dashboard UI redesign (bar charts, email captures list, duration precision, shared ui.tsx)

---

## Implementation Notes (deviations from spec)

1. **NoiseField** — Implemented inline in `LandingPage.tsx` rather than as a separate file. Functionally identical; no reason to split unless the animation logic grows.

2. **DemoPage / DemoArticleCard** — Both implemented inline in `src/app/demo/page.tsx`. The file is ~500 lines. If the demo expands (more articles, more interaction types), consider extracting into `src/components/demo/`.

3. **Admin redirect on no session** — Spec says redirect to `/login`; implementation redirects to `/` (landing page). This is a better UX for the public context — unauthenticated visitors should see the landing page, not a bare login form.

4. **`useTracking.test.ts` not created** — Hook functionality is covered indirectly through component integration tests. Isolated unit tests for `getSessionId()`, `getVisitorId()`, `captureEmail()` etc. were specified but not written. Low priority given indirect coverage, but should be added before significant tracking logic changes.

5. **Admin dashboard UI redesign (PR #87)** — The spec described the admin dashboard at a functional level. The actual implementation went through a full UI redesign (bar charts, email captures list with per-row GDPR actions, duration in seconds with `Xm Ys` format) based on the original prototype screenshots. This is the intended final state.

6. **`privacy_page_view` event type** — Added to `page_events` tracking (fires on `/privacy` mount) and surfaced as a stat card on the Landing tab. Not explicitly listed in the spec's event types but consistent with the spec's intent.

7. **`email` field on `demo_events` table** — The prototype migration added this for easier per-user querying. Means GDPR queries can directly filter `demo_events.email` without joining through `demo_sessions`.

---

## Related Documentation

- `imported/project-837462e/` — Source prototype (safe to delete — all PRs merged or pending merge)
- `REFERENCE/technical-debt.md` — TD-010: Unified User Identity (demo analytics not linked to Ansible user accounts)
- [REFERENCE/architecture/](../REFERENCE/architecture/) — Auth patterns, service role client usage
- [REFERENCE/patterns/service-role-client.md](../REFERENCE/patterns/service-role-client.md) — Pattern for admin data reads
- [REFERENCE/development/testing-strategy.md](../REFERENCE/development/testing-strategy.md) — Testing conventions
