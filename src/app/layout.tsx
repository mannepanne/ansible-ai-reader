// ABOUT: Root layout component for Ansible AI Reader
// ABOUT: Defines HTML structure and global styles

import type { Metadata } from 'next';
import './globals.css';

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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
