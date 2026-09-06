import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// baseURL is omitted so the client calls /api/auth on whatever origin served
// the page, which keeps localhost and production working from one build.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
