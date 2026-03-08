# Ansible - AI-Powered Reader Summary System

**Status**: Planning
**Last Updated**: 2026-03-07
**Target Launch**: TBD

---

## Overview

Ansible is a web application for **depth-of-engagement triage** of content saved to Readwise Reader. It generates AI summaries of unread items, enabling you to quickly decide what deserves full reading versus consuming just the key takeaways.

**The Problem:**
You've already decided content is interesting (you saved it to Reader). The question is: does this warrant 10-30 minutes of deep reading, or can you get the value in 2 minutes via summary?

**Core Value Proposition:**
- **Two-tier reading system**: Summary-first consumption, selective deep-dive
- Make informed decisions about depth of engagement
- Capture thoughts triggered by summaries without opening Reader
- Build a graph of your interests through ratings over time
- Never lose track of interesting content

---

## Technical Architecture

### Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS (same classes/layout as hultberg.org/updates)
- **Database**: Supabase (Postgres + Auth)
- **Email**: Resend (for magic link authentication)
- **Deployment**: Cloudflare Workers (using `@cloudflare/next-on-pages`)
- **Domain**: ansible.hultberg.org

### Key Integrations

1. **Readwise Reader API** - Fetch unread items, sync archive state, sync document notes
2. **Perplexity API** - Generate summaries and tags
3. **Supabase Auth** - Magic link authentication
4. **Resend** - Send magic link emails

### Deployment Flow

```
Local Development → Build with @cloudflare/next-on-pages → Deploy to Workers
                                                           ↓
                                                    ansible.hultberg.org
```

---

## Data Model

### Database Schema (Supabase/Postgres)

**Table: \****`users`**
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
email             text UNIQUE NOT NULL
created_at        timestamp with time zone DEFAULT now()
summary_prompt    text  -- User's custom prompt for summaries
```

**Table: \****`reader_items`**
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE
reader_id         text NOT NULL  -- Readwise Reader's ID for this item
title             text NOT NULL
url               text NOT NULL
author            text
source            text  -- e.g., "blog", "newsletter", "pdf"
content_type      text  -- "article", "pdf", "email", etc.

short_summary     text  -- Bullet points, max ~2000 chars
long_summary      text  -- Detailed summary, max ~5min read
tags              text[]  -- Array of 3-5 generated tags
perplexity_model  text  -- Model used for generation

document_note     text  -- User's note on the document (syncs to Reader)
rating            integer  -- 0-5 interest rating (null if not rated)
archived          boolean DEFAULT false
archived_at       timestamp with time zone

created_at        timestamp with time zone DEFAULT now()
updated_at        timestamp with time zone DEFAULT now()

UNIQUE(user_id, reader_id)  -- Prevent duplicates
CREATE INDEX idx_user_archived ON reader_items(user_id, archived, created_at DESC)
CREATE INDEX idx_user_tags ON reader_items USING GIN(tags)
```

**Table: \****`sync_log`** (optional, for debugging)
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE
sync_type         text  -- "manual" or "cron"
items_fetched     integer
items_created     integer
errors            jsonb
created_at        timestamp with time zone DEFAULT now()
```

### Row-Level Security (RLS)

Enable RLS on all tables:
```sql
-- Users can only see their own data
ALTER TABLE reader_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items"
  ON reader_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON reader_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON reader_items FOR UPDATE
  USING (auth.uid() = user_id);
```

---

## User Flows

### 1. Authentication Flow

```
User visits ansible.hultberg.org
  ↓
Enters email address
  ↓
Receives magic link via Resend
  ↓
Clicks link → authenticated → redirected to /summaries
```

**Implementation:**
- Supabase Auth handles magic link generation
- Resend SMTP integration for email delivery
- Session stored in httpOnly cookie

### 2. First-Time Sync Flow

```
New user logs in
  ↓
Sees empty state: "No summaries yet. Click 'Sync Reader' to get started."
  ↓
Clicks "Sync Reader" button
  ↓
Background process:
  1. Fetch unread items from Reader API
  2. For each item:
     - Generate short summary via Perplexity
     - Generate tags via Perplexity
     - Store in database
  3. Show progress indicator
  ↓
Redirect to /summaries with items listed
```

### 3. Daily Usage Flow

```
User visits ansible.hultberg.org (already authenticated)
  ↓
Sees list of unread items (latest at bottom)
  ↓
For each item:
  - Read title
  - Read short summary (bullets, ~2000 chars)
  - See 3-5 tags
  - See existing document note (if any)
  ↓
User decides:

