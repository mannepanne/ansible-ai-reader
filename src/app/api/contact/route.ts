// ABOUT: API endpoint for the public contact form
// ABOUT: Verifies Cloudflare Turnstile CAPTCHA, then sends email via Resend
// ABOUT: Recipient address is server-side only — never exposed to the client

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ContactSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must be under 2000 characters')
    .transform((s) => s.trim()),
  turnstileToken: z.string().min(1, 'CAPTCHA token is required'),
});

/**
 * POST /api/contact
 *
 * Submit a contact form message.
 * Verifies Cloudflare Turnstile CAPTCHA server-side, then sends email via Resend.
 * The recipient email address is read from CONTACT_EMAIL env var — never sent to client.
 *
 * Authentication: None (public route)
 *
 * Request body:
 * - email: Sender's email address (required)
 * - message: Message body (10–2000 chars)
 * - turnstileToken: Cloudflare Turnstile response token from widget
 *
 * Response:
 * - 200: { success: true }
 * - 400: Validation failure or CAPTCHA verification failure
 * - 500: Missing configuration or email send failure
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validate request body
    const body = await request.json();
    const validated = ContactSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { email, message, turnstileToken } = validated.data;

    // 2. Verify Turnstile CAPTCHA token with Cloudflare
    const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      console.error('[Contact] CLOUDFLARE_TURNSTILE_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const turnstileResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: turnstileSecret, response: turnstileToken }),
      }
    );
    const turnstileOutcome = (await turnstileResponse.json()) as { success: boolean };

    if (!turnstileOutcome.success) {
      return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
    }

    // 3. Check required env vars before attempting send
    const contactEmail = process.env.CONTACT_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!contactEmail || !resendApiKey || !fromEmail) {
      console.error('[Contact] CONTACT_EMAIL, RESEND_API_KEY, or RESEND_FROM_EMAIL not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 4. Send email via Resend REST API
    // reply_to is set to the sender's address so replies go directly to them
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Ansible Contact Form <${fromEmail}>`,
        to: [contactEmail],
        reply_to: email,
        subject: `Message via Ansible contact form`,
        html: `
          <p><strong>From:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.json();
      console.error('[Contact] Resend API error:', err);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    console.log('[Contact] Message sent from:', email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Contact] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
