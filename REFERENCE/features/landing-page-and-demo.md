# Landing Page, Demo & Tracking
REFERENCE > Features > Landing Page & Demo

The public-facing surface of Ansible: a marketing landing page, an interactive product demo gated behind email capture, and a privacy page — all instrumented with a cookie-free, localStorage-based analytics system.

## What Is This?

Before users have Ansible accounts, they land on a public marketing site. The goal is to:
1. Explain what Ansible does and why it matters
2. Capture email addresses from interested people (waitlist)
3. Let those people experience the product interactively via a demo
4. Collect behavioural analytics to inform product decisions — without cookies and without third-party trackers

---

## Architecture Overview

```
/           LandingPage.tsx   ← email capture, nav tracking, CTA section
/demo       DemoPage.tsx      ← interactive product demo, gated
/privacy    PrivacyPage.tsx   ← GDPR policy, tracks its own views

src/hooks/useTracking.ts      ← all tracking logic, two hooks, identity helpers
```

All three pages are **client components** (`'use client'`). The tracking hook uses a direct Supabase anonymous client (not the Next.js server client), which is an intentional design choice — see [Identity & Supabase Client](#identity--supabase-client) below.

---

## Landing Page

**File:** `src/components/landing/LandingPage.tsx`

Sections:
- **Navbar** — scrolls to Features / How it works / Try the demo
- **Hero** — headline, subheadline, email capture form with consent checkbox, animated noise-field background
- **Features** — three feature highlights (AI summaries, Commentariat, triage workflow)
- **How it works** — step-by-step walkthrough
- **CTA section** — second email capture form with `source: 'cta'`
- **Footer** — login link for existing users

### Email Capture Flow

```
User fills email + checks consent → handleSubmit()
  1. captureEmail(email, source, true)    → INSERT into email_captures
  2. setSessionEmail(email)               → localStorage.setItem('ansible_email', email)
  3. trackPageEvent('demo_signup', {...}) → INSERT into page_events
  4. router.push('/demo')
```

Two capture sources exist — `'hero'` (top form) and `'cta'` (bottom form). Both write to `email_captures` and fire a `demo_signup` page event. If the user has already submitted their email, the hero button skips the form and goes straight to `/demo`.

The consent checkbox is required before the submit button becomes active. `consented_at` is stored as an ISO timestamp when `consented: true`, and `null` when `consented: false` — this allows the admin dashboard to query consent status directly from the row.

### Navigation Tracking

Every interactive link fires a `nav_click` page event with a `label` payload. The admin dashboard aggregates these into the Navigation Clicks bar chart:

| Label | Trigger |
|---|---|
| `features` | Navbar → Features |
| `how_it_works` | Navbar → How it works |
| `try_demo` | Navbar → Try the demo |
| `go_to_demo` | "See Ansible in action" button (hero or CTA, after email submitted) |
| `footer_privacy` | Footer → Privacy link |
| `footer_login` | Footer → Login link |

The BarChart renders underscore labels with spaces (`how_it_works` → "how it works").

---

## Demo Page

**File:** `src/app/demo/page.tsx`

A full read-only simulation of the Ansible UI. Five demo articles (pre-written with realistic AI summaries and Commentariat responses) are rendered in a 3-column card grid that mirrors the actual application.

### Email Gate

On mount, the demo page checks localStorage for a stored email. If none is found, it immediately redirects to `/`:

```typescript
useEffect(() => {
  const email = getStoredEmail();
  if (!email) {
    router.replace('/');
  } else {
    setEmailChecked(true);
    trackEvent('page_view', { page: 'demo' });
  }
}, []);
```

This is a **client-side gate only** — it's not secure authentication, just a UX flow ensuring the user has gone through the email capture before reaching the demo. The component renders `null` until the check completes (preventing a flash of content).

### Tracked Demo Interactions

Every meaningful interaction fires a `trackEvent` call that writes to `demo_events`:

| Event type | Trigger |
|---|---|
| `page_view` | Demo page mount (after email gate passes) |
| `tab_switch` | Switching between Summary / Commentary tabs |
| `expand` | Expanding a card to full summary |
| `collapse` | Collapsing back to short summary |
| `add_note` | Saving a note on an article |
| `reaction` | Clicking 💡 (interesting) or 😐 (not interesting) |
| `archive` | Archiving an article |
| `open_reader` | Clicking "Open in Reader" button |
| `sync` | Clicking the Sync button |

Each event carries `{ article_id, ...additional_data }` in the `event_data` payload. These are aggregated in the admin dashboard's "Engagement Breakdown" bar chart.

### Demo Content

The five demo articles are hardcoded directly in `DemoPage.tsx`. Each has a `summary` (short, ~2 sentences), an `expandedSummary` (full Ansible-style summary), and a `commentary` (full Commentariat critique). Topics were chosen to represent real Ansible use cases: AI regulation, semiconductor policy, global health, climate markets, algorithmic transparency.

The inline article data is intentional — these are not live API calls, not database records, just static content that demonstrates the product.

---

## Privacy Page

**File:** `src/app/privacy/page.tsx`

Static GDPR-compliant privacy policy. On mount, it fires a `privacy_page_view` page event:

```typescript
trackPageEvent('privacy_page_view');
```

This is tracked so the admin can see how many landing page visitors read the privacy policy before signing up — a useful signal for consent quality.

The policy is written in plain language and commits to:
- Email used only for a one-time launch notification
- No third-party sharing, no marketing lists
- Anonymous visitor/session IDs via localStorage (no cookies)
- Right to deletion and data export (handled via admin GDPR tools)

---

## Identity & Tracking System

**File:** `src/hooks/useTracking.ts`

This is the most architecturally interesting part of the feature. It provides two identities and two hooks.

### Why a Direct Supabase Client?

The rest of Ansible uses the Next.js server client (cookie-based auth, SSR-aware). The tracking hook uses a **direct anonymous client** instead:

```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
```

This is correct and intentional. Public tracking pages have no user auth session — there are no cookies to read. Using the server client would produce an empty session on every request and add unnecessary SSR overhead. The anon client writes directly from the browser to Supabase, which is safe because the `email_captures`, `demo_sessions`, `demo_events`, and `page_events` tables are INSERT-only from the anon role (Supabase RLS policies allow anon writes, reads are blocked).

### Two Identity Levels

| Identity | Storage key | Lifespan | Purpose |
|---|---|---|---|
| `visitor_id` | `ansible_visitor_id` | Permanent (until browser clear) | Unique visitor counting across sessions |
| `session_id` | `ansible_session_id` | 30 minutes of inactivity | Session grouping, demo engagement |

The 30-minute session timeout is checked via `ansible_last_active`. Every time `getSessionId()` or `touchLastActive()` is called, `ansible_last_active` is updated to `Date.now()`. If the gap since last active exceeds 30 minutes, a new session UUID is generated.

```typescript
const timedOut = lastActive && now - Number(lastActive) > SESSION_TIMEOUT_MS;
if (!existingId || timedOut) {
  const id = crypto.randomUUID();   // new session
  localStorage.setItem('ansible_session_id', id);
  ...
}
```

This mirrors how analytics platforms like Google Analytics handle session boundaries — a visitor is a persistent identity, a session is a bounded engagement window.

### `usePageTracking` — Landing Page Tracking

Used on the landing page and privacy page. Records `page_events` rows:

```typescript
supabase.from('page_events').insert({
  visitor_id: vid,
  session_id: sid,
  event_type: eventType,
  event_data: eventData,
}).then(() => {});
```

> **⚠️ Supabase lazy thenable trap:** Supabase JS v2 query builders implement `PromiseLike`, not native `Promise`. The HTTP request only fires when `.then()` is called. `void builder` without chaining `.then()` means the fetch **never executes** — silently discarding the write with no error. All fire-and-forget Supabase calls must chain `.then(() => {})` to trigger execution.

Each row links both visitor and session IDs, enabling the admin to distinguish "how many people visited" (unique visitor IDs) from "how many visits" (total rows with `event_type = 'landing_page_view'`).

### `useTracking` — Demo Session Tracking

More sophisticated. On mount it creates a `demo_sessions` row:

```typescript
supabase.from('demo_sessions').insert({
  session_id: sid,
  email,            // null if user hasn't captured email yet
  started_at: now,
  last_active_at: now,
  total_events: 0,
}).then(({ error }) => {
  if (error) {
    // Row already exists for this session (returning visitor) — fire heartbeat instead
    supabase.rpc('update_session_heartbeat', { sid }).then(() => {});
  }
});
```

A **30-second heartbeat** keeps `last_active_at` current throughout the demo:

```typescript
const interval = setInterval(() => {
  touchLastActive();
  supabase.rpc('update_session_heartbeat', { sid: sessionId.current }).then(() => {});
}, 30000);
```

Session duration displayed in the admin dashboard is `last_active_at - started_at`, computed server-side at page load time. It is not stored as a field.

### `trackEvent` and the Increment RPC

Each demo event writes to `demo_events` AND increments the session's `total_events` counter via an RPC:

```typescript
supabase.from('demo_events').insert({ session_id: sid, email, event_type, event_data }).then(() => {});
supabase.rpc('increment_session_events', { sid }).then(() => {});
```

The RPC exists because `demo_events` and `demo_sessions` are separate tables — the anon client cannot run an UPDATE on `demo_sessions` directly (that would require read+write access to the row, which RLS blocks). A `SECURITY DEFINER` RPC can do it safely.

### Email Association

If a user captures their email mid-session (after already starting the demo), the email is stored in localStorage. `trackEvent` reads `getStoredEmail()` on every call, so subsequent events automatically include the email. This means event rows written before email capture have `email: null`, and rows after capture have the email — the session itself is backfillable via the session ID linkage.

### localStorage Keys

| Key | Value | Used by |
|---|---|---|
| `ansible_visitor_id` | UUID | `getVisitorId()` |
| `ansible_session_id` | UUID | `getSessionId()` |
| `ansible_last_active` | Unix timestamp (ms) | Session timeout logic |
| `ansible_email` | Email string or null | `getStoredEmail()` / `setSessionEmail()` |

---

## Database Tables

### `page_events`
Rows written by `usePageTracking.trackPageEvent()`.

| Column | Type | Notes |
|---|---|---|
| `visitor_id` | text | From `ansible_visitor_id` localStorage |
| `session_id` | text | From `ansible_session_id` localStorage |
| `event_type` | text | `landing_page_view`, `privacy_page_view`, `nav_click`, `demo_signup` |
| `event_data` | jsonb | E.g. `{ label: 'features' }` for nav clicks |
| `created_at` | timestamptz | Auto-set |

### `email_captures`
Written by `captureEmail()`.

| Column | Type | Notes |
|---|---|---|
| `email` | text | |
| `source` | text | `'hero'` or `'cta'` |
| `consented` | boolean | |
| `consented_at` | timestamptz | ISO timestamp or null |
| `created_at` | timestamptz | Auto-set |

### `demo_sessions`
Written by `useTracking` on mount.

| Column | Type | Notes |
|---|---|---|
| `session_id` | text | UUID from localStorage |
| `email` | text | Null until email captured |
| `started_at` | timestamptz | Set on mount |
| `last_active_at` | timestamptz | Updated by heartbeat RPC every 30s |
| `total_events` | integer | Incremented by `increment_session_events` RPC |

### `demo_events`
Written by `trackEvent()` on each interaction.

| Column | Type | Notes |
|---|---|---|
| `session_id` | text | Links to `demo_sessions` (no FK, same UUID) |
| `email` | text | Read from localStorage at event time |
| `event_type` | text | See tracked events table above |
| `event_data` | jsonb | Article ID and other context |
| `created_at` | timestamptz | Auto-set |

Note: There are no foreign key constraints between these tables. The session_id is a shared UUID, but the analytics tables are designed to be independent — this simplifies RLS (each can have its own INSERT policy) and avoids cascade complexity in GDPR deletes.

**RLS policy summary:** All four tables have INSERT policies for the `anon` role (public landing page visitors) and `email_captures`, `demo_sessions`, and `demo_events` also have INSERT policies for the `authenticated` role (logged-in users who visit the demo). Both the `increment_session_events` and `update_session_heartbeat` RPCs have EXECUTE grants for both roles.

---

## Related Documentation

- [Admin Analytics](./admin-analytics.md) — Dashboard that surfaces this data
- [Architecture Overview](../architecture/overview.md) — How the landing pages fit into the 3-worker setup
- [Privacy page source](../../src/app/privacy/page.tsx) — Full text of the privacy policy
