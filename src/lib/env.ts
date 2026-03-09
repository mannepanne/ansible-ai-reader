// ABOUT: Environment variable validation with Zod
// ABOUT: Ensures all required env vars are present and valid at startup

import { z } from 'zod';

// Phase 1.2: Supabase and Resend
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().startsWith('re_', {
    message: 'RESEND_API_KEY must start with re_',
  }),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  // Skip validation during build - Cloudflare secrets only available at runtime
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      RESEND_API_KEY: '',
    } as Env;
  }

  const input = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };

  const result = envSchema.safeParse(input);

  if (!result.success) {
    const missing = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n  ');

    throw new Error(
      `Missing required environment variables:\n  ${missing}\n\n` +
        `See REFERENCE/environment-setup.md for configuration details.`
    );
  }

  return result.data;
}

// Export validated env for typed access
let cachedEnv: Env | undefined;

export const env = new Proxy({} as Env, {
  get(_target, prop) {
    if (!cachedEnv) {
      cachedEnv = validateEnv();
    }
    return cachedEnv[prop as keyof Env];
  },
});
