// ABOUT: Queue producer API endpoint
// ABOUT: Creates jobs and sends messages to Cloudflare Queue

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';

// Queue message schema
const jobSchema = z.object({
  userId: z.string().uuid(),
  jobType: z.enum(['summary_generation', 'archive_sync']),
  readerItemId: z.string().uuid(),
  payload: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    readerId: z.string().optional(),
  }),
});

type JobInput = z.infer<typeof jobSchema>;

interface QueueMessage {
  jobId: string;
  userId: string;
  readerItemId: string;
  jobType: 'summary_generation' | 'archive_sync';
  payload: JobInput['payload'];
}

interface CloudflareEnv {
  PROCESSING_QUEUE: {
    send: (message: QueueMessage) => Promise<void>;
  };
}

export async function POST(
  request: NextRequest,
  env?: CloudflareEnv
): Promise<NextResponse> {
  try {
    // Check if queue binding is available (Cloudflare Workers environment)
    if (!env?.PROCESSING_QUEUE) {
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
      jobType: validatedInput.jobType,
      payload: validatedInput.payload,
    };

    try {
      await env.PROCESSING_QUEUE.send(queueMessage);
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
          details: error.errors,
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
