// ABOUT: Next.js configuration for Ansible AI Reader
// ABOUT: Configures TypeScript and base settings

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Suppress the X-Powered-By: Next.js header (information disclosure).
  poweredByHeader: false,
};

export default nextConfig;
