// ABOUT: Public contact form page
// ABOUT: Simple email + message form protected by Cloudflare Turnstile CAPTCHA
// ABOUT: Submits to /api/contact which sends to CONTACT_EMAIL without exposing it

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function ContactPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isSubmittable =
    email.trim().length > 0 &&
    message.trim().length >= 10 &&
    turnstileToken !== null &&
    formState !== 'submitting';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSubmittable || !turnstileToken) return;

    setFormState('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message, turnstileToken }),
      });

      if (res.ok) {
        setFormState('success');
      } else {
        const data = (await res.json()) as { error?: string };
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.');
        setFormState('error');
      }
    } catch {
      setErrorMessage('Could not reach the server. Please check your connection and try again.');
      setFormState('error');
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif text-2xl font-medium tracking-tight">
            Ansible
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-serif text-3xl sm:text-4xl font-medium mb-2">Contact</h1>
        <p className="text-sm text-muted-foreground mb-12">
          Questions about your data or this privacy policy? Get in touch.
        </p>

        {formState === 'success' ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-8 text-center">
            <p className="font-medium text-green-800 mb-1">Message sent</p>
            <p className="text-sm text-green-700">
              Thank you — we&apos;ll get back to you as soon as possible.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-xl" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Your email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message..."
                required
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-y"
              />
            </div>

            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? ''}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />

            {formState === 'error' && (
              <p className="text-sm text-red-600" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={!isSubmittable}
              className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {formState === 'submitting' ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-serif text-lg">Ansible</span>
          <p className="text-xs text-muted-foreground">
            Depth-of-engagement triage for voracious readers.
          </p>
        </div>
      </footer>
    </div>
  );
}
