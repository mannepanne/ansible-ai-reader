# Fika
REFERENCE > Features > Fika

The daily two-item reading email, with in-inbox actions and weekly reading-day dots. Slice 1a of [spec 13](../../SPECIFICATIONS/13-fika-reading-habit.md).

## What Is This?

Fika turns the summaries into a moment. Once a day, at an hour the user picks, an email arrives with two items: the oldest unread one and the freshest one saved in the last week. Each item shows its summary and four buttons that do exactly what the web card does. An ignored Fika is the same Fika tomorrow: nothing accumulates in the inbox, and an item only leaves the rotation when it is archived, by any path.

**Design rules** (from the spec, each traced to habit research):
1. One anchor moment, one bounded unit: two items, never more.
2. Nothing accumulates in the cue channel.
3. The backlog is a number, never a list.
4. Weekly dots, no streaks: "3 of 5 reading days this week", reset on Monday.
5. The reward is intrinsic: Fika-sourced signals feed the interest model and Relay.
6. Archive state is one state: archiving in Ansible archives in Reader.

River mode (unread items drifting to archive) is slice 1b and is not built yet; its `drift_days` setting exists but is off.

## How It Works

```
workers/cron.ts (hourly)
  └─ GET /api/cron/fika  (CRON_SECRET)
       └─ for each user with fika_hour set: runFikaForUser()
            ├─ shouldSend()        local hour in [fika_hour, fika_hour + 6), no sent batch today, < 3 attempts
            ├─ getBatchByDate()    reuse today's unsent batch (a failed send) if there is one
            ├─ selectBatch()       else carry forward unarchived items from the most recent batch, top up oldest + freshest
            ├─ createBatch()       fika_batches + fika_batch_items
            ├─ renderFikaEmail()   HTML + text, signed action links per item and action
            ├─ sendViaResend()
            └─ markSent() / recordSendAttempt()
```

### Selection (`src/lib/fika/select-batch.ts`)

Pure. Slot 1 is the oldest eligible item; slot 2 is the newest item saved in the last 7 days, else the next-oldest. Eligible means unread, not `reader_deleted`, and summarised. Unarchived items from the most recent batch (whatever its date) keep their slots. Items in any batch in the last 14 days are excluded from fresh selection.

### Scheduling (`src/lib/fika/schedule.ts`)

All timezone logic lives here, using `Intl.DateTimeFormat` so DST is ICU's problem. A batch is keyed by the user's local date. The send window is six hours after `fika_hour`, so a missed tick, an overrunning sync, or a spring-forward hour still gets a Fika that day, while a long-dead cron never sends a morning email in the evening on recovery. Three send attempts per day, then the day is abandoned and logged.

### The email (`src/lib/fika/email.ts`, `markdown.ts`)

Inline styles, table layout, a 100 percent width container with a 600px max, a two-by-two button grid at every width, and a plain-text alternative. Every model-generated field is escaped, then a small allowlist markdown renderer re-enables bullets, numbered lists, bold, emphasis, and http(s) links. The subject is fixed: `Ansible Fika: Your two items to go`. Titles go in a hidden preheader, never the subject. Render the sample with `npm run fika:preview` and open `fika-preview.html`.

### Action links (`src/lib/fika/action-token.ts`, `/fika/act`, `/api/fika/act`)

Each button is `GET /fika/act?t=<token>`. The GET renders a form that a bundled client script submits to `POST /api/fika/act`; a visible Continue button is the no-JS fallback. Link prefetchers only ever see the GET, which writes nothing.

The token is an HMAC-SHA256 signature over `{ userId, itemId, batchId, action, exp }` with `FIKA_ACTION_SECRET`, base64url encoded, verified with a constant-time compare, valid for 7 days. No session is involved: the token is the credential. See [authentication.md](../architecture/authentication.md#4-signed-action-token-fika-email) for the threat model.

| Button | Effect | Leaves the rotation? |
|---|---|---|
| 💡 Interesting | rating 4 + `rated_interesting` signal, `source = 'fika'` | No |
| 🤷 Not for me | rating 1 + `rated_not_interesting` signal, `source = 'fika'` | No |
| 📦 Archive | `archiveItemForUser` with reason `user` (Reader first, then local) | Yes |
| 📖 Read in full | `click_through` signal, `source = 'fika'`, then 303 redirect to the article | No |

Ratings and archive are idempotent. Bad or expired tokens, and items that no longer exist, get a friendly HTML page and no write.

### Weekly dots (`src/lib/fika/reading-days.ts`, `WeeklyDots.tsx`, `/api/fika/reading-days`)

A reading day is any local calendar day with at least one signal (any type) or a user archive (`archive_reason` is `user` or null, never `drift`). The header shows seven dots, Monday first, and "N of M this week" on desktop. The same line is in the email footer as of send time.

## Settings

| Setting | Column | Default | Meaning |
|---|---|---|---|
| Fika email | `users.fika_hour` | null (off) | Local hour to send, 0-23 |
| Timezone | `users.timezone` | `Europe/London` | IANA zone, validated with `Intl` |
| Reading days a week | `users.weekly_target` | 5 | Target for the dots, 1-7 |

Edited on the Settings page; saved with the rest of the settings through `PATCH /api/settings`.

## Configuration

- `FIKA_ACTION_SECRET` (main app secret): signs action links. Rotating it invalidates links in emails already sent.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: already present for the contact form; Fika sends as `Ansible <RESEND_FROM_EMAIL>`.
- `NEXT_PUBLIC_SITE_URL`: base for links in the email; defaults to `https://ansible.hultberg.org`.
- `CRON_SECRET`: the cron worker calls `/api/cron/fika` with it, in its own try/catch after auto-sync.

## Measuring the trial

The primary measure is Fika-sourced actions per week:

```sql
SELECT date_trunc('week', created_at) AS week, signal_type, count(*)
FROM item_signals
WHERE source = 'fika'
GROUP BY 1, 2 ORDER BY 1;
```

Reading days (the dots) and the unread count are secondary. Drift stays off during the trial so the unread trend reflects reading.

## Troubleshooting

- **No email arrived.** Check `fika_batches` for today's local date: no row means `shouldSend` never returned true (Fika off, before the hour, or the six-hour window passed). A row with `sent_at` null and `send_attempts` 3 means Resend failed three times; the cron log has the Resend status.
- **Same two items every day.** That is the idempotence rule: nothing changes until one of them is archived.
- **A link says it expired.** Tokens last 7 days, and rotating `FIKA_ACTION_SECRET` invalidates every existing link.
- **Dots look wrong.** Reading days are computed in `users.timezone`; check it is the zone the user is actually in.

## Related Documentation

- [Spec 13](../../SPECIFICATIONS/13-fika-reading-habit.md): design rules, research basis, slices 1b to 4
- [Spec 14](../../SPECIFICATIONS/14-prose-summary.md): the prose summary the email will prefer once it exists
- [interest-signals.md](./interest-signals.md): the `source` column
- [reader-sync.md](./reader-sync.md#3-archive-item-post-apireaderarchive): the shared archive helper
- [automated-sync.md](./automated-sync.md): the cron worker
