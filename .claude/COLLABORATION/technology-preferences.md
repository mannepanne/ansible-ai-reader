# Technology Stack and Choices

**When to read this:** Selecting frameworks, libraries, services, or making technology stack decisions.

**Related Documents:**
- [CLAUDE.md](./../../CLAUDE.md) - Project navigation index
- [CLAUDE.md](./../CLAUDE.md) - Collaboration principles

---

Reference guide for selecting technologies across projects.

## General Preferences

- Free or low cost solutions are always preferred
- We prefer state-of-the-art solutions, but avoid experimental code or beta versions (unless nothing else is available)
- Never use outdated or deprecated solutions
- If a suitable technology doesn't seem to be available, recommend running a deep research task first to understand the topic better and find potential alternatives
- For any selected framework, library, third party component, API or other service, read the manual to ensure you use the latest stable version and follow best practice usage and patterns

## Platform-Specific Preferences

| Use Case | Preferred Technology | Reason |
| --- | --- | --- |
| CLI/Headless projects | Python | Simplicity and extensive libraries |
| Web application projects | TypeScript (strict mode) | Industry standard type safety |
| Web frontend framework | Next.js (React) with App Router | Server-side rendering and SEO |
| Web frontend design | TailWind CSS for styling with shadcn/ui as component library | Great starting point |
| Hosting of websites and web apps | CloudFlare.com | I already have an account |
| CDN / DNS / Basic data storage | Cloudflare KV | Key-value storage, then other CF options |
| Database and authentication | Supabase.com | I already have an account |
| Email communication | Resend.com | I already have an account |
| Authentication | Magic link systems | Simple and secure |
| Payment processing | Stripe.com | Industry leader |
| Web analytics | Cloudflare Web Analytics | Privacy-focused, cookie-free analytics |
