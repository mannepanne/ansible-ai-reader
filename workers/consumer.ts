// ABOUT: Cloudflare Queue consumer for processing summary generation jobs
// ABOUT: Fetches content from Reader API, generates AI summaries via Perplexity

import { createClient } from '@supabase/supabase-js';
import { generateSummary } from '../src/lib/perplexity-api';
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
  jobType: 'summary_generation';
}

// Custom error types for different failure scenarios
class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
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
      // 4xx errors are permanent (item doesn't exist, access denied, etc.)
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentError(`Item not found in Readwise Reader (HTTP ${response.status})`);
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
      throw new PermanentError('Item not found in Readwise Reader (may have been deleted)');
    }

    const item = data.results[0];

    if (!item.html_content) {
      console.error('[Consumer] Item has no content:', readerId);
      throw new PermanentError('Item has no content in Readwise Reader');
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
  contentTruncated: boolean
): Promise<void> {
  const { error } = await supabase.from('sync_log').insert({
    user_id: userId,
    sync_type: 'summary_generation',
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
 * Process a single summary generation job
 */
async function processSummaryGeneration(
  message: Message<QueueMessage>,
  env: Env,
  supabase: any
): Promise<void> {
  const { jobId, userId, readerItemId, readerId } = message.body;

  console.log('[Queue Consumer] Processing job:', jobId);

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

    // 3. Fetch content from Reader API
    const articleContent = await fetchReaderContent(
      readerId,
      env.READER_API_TOKEN
    );

    if (!articleContent.content || articleContent.content.length < 100) {
      throw new PermanentError(
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
      console.log('[Queue Consumer] Could not fetch user prompt, using default');
    }

    // 5. Generate summary via Perplexity API
    const result = await generateSummary(env.PERPLEXITY_API_KEY, {
      title: articleContent.title,
      author: articleContent.author,
      content: articleContent.content,
      url: articleContent.url,
    }, customPrompt);

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
      result.contentTruncated
    );

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
        sync_type: 'summary_generation_failed',
        items_failed: 1,
        errors: {
          reader_item_id: readerItemId,
          reader_id: readerId,
          error: errorMessage,
          permanent: true,
          timestamp: new Date().toISOString(),
        },
      });

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
        sync_type: 'summary_generation_failed',
        items_failed: 1,
        errors: {
          reader_item_id: readerItemId,
          reader_id: readerId,
          error: errorMessage,
          permanent: false,
          timestamp: new Date().toISOString(),
        },
      });

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
      await processSummaryGeneration(message, env, supabase);
    }
  },
};
