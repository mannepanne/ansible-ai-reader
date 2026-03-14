// ABOUT: Cloudflare Queue consumer for processing jobs
// ABOUT: Phase 3: Minimal implementation (marks jobs complete), Phase 4: Add summary generation

import { createClient } from '@supabase/supabase-js';

// Environment bindings provided by Cloudflare Workers
interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}

// Queue message schema
// Phase 4: Consumer will fetch content from Reader API using readerId
interface QueueMessage {
  jobId: string;
  userId: string;
  readerItemId: string; // Local DB ID
  readerId: string; // Reader API ID for fetching content
  jobType: 'summary_generation';
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
      try {
        const { jobId } = message.body;

        console.log('[Queue Consumer] Processing job:', jobId);

        // Phase 3: Minimal implementation - mark as completed without processing
        // Phase 4: Add Perplexity API call for summary generation
        const { error: updateError } = await supabase
          .from('processing_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        if (updateError) {
          console.error('[Queue Consumer] Failed to update job:', updateError);
          // Retry will happen automatically via queue retries
          message.retry();
          continue;
        }

        console.log('[Queue Consumer] Job completed:', jobId);
        message.ack();
      } catch (error) {
        console.error('[Queue Consumer] Error processing message:', error);
        message.retry();
      }
    }
  },
};
