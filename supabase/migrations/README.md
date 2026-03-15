# Database Migrations

Supabase database schema migrations for Ansible AI Reader.

## Running Migrations

### Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the sidebar
4. Copy the contents of the migration file
5. Paste into the SQL editor and click **Run**

### Via Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push
```

## Migration Files

Migrations are named with format: `YYYYMMDD_description.sql`

### Available Migrations

- **20260312_add_sync_log_id.sql** - Adds `sync_log_id` column to `processing_jobs` table for linking jobs to sync operations (Phase 3)
- **20260314_add_word_count.sql** - Adds `word_count` column to `reader_items` table for displaying article length (Phase 3)
- **20260315_add_summaries_tags.sql** - Adds `short_summary`, `tags`, and `perplexity_model` columns to `reader_items` table for AI-generated summaries (Phase 4)
- **20260315_add_content_truncated.sql** - Adds `content_truncated` boolean column to track when summaries are based on truncated content (>30k chars) (Phase 4)

## Initial Schema

The initial database schema (4 tables: users, reader_items, sync_log, processing_jobs) was created directly in Supabase during Phase 1.2.

See [phase-1-2-implementation.md](../../REFERENCE/phase-1-2-implementation.md) for complete schema documentation.
