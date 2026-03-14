// ABOUT: Queue producer API endpoint
// ABOUT: Creates jobs and sends messages to Cloudflare Queue

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { supabaseAdmin } from '@/lib/supabase';

// Queue message schema
// Phase 4: Consumer will fetch content from Reader API using readerId
const jobSchema = z.object({
  userId: z.string().uuid(),
  jobType: z.enum(['summary_generation', 'archive_sync']),
  readerItemId: z.string().uuid(),
  readerId: z.string(), // Reader API ID for fetching content
});

type JobInput = z.infer<typeof jobSchema>;

interface QueueMessage {
  jobId: string;
  userId: string;
  readerItemId: string; // Local DB ID
  readerId: string; // Reader API ID for fetching content
  jobType: 'summary_generation' | 'archive_sync';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Access Cloudflare bindings via getCloudflareContext
    const { env } = getCloudflareContext();
    const PROCESSING_QUEUE = env.PROCESSING_QUEUE;

    // Check if queue binding is available (Cloudflare Workers environment)
    if (!PROCESSING_QUEUE) {
      return NextResponse.json(
        {
          error:
            'Queue functionality not available in local development. Deploy to Cloudflare Workers to use queues.',
        },
        { status: 405 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedInput = jobSchema.parse(body);

    // Create job in database
    const { data: job, error: dbError } = await supabaseAdmin
      .from('processing_jobs')
      .insert({
        user_id: validatedInput.userId,
        reader_item_id: validatedInput.readerItemId,
        job_type: validatedInput.jobType,
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
      })
      .select('id, status, created_at')
      .single();

    if (dbError || !job) {
      console.error('Database error creating job:', dbError);
      return NextResponse.json(
        { error: 'Failed to create job in database' },
        { status: 500 }
      );
    }

    // Send message to queue
    const queueMessage: QueueMessage = {
      jobId: job.id,
      userId: validatedInput.userId,
      readerItemId: validatedInput.readerItemId,
      readerId: validatedInput.readerId,
      jobType: validatedInput.jobType,
    };

    try {
      await PROCESSING_QUEUE.send(queueMessage);
    } catch (queueError) {
      console.error('Queue error:', queueError);

      // Mark job as failed if queue send fails
      await supabaseAdmin
        .from('processing_jobs')
        .update({
          status: 'failed',
          error_message: 'Failed to send message to queue',
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Failed to send message to queue' },
        { status: 500 }
      );
    }

    // Return success
    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        createdAt: job.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