Option A: Not Interested
  → Click "Archive" → item archived in both Ansible and Reader

Option B: Somewhat Interesting
  → Rate 0-5 → rating saved

Option C: Summary Triggers a Thought
  → Click "Add Note" or edit existing note
  → Enter thought/annotation
  → Save → stored in Ansible + synced to Reader as document note

Option D: Want More Detail
  → Click item title → navigate to /summaries/:id
  → Read long summary (~5min)
  → Options:
     - Rate 0-5
     - Add/edit document note (syncs to Reader)
     - Archive (syncs to Reader)
     - Click "Read in Reader" → opens Reader URL

Option E: Skip for Now
  → Do nothing → item stays in list
```

### 4. Configuration Flow

```
User clicks "Settings" (nav link)
  ↓
Sees editable text field: "Summary Prompt"
  ↓
Default value:
  "I'm interested in product management, AI/LLM applications,
   software architecture, writing craft, and cognitive science.
   Focus on practical takeaways and novel applications."
  ↓
User edits prompt
  ↓
Click "Save" → stored in users.summary_prompt
  ↓
Future summaries use this prompt (prepended to Perplexity request)
```

---

## API Integration Details

### Readwise Reader API

**Documentation**: https://readwise.io/reader_api

**Authentication**: API token (user provides in settings or env var)

**Key Endpoints:**

1. **Fetch Unread Items**
```
GET https://readwise.io/api/v3/list/
Headers:
  Authorization: Token <reader_api_token>
Query:
  location=new  // Unread items only
  pageCursor=<cursor>  // For pagination
