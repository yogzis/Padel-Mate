import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { ADMIN_ROLE, isAdminEmail } from "./admin-access";
import { ensurePlayerRecord } from "./server/players";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  // D1 has no interactive transactions, so the adapter must stay in its default
  // sequential mode. Setting `transaction: true` here would break every write.
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Config hooks run after plugin hooks and shallow-merge over them, so
        // this overrides the admin plugin's default role of "user".
        before: async (user) =>
          isAdminEmail(user.email)
            ? { data: { ...user, role: ADMIN_ROLE } }
            : { data: user },

        // Signing in is what makes you a player; there is no profile to create.
        // A failure here must not abort an otherwise valid signup, because
        // getBootstrap recreates the row on the user's next request.
        after: async (user) => {
          try {
            await ensurePlayerRecord(user.id, user.name, user.email);
          } catch (error) {
            console.error(
              "Could not create the player record at signup",
              error,
            );
          }
        },
      },
    },
  },

  // nextCookies must stay last: it flushes cookies queued by the plugins before it.
  plugins: [admin(), nextCookies()],
});
