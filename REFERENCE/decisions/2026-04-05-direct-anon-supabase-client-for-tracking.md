# ADR: Use direct anonymous Supabase client for public tracking pages

**Date:** 2026-04-05
**Status:** Active
**Supersedes:** N/A

---

## Decision

The public tracking hooks (`usePageTracking`, `useTracking`) use a direct anonymous Supabase client (`createClient` from `@supabase/supabase-js`) rather than the server-aware client used everywhere else in the application.

## Context

The landing page, demo page, and privacy page need to write analytics data to Supabase — page views, email captures, demo sessions, and events. The rest of Ansible uses `@supabase/ssr`'s `createBrowserClient` (or server-side equivalents), which is the standard pattern for authenticated Next.js applications. The question was whether the tracking hooks should follow that same pattern or use something different.

## Alternatives considered

- **`createBrowserClient` from `@supabase/ssr` (standard app pattern):**
  Reads auth state from cookies. Used by all authenticated pages in Ansible.
  - Why not: Public tracking pages have no user session — there are no auth cookies. The SSR client would produce an empty session on every call, adding complexity and overhead for no benefit. Worse, if an authenticated user visits the landing page, the SSR client could pick up their session and blur the distinction between anonymous tracking and authenticated activity.

- **Server-side API routes proxying writes:**
  Client sends tracking data to a Next.js API route, which then writes to Supabase with a service role client.
  - Why not: Adds an extra network hop and server-side code for every tracking event. The events are low-sensitivity INSERT-only data — there is no reason to route them through the application server.

- **Direct `createClient` from `@supabase/supabase-js` (chosen):**
  Uses the publishable anon key, writes directly from browser to Supabase. HTTP requests only fire when `.then()` is called (see lazy thenable note in the reference docs).

## Reasoning

Public tracking pages have a fundamentally different security posture from the rest of the application:

- **No auth session exists** — visitors are anonymous by definition. The SSR client adds nothing.
- **RLS policies cover this** — `email_captures`, `demo_sessions`, `demo_events`, and `page_events` tables have INSERT-only policies for the `anon` role. Reads are blocked. The anon key cannot do anything outside these policies.
- **The publishable key is safe here** — It is designed to be exposed in client-side code. It cannot bypass RLS.
- **Direct writes are simpler** — No server round-trip, no extra infrastructure, no session management.

This pattern matches how Supabase recommends handling truly anonymous data collection.

## Trade-offs accepted

**Two Supabase client patterns in the same codebase:**
Developers new to the project will see `@supabase/ssr` used everywhere except the tracking hooks, which use a plain `createClient`. This is intentional but could cause confusion.
- Accepted: The reference documentation (`landing-page-and-demo.md`) explains this explicitly under "Why a Direct Supabase Client?"

**No automatic session inheritance:**
If a logged-in user visits the demo, tracking events are written under the anon role, not linked to their Supabase account.
- Accepted: The tracking system uses its own visitor/session UUID identity model (localStorage-based), deliberately separate from Supabase Auth identity.

**Authenticated users also need INSERT policies:**
The `anon` role covers public visitors but logged-in users fall under the `authenticated` role — a separate RLS policy is required for each table. Forgetting this silently discards events for authenticated users.
- Accepted: Policies are in place. Future analytics tables must include both `anon` and `authenticated` INSERT policies.

## Implications

**Enables:**
- Simple, dependency-light tracking code with no session management
- Any future public-facing page can use the same `usePageTracking` hook without worrying about auth state

**Prevents/complicates:**
- Cannot use the tracking hooks to write to tables that require an authenticated session
- Any tracking table must have explicit `anon` INSERT policies — relying on `authenticated`-only policies will silently fail for anonymous visitors

---

## References

- Reference doc: [landing-page-and-demo.md — Identity & Supabase Client](../features/landing-page-and-demo.md#why-a-direct-supabase-client)
- Supabase anon key documentation: https://supabase.com/docs/guides/api/api-keys
