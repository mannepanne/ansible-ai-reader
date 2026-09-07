// ABOUT: Vitest configuration for Ansible AI Reader
// ABOUT: Configures TypeScript path aliases and coverage thresholds

import { defineConfig, coverageConfigDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // A bare `exclude` replaces Vitest's defaults (test files, *.d.ts, config files, __tests__/ ...),
      // which is how test files once ended up counted as product code. Spread the defaults, then add ours.
      exclude: [
        ...coverageConfigDefaults.exclude,
        // The defaults only cover named tools (vite, jest, ...); tailwind/next/open-next configs need this
        '**/*.config.{ts,js,mjs,cjs}',
        '.next/**',
        '.open-next/**',
        // Build output, one-off operator scripts, and scratch files are not product code
        '.vercel/**',
        '.wrangler/**',
        'scripts/**',
        'SCRATCH/**',
        'vitest.setup.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
