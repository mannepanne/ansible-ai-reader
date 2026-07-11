// ABOUT: Cloudflare Queue consumer dispatching summary_generation and tags_generation jobs
// ABOUT: Summary path fetches Reader content + Perplexity; tags path reuses existing summary

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateSummary, generateTags } from '../src/lib/perplexity-api';
import { fetchUnreadItems } from '../src/lib/reader-api';
import { stripHtml } from '../src/lib/html-utils';
import type { Message, MessageBatch } from '@cloudflare/workers-types';

// Environment bindings provided by Cloudflare Workers
interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  READER_API_TOKEN: string;
  PERPLEXITY_API_KEY: string;
}

// Queue message schema
interface QueueMessage {
  jobId: string;
  userId: string;
  readerItemId: string; // Local DB ID
  readerId: string; // Reader API ID for fetching content
  jobType: 'summary_generation' | 'tags_generation';
}

// Custom error types for different failure scenarios
class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

// A permanent failure where the item can NEVER be summarized (deleted in Reader,
// or no usable content). Retrying is futile, so the item is auto-archived to keep
// it out of the unread list instead of lingering as an un-summarizable ghost.
// `readerDeleted` distinguishes "gone from Reader" from "exists but has no content".
class ContentUnavailableError extends PermanentError {
  readonly readerDeleted: boolean;
  constructor(message: string, readerDeleted = false) {
    super(message);
    this.name = 'ContentUnavailableError';
    this.readerDeleted = readerDeleted;
  }
}

class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

// Content that is currently absent but MIGHT still arrive — Reader can return a
// freshly-saved item before it finishes fetching/parsing its body. Retried like
// any transient error; only if it is STILL empty after retries are exhausted is
// the item auto-archived (it has no usable content and never got any). This avoids
// prematurely hiding an item that Reader was merely slow to parse.
class RecoverableContentError extends TransientError {
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableContentError';
  }
}

/**
 * Auto-archive an item that can never be summarized so it drops out of the unread
 * list instead of lingering as a ghost. Mirrors the manual archive route's field
 * writes (local DB only — the Reader-side archive is either unnecessary, because
 * the item is already gone, or irrelevant, because it has no readable content).
 */
async function autoArchiveUnsummarizable(
  supabase: SupabaseClient,
  readerItemId: string,
  readerDeleted: boolean,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('reader_items')
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
      reader_deleted: readerDeleted,
    })
    .eq('id', readerItemId);

  if (error) {
    console.error(
      `[Queue Consumer] Failed to auto-archive item ${readerItemId}:`,
      error
    );
  } else {
    console.log(
      `[Queue Consumer] Auto-archived unsummarizable item ${readerItemId} (reader_deleted=${readerDeleted}, reason="${reason}")`
    );
  }
}

