// ABOUT: Local development consumer for processing summary generation jobs
// ABOUT: Polls database for pending jobs instead of using Cloudflare Queue

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateSummary } from '../src/lib/perplexity-api';
import { stripHtml } from '../src/lib/html-utils';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const BATCH_SIZE = 5; // Process up to 5 jobs at a time

interface ProcessingJob {
  id: string;
  user_id: string;
  reader_item_id: string;
  attempts: number;
  max_attempts: number;
  reader_items: {
    reader_id: string;
    title: string;
    author: string | null;
    url: string;
  };
}

/**
 * Fetch article content from Reader API
 */
async function fetchReaderContent(
  readerId: string,
  apiToken: string
): Promise<{ title: string; author?: string; content: string; url: string } | null> {
  try {
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
      console.error(`[Consumer] Failed to fetch from Reader API: ${response.status}`);
      return null;
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
      return null;
    }

    const item = data.results[0];

    if (!item.html_content) {
      console.error('[Consumer] Item has no content:', readerId);
      return null;
    }

    const plainText = stripHtml(item.html_content);

    return {
      title: item.title,
      author: item.author,
      content: plainText,
      url: item.url,
    };
  } catch (error) {
    console.error('[Consumer] Error fetching Reader content:', error);
    return null;
  }
}

/**
 * Process a single summary generation job
 */
async function processJob(job: ProcessingJob, supabase: SupabaseClient): Promise<void> {
  const { id: jobId, user_id: userId, reader_item_id: readerItemId } = job;
  const readerId = job.reader_items.reader_id;

  console.log(`[Consumer] Processing job: ${jobId}`);
  console.log(`[Consumer]   Title: "${job.reader_items.title}"`);

  try {
    // Update job status to 'processing'
    await supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq('id', jobId);

    // Fetch content from Reader API
    const articleContent = await fetchReaderContent(
      readerId,
      process.env.READER_API_TOKEN!
    );

    if (!articleContent) {
      throw new Error('Failed to fetch article content from Reader API');
    }

    if (!articleContent.content || articleContent.content.length < 100) {
      throw new Error('Article content is empty or too short (< 100 characters)');
    }

    console.log(
      `[Consumer]   Content length: ${articleContent.content.length} chars`
    );

    // Generate summary via Perplexity API
    const result = await generateSummary(process.env.PERPLEXITY_API_KEY!, {
      title: articleContent.title,
      author: articleContent.author,
      content: articleContent.content,
      url: articleContent.url,
    });

    console.log(`[Consumer]   Summary generated (${result.model})`);
    console.log(`[Consumer]   Tags: ${result.tags.join(', ')}`);
    console.log(
      `[Consumer]   Tokens: ${result.usage.prompt_tokens}p + ${result.usage.completion_tokens}c = ${result.usage.total_tokens}t`
    );
    if (result.contentTruncated) {
      console.log(`[Consumer]   ⚠️  Content was truncated (>30k chars)`);
    }

    // Store summary and tags in database
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

    // Mark job as completed
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

    console.log(`[Consumer] ✓ Job completed: ${jobId}`);
  } catch (error) {
    console.error(`[Consumer] ✗ Job failed: ${jobId}`, error);

    // Update job with error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    const shouldRetry = job.attempts + 1 < job.max_attempts;

    await supabase
      .from('processing_jobs')
      .update({
        status: shouldRetry ? 'pending' : 'failed',
        error_message: errorMessage,
        attempts: job.attempts + 1,
      })
      .eq('id', jobId);

    if (shouldRetry) {
      console.log(
        `[Consumer]   Retry ${job.attempts + 1}/${job.max_attempts} scheduled`
      );
    } else {
      console.log(`[Consumer]   Max retries reached, marking as failed`);
    }
  }
}

/**
 * Poll for pending jobs and process them
 */
async function pollAndProcess(supabase: SupabaseClient): Promise<void> {
  try {
    // Fetch pending jobs with reader_item details
    const { data: jobs, error } = await supabase
      .from('processing_jobs')
      .select(
        `
        id,
        user_id,
        reader_item_id,
        attempts,
        max_attempts,
        reader_items!inner (
          reader_id,
          title,
          author,
          url
        )
      `
      )
      .eq('status', 'pending')
      .eq('job_type', 'summary_generation')
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[Consumer] Failed to fetch pending jobs:', error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      // No jobs to process
      return;
    }

    console.log(`[Consumer] Found ${jobs.length} pending job(s)`);

    // Process jobs sequentially to avoid rate limiting
    for (const job of jobs) {
      // Transform Supabase response (array) to ProcessingJob (single object)
      const processableJob: ProcessingJob = {
        ...job,
        reader_items: Array.isArray(job.reader_items) ? job.reader_items[0] : job.reader_items,
      };

      await processJob(processableJob, supabase);

      // Small delay between jobs to avoid hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('[Consumer] Poll error:', error);
  }
}

/**
 * Main consumer loop
 */
async function main() {
  console.log('[Consumer] Starting local dev consumer...');
  console.log(`[Consumer] Polling interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`[Consumer] Batch size: ${BATCH_SIZE}`);

  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is required');
  }
  if (!process.env.READER_API_TOKEN) {
    throw new Error('READER_API_TOKEN is required');
  }
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY is required');
  }

  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  console.log('[Consumer] Waiting for jobs...\n');

  // Poll for jobs
  while (true) {
    await pollAndProcess(supabase);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Run the consumer
main().catch((error) => {
  console.error('[Consumer] Fatal error:', error);
  process.exit(1);
});
