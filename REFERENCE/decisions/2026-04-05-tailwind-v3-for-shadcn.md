# ADR: Use Tailwind CSS v3 for Landing Page and Demo UI

**Date:** 2026-04-05
**Status:** Active
**Supersedes:** N/A

---

## Decision

Use Tailwind CSS v3 (with `tailwind.config.js` and PostCSS) for the landing page, demo, and privacy page, rather than upgrading to Tailwind v4.

## Context

The project had `tailwindcss@^4.0.0` listed in `devDependencies` but no actual Tailwind usage anywhere — all existing app pages (summaries, login, settings) use inline `style={{}}` props. When porting the marketing landing page from a Vite+React prototype, we needed to decide which version of Tailwind to adopt.

The prototype was built with shadcn/ui components, which at the time of this decision (April 2026) have first-class support for Tailwind v3 but experimental/limited support for Tailwind v4. The prototype also used the standard v3 configuration pattern (`tailwind.config.js` + PostCSS).

## Alternatives considered

- **Tailwind CSS v4:** The latest major version. Uses a CSS-first config approach (no `tailwind.config.js`), eliminating PostCSS configuration complexity.
  - Why not: shadcn/ui components (Button, Input, Badge, Tabs) used by the landing page are not yet fully compatible with v4's new config system. Migrating the prototype's shadcn components to v4 would require significant rework beyond the scope of porting the landing page.

- **Tailwind CSS v3 (chosen):** Stable, widely adopted, shadcn/ui fully compatible.
  - The downgrade from the pre-installed v4 stub was safe because v4 was never actually used — no production code depended on it.

- **Continue with inline styles:** The existing app pages use inline `style={{}}` props. We could have done the same for the landing page.
  - Why not: The landing page has far more complex layout and responsive breakpoints than the app pages. Tailwind's utility classes are substantially more maintainable for this kind of content-marketing page.

## Reasoning

**shadcn/ui compatibility is the primary driver:**
- The shadcn/ui component library (used for Button, Input, Badge, Tabs, and CSS variable tokens) targets Tailwind v3
- Forcing v4 would mean either abandoning shadcn or maintaining a patched fork

**No existing code was affected:**
- All app pages (`/summaries`, `/login`, `/settings`) use inline styles
- The Tailwind v4 stub in `devDependencies` had zero consumers
- The "downgrade" was effectively a clean first installation

**v3 is production-stable:**
- Tailwind v3 is actively maintained and widely supported
- No known security issues or EOL timeline at time of decision

## Trade-offs accepted

**Locked into v3 for the foreseeable future:**
- Any future pages that adopt Tailwind must use v3 patterns
- Upgrading to v4 later means migrating all new pages (`/`, `/demo`, `/privacy`) to the CSS-first config system — non-trivial but not catastrophic

**Two styling paradigms in the codebase:**
- App pages: inline `style={{}}` props
- Marketing pages: Tailwind utility classes
- Accepted: these are distinct areas of the product with different layout complexity requirements. The tech debt of eventual migration is known and accepted.

**9 new dependencies added:**
- `postcss`, `autoprefixer`, `tailwindcss-animate`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `class-variance-authority`, `clsx`, `lucide-react`, `tailwind-merge`
- All are well-established, widely used packages with good security track records

## Implications

**Going forward:**
- New marketing or public-facing pages should use Tailwind v3 utilities
- App pages (authenticated) can continue with inline styles or gradually adopt Tailwind
- When shadcn/ui ships stable v4 support, evaluate upgrading in a dedicated PR

**Prevents:**
- Mixing Tailwind v4 CSS-first config with v3 `tailwind.config.js` — must stay consistent

---

## References

- [shadcn/ui Tailwind v4 status](https://ui.shadcn.com/docs/tailwind-v4)
- [Tailwind CSS v3 documentation](https://v3.tailwindcss.com/)
- PR #84: feat: Public landing page, interactive demo, and privacy page
- Related code: `tailwind.config.js`, `postcss.config.js`, `src/app/globals.css`
