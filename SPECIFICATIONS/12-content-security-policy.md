# Phase 12: Content-Security-Policy

**Dependencies:** Requires the baseline security headers (PR: security-headers) merged and deployed.

**Brief description:**
Add a `Content-Security-Policy` to push the securityheaders.com grade from A toward A+, and — more importantly — to constrain what scripts, styles, and connections the app is allowed to make. CSP is the one security header that can break the app if mis-tuned, so it ships in **Report-Only** mode first, observes real traffic, then flips to enforcing in a follow-up.

---

## Scope and deliverables

### In scope
- [ ] `Content-Security-Policy-Report-Only` header set in `src/middleware.ts` (extends the existing `SECURITY_HEADERS` pattern)
- [ ] A report sink — `POST /api/csp-report` route that logs violations (Cloudflare observability is already enabled)
- [ ] An origin allowlist covering every third party the app actually talks to (see below)
- [ ] Tests for the header presence and the report endpoint
- [ ] Update [REFERENCE/operations/security-headers.md](../REFERENCE/operations/security-headers.md) once enforcing

### Out of scope (this PR)
- Flipping from Report-Only to enforcing `Content-Security-Policy` — that is a **separate follow-up PR** after we have observed reports and confirmed zero legitimate violations.
- HSTS preload submission (tracked separately; Cloudflare-edge concern).

### Acceptance criteria
- [ ] Built worker (`wrangler dev`) returns `content-security-policy-report-only` on the homepage
- [ ] Loading the app in a browser produces CSP reports only for things we expect (not core app functionality)
- [ ] All tests passing, type check clean
- [ ] securityheaders.com re-scanned after deploy (Report-Only does not raise the grade by itself — the grade bump comes with enforcement)

---

## Technical approach

### Why Report-Only first
A Report-Only policy makes the browser **report** what *would* be blocked without actually blocking it. Nothing breaks; we collect evidence. Once the report stream is clean, we rename the header to `Content-Security-Policy` (enforcing) in a one-line follow-up.

### The hard part: Next.js inline scripts
Next.js App Router injects inline `<script>` tags for hydration. A strict `script-src` blocks them unless we either:
- **(a)** allow `'unsafe-inline'` — weakens the policy, simplest, still passes the scanner, **or**
- **(b)** wire a per-request **nonce** through middleware and have Next stamp it on its scripts — strict, but more moving parts.

Decision deferred to implementation, informed by what Report-Only reveals. Start with a nonce-ready structure; fall back to `'unsafe-inline'` for `script-src` if nonce wiring proves fragile on OpenNext.

### Known origins to allow
Derived from the app's integrations — **verify against the codebase during implementation, don't trust this list blindly:**

| Directive | Origins | Source |
|---|---|---|
| `connect-src` | `'self'`, Supabase project URL, Perplexity API | auth + summaries |
| `script-src` | `'self'`, `https://challenges.cloudflare.com`, `https://static.cloudflareinsights.com` | Turnstile, CF Web Analytics |
| `frame-src` | `'self'`, `https://challenges.cloudflare.com` | Turnstile widget iframe |
| `style-src` | `'self'`, `'unsafe-inline'` | Tailwind / Next inline styles |
| `img-src` | `'self'`, `data:`, `https:` | article thumbnails |
| `font-src` | `'self'` | self-hosted woff2 (see preload headers) |
| `frame-ancestors` | `'none'` | redundant-but-explicit clickjacking guard alongside `X-Frame-Options` |
| `default-src` | `'self'` | baseline |

### Files
- Modify: `src/middleware.ts` (add CSP-RO to header set), `src/middleware.test.ts`
- New: `src/app/api/csp-report/route.ts` + test

---

## Known risks
- **Mis-scoped allowlist blocks core functionality** → mitigated entirely by Report-Only first.
- **Nonce wiring is brittle on OpenNext** → fallback to `'unsafe-inline'` for `script-src`; still passes the scanner, documented as accepted trade-off.
- **Supabase URL is environment-specific** → build the `connect-src` origin from `NEXT_PUBLIC_SUPABASE_URL` rather than hardcoding.

---

## Related documentation
- [REFERENCE/operations/security-headers.md](../REFERENCE/operations/security-headers.md) — current header ownership map
- [securityheaders.com](https://securityheaders.com) — grading reference
