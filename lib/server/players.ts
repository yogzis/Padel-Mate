import { env } from 'cloudflare:workers';
import { playerNameFrom } from '../player-identity';

/**
 * Creates the player row that belongs to a user account.
 *
 * Called once by the sign-in hook and again, defensively, on every bootstrap.
 * `INSERT OR IGNORE` makes the repeat harmless and means a failed hook heals
 * itself on the user's next request rather than leaving them unable to play.
 */
export async function ensurePlayerRecord(
  userId: string,
  displayName: string | null | undefined,
  email?: string | null,
): Promise<void> {
  if (!env.DB) throw new Error('The scoreboard database is unavailable.');

  await env.DB.prepare(
    'INSERT OR IGNORE INTO player_profiles (id, name, created_at) VALUES (?, ?, ?)',
  )
    .bind(userId, playerNameFrom(displayName, email), new Date().toISOString())
    .run();
}
