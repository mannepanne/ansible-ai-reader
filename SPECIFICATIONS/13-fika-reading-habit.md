# 13 — Fika: a reading habit for Ansible

**Status:** Revised after `/review-spec` (2026-09-06). Ready for implementation of slice 1a.
**Last updated:** 2026-09-06
**Depends on:** nothing for slice 1a; [14-prose-summary.md](./14-prose-summary.md) improves the email but is not required
**Related:** [relay/restraint-and-prose-tuning.md](./relay/restraint-and-prose-tuning.md)

---

## Problem

Ansible turned saving into summaries, but never turned summaries into a moment. Items arrive continuously through the hourly cron sync with zero effort. Consuming them requires remembering to open a website, which greets you with the whole pile, newest first (`src/app/api/reader/items/route.ts` orders by `created_at DESC`, so the oldest saves sink out of view). There is no cue, no bounded unit of work, no visible progress, and no consequence for skipping. The rational default is to skip, so the summaries pile up. The triage layer became a second inbox.

Two problems are tangled here and both are real:

1. **A habit problem.** There is no slot in the day where reading two summaries is the obvious thing to do. Time is not the constraint. Attention is.
2. **A queue problem.** Inflow is automated and outflow is manual. Any such queue grows. Reading daily slows the growth; only a bottom on the bucket stops it.

## Research basis

The design rules below are each traceable to a finding. Full source list at the end.

| Finding | Source | Rule it produces |
|---|---|---|
| Habits form around an anchor moment plus a behaviour small enough to feel silly to skip; adherence above 85 percent when both hold. Implementation intentions ("after I X, I will Y") double to triple follow-through. | Fogg, Tiny Habits; Gollwitzer 1999 | One anchor moment, one bounded and small unit |
| Streaks work through loss aversion, but the abstinence violation effect means one missed day often ends the habit entirely. Weekly targets and heatmaps keep the motivation without the cliff. | Duolingo streak analyses; habit-streak critiques | Weekly dots, never a streak |
| Skipping one day of spaced repetition doubles the next day's queue. Seeing the full backlog is where people quit. Cap the daily due count and hide the rest. | Anki backlog guidance | The backlog is a number, never a list |
| About 70 percent of Pocket saves were never reopened. Saving is largely impulse, not intent. Pocket shut down in 2025 on this premise. | Read-it-later history; PLOS ONE 2023 | River, not bucket: unread items drift to archive |
| Pairing a "should" with a "want" raises follow-through; the effect decays unless the want is intrinsic. | Milkman, temptation bundling | The reward is intrinsic: Relay and the taste model |
| Fresh-start effect: people restart aspirational behaviours at temporal landmarks such as a new week. | Milkman, How to Change | Weekly target resets on Monday |
| Readwise's Daily Review email (5 to 10 highlights, spaced repetition) is the closest existing product, and it exists for highlights, not unread items. | Readwise docs | Email is a proven channel for exactly this shape |

## Design rules (apply to every slice)

1. **One anchor moment, one bounded unit.** Fika is two items at a time you choose. Never more, even on a good day. The research supports "bounded and small" rather than two specifically; two is the starting point and the number is revisited from data, not from the table.
2. **Nothing accumulates in the cue channel.** An ignored Fika is the same Fika tomorrow. The email never lists the backlog and never scolds.
3. **The backlog is a number, never a list.** Where the count is shown, it is a single shrinking number.
4. **River, not bucket.** Unread items older than a set age drift to archive. Build-up becomes structurally impossible.
5. **Weekly dots, no streaks.** Progress is "reading days this week", resets Monday. No streak counter anywhere, ever.
6. **The reward is intrinsic.** Rating feeds Relay and the interest-signals taste model. Surface that. No badges, no owls.
7. **Reading should feel like reading.** Fika uses the prose summary from spec 14 when it exists, bullets otherwise.
8. **Archive state is one state.** Archiving in Ansible, for any reason and through any action, archives in Reader. The two lists never diverge. Ansible is the triage surface and the memory of triage decisions; Reader is the library; unread means the same thing in both.

