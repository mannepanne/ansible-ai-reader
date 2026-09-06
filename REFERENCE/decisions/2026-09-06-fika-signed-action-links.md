# ADR: Fika email actions use a signed token as the credential, with GET-renders / POST-writes

**Date:** 2026-09-06
**Status:** Active
**Supersedes:** N/A

---

## Decision

The buttons in the daily Fika email act without a session. Each link carries an HMAC-SHA256-signed, expiring token naming the user, item, batch, and action. `GET /fika/act` only renders a form; `POST /api/fika/act` verifies the token and acts through the service-role client after re-checking item ownership. This is the project's fourth client type alongside the browser, server, and service-role clients.

## Context

Fika's whole point is a decision made from the inbox, over coffee, often on a phone where the app may not be signed in. A link that bounced through the magic-link login would lose the moment. At the same time, mail clients and security products prefetch links, so any GET that performs the action would be triggered by Gmail before the user ever opened the email.

## Alternatives considered

- **Session-authenticated links into the app:** one tap in the email, then a login redirect when the phone session has lapsed. Why not: the context switch lands exactly when the habit is most fragile.
- **Plain GET action links with a random id:** simplest. Why not: prefetchers would archive items unread.
- **Single-use tokens consumed on first use:** stricter. Why not: a prefetcher would consume the token before the user, and the same email is legitimately reopened over several days. Kept as the tightening to apply if the user base widens.
- **Signed token plus GET-renders / POST-writes:** chosen. Ordinary prefetchers and Gmail's link proxy see a harmless GET; the write needs a POST with a valid signature.

## Reasoning

- The token cannot read anything, cannot touch other items or other users (ownership is re-checked server-side), and every effect is one the user can undo in the UI. Under the single-trusted-user threat model ([2026-04-25](./2026-04-25-pr-review-threat-model.md)), "anyone holding the email can act on those two items for a week" is an acceptable exposure.
- Verification order is signature first, then parse, then expiry, with a constant-time compare, so an unsigned token learns nothing.
- Tokens live 7 days, longer than a batch, so an old email still works. Rotating the secret invalidates every outstanding link, which the page reports as "expired" rather than implying tampering.
- The landing page auto-submits once per token per browser session, so the Back button after "Read in full" does not act again or bounce the user out.

## Trade-offs accepted

- A mail scanner that executes JavaScript would submit the form. For a single owner on a personal Gmail account this does not arise; if it ever does, the archive action can require an explicit tap while the harmless actions keep auto-submitting.
- Tokens are reusable for their lifetime. If the user base widens: shorten the TTL to the batch lifetime and mark tokens consumed when their batch is superseded.

## References

- [authentication.md](../architecture/authentication.md#4-signed-action-token-fika-email), [fika.md](../features/fika.md#action-links), spec [13](../../SPECIFICATIONS/13-fika-reading-habit.md)