async function fetchReaderContent(
  readerId: string,
  apiToken: string
): Promise<{ title: string; author?: string; content: string; url: string }> {
  try {
    // Use Reader API to get item with full HTML content
    // withHtmlContent=true returns the html_content field
    const response = await fetch(
      `https://readwise.io/api/v3/list/?id=${readerId}&withHtmlContent=true`,
      {
        method: 'GET',
        headers: {
          Authorization: `Token ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(
        `[Consumer] Failed to fetch from Reader API: ${response.status}`
      );
      // Item genuinely gone → content can never be fetched → auto-archive.
      if (response.status === 404 || response.status === 410) {
        throw new ContentUnavailableError(
          `Item not found in Readwise Reader (HTTP ${response.status})`,
          true
        );
      }
      // Rate limited → transient, retry (this path is a raw fetch, NOT behind the
      // rate-limited readerQueue, so 429s under sync load land here). Must NOT
      // auto-archive: the item is fine, we were just throttled.
      if (response.status === 429) {
        throw new TransientError('Reader API rate limited (HTTP 429), will retry');
      }
      // Other 4xx (401/403/…) are permanent but not a content problem — surface as
      // a visible failure the user can retry, never auto-archive a good item.
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentError(`Reader API error (HTTP ${response.status})`);
      }
      // 5xx errors are transient (Reader API issues, try again)
      throw new TransientError(`Reader API error (HTTP ${response.status}), will retry`);
    }

    const data = (await response.json()) as {
      results?: Array<{
        id: string;
        title: string;
        author?: string;
        html_content?: string;
        url: string;
      }>;
    };

    if (!data.results || data.results.length === 0) {
      console.error('[Consumer] Item not found:', readerId);
      throw new ContentUnavailableError(
        'Item not found in Readwise Reader (may have been deleted)',
        true
      );
    }

    const item = data.results[0];

    if (!item.html_content) {
      console.error('[Consumer] Item has no content:', readerId);
      // Recoverable: Reader may still be parsing. Retry; auto-archive only if it
      // stays empty after retries are exhausted.
      throw new RecoverableContentError('Item has no content in Readwise Reader');
    }

    // Strip HTML tags to get plain text for Perplexity
    const plainText = stripHtml(item.html_content);

    return {
      title: item.title,
      author: item.author,
      content: plainText,
      url: item.url,
    };
  } catch (error) {
    // Re-throw PermanentError and TransientError as-is
    if (error instanceof PermanentError || error instanceof TransientError) {
      throw error;
    }
    // Network errors and other exceptions are transient
    console.error('[Consumer] Error fetching Reader content:', error);
    throw new TransientError('Network error fetching content, will retry');
  }
}

/**
 * Track token usage in sync_log for cost monitoring
 */
async function trackTokenUsage(
  supabase: any,
  userId: string,
  readerItemId: string,
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  },
  model: string,
  contentTruncated: boolean,
  syncType: 'summary_generation' | 'tags_generation'
): Promise<void> {
  const { error } = await supabase.from('sync_log').insert({
    user_id: userId,
    sync_type: syncType,
    items_created: 1,
    errors: {
      reader_item_id: readerItemId,
      token_usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        model,
        content_truncated: contentTruncated,
        timestamp: new Date().toISOString(),
      },
    },
  });

  if (error) {
    console.error('[Consumer] Failed to log token usage:', error);
  }
}

/**
 * Process a single queue job. Dispatches on jobType:
 *  - 'summary_generation': fetch article → generate summary + tags (writes both)
 *  - 'tags_generation': read existing summary → regenerate tags only
 *
 * Both paths share job-state transitions and error handling.
 */
async function processJob(
  message: Message<QueueMessage>,
  env: Env,
  supabase: any
): Promise<void> {
  const { jobId, userId, readerItemId, readerId } = message.body;
  // Backward-compat fallback for in-flight messages enqueued before tags_generation
  // shipped (deploy ~2026-05-09). Safe to remove after 2026-05-23 — by then any such
  // messages have either drained through or been retried past the queue's max age.
  const jobType = message.body.jobType ?? 'summary_generation';

  console.log(`[Queue Consumer] Processing ${jobType} job:`, jobId);

  // 1. Get current job status and retry count
  const { data: job, error: jobFetchError } = await supabase
    .from('processing_jobs')
    .select('attempts, max_attempts')
    .eq('id', jobId)
    .single();

  if (jobFetchError || !job) {
    console.error('[Queue Consumer] Failed to fetch job:', jobFetchError);
    message.retry();
    return;
  }

  try {
    // 2. Update job status to 'processing'
    await supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (jobType === 'tags_generation') {
      // Tags-only path: skip Reader fetch entirely. Read the existing summary
      // and ask Perplexity for fresh tags. Cheaper by ~95% in prompt tokens
      // and preserves the user's existing summary verbatim.
      const { data: item, error: itemError } = await supabase
        .from('reader_items')
        .select('title, short_summary')
        .eq('id', readerItemId)
        .single();

      if (itemError || !item) {
        throw new PermanentError(
          `Item not found for tags regeneration: ${itemError?.message ?? 'no row'}`
        );
      }

      if (!item.short_summary || item.short_summary.length < 10) {
        throw new PermanentError(
          'Cannot regenerate tags: item has no summary to derive tags from'
        );
      }

      const result = await generateTags(env.PERPLEXITY_API_KEY, {
        title: item.title,
        summary: item.short_summary,
      });

      // Defend the existing tags: if Perplexity returned no parseable tags, refuse to
      // overwrite. Without this guard an unparseable response would wipe the user's
      // tags to []. Surfaces as `tags_generation_failed` in sync_log; the user can
      // re-click "Regenerate Tags" to retry.
      if (result.tags.length === 0) {
        throw new PermanentError(
          'Perplexity returned no parseable tags — preserving existing tags'
        );
      }

      // Update only the tags column — short_summary and perplexity_model are untouched
      const { error: updateError } = await supabase
        .from('reader_items')
        .update({
          tags: result.tags,
          updated_at: new Date().toISOString(),
        })
        .eq('id', readerItemId);

      if (updateError) {
        console.error('[Consumer] Failed to update reader_items tags:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      await trackTokenUsage(
        supabase,
        userId,
        readerItemId,
        result.usage,
        result.model,
        false,
        'tags_generation'
      );
    } else {
      // 3. Fetch content from Reader API
      const articleContent = await fetchReaderContent(
        readerId,
        env.READER_API_TOKEN
      );

      if (!articleContent.content || articleContent.content.length < 100) {
        // Recoverable: Reader may still be parsing. Retry; auto-archive only if it
        // stays too short after retries are exhausted.
        throw new RecoverableContentError(
          'Article content is empty or too short (< 100 characters)'
        );
      }

      // 4. Fetch user's custom summary prompt (fall back to default if unavailable)
      let customPrompt: string | undefined;
      try {
        const { data: userSettings } = await supabase
          .from('users')
          .select('summary_prompt')
          .eq('id', userId)
          .single();
        customPrompt = userSettings?.summary_prompt ?? undefined;
      } catch {
        console.warn('[Queue Consumer] Could not fetch user prompt, using default');
      }

      // 5. Generate summary via Perplexity API
      const result = await generateSummary(env.PERPLEXITY_API_KEY, {
        title: articleContent.title,
        author: articleContent.author,
        content: articleContent.content,
        url: articleContent.url,
      }, customPrompt);

      // Guard against storing a null/empty summary as a "success" — that silently
      // produces a tagged card with "No summary available". Fail the job instead so
      // it surfaces for retry. NOT a ContentUnavailableError: Perplexity is
      // stochastic, so a manual "Retry Failed" may well succeed — keep it visible,
      // don't auto-archive.
      if (!result.summary || result.summary.trim().length === 0) {
        throw new PermanentError('Perplexity returned no usable summary');
      }

      // 6. Store summary and tags in database
      const { error: updateError } = await supabase
        .from('reader_items')
        .update({
          short_summary: result.summary,
          tags: result.tags,
          perplexity_model: result.model,
          content_truncated: result.contentTruncated,
          updated_at: new Date().toISOString(),
        })
        .eq('id', readerItemId);

      if (updateError) {
        console.error('[Consumer] Failed to update reader_items:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      // 7. Track token usage for cost monitoring
      await trackTokenUsage(
        supabase,
        userId,
        readerItemId,
        result.usage,
        result.model,
        result.contentTruncated,
        'summary_generation'
      );
    }

    // 8. Mark job as completed
    const { error: completeError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (completeError) {
      console.error('[Consumer] Failed to mark job complete:', completeError);
      throw new Error(`Failed to mark job complete: ${completeError.message}`);
    }

    console.log('[Queue Consumer] Job completed:', jobId);
    message.ack();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const isPermanentError = error instanceof PermanentError;

    console.error('[Queue Consumer] Error processing job:', errorMessage);

    // Permanent errors: fail immediately without retry
    if (isPermanentError) {
      console.error(
        `[Queue Consumer] Job ${jobId} permanently failed: ${errorMessage}`
      );

      await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Log failure to sync_log
      await supabase.from('sync_log').insert({
        user_id: userId,
        sync_type: `${jobType}_failed`,
        items_failed: 1,
        errors: {
          reader_item_id: readerItemId,
          reader_id: readerId,
          error: errorMessage,
          permanent: true,
          timestamp: new Date().toISOString(),
        },
      });

      // Content that is genuinely gone (deleted / 404): auto-archive immediately so
      // it doesn't linger as an un-summarizable ghost in the unread list.
      if (error instanceof ContentUnavailableError && readerItemId) {
        await autoArchiveUnsummarizable(
          supabase,
          readerItemId,
          error.readerDeleted,
          errorMessage
        );
      }

      message.ack(); // Don't retry
      return;
    }

    // Transient errors: retry up to max_attempts
    if (job.attempts >= job.max_attempts) {
      // Exhausted retries - mark as failed
      console.error(
        `[Queue Consumer] Job ${jobId} failed after ${job.attempts} attempts`
      );

      await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Log failure to sync_log
      await supabase.from('sync_log').insert({
        user_id: userId,
        sync_type: `${jobType}_failed`,
        items_failed: 1,
        errors: {
          reader_item_id: readerItemId,
          reader_id: readerId,
          error: errorMessage,
          permanent: false,
          timestamp: new Date().toISOString(),
        },
      });

      // Content that stayed empty across all retries is not a transient blip — it
      // has no readable content and never will via this path. Auto-archive it
      // (reader_deleted=false: the item still exists in Reader, just has no body).
      if (error instanceof RecoverableContentError && readerItemId) {
        await autoArchiveUnsummarizable(
          supabase,
          readerItemId,
          false,
          errorMessage
        );
      }

      message.ack(); // Don't retry anymore
    } else {
      // Increment attempts and retry
      await supabase
        .from('processing_jobs')
        .update({
          attempts: job.attempts + 1,
        })
        .eq('id', jobId);

      console.log(
        `[Queue Consumer] Retrying job ${jobId} (attempt ${job.attempts + 1}/${job.max_attempts})`
      );
      message.retry(); // Re-queue with exponential backoff
    }
  }
}

export default {
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env
  ): Promise<void> {
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    for (const message of batch.messages) {
      await processJob(message, env, supabase);
    }
  },
};
