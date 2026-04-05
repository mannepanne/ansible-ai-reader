# ADR: Cookie-free, localStorage-based analytics (build vs. buy)

**Date:** 2026-04-05
**Status:** Active
**Supersedes:** N/A

---

## Decision

Ansible tracks landing page and demo engagement using a custom-built, cookie-free analytics system backed by localStorage identity and direct Supabase writes — rather than using a third-party analytics product.

## Context

The landing page and demo needed behavioural analytics to inform product decisions: how many visitors, which sections they engage with, how they use the demo, conversion rates. Standard options range from free (Google Analytics) to paid privacy-preserving tools (Plausible, Fathom, PostHog). The alternative was to build something purpose-built.

Ansible collects email addresses before the demo — GDPR compliance was a hard constraint. Any analytics approach had to be compatible with the privacy policy commitments made to users.

## Alternatives considered

- **Google Analytics / similar:**
  Free, battle-tested, rich dashboards.
  - Why not: Third-party cookies, cross-site tracking, GDPR consent banner required, data leaves the product's control, overkill for a simple waitlist/demo funnel.

- **Plausible / Fathom (privacy-first SaaS):**
  Cookie-free, GDPR compliant, clean UI. ~€9–19/month.
  - Why not: External dependency, recurring cost for a pre-launch product, data hosted elsewhere, limited customisation for demo-specific events (tab switches, expand/collapse, reactions). Would still require integration work.

- **PostHog (self-hosted or cloud):**
  Full product analytics, feature flags, session recording. Free tier available.
  - Why not: Significant operational overhead to self-host. Cloud version sends data to a third party. More than needed for two pages.

- **Custom build with localStorage + Supabase (chosen):**
  Visitor and session identities stored in localStorage (no cookies). Events written directly to Supabase tables. Admin dashboard built as a protected page in the existing Next.js app.

## Reasoning

**GDPR fit:** No cookies means no cookie consent banner. The privacy policy accurately commits to localStorage-only tracking, no third-party sharing, and full data deletion on request. This is genuinely simpler to honour with owned infrastructure.

**Data ownership:** All analytics data lives in the same Supabase project as the rest of the application. GDPR export and deletion are handled by the existing admin API routes — no third-party data processor to coordinate with.

**Demo-specific events:** The demo tracks tab switches, card expansions, reactions, archive actions — events specific to the product UI. Generic analytics products need custom event schemas and per-plan event quotas. Purpose-built tracking handles these naturally.

**Stack simplicity:** No new third-party SDK. The tracking hooks use the same Supabase client already in the project. The admin dashboard is a Next.js page. Zero new dependencies.

**Scale:** This is a waitlist funnel for a pre-launch product. Traffic volume does not justify the operational complexity of a dedicated analytics platform.

## Trade-offs accepted

**Maintenance burden:**
Custom code means we own bugs, schema migrations, and dashboard logic.
- Accepted: The scope is narrow (two public pages, one admin dashboard). The reference documentation is thorough.

**No out-of-box features:**
Funnel visualisation, cohort analysis, A/B testing — none of this comes for free. Each new insight needs a new query or dashboard section.
- Accepted: Current analytics needs are simple (visitor counts, demo engagement, conversion rate). This can be revisited if needs grow.

**Session model is approximate:**
The 30-minute inactivity timeout for sessions mirrors industry convention but is not exact. A user who leaves for 31 minutes and returns gets a new session.
- Accepted: Sufficient precision for product decision-making at this stage.

**No real-time dashboard:**
Analytics are fetched at page load and computed server-side. The dashboard does not update live.
- Accepted: Admin checks the dashboard periodically, not in real time.

## Implications

**Enables:**
- Full control over data model, retention, and deletion — GDPR compliance is first-class
- Custom demo-specific events without quota limits or schema constraints
- Analytics data queryable via the same Supabase project (can join with other tables if needed)

**Prevents/complicates:**
- Cannot trivially add features like session replay, heatmaps, or user journey analysis without significant build effort
- Switching to a third-party analytics tool later would require migrating historical data or abandoning it

---

## References

- Reference doc: [landing-page-and-demo.md — Identity & Tracking System](../features/landing-page-and-demo.md#identity--tracking-system)
- Reference doc: [admin-analytics.md](../features/admin-analytics.md)
- Privacy commitments: `src/app/privacy/page.tsx`
