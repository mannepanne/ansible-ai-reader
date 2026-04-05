# Feature: Public Landing Page, Demo & Admin Analytics

**Status**: Planned
**Last Updated**: 2026-04-02
**Dependencies**: Phase 1 ✅ (Supabase schema), Phase 2 ✅ (Auth), Phase 3 ✅ (Reader integration)
**Source**: Imported from standalone prototype at `imported/project-837462e/`

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

### Part A: Landing Page, Demo & Privacy (user-facing)

1. Add Tailwind CSS + shadcn/ui to the project
2. New landing page (replaces `HomeContent.tsx`)
3. New `/demo` route — interactive static demo
4. New `/privacy` route — static privacy policy
5. Supabase migrations: 4 new analytics tables
6. Tracking hook (`useTracking.ts`) wired to those tables

### Part B: Admin Role & Analytics Dashboard

1. `is_admin` column on `users` table
2. Admin check in `Header.tsx` — conditional "Admin" link
3. New `/admin` route — analytics dashboard, protected by admin role
4. Seed Magnus as admin user

---

## Scope

---

### Part A1: Tailwind CSS + shadcn/ui

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

### Part A2: New Landing Page (`src/app/page.tsx`)

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
- Delete: `src/app/HomeContent.tsx`, `src/app/HomeContent.test.tsx`
- Replace: `src/app/page.tsx` (new server component, minimal — just auth check + landing component)
- Create: `src/components/landing/LandingPage.tsx` (ported from prototype)
- Create: `src/components/landing/NoiseField.tsx` (ported from prototype)

---

### Part A3: Demo Page (`src/app/demo/page.tsx`)

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
- `src/app/demo/page.tsx`
- `src/components/demo/DemoPage.tsx`
- `src/components/demo/DemoArticleCard.tsx`

---

### Part A4: Privacy Page (`src/app/privacy/page.tsx`)

Static page. Port directly from `PrivacyPage.tsx` in the prototype. No interactivity, no tracking.

**Content covers:**
- What data is collected (email, landing page events, demo engagement)
- No third-party analytics
- User rights (data export, deletion — handled via admin dashboard)
- Contact information

**Files:**
- `src/app/privacy/page.tsx` (server component, static)

---

### Part A5: Supabase Analytics Tables

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

**Migration file:** `supabase/migrations/20260402_add_landing_analytics.sql`

---

### Part A6: Tracking Hook (`src/hooks/useTracking.ts`)

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

### Part B1: Admin Role on Users Table

```sql
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Seed Magnus as admin (run once, idempotent)
UPDATE users SET is_admin = true WHERE email = 'magnus.hultberg@gmail.com';
```

**Migration file:** `supabase/migrations/20260402_add_admin_role.sql`

**RLS:** No new policies needed. The `users` table already allows users to read their own row (`auth.uid() = id`). The `is_admin` field is just an additional column on that row.

---

### Part B2: Admin Link in Header

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

### Part B3: Admin Analytics Page (`src/app/admin/page.tsx`)

**Route guard (server component):**
```typescript
// 1. Check Supabase session (existing pattern)
// 2. If no session → redirect('/login')
// 3. Query users.is_admin for current user
// 4. If is_admin is false → redirect('/summaries') with 403-equivalent
// 5. Render AdminContent
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
- `src/app/admin/page.tsx` (server component — auth + admin guard)
- `src/components/admin/AdminContent.tsx` (client component — tabs, charts, table)
- `src/components/admin/LandingAnalytics.tsx`
- `src/components/admin/DemoAnalytics.tsx`

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

### Unit tests

**`src/hooks/useTracking.test.ts`**
- `getSessionId()` returns consistent ID within 30-min window, new ID after expiry
- `getVisitorId()` returns persistent ID across calls
- `captureEmail()` inserts to Supabase with correct fields
- `getStoredEmail()` reads from localStorage; returns null if absent
- `useTracking()` — `trackEvent()` inserts demo_event with correct session + email
- `usePageTracking()` — fires `landing_page_view` on mount

**`src/app/admin/page.test.tsx`**
- Unauthenticated → redirect to `/login`
- Authenticated non-admin → redirect to `/summaries`
- Authenticated admin → renders AdminContent

**`src/components/admin/AdminContent.test.tsx`**
- Renders both tabs
- Tab 1: displays correct aggregated metrics
- Tab 2: displays session table with correct data
- Export triggers CSV download
- Delete removes correct records and updates display

**`src/components/landing/LandingPage.test.tsx`**
- Email form: validates email format, requires consent checkbox
- On valid submit: calls `captureEmail`, redirects to `/demo`
- Footer: Privacy link present; Login link present

**`src/app/demo/page.test.tsx`**
- No stored email → redirects to `/`
- Stored email → renders demo with 5 articles
- Interactions fire tracking events

### No tests needed for:
- `NoiseField.tsx` (canvas animation — not unit testable)
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

- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] No `console.log` or debug code
- [ ] No secrets in code
- [ ] Tailwind not applied to any existing app pages

---

## PR Workflow

Two PRs recommended (can be one if the scope feels manageable):

- **PR A:** `feature/landing-page` — Tailwind setup + privacy + landing + demo + tracking + analytics migrations
- **PR B:** `feature/admin-dashboard` — `is_admin` migration + Header update + admin route

**Review:** `/review-pr` for PR A (frontend only, no existing logic changed); `/review-pr-team` for PR B (auth/security implications of the admin guard).

---

## Related Documentation

- `imported/project-837462e/` — Source prototype (do not delete until both PRs are merged)
- [REFERENCE/architecture/](../REFERENCE/architecture/) — Auth patterns, service role client usage
- [REFERENCE/patterns/service-role-client.md](../REFERENCE/patterns/service-role-client.md) — Pattern for admin data reads
- [REFERENCE/development/testing-strategy.md](../REFERENCE/development/testing-strategy.md) — Testing conventions
