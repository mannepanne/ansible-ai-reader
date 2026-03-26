# System Overview
REFERENCE > Architecture > Overview

High-level system architecture, technology stack, and design decisions.

## What Is This?
Ansible AI Reader is an AI-powered depth-of-engagement triage system for Readwise Reader content. It generates AI summaries so you can decide what deserves full reading versus consuming just the key takeaways.

## Core Workflow
1. **Sync** unread items from Readwise Reader
2. **Generate** AI summaries via Perplexity API
3. **Review** summaries, add notes, rate interest
4. **Archive** items (syncs back to Reader) or read in full

## Technology Stack

### Frontend
- **Next.js 15** (App Router) - React framework
- **React 19** - UI library
- **ReactMarkdown** - Formatted summary rendering

### Backend
- **Cloudflare Workers** - Serverless runtime (NOT Pages)
- **Node.js runtime** - nodejs_compat compatibility mode

### Data & Storage
- **Supabase** - PostgreSQL database + Authentication
- **Cloudflare Queues** - Async job processing

### External Services
- **Readwise Reader API** - Article sync and content fetching
- **Perplexity API** (sonar-pro) - AI summary generation
- **Resend** - Email delivery for magic links

### Development
- **TypeScript** - Type safety
- **Vitest** - Testing framework (~293 tests)
- **GitHub Actions** - CI/CD pipeline

## 3-Worker Architecture

We deploy **three separate Cloudflare Workers**:

### 1. Main App Worker (`wrangler.toml`)
- Next.js application
- API routes for auth, sync, settings
- Queue producer
- Serves UI

### 2. Queue Consumer Worker (`wrangler-consumer.toml`)
- Processes async jobs from Cloudflare Queues
- Fetches full article content from Reader
- Generates summaries via Perplexity
- Updates database with results

### 3. Cron Worker (`wrangler-cron.toml`)
- Runs hourly (cron schedule)
- Triggers automated sync for users with sync_interval > 0
- Separate worker because OpenNext doesn't support scheduled() function

**Why 3 workers?** OpenNext (Cloudflare adapter for Next.js) only generates HTTP request handlers, not scheduled event handlers. The cron functionality must be in a separate worker.

## System Diagram

```mermaid
graph TB
    subgraph "User Interface"
        UI[Next.js Frontend<br/>Pages: Home, Summaries, Settings]
        Header[Header Component]
        SummaryCard[SummaryCard with<br/>ReactMarkdown]
        SettingsPage[Settings Page]
    end

    subgraph "Cloudflare Workers - Main App"
        Auth[Auth API Routes<br/>/api/auth/*]
        ReaderAPI[Reader API Routes<br/>/api/reader/*]
        SettingsAPI[Settings API<br/>/api/settings]
        CronAPI[Cron Handler<br/>/api/cron/auto-sync]
        Middleware[Auth Middleware<br/>Session Protection]
    end

    subgraph "Cloudflare Workers - Queue Consumer"
        Consumer[Queue Consumer Worker<br/>workers/consumer.ts]
    end

    subgraph "Cloudflare Workers - Cron"
        CronWorker[Cron Worker<br/>workers/cron.ts<br/>Runs hourly]
    end

    subgraph "Cloudflare Infrastructure"
        Queue[Cloudflare Queues<br/>ansible-processing-queue]
        DLQ[Dead Letter Queue<br/>ansible-processing-dlq]
    end

    subgraph "External Services"
        Supabase[(Supabase<br/>PostgreSQL + Auth)]
        Reader[Readwise Reader API]
        Perplexity[Perplexity API<br/>sonar-pro model]
        Resend[Resend SMTP]
    end

    subgraph "Database Schema"
        DB_Users[users table<br/>Settings, last_auto_sync_at]
        DB_Items[reader_items table<br/>Articles + summaries]
        DB_Jobs[jobs table<br/>Queue job tracking]
        DB_Sync[sync_log table<br/>Sync history]
    end

    %% User flows
    UI --> Header
    UI --> SummaryCard
    UI --> SettingsPage
    UI --> Auth
    UI --> ReaderAPI
    UI --> SettingsAPI

    %% Cron flow
    CronWorker -.->|Hourly trigger| CronAPI
    CronAPI -->|Check users| DB_Users
    CronAPI -->|Trigger sync| ReaderAPI

    %% Auth flow
    Auth -->|Magic link request| Supabase
    Supabase -->|Send email| Resend
    Resend -->|Magic link email| UI
    Auth -->|Session validation| Middleware
    Middleware -->|Protect routes| ReaderAPI
    Middleware -->|Protect routes| SettingsAPI

    %% Settings flow
    SettingsAPI -->|Read/write| DB_Users
    SettingsPage -->|Configure| SettingsAPI

    %% Sync flow
    ReaderAPI -->|1. Fetch unread| Reader
    Reader -->|Article metadata| ReaderAPI
    ReaderAPI -->|2. Store items| DB_Items
    ReaderAPI -->|3. Create jobs| DB_Jobs
    ReaderAPI -->|4. Enqueue| Queue

    %% Queue processing
    Queue -->|Batch messages| Consumer
    Consumer -->|Fetch content| Reader
    Consumer -->|Generate summary| Perplexity
    Perplexity -->|Summary + tags| Consumer
    Consumer -->|Store results| DB_Items
    Consumer -->|Update status| DB_Jobs
    Consumer -->|Failed jobs| DLQ

    %% Display flow
    ReaderAPI -->|Fetch summaries| DB_Items
    DB_Items -->|Render markdown| SummaryCard

    %% Archive flow
    ReaderAPI -->|Archive item| Reader
    ReaderAPI -->|Update DB| DB_Items

    %% Database relationships
    Supabase -.->|Contains| DB_Users
    Supabase -.->|Contains| DB_Items
    Supabase -.->|Contains| DB_Jobs
    Supabase -.->|Contains| DB_Sync

    style UI fill:#e3f2fd
    style Consumer fill:#fff3e0
    style CronWorker fill:#ffe0b2
    style Queue fill:#f3e5f5
    style Supabase fill:#e8f5e9
    style Reader fill:#fce4ec
    style Perplexity fill:#fff9c4
    style Resend fill:#f1f8e9
```

## Key Design Decisions

### Why Cloudflare Workers (not Pages)?
- Need queue producer bindings (not available in Pages)
- Better control over worker configuration
- Can deploy multiple workers (main + consumer + cron)

### Why Async Queue Processing?
- AI summary generation is slow (2-5 seconds per article)
- User doesn't wait for summaries during sync
- Batching optimizes API calls and reduces costs
- Automatic retries for failed jobs

### Why Service Role Client for Settings?
- Cookie-based SSR auth doesn't pass JWT to Postgres
- RLS policies check `auth.uid()` which returns null
- Service role bypasses RLS (safe when auth verified at API level)
- See [patterns/service-role-client.md](../patterns/service-role-client.md)

### Why 3 Separate Workers?
- OpenNext limitation: Only generates HTTP handlers
- Cron needs scheduled() function
- Queue consumer is long-running (30s timeout)
- Separation of concerns: API, processing, scheduling

## Deployment
- **Domain**: ansible.hultberg.org
- **CI/CD**: GitHub Actions auto-deploys on push to main
- **Secrets**: Managed via `wrangler secret put`
- **Observability**: Enabled on all 3 workers

## Related Documentation
- [Workers](./workers.md) - Detailed worker implementation
- [Database Schema](./database-schema.md) - Tables and relationships
- [Authentication](./authentication.md) - Auth flow and security
- [API Design](./api-design.md) - REST conventions
- [Deployment Guide](../operations/deployment.md) - How to deploy