```

**Response** (simplified):
```json
{
  "results": [
    {
      "id": "reader_item_id",
      "url": "https://example.com/article",
      "title": "Article Title",
      "author": "Author Name",
      "source": "blog",
      "content": "Full article text...",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "nextPageCursor": "cursor_string"
}
```

2. **Archive Item**
```
PATCH https://readwise.io/api/v3/update/<reader_id>/
Headers:
  Authorization: Token <reader_api_token>
Body:
  {
    "location": "archive"
  }
```

3. **Add/Update Document Note**
```
PATCH https://readwise.io/api/v3/update/<reader_id>/
Headers:
  Authorization: Token <reader_api_token>
Body:
  {
    "notes": "Your document-level note text here"
  }
```

**Note**: The `notes` parameter adds a document-level note (not attached to a specific highlight). If the user later edits the note in Ansible, PATCH the full updated note content to Reader.

**Content Access Strategy:**

For summarization, we need to get the article content to Perplexity:

**Option A**: Send full content from Reader API
- Reader API provides article content
- Send directly to Perplexity
- ✅ Simple, no extra API calls
- ❌ Content might be incomplete for paywalled articles

**Option B**: Use Reader's public link
- Enable public link via API (if supported)
- Send public URL to Perplexity
- Disable public link after summary
- ❌ Need to verify API supports this
- ❌ Extra API calls

**Option C**: Use Jina AI Reader
- Free service: https://jina.ai/reader
- `https://r.jina.ai/<article_url>` returns clean markdown
- Send to Perplexity
- ✅ Good for web articles
- ❌ Won't work for PDFs or private content

**Recommendation**: Start with **Option A** (Reader API content). Fall back to Option C for web URLs if content is incomplete.

### Perplexity API

**Documentation**: https://docs.perplexity.ai/

**Authentication**: API key (env var)

**Pricing**: Pay-as-you-go (separate from Pro subscription)
- Small models: ~$1 per 1M tokens
- Best models: ~$5 per 1M tokens
- Estimated cost: $3-15/month for 20 items/day

**Models to Consider:**
- `sonar-pro` - Best quality, higher cost
- `sonar` - Good quality, lower cost
- Start with `sonar`, upgrade if quality isn't good enough

**Summary Generation Request:**

1. **Short Summary**
```
POST https://api.perplexity.ai/chat/completions
Headers:
  Authorization: Bearer <api_key>
  Content-Type: application/json
Body:
{
  "model": "sonar",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant that creates concise summaries. [User's custom prompt]"
    },
    {
      "role": "user",
      "content": "Summarize this article in bullet points (max 2000 characters). Focus on key concepts and practical takeaways. Also provide 3-5 relevant tags.\n\nTitle: <title>\nAuthor: <author>\nContent: <content>"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.2
}
```

Expected response format:
```
## Summary
- Key point 1
- Key point 2
- Key point 3
- ...

## Tags
product-management, ai-applications, software-architecture
```

2. **Long Summary** (on-demand)
```
Similar request, but:
  "content": "Create a detailed 5-minute summary of this article. Include context, key arguments, evidence, and practical implications..."
  "max_tokens": 2000
```

**Parsing Strategy:**
- Use regex or simple parsing to extract summary and tags from response
- Store tags as Postgres array
- Handle edge cases (missing tags, malformed response)

### Resend Integration

**Documentation**: https://resend.com/docs

**Purpose**: Send magic link emails via Supabase Auth

**Configuration** (in Supabase dashboard):
```
Settings → Auth → Email Provider → SMTP
  Host: smtp.resend.com
  Port: 465
  Username: resend
  Password: <resend_api_key>
  Sender email: ansible@hultberg.org
```

**Email Template** (Supabase handles this):
```
Subject: Sign in to Ansible

Click here to sign in to Ansible:
{{ .ConfirmationURL }}

This link expires in 1 hour.
```

---

## MVP Scope (v1)

### In Scope ✅

**Core Features:**
- Magic link authentication (single user: Magnus)
- Manual "Sync Reader" button
- Fetch unread items from Reader
- Generate short summaries (bullets, ~2000 chars)
- Generate tags (3-5 per item)
- List view: items with title, summary, tags
- Document notes: Add/edit notes that sync to Reader (document-level)
- Archive button (syncs to Reader)
- Interest rating (0-5, stored but not acted upon)
- Click through to Reader for full article
- Basic configuration: editable summary prompt

**UI/UX:**
- Copy layout/styling from hultberg.org/updates
- Responsive design (mobile-friendly)
- Loading states for sync/summarization
- Empty states

**Data:**
- Support text articles and PDFs from Reader
- Store all summaries in Supabase

**Deployment:**
- Cloudflare Workers hosting
- ansible.hultberg.org subdomain

### Out of Scope ❌ (Future Features)

**v1.1:**
- Long summaries (detailed 5-min read on-demand)
- Pagination/infinite scroll for large lists
- Filter by tags
- Search functionality

**v2:**
- Learning from ratings (adjust summaries based on interest graph)
- Concept graph visualization
- Background cron job (auto-sync every N hours)
- Detect items archived in Reader, sync to Ansible
- Tag management (rename, merge, delete)

**v3:**
- Multi-user support (public launch)
- Shared summaries (optional)
- Export summaries (markdown, PDF)
- Integration with other read-it-later services (Pocket, Instapaper)
- Video/podcast summarization (YouTube, Spotify)

---

## Development Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js project with Cloudflare Workers adapter
- [ ] Configure Tailwind CSS (copy styles from hultberg.org)
- [ ] Set up Supabase project (database + auth)
- [ ] Create database schema
- [ ] Implement RLS policies
- [ ] Configure Resend for magic link emails
- [ ] Deploy basic "hello world" to ansible.hultberg.org

### Phase 2: Authentication (Week 2)
- [ ] Implement Supabase Auth with magic links
- [ ] Create login page
- [ ] Create protected route wrapper
- [ ] Test email delivery via Resend
- [ ] Add logout functionality

### Phase 3: Reader Integration (Week 3)
- [ ] Implement Reader API client
- [ ] Create "Sync Reader" button
- [ ] Fetch unread items from Reader
- [ ] Store items in database (without summaries yet)
- [ ] Display list of items (title, URL, basic info)
- [ ] Implement archive functionality (sync to Reader)

### Phase 4: Perplexity Integration (Week 3-4)
- [ ] Implement Perplexity API client
- [ ] Create summary generation function
- [ ] Generate short summaries during sync
- [ ] Parse and store tags
- [ ] Display summaries and tags in UI
- [ ] Add loading states and error handling

### Phase 5: Notes, Rating & Polish (Week 4-5)
- [ ] Implement document notes UI (add/edit note field)
- [ ] Sync notes to Reader API via PATCH endpoint
- [ ] Implement rating system (0-5 stars)
- [ ] Add configuration page (editable summary prompt)
- [ ] Create click-through to Reader
- [ ] Add empty states
- [ ] Improve error messages
- [ ] Test with real data
- [ ] Performance optimization

### Phase 6: Launch (Week 5)
- [ ] Final testing
- [ ] Documentation (user guide)
- [ ] Monitor initial usage
- [ ] Gather feedback
- [ ] Plan v1.1 features

---

## Technical Considerations

### Cloudflare Workers Constraints

**Execution Time:**
- Workers have CPU time limits (10ms-50ms on free tier, 50ms+ on paid)
- Summary generation might timeout if done synchronously
- **Solution**: Use async pattern, show "Generating..." state

**Memory:**
- Workers have 128MB memory limit
- Unlikely to be an issue, but watch large PDFs
- **Solution**: Chunk very large content if needed

**Cold Starts:**
- Workers can have cold start latency
- **Solution**: Use Durable Objects or KV for state if needed (unlikely for MVP)

### Perplexity Rate Limits

- Check current rate limits in docs
- Implement retry logic with exponential backoff
- Cache summaries (never regenerate for same content)

### Cost Management

**Perplexity API:**
- Monitor token usage
- Set up billing alerts
- Consider cheaper models if cost becomes issue
- Estimated: $3-15/month for personal use

**Supabase:**
- Free tier: 500MB database, 2GB bandwidth
- Should be plenty for single user
- Upgrade if multi-user launch happens

**Cloudflare:**
- Already paying for plan
- Workers requests should stay within limits

### Security

**API Keys:**
- Store Reader API token in environment variables
- Store Perplexity API key in environment variables
- Never expose in client-side code

**RLS Policies:**
- Enforce at database level
- Users can only access their own data

**Authentication:**
- Magic links expire after 1 hour
- Session tokens in httpOnly cookies
- Logout clears session

---

## Future Features List

### v1.1 Enhancements
- Long summaries (on-demand detailed summaries)
- Pagination for list view
- Filter items by tag
- Search summaries by keyword
- Sort options (date, rating, title)
- Dark mode toggle

### v2 Intelligence
- Learning from ratings:
  - Adjust summary prompts based on high-rated content
  - Emphasize topics user rates highly
  - Build concept graph of interests
- Tag insights:
  - Most common tags
  - Tag correlation with high ratings
  - Suggest related unread items
- Summary quality feedback loop:
  - "Was this summary helpful?" button
  - Improve prompts based on feedback

### v3 Expansion
- Multi-user support:
  - Public signup
  - User onboarding flow
  - Reader API token input (not env var)
- Background sync:
  - Cron job to auto-sync every N hours
  - Email notifications for new summaries
- Archive detection:
  - Poll Reader for items archived directly
  - Mark as archived in Ansible
- Advanced features:
  - Export summaries (markdown, PDF, CSV)
  - Share summaries with others (optional)
  - Integration with other services (Pocket, Instapaper, Omnivore)
  - Browser extension (save to Reader + Ansible in one click)

### v4 Content Expansion
- Video summaries (YouTube transcripts)
- Podcast summaries (Spotify, Apple Podcasts)
- Book summaries (longer content strategy)
- Twitter/X thread summaries
- Email newsletter digests

---

## Open Questions

1. **Perplexity content limits**: What's the max content length Perplexity can handle? Need to test with very long PDFs.

2. **Summary prompt engineering**: What's the optimal prompt structure for different content types (blog vs academic paper vs newsletter)?

3. **Tag generation consistency**: Should tags be free-form or from a controlled vocabulary? Start free-form, consider vocabulary in v2.

4. **Reader API rate limits**: What are the actual rate limits? Need to check docs and implement throttling if needed.

5. **Cloudflare Workers build size**: Will Next.js app fit within Workers size limits? Test early.

---

## Success Metrics

**MVP Success (v1):**
- Ansible successfully syncs Reader items
- Summaries are generated for 95%+ of items
- Archive sync works reliably
- Document notes sync to Reader successfully
- Magnus uses it daily for 2+ weeks
- Reduces time spent triaging Reader by 50%+
- Captures thoughts without needing to open Reader

**v2 Success:**
- Learning system improves summary relevance
- High-rated tags appear more prominently
- User-reported summary quality increases

**Long-term:**
- Multi-user launch (if pursued)
- 100+ active users
- Positive user feedback on time saved
- Potential integration into Readwise product

---

## References & Resources

- **Readwise Reader API**: https://readwise.io/reader_api
- **Perplexity API**: https://docs.perplexity.ai/
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Cloudflare Next.js adapter**: https://github.com/cloudflare/next-on-pages
- **Supabase Docs**: https://supabase.com/docs
- **Resend Docs**: https://resend.com/docs
- **Migration guide - Pages to Workers**: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

---

## Notes

- This spec assumes single-user deployment initially (Magnus only)
- Multi-user features are documented for future reference but not implemented in MVP
- Technical choices prioritize simplicity and speed to working product
- Can iterate on prompt engineering and UX after basic functionality works
- Consider creating detailed wireframes before Phase 5