## Why "Fika"

The Swedish coffee break. A fixed daily pause, something small, no rush. It names the *mode* (today's two items) rather than the email, so the same two items can later appear in the web view, an audio feed, or a bot without renaming anything.

## Slices

| Slice | Contents | Status |
|---|---|---|
| **1a (this spec)** | Fika email with in-inbox actions, weekly dots in the header, settings, cron | Specified below |
| **1b (this spec)** | River mode: drift to archive, Relay skip, drifted filter | Specified below, built after 1a has run for three weeks |
| 2 | Fika section in the web view (today's two, backlog as a number, hide the rest); Relay excerpt in the email | Outline only |
| 3 | Audio: the two prose summaries as a private podcast feed | Outline only |
| 4 | Telegram bot as the on-the-go surface (same two items, inline keyboard) | Outline only |
| Later, nice to have | Reply-to-email becomes the document note | Deferred by decision 2026-09-06 |

The split follows the review: the email half is low risk and self-contained; river mode carries the archive-helper extraction, the Relay coupling, and the metric interactions. Building 1a alone also keeps the unread-count trend interpretable during the measurement period.

---

## Slice 1a — The Fika email

### 1. The Fika batch

A **batch** is the set of up to two items that are "today's Fika" for a user. Batches are persisted so they are stable across the day and across channels.

**Selection**, run once per user per day at send time:

1. Carry forward any item from the **most recent** batch (not "yesterday's": there may have been no batch yesterday) that is still **unactioned**.
2. Top up to two. The first top-up slot takes the **oldest** eligible item. The second takes the **newest** eligible item (saved in the last 7 days if any, else next-oldest). One old, one fresh: the pile drains, and the email stays interesting.
3. Eligible = not archived, not `reader_deleted`, has a `short_summary`, and not in any batch from the last 14 days.

**Actioned** = the item has been archived, by any path: the archive button in the email, the archive button in the web UI, or archived in Reader and mirrored back by the hourly sync. Ratings and click-throughs are recorded exactly as the web UI records them and do not affect the rotation. There is one exit from Fika and it is the same exit the web list has.

**Idempotence rule (design rule 2):** if both items in the most recent batch are unactioned, today's batch is identical. Nothing new enters until something is archived. An item you rated 💡 and intend to read in full stays in Fika until you archive it, which normally happens in Reader after reading.

**Empty state:** no eligible items means no email. Not "nothing to read today", just silence. Silence is the reward for an empty queue.

**Item lifecycle**, stated so the selection tests do not freeze an ambiguity:

```
unread, not in batch  --selected-->  in current batch  --archived (any path)-->  archived, out of rotation
                                          |
                                          +--next day, still unread--> carried forward (same batch item)
```

An item removed from the database, or marked `reader_deleted`, while in a batch is dropped at the next selection and the slot is topped up.

### 2. The email

Sent through Resend, which the contact form already uses with a direct REST call (`src/app/api/contact/route.ts`). Recipient is `users.email`. Design agreed on a rendered preview (2026-09-06): the email looks like the app's summary card, not the landing page. White card, the app's blue for links, near-black text, muted grey meta, on a light grey ground. System font stack. No images, no tracking pixels.

**Subject:** `Ansible Fika: Your two items to go`. Fixed. Titles never go in the subject: too long, and title text in subjects is a spam-filter risk. A hidden preheader carries the two titles so inbox previews still show them.

**Structure:**

```
Header line:  "Ansible Fika" left, the date right
Heading:      "Your two items to go."

<item card>
  Title (link to the source URL, as the web card does)
  Meta line: author · source · "N min read" from word_count (omitted when null) · "saved N days ago" · "Open in Ansible" (deep link to the item on the summaries page, for notes and anything the four buttons do not cover)
  Prose summary if present, else the bullet summary rendered as HTML, at reading size (17px)
  Tags as muted pills
  Actions in a 2x2 grid:  💡 Interesting   🤷 Not for me
                          📦 Archive       📖 Read in full

<second item card>

Footer, one muted block: the week as filled and empty circles, "3 of 5 reading days this week"
        (as of send time, so one day behind the header), the unread count as a single number,
        a Settings link, and one line saying why the email was sent.
```

**Layout rules, learned from the preview:** the container is a table at 100 percent width with a 600px max-width, never a fixed 600px width with a percentage max, which lets the cell grow past a phone screen. The action grid is two by two at every width because a four-across row cannot reflow in Gmail. Buttons are bordered blocks with emoji plus a text label, tall enough to tap, all four at equal visual weight since the web UI does not privilege archive either. A plain-text alternative part is sent alongside the HTML.

**Actions** are the four the web card offers, minus expand and note, and they do exactly what the web card does:

| Button | Effect | Leaves the rotation? |
|---|---|---|
| 💡 Interesting | rating 4 + `rated_interesting` signal | No |
| 🤷 Not for me | rating 1 + `rated_not_interesting` signal | No |
| 📦 Archive | archive in Ansible and Reader through the shared archive helper | Yes |
| 📖 Read in full | `click_through` signal, then redirect to the source URL | No |

Every signal written from the email carries `source = 'fika'` (section 7). That is the primary success measure for the trial: it is the only signal that separates "Fika worked" from "I did my usual triage in the web UI".

**Rendering rules:** every field that reaches HTML (title, author, source, tags, summary) goes through the `escapeHtml` precedent from the contact route. The bullet summary is markdown rendered through an allowlist of paragraph, list, emphasis, and link. Gmail will thread identical subjects; that is intended and keeps the cue to one thread. The renderer ships with a preview script that writes sample output to a file, so template changes are reviewed in a browser and on a phone before anything is sent.

**Preview:** the agreed mockup lives at the artifact "Ansible Fika Email" (published 2026-09-06); the renderer in `src/lib/fika/email.ts` reproduces it.

### 3. Action links and security

Email clients and corporate link scanners prefetch links. A plain GET that archives an item would be triggered by Gmail. So:

- Each action link is `GET /fika/act?t=<token>`. The GET renders a minimal page that immediately submits `POST /api/fika/act` via a form (a bundled client script auto-submits, with a visible button as the no-JS fallback; no inline script, so spec 12's CSP is unaffected). Prefetchers only ever see the GET.
- For 📖 the POST response is a redirect to the source URL, not a confirmation page. For the other three the POST response is a one-line confirmation: item title, what happened, link to the summaries page.
- The token is an HMAC-signed payload `{ user_id, item_id, batch_id, action, exp }` signed with a new secret `FIKA_ACTION_SECRET`. Expiry 7 days, which deliberately outlives the batch so an old email still works. Signature verified with a constant-time compare. Web Crypto in workerd.
- The endpoint uses the service-role client after verifying the token and re-checks that the item belongs to the user in the token. No session cookie is involved, which makes this the fourth client type after the three in [REFERENCE/architecture/authentication.md](../REFERENCE/architecture/authentication.md); document it there.
- Anyone holding the email can act. That is consistent with the single-trusted-user threat model in [the PR-review ADR](../REFERENCE/decisions/2026-04-25-pr-review-threat-model.md) and is stated here as a deliberate choice. Rotating the secret invalidates in-flight links; the 403 page says "this link has expired" rather than implying tampering.
- Archive and rating are idempotent: archiving an archived item, or rating with the same value, returns 200 without a second write or a second signal. Click-through is not deduplicated, matching the web UI's documented contract that every click is a signal.
- A tampered or expired token returns 403 with a friendly page. An item that no longer exists returns the same friendly page, never a 500.
- No rate limiter. Per-isolate in-memory limits are not a bound on Workers and would only be recorded as a control that does not work. The HMAC and idempotence are the controls.

### 4. Weekly dots

- A **reading day** is any calendar day, in the user's timezone, with at least one user archive, rating, or click-through. Derived from `item_signals` and `reader_items.archived_at` where `archive_reason = 'user'`. Reader-side archives mirrored by sync count, using the archive time the mirror records. Drift never counts (slice 1b).
- Setting `weekly_target`, integer 1 to 7, default 5.
- The header shows seven dots for the current week, Monday first, filled for reading days, with the text "3 of 5 this week". Resets Monday. No streak count, no best week, no history beyond the current week. A small API route feeds the client-side header; the derivation runs server-side.
- The same line appears in the Fika email footer.

### 5. Settings

New fields on `users`, editable on the Settings page:

| Column | Type | Default | Meaning |
|---|---|---|---|
| `fika_hour` | integer 0-23, null | null | Local hour to send Fika. Null = off (opt-in, like sync) |
| `timezone` | text | `Europe/London` | IANA zone for send time, batch date, and reading-day boundaries. Validated against `Intl.supportedValuesOf('timeZone')` |
| `weekly_target` | integer 1-7 | 5 | Reading days per week |
| `drift_days` | integer | 0 | Slice 1b. 0 = off. The settings page suggests 60 when enabling |

### 6. Scheduling

The cron worker fires hourly and calls `/api/cron/auto-sync`. Add `/api/cron/fika` with the same `CRON_SECRET` bearer pattern, called from `workers/cron.ts` in its own try/catch so a sync failure never suppresses Fika. Reuse the auto-sync loop shape: per-user try/catch, timeout budget, counted result object.

Each hour, for each user with `fika_hour` set:

1. Compute the user's local hour and local date.
2. Send if local hour is at or after `fika_hour`, within a six-hour window after it, and there is no batch for today's local date with `sent_at` set. The window means a missed tick, an overrunning sync, or a DST spring-forward still gets a Fika that day, but a long-dead cron does not fire a morning email at 23:00 on recovery.
3. Build the batch if none exists for today (upsert on `user_id, batch_date`), render, send.
4. `sent_at` is set only on a Resend 2xx. On failure, `send_attempts` increments and the next tick retries within the window, up to three attempts. A Resend timeout with an unknown outcome counts as an attempt and is retried; the small chance of a duplicate email is accepted over the certainty of a missing one. Exhausted attempts are logged with the Resend error class (429, 4xx, 5xx) and surfaced as a count in the admin dashboard.

Concurrency with a running sync is acceptable: an item archived by the mirror in the same minute is dropped at the next selection.

### 7. Data model

```sql
CREATE TABLE fika_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_date date NOT NULL,                 -- the user's local date
  sent_at timestamptz,
  send_attempts integer NOT NULL DEFAULT 0,
  resend_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, batch_date)
);

CREATE TABLE fika_batch_items (
  batch_id uuid NOT NULL REFERENCES fika_batches(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES reader_items(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  carried_from uuid REFERENCES fika_batches(id),
  PRIMARY KEY (batch_id, item_id)
);
CREATE INDEX fika_batch_items_item_idx ON fika_batch_items(item_id);

-- Signals: where an action came from. Existing rows are web.
ALTER TABLE item_signals
  ADD COLUMN source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'fika'));

-- Archive provenance. Written by the shared archive helper from now on.
ALTER TABLE reader_items
  ADD COLUMN archive_reason text CHECK (archive_reason IN ('user', 'drift'));

ALTER TABLE users
  ADD COLUMN fika_hour integer CHECK (fika_hour BETWEEN 0 AND 23),
  ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN weekly_target integer NOT NULL DEFAULT 5 CHECK (weekly_target BETWEEN 1 AND 7),
  ADD COLUMN drift_days integer NOT NULL DEFAULT 0 CHECK (drift_days >= 0);
```

A child table rather than `uuid[]`: carry-forward, per-item state, and the 14-day exclusion become joins, and slices 2 to 4 want per-item state anyway. `fika_batches` follows the `reader_items` RLS pattern (owner read, service-role write) and is added to the admin delete-user-data route's explicit table list.

### 8. The shared archive helper

Today the user-facing archive logic is inlined in the session-authenticated route `src/app/api/reader/archive/route.ts`: it calls the Reader API, handles a 404 by setting `reader_deleted`, and updates `archived`, `archived_at`. Fika needs the same behaviour from a service-role context, and river mode needs it from cron. So:

- Extract `archiveItemForUser(db, { userId, itemId, reason })` into `src/lib/archive.ts`. It archives in Reader, ports the 404-to-`reader_deleted` case, and sets `archived`, `archived_at`, and `archive_reason` together. The codebase queries both `archived` and `archived_at` in different places, so the helper always sets both.
- Migrate the existing route onto it. Its existing tests change accordingly; reviewers should expect that churn.
- `sync-operations.ts` is not touched: its archive step is the Reader-to-Ansible mirror, not a writer. The mirror sets `archive_reason = 'user'` for archives it discovers, since a Reader-side archive is a user action.

### 9. Key files (1a)

```
New
  src/lib/archive.ts                  shared archive helper (section 8)
  src/lib/fika/select-batch.ts        selection + carry-forward (pure, heavily tested)
  src/lib/fika/action-token.ts        HMAC sign/verify (pure)
  src/lib/fika/email.ts               HTML rendering + escaping (pure, snapshot tested)
  src/lib/fika/reading-days.ts        weekly dots derivation (pure)
  src/lib/fika/schedule.ts            local-hour window + retry predicate (pure)
  src/app/api/cron/fika/route.ts      hourly entry point
  src/app/api/fika/act/route.ts       POST action endpoint
  src/app/api/fika/reading-days/route.ts   feeds the header
  src/app/fika/act/page.tsx           GET landing page that auto-submits
  src/components/WeeklyDots.tsx
Modified
  workers/cron.ts                     second call, own try/catch
  src/app/api/reader/archive/route.ts use the helper
  src/app/api/reader/signal/route.ts  write source = 'web'
  src/app/api/reader/rating/route.ts  write source = 'web'
  src/lib/sync-operations.ts          mirror writes archive_reason = 'user'
  src/app/settings/*                  new fields
  src/components/Header.tsx           weekly dots
  src/app/api/admin/delete-user-data/route.ts   fika tables
```

### 10. Acceptance criteria (1a)

- [ ] With two unactioned items in the most recent batch, today's batch is identical (idempotence). Holds when the most recent batch is older than yesterday.
- [ ] Archiving one item, by any of the three paths, replaces exactly that item at the next selection; the other carries forward.
- [ ] Rating or clicking through an item does not change the rotation.
- [ ] Empty eligible set sends nothing and records nothing.
- [ ] A GET on an action link performs no write. Only the POST does. 📖 redirects; the others confirm.
- [ ] A tampered or expired token, or a deleted item, returns a friendly page and performs no write.
- [ ] Repeating archive or rating is a no-op with a 200. Repeating click-through records again.
- [ ] Every signal from the email carries `source = 'fika'`; every signal from the web carries `source = 'web'`.
- [ ] The web archive route and the sync mirror write `archive_reason = 'user'`.
- [ ] The send predicate sends once per local day inside the window, retries a failed send on the next tick, stops after three attempts, and handles DST in both directions and a user at `fika_hour = 23`.
- [ ] Weekly dots count a reading day from any of the three user actions, in the user's timezone, and reset on Monday.
- [ ] All rendered fields are escaped. Snapshot tests cover one-item and two-item batches, with and without prose, with and without `word_count`.
- [ ] Manual: email renders in Gmail web, Gmail Android, and Apple Mail, light and dark. This is unverifiable in CI and is a manual step on every template change.
- [ ] Tests first, coverage targets hold, `npx tsc --noEmit` clean.
- [ ] REFERENCE docs: new `features/fika.md`, `authentication.md` fourth client type, `automated-sync.md` cron additions, `database-schema.md`, `interest-signals.md` source column, `patterns/` archive helper.

### 11. Testing strategy (1a)

All decision logic is pure and tested exhaustively: selection with carry-forward and the lifecycle above; token sign, verify, expiry, and tamper; the schedule predicate across timezones, DST, the window, and attempts; reading-day derivation across day boundaries and the Monday reset. Timezone cases are the largest surface here, roughly three to four times what a naive plan implies; budget for it. Email HTML is snapshot tested. Route tests mock Resend, the archive helper, and the service-role client. The cron route is tested with fake timers. Tests that would exercise the real Reader queue are avoided; the archive helper is mocked (see the project memory on the shared queue hanging under fake timers).

---

## Slice 1b — River mode

Built after 1a has run for three weeks, so the unread trend during the trial reflects reading rather than drift.

### 12. Drift

A nightly pass at local 03:00, from the same cron endpoint, archives unread items older than `drift_days`.

- `drift_days` is 0 by default and off. When you enable it, the settings page suggests 60. There is no rescue path: an item that drifts is archived in both systems, its rating and note survive in Ansible as the memory of the decision, and it is findable in Reader's archive like anything else. If that ever feels wrong, the answer is a longer `drift_days`, not a rescue feature.
- Drift archives through the shared helper with `reason = 'drift'`, so Reader and Ansible stay in one state (rule 8). A Reader 404 marks `reader_deleted` and continues.
- Drift never touches an item in the current Fika batch. The email must never link to something the app has already archived.
- Items rated 💡 are exempt while `drift_exempt_interesting` is true (new boolean on `users`, default true). Review after the trial: if 💡 items pile up unread, that is the user's explicit "read in full" pile and the setting can be turned off.
- Items with no summary are still subject to drift. They were never shown, but they are also 60 days old and unread.
- Cap of 20 per night, unconditional, oldest first. There is no "first run" state to detect and the unconditional cap satisfies the recovery case on its own. Lowering `drift_days` later simply creates a new backlog that drains at 20 a night.
- Wall-clock: 20 Reader calls consume the shared queue's per-minute budget; the pass must run inside the cron timeout budget and tolerate 429 via the existing retry-after handling.

### 13. Relay must not react to drift

The engagement gate is a standing scan over `archived = true AND relay_triggered_at IS NULL` at the end of each sync, so drifted items will be swept up unless handled. A drifted item with a note or highlight would otherwise wake the narrator. Required changes, listed because the review found them spread across six files:

- Migration: drop and recreate the `relay_gate_code` check to add `'drift'`.
- `src/lib/relay/engagement-trigger.ts`: the scan selects `archive_reason`; `classifyEngagement` takes it in its input and returns `skip('drift')` before any signal check. Its tests change.
- `src/app/admin/page.tsx`: the three query sites that enumerate skip codes, and the union type.
- `src/components/admin/types.ts` and `RelayAgent.tsx`: render `'drift'` as "drifted to archive", not "no engagement signal".
- Activity log: drift skips appear like any other skip. The cheaper alternative, stamping `relay_triggered_at` at drift time, was considered and rejected because it hides drift from the log.

### 14. Drifted filter

The summaries page gets an "archived by drift" filter (archived items with `archive_reason = 'drift'`), so what drifted is visible on request without ever being pushed. This is the only place drift is listed, and it is behind a click.

### 15. Acceptance criteria (1b)

- [ ] Drift never archives a 💡 item while the exemption is on, never touches a current-batch item, never exceeds 20 per night, and archives in Reader through the helper.
- [ ] A Reader 404 during drift marks `reader_deleted` and the pass continues.
- [ ] A drifted item never counts as a reading day and never fires the Relay gate; with the gate on, it logs a `drift` skip that the admin tab renders correctly.
- [ ] The web archive route, the sync mirror, and drift each write the correct `archive_reason`.
- [ ] Drift tests mock the archive helper.

---

## Four risks

- **Value.** You asked for exactly this, but the real test is whether the email gets opened at coffee for three weeks. The idempotence rule is the mitigation for the failure mode where the email itself becomes a pile. The outcome measure is Fika-sourced signals per week, read from `item_signals`, with reading days and the unread count as secondary. Drift stays off during measurement so the unread trend means something.
- **Usability.** Four buttons in an email is the maximum. Every extra element is a reason to close it. The landing page after a click must be one glance and done, and 📖 must not interpose a page at all.
- **Feasibility.** 1a is low: cron, Resend, and service-role writes exist; the new surface is the token endpoint, the email renderer, and the archive-helper extraction. 1b is medium: it touches the Relay subsystem across six files and the shared Reader queue.
- **Viability.** Cost is one Resend email a day. Drift is the only irreversible-feeling step; it is off by default, 60 days when on, and preserves the rating and note.

## Decisions taken at review (2026-09-06)

1. Ratings in the email do not archive. Same as the web UI. The only exit from the rotation is archive, by any path.
2. Drift archives in Reader. No rescue feature. 60 days when enabled, off by default.
3. In-inbox action buttons stay in 1a.
4. Slice 1 is split into 1a and 1b; 1b starts after three weeks of 1a data.
5. Spec 14 is built after 1a, not before. The email falls back to bullets until then.

## Open questions (remaining)

1. Oldest plus newest, or two oldest? (Position: one of each. Two oldest makes every Fika feel like homework.) Once drift is on, the oldest slot becomes a last look before an item drifts; revisit whether that slot should be interest-weighted, which is also open question 2.
2. Should the second slot prefer items whose tags match past 💡 ratings once the interest-signals model exists? (Position: slice 2, only if selection stays explainable.)
3. Is two the right number? Decide from the trial, not from the research table.

## Rollout

1. Migration, settings UI, the archive helper, and the cron endpoint, behind `fika_hour = null`. Nothing sends until you set an hour.
2. Enable for the owner account only. Run for three weeks. Read Fika-sourced signals per week, the dots, and the unread trend.
3. Build 1b. Enable drift at 60 days.
4. Then decide on slice 2.

---

## Slices 2 to 4, outline

**Slice 2, web view and Relay excerpt.** The summaries page gets a Fika section at the top showing today's batch, then a single number for the rest, with the full list behind a disclosure. The email gains a short section: the last Relay piece written from something you rated, with a link. Depends on Relay restraint tuning landing first, or the excerpt will be noise.

**Slice 3, audio.** The two prose summaries read by a TTS voice into a private RSS feed. Depends on spec 14. Cloudflare R2 for the audio files. Candidate TTS providers to be evaluated at spec time.

**Slice 4, Telegram bot.** A daily message with the same batch and an inline keyboard of the four actions, using the same token mechanism. Cheaper than any native app and native on Android.

**Adjacent, separate ticket.** Drift makes visible that bullet summaries are generated for every synced item on arrival, so items that drift unread were summarised at cost for nothing. Worth asking whether bullets should go lazy the way spec 14 proposes for prose.

---

## Sources

- [Duolingo streak system breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [The psychology behind Duolingo's streak feature](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)
- [Duolingo's habit-forming reminders](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/)
- [Why my daughter quit Duolingo: streak addiction](https://drracheltaylor.substack.com/p/why-my-daughter-quit-duolingo-the)
- [The habit streak paradox](https://workbrighter.co/habit-streak-paradox/)
- [Saved, never read: a 20-year history of read-it-later apps](https://slax.com/blog/read-it-later-history/)
- [Read it later app 2026: honest guide from a builder](https://www.burn451.cloud/blog/read-it-later-app)
- [Opinionated read-later: a river, not a bucket](https://github.com/hansdez/opinionated-read-later)
- [Ephemera: expiring bookmarks](https://apps.apple.com/us/app/ephemera/id1565668129)
- [Catching up on your Anki reviews](https://controlaltbackspace.org/catch-up/)
- [How to overcome Anki burnout](https://fluxo.today/blog/how-to-overcome-anki-burnout-clear-your-review-backlog-and-study-sustainably/)
- [Tiny Habits, BJ Fogg's method](https://goalsandprogress.com/tiny-habits-fogg-behavior-model-explained/)
- [Habit stacking, James Clear](https://jamesclear.com/habit-stacking)
- [Temptation bundling evaluation, Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784)
- [Katy Milkman on the fresh-start effect](https://www.charterworks.com/katy-milkman-how-to-change-wharton/)
- [Readwise Daily Review](https://readwise.io/)
- [Matter and Meco: reading newsletters in an app](https://www.fastcompany.com/91164889/email-newsletter-reader-matter-meco)
