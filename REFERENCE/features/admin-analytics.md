# Admin Analytics Dashboard
REFERENCE > Features > Admin Analytics

A server-rendered analytics dashboard for the Ansible admin, showing landing page funnel metrics, demo engagement data, email captures, and GDPR tools. Gated behind auth + `is_admin` flag.

## What Is This?

After launching the public landing page and demo, the admin needs to answer questions like:
- How many people are visiting? Are they unique visitors or repeat?
- What fraction of visitors sign up for the waitlist?
- Do people who reach the demo actually engage with it?
- Which features are they clicking on?
- How long do demo sessions last on average?
- Who has signed up, and can I export/delete their data on request?

The admin dashboard answers all of these from a single page, fetching all data in one parallel `Promise.all` at request time.

---

## Access Control

**File:** `src/app/admin/page.tsx`

Two-layer guard, both server-side:

```
1. Auth session check    → no session → redirect('/')
2. is_admin flag check   → users.is_admin = false → redirect('/summaries')
```

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) redirect('/');

const { data: userData } = await supabase
  .from('users').select('is_admin').eq('id', session.user.id).single();
if (!userData?.is_admin) redirect('/summaries');
```

The `is_admin` check uses the regular user client (RLS-limited), which means users can only read their own row. The admin flag must be set manually in the Supabase dashboard — there is no self-service promotion mechanism.

After the guards pass, all analytics queries use a **service role client** (`createServiceRoleClient()`) to bypass RLS and read cross-user analytics tables.

---

## Architecture: Server Component + Client Tabs

```
page.tsx (server)
  ↓ builds landingStats + demoStats
  ↓ passes as props
AdminContent.tsx (client)
  ├── LandingAnalytics.tsx    (Landing Page tab)
  └── DemoAnalytics.tsx       (Demo tab)
```

The page component does all data fetching. Child components receive typed props and handle only rendering and interactive state (delete confirmations, optimistic updates after GDPR deletes).

**`AdminContent.tsx`** renders a tab bar (Landing Page / Demo) and passes the relevant stats object to each panel. No additional data fetching happens in client components.

---

## Data Fetching

All 10 queries run in parallel via a single `Promise.all`:

```typescript
const [
  landingVisitsResult,      // COUNT of landing_page_view events
  visitorIdsResult,         // All visitor_ids for unique-visitor dedup
  privacyViewsResult,       // COUNT of privacy_page_view events
  signupsResult,            // COUNT of demo_signup events
  navClicksResult,          // event_data payloads for nav_click events
  emailCapturesResult,      // Last 100 email_captures rows
  sessionCountResult,       // COUNT of demo_sessions
  interactionsResult,       // COUNT of demo_events
  sessionsResult,           // Last 200 demo_sessions rows (for table + avg)
  eventTypesResult,         // All event_type values from demo_events
] = await Promise.all([...]);
```

### Unique Visitor Computation

Supabase doesn't support `COUNT(DISTINCT visitor_id)` via the JS client directly. Instead, all `visitor_id` values are fetched and deduped in the server component:

```typescript
const uniqueVisitors = new Set(
  (visitorIdsResult.data ?? []).map((r) => r.visitor_id)
).size;
```

This works for the current scale but would become slow at very high traffic volumes. See [Technical Debt](../technical-debt.md).

### Nav Click Aggregation

Nav clicks are stored as `event_data: { label: 'features' }` in `page_events`. The server component pivots them into a sorted count map:

```typescript
const navClickCounts: Record<string, number> = {};
navClicksResult.data?.forEach((e) => {
  const label = e.event_data?.label ?? 'unknown';
  navClickCounts[label] = (navClickCounts[label] ?? 0) + 1;
});
// → [{ label: 'features', count: 40 }, { label: 'how-it-works', count: 30 }, ...]
```

### Session Duration

Duration is not stored in the database — it is computed at page load from the session row's `started_at` and `last_active_at` timestamps:

```typescript
const durationMs = new Date(s.last_active_at).getTime() - new Date(s.started_at).getTime();
return { durationSeconds: Math.max(0, Math.round(durationMs / 1000)), ... };
```

The `max(0, ...)` guard handles edge cases where clock skew or a page crash could produce negative deltas. Average duration is the mean over all sessions in the result set (up to 200).

### Unique Email Count

`emailCaptureCount` (shown in the stat card as "Unique Emails") is derived from a `Set` of email values in the captures list:

```typescript
const capturedEmails = new Set<string>();
emailCapturesResult.data?.forEach((e) => capturedEmails.add(e.email));
// emailCaptureCount = capturedEmails.size
```

Note: `emailCaptureCount` reflects **unique email addresses**, while `emailCaptures` (the array) contains all rows — a user who submitted from both hero and CTA sections appears once in the count but twice in the list. This is intentional: the stat card answers "how many people signed up?" and the list shows the full audit trail.

---

## Landing Page Tab (`LandingAnalytics.tsx`)

**File:** `src/components/admin/LandingAnalytics.tsx`

### Stat Cards (row of 4)

| Card | Value | Source |
|---|---|---|
| Total Visits | `landingVisitsResult.count` | COUNT of `landing_page_view` events |
| Unique Visitors | `capturedEmails.size`... wait, no | `new Set(visitor_ids).size` |
| Privacy Page Views | `privacyViewsResult.count` | COUNT of `privacy_page_view` events |
| Demo Sessions | `sessionCountResult.count` | COUNT of `demo_sessions` rows |

Privacy Page Views is an interesting signal — a high ratio of privacy views to signups suggests users are checking the policy before committing (good trust signal).

### Dual Conversion Rates

Two conversion rates are shown side by side because they answer different questions:

- **Visits → Signups**: `totalSignups / totalVisits` — What fraction of page loads convert? Includes repeat visitors.
- **Unique Visitors → Signups**: `totalSignups / uniqueVisitors` — What fraction of distinct people convert? More meaningful for a real funnel.

```typescript
const visitRate = totalVisits > 0
  ? ((totalSignups / totalVisits) * 100).toFixed(1) + '%'
  : '0%';
