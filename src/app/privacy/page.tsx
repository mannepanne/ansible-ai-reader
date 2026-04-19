// ABOUT: Privacy policy page for the Ansible public site
// ABOUT: Static content explaining data collection, storage, and user rights

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePageTracking } from '@/hooks/useTracking';

export default function PrivacyPage() {
  const { trackPageEvent } = usePageTracking();

  useEffect(() => {
    trackPageEvent('privacy_page_view');
  }, [trackPageEvent]);

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
        <h1 className="font-serif text-3xl sm:text-4xl font-medium mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-12">Last updated: 19 April 2026</p>

        <div className="prose prose-neutral max-w-none space-y-8 text-[15px] leading-relaxed text-foreground/85">
          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">Who we are</h2>
            <p>
              Ansible is a personal project by Magnus Hultberg. It is a reading-triage tool that
              generates AI summaries and commentary for articles saved in Readwise Reader.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">
              What data we collect and why
            </h2>

            <h3 className="font-semibold text-base text-foreground mt-6 mb-2">Email addresses</h3>
            <p>
              When you enter your email address to access the interactive demo, we store it to gauge
              interest in a wider rollout of Ansible and, if we proceed, to notify you once you can
              sign up.
            </p>
            <p className="mt-3">
              We may also contact you on a one-off basis to invite you to opt in to occasional
              updates about Ansible&apos;s development — but you will never be subscribed to anything
              without your explicit consent. We will never share, sell, or transfer your email
              address to any third party for any purpose.
            </p>
            <p className="mt-3">
              If Ansible does not proceed to a wider rollout, all collected email addresses will be
              permanently deleted.
            </p>

            <h3 className="font-semibold text-base text-foreground mt-6 mb-2">
              Landing page analytics
            </h3>
            <p>
              When you visit the Ansible website, we collect anonymous usage data to understand how
              people discover and navigate the site. This includes:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Page views (landing page, privacy page)</li>
              <li>Navigation clicks (e.g. &ldquo;Features,&rdquo; &ldquo;How it works&rdquo;)</li>
              <li>
                A randomly generated visitor identifier stored in your browser&apos;s local storage,
                used to count unique visitors
              </li>
            </ul>
            <p className="mt-3">
              The visitor identifier is not linked to your name, email, or any other personal
              information unless you separately provide your email to access the demo. It is used
              solely for aggregate analytics (e.g. &ldquo;how many unique visitors this week&rdquo;).
            </p>
            <p className="mt-3">
              Separately, we also use Cloudflare Web Analytics to measure aggregate page traffic
              and site performance. See &ldquo;Cookies and tracking&rdquo; below for details.
            </p>

            <h3 className="font-semibold text-base text-foreground mt-6 mb-2">
              Demo engagement data
            </h3>
            <p>
              When you interact with the demo, we collect anonymous usage data to understand how
              people engage with the product. This includes:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Which features you tried (tabs, expand/collapse, archive)</li>
              <li>How long you spent with the demo</li>
              <li>
                A random session identifier (not linked to your identity unless you provided your
                email)
              </li>
            </ul>
            <p className="mt-3">
              This data is used solely to inform product decisions. It is never shared with third
              parties.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">
              How your data is stored
            </h2>
            <p>
              Data is stored in a Supabase-hosted PostgreSQL database with encryption at rest
              (AES-256) and encryption in transit (TLS). Access to stored data is restricted to the
              project administrator only, via authenticated access with row-level security policies.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">Advertising</h2>
            <p>
              We may in the future display simple advertisements to help support the running costs of
              this project. If we do, these will be contextual and non-personalised — they will never
              be targeted based on your email address, browsing history, or demo usage. We will not
              share any personal information with advertisers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">Your rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Request deletion</strong> of your email address and any associated
                engagement data at any time
              </li>
              <li>
                <strong>Request access</strong> to any data we hold about you
              </li>
              <li>
                <strong>Withdraw consent</strong> at any time by contacting us
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights,{' '}
              <Link href="/contact" className="underline hover:text-foreground transition-colors">
                contact us
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">
              Cookies and tracking
            </h2>
            <p>
              We do not use cookies. We use your browser&apos;s local storage to store a randomly
              generated visitor identifier and session timing data. This local storage data stays on
              your device and is never sent to third parties. You can clear it at any time by
              clearing your browser&apos;s local storage or site data.
            </p>
            <p className="mt-3">
              We use Cloudflare Web Analytics to measure aggregate page traffic and site
              performance. It is cookieless and does not fingerprint visitors — it aggregates
              anonymous signals (URL path, referrer, approximate country, and device type) sent by
              your browser when it loads a page. No individual visitor can be identified from this
              data, and it is not combined with your email address or any information you provide
              elsewhere on the site.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">
              Changes to this policy
            </h2>
            <p>
              If we make material changes to this policy, we will update the &ldquo;last
              updated&rdquo; date at the top of this page. Given the limited scope of data
              collection, we do not anticipate significant changes.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-3">Contact</h2>
            <p>
              For any questions about this privacy policy or your data, use our{' '}
              <Link href="/contact" className="underline hover:text-foreground transition-colors">
                contact form
              </Link>
              .
            </p>
          </section>
        </div>
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
