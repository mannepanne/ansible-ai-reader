// ABOUT: Root layout component for Ansible AI Reader
// ABOUT: Defines HTML structure, global styles, and the Cloudflare Web Analytics beacon

import type { Metadata } from 'next';
import { DM_Sans, Newsreader } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Ansible - AI-Powered Reading Triage',
  description: 'Depth-of-engagement triage for Readwise Reader content',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Empty string fallback is the CI-build-without-secret case: beacon ships
  // inert (Cloudflare rejects unknown tokens without affecting page load).
  const cfAnalyticsToken = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? '';

  return (
    <html lang="en" className={`${dmSans.variable} ${newsreader.variable}`}>
      <body>
        {children}
        <Script
          strategy="afterInteractive"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: cfAnalyticsToken })}
        />
      </body>
    </html>
  );
}