const visitorRate = uniqueVisitors > 0
  ? ((totalSignups / uniqueVisitors) * 100).toFixed(1) + '%'
  : '0%';
```

### Signup Sources

Badges showing how many captures came from each form location (`hero` vs `cta`). Only rendered if at least one capture exists.

### Navigation Clicks Bar Chart

Horizontal bar chart showing which nav links users click most. Bars are proportional to the highest-count item. Underscores in labels are replaced with spaces (`how_it_works` → `how it works`).

---

## Demo Tab (`DemoAnalytics.tsx`)

**File:** `src/components/admin/DemoAnalytics.tsx`

### Stat Cards (row of 4)

| Card | Value |
|---|---|
| Unique Emails | Unique email addresses captured |
| Demo Sessions | Total `demo_sessions` rows |
| Interactions | Total `demo_events` rows |
| Avg Engagement | Average session duration, formatted |

### Email Captures List

All captures (up to 100, newest first) are shown in a scrollable list. Each row shows email, source, and timestamp. Two action buttons per row:

**Export (↓):** Triggers a browser download by navigating to `/api/admin/export-user-data?email=...`. No JS fetch — the endpoint returns a `Content-Disposition: attachment` JSON file, so the browser download dialog appears automatically.

**Delete (✕):** Calls `DELETE /api/admin/delete-user-data?email=...` with a confirmation dialog showing the exact number of records that will be removed. On success, performs **optimistic local update** — removes the email from captures list, removes associated sessions, recalculates the average duration and event count in client state without a page reload.

The confirm dialog counts records before deletion:
```typescript
const captureCount = emailCaptures.filter(c => c.email === email).length;
const sessionCountForEmail = sessions.filter(s => s.email === email).length;
// "Delete all data for alice@example.com?
//  This will permanently remove 1 email capture(s) and 2 demo session(s)."
```

GDPR actions live in the email captures list rather than the session table — an email address is the person's identity. Deleting by email is the semantically correct operation (deleting the person, not a session).

### Engagement Breakdown Bar Chart

Aggregates all `demo_events` by `event_type` and renders a bar chart. Shows which demo interactions are most popular (`tab_switch`, `expand`, `reaction`, etc.).

### Recent Sessions Table

Last 200 sessions (newest first), showing: email (or "Anonymous" in italic), started timestamp, duration, and event count. Anonymous sessions are common — users who arrived at the demo URL directly without going through the landing page email form, or who cleared their localStorage.

---

## GDPR API Routes

### Export: `GET /api/admin/export-user-data?email=...`

**File:** `src/app/api/admin/export-user-data/route.ts`

Returns a JSON file attachment containing all data held for an email address:

```json
{
  "email": "alice@example.com",
  "exportedAt": "2026-04-05T12:00:00.000Z",
  "emailCaptures": [...],
  "demoSessions": [...],
  "demoEvents": [...]
}
```

Filename: `ansible-data-alice_example_com.json` (special chars replaced with `_`).

All three table queries run in parallel — there are no FK dependencies between the analytics tables.

### Delete: `DELETE /api/admin/delete-user-data?email=...`

**File:** `src/app/api/admin/delete-user-data/route.ts`

Deletes all rows matching the email from `demo_events`, `demo_sessions`, and `email_captures` — also in parallel:

```typescript
const [eventsResult, sessionsResult, capturesResult] = await Promise.all([
  db.from('demo_events').delete().eq('email', email),
  db.from('demo_sessions').delete().eq('email', email),
  db.from('email_captures').delete().eq('email', email),
]);
```

Both routes require an authenticated admin session (same two-layer guard as the page). They return 401 if unauthenticated and 403 if authenticated but not admin.

---

## Shared UI Primitives

**File:** `src/components/admin/ui.tsx`

Both analytics panels share these primitives to avoid duplication:

- **`StatCard`** — White card with icon, label, and large value
- **`BarChart`** — Horizontal bar chart using pure CSS (no chart library). Bar widths are percentage-width `div`s relative to `maxValue`. Labels with underscores are auto-formatted.
- **`formatDuration(seconds)`** — Human-readable duration:
  - `0s` for zero or negative
  - `45s` for under a minute
  - `3m 5s` for under an hour
  - `2h 3m` for an hour or more (drops seconds — not meaningful at that scale)
- **`SECTION_HEADING`** — Shared CSS style object for section labels

---

## Type System

**File:** `src/components/admin/types.ts`

```typescript
interface LandingStats {
  totalVisits: number;
  uniqueVisitors: number;
  privacyPageViews: number;
  demoSessions: number;
  totalSignups: number;
  navClicks: { label: string; count: number }[];
  signupSources: { source: string; count: number }[];
}

