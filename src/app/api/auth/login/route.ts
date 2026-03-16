// ABOUT: API route for sending magic link emails
// ABOUT: Uses Supabase Auth with Resend SMTP

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  returnTo: z.string().optional().default('/summaries'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, returnTo } = loginSchema.parse(body);

    const supabase = await createClient();

    // Use SITE_URL env var (server-side), fallback to request origin
    const siteUrl = process.env.SITE_URL || request.nextUrl.origin;

    // Send magic link via Supabase Auth
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/api/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
      },
    });

    if (error) {
      console.error('Magic link error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to send magic link' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Magic link sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
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
