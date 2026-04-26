# Ansible AI Reader

AI-powered depth-of-engagement triage for Readwise Reader content. Generate summaries of unread items to decide what deserves full reading versus consuming just the key takeaways.

## About the Name

**Ansible** combines two concepts:
- Ursula K. Le Guin's **ansible** - an instant communication device from her Hainish Cycle novels
- The **Book of Thoth** - legendary repository of universal knowledge

Together: instant access to distilled knowledge from your reading list.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19
- **Runtime**: Cloudflare Workers (Edge)
- **Database**: Supabase (PostgreSQL + Auth)
- **Queues**: Cloudflare Queues (async job processing)
- **UI**: ReactMarkdown for formatted summaries
- **AI**: Perplexity API (sonar-pro model)
- **Integrations**: Readwise Reader API, Resend (magic link emails)
- **Testing**: Vitest, React Testing Library (360 tests, 95%+ coverage)
- **CI/CD**: GitHub Actions

## Overview

Full specification: [`SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md`](./SPECIFICATIONS/ORIGINAL_IDEA/ansible-outline.md)

### System Architecture

```mermaid
graph TB
    subgraph "User Interface"
        UI[Next.js Frontend<br/>Pages: Home, Summaries]
        Header[Header Component]
        SummaryCard[SummaryCard Component<br/>with ReactMarkdown]
    end

    subgraph "Cloudflare Workers - Main App"
        Auth[Auth API Routes<br/>/api/auth/*]
        ReaderAPI[Reader API Routes<br/>/api/reader/*]
        JobsAPI[Jobs API<br/>/api/jobs]
        Middleware[Auth Middleware<br/>Session Protection]
    end

    subgraph "Cloudflare Workers - Queue Consumer"
        Consumer[Queue Consumer Worker<br/>workers/consumer.ts]
    end

    subgraph "Cloudflare Infrastructure"
        Queue[Cloudflare Queues<br/>ansible-processing-queue]
        DLQ[Dead Letter Queue<br/>ansible-processing-dlq]
    end

    subgraph "External Services"
        Supabase[(Supabase<br/>PostgreSQL + Auth)]
        Reader[Readwise Reader API]
        Perplexity[Perplexity API<br/>AI Summaries]
        Resend[Resend<br/>Email/SMTP]
    end

    subgraph "Database Schema"
        DB_Users[users table<br/>Auth managed]
        DB_Items[reader_items table<br/>Articles + metadata]
        DB_Jobs[jobs table<br/>Queue job tracking]
        DB_Sync[sync_log table<br/>Sync history]
    end

    %% User flows
    UI --> Header
    UI --> SummaryCard
    UI --> Auth
    UI --> ReaderAPI

    %% Auth flow
    Auth -->|Magic link request| Supabase
    Supabase -->|Send email| Resend
    Resend -->|Magic link email| UI
    Auth -->|Session validation| Middleware
    Middleware -->|Protect routes| ReaderAPI

    %% Sync flow
    ReaderAPI -->|1. Fetch unread items| Reader
    Reader -->|Article metadata| ReaderAPI
    ReaderAPI -->|2. Store items| DB_Items
    ReaderAPI -->|3. Create jobs| DB_Jobs
    ReaderAPI -->|4. Enqueue| Queue

    %% Queue processing
    Queue -->|Batch messages| Consumer
    Consumer -->|Fetch full content| Reader
    Consumer -->|Generate summary| Perplexity
    Perplexity -->|Summary + tags| Consumer
    Consumer -->|Store results| DB_Items
    Consumer -->|Update job status| DB_Jobs
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
    style Queue fill:#f3e5f5
    style Supabase fill:#e8f5e9
    style Reader fill:#fce4ec
    style Perplexity fill:#fff9c4
    style Resend fill:#f1f8e9
```

**Key Features:**
- **Magic Link Authentication**: Passwordless login via email
- **Async Queue Processing**: Cloudflare Queues for scalable AI summary generation
- **Markdown Rendering**: Beautiful formatting with bullets, bold, and links
- **Real-time Sync**: Fetch unread items from Readwise Reader
- **Tag Regeneration**: Bulk reprocess items missing AI-generated tags
- **Archive Sync**: Two-way sync with Readwise Reader

See [`REFERENCE/architecture/overview.md`](./REFERENCE/architecture/overview.md) for detailed documentation.

## Development

### Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys (see REFERENCE/operations/environment-setup.md)

# Run tests
npm test

# Start development server
npm run dev

# Build for production
npm run build:worker

# Deploy to Cloudflare
npm run deploy
```

### Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Project navigation and development workflow
- **[REFERENCE/architecture/overview.md](./REFERENCE/architecture/overview.md)** - System architecture and data flows
- **[REFERENCE/development/testing-strategy.md](./REFERENCE/development/testing-strategy.md)** - Testing approach and coverage
- **[REFERENCE/operations/deployment.md](./REFERENCE/operations/deployment.md)** - CI/CD and production deployment
- **[REFERENCE/operations/troubleshooting.md](./REFERENCE/operations/troubleshooting.md)** - Common issues and solutions

### Built With

This project was built with [Claude Code](https://claude.com/claude-code) using:
- Test-driven development (TDD) workflow
- Agent teams for collaborative PR reviews
- 360 tests with 95%+ coverage
- Full traceability from specs to implementation