interface DemoStats {
  emailCaptureCount: number;      // unique email addresses
  sessionCount: number;
  totalInteractions: number;
  avgDurationSeconds: number;
  eventTypeBreakdown: { eventType: string; count: number }[];
  sessions: DemoSessionRow[];
  emailCaptures: EmailCaptureRow[];
}
```

Types are defined once and shared between the server page (where data is built) and the client components (where data is consumed).

---

## Known Limitations

### Unique Visitor Query Scale
Fetching all visitor IDs to compute unique count in JavaScript works now but becomes inefficient at scale (thousands of rows). A Supabase RPC with `COUNT(DISTINCT visitor_id)` would be more efficient. Tracked in [Technical Debt](../technical-debt.md).

### Email ↔ Session Backfill
Sessions started before email capture have `email: null`. The session is linkable via `session_id` but there's no automated backfill that updates historical session rows when an email is captured mid-session. Tracked in [Technical Debt](../technical-debt.md).

### Static 200-session limit
The dashboard shows the most recent 200 sessions. Long-term this could truncate meaningful historical data. A date-range filter would be the right solution.

---

## Related Documentation

- [Landing Page & Demo](./landing-page-and-demo.md) — How the tracking data is generated
- [Patterns: Service Role Client](../patterns/service-role-client.md) — Why and how the service role client is used for analytics queries
- [Architecture Overview](../architecture/overview.md) — Where the admin page fits in the 3-worker setup
