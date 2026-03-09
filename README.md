# Ansible AI Reader

AI-powered depth-of-engagement triage for Readwise Reader content. Generate summaries of unread items to decide what deserves full reading versus consuming just the key takeaways.

## About the Name

**Ansible** combines two concepts:
- Ursula K. Le Guin's **ansible** - an instant communication device from her Hainish Cycle novels
- The **Book of Thoth** - legendary repository of universal knowledge

Together: instant access to distilled knowledge from your reading list.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Database**: Supabase (Postgres + Auth)
- **Deployment**: Cloudflare Workers
- **Integrations**: Readwise Reader API, Perplexity API (summaries), Resend (magic links)

## Overview

Full specification: [`SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md`](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)

## Development

Built with [Claude Code](https://claude.com/claude-code) using agent teams for collaborative PR reviews.

See [`CLAUDE.md`](./CLAUDE.md) for project navigation and development workflow.
