// Throwaway config used only by `@better-auth/cli generate`. The CLI runs in
// Node, where the real config's Cloudflare D1 binding cannot be resolved, and
// schema generation only depends on the provider and the plugin set.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';

export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: 'sqlite' }),
  socialProviders: {
    google: { clientId: 'generate-only', clientSecret: 'generate-only' },
  },
  plugins: [admin(), nextCookies()],
});
