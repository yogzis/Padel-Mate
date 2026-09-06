import { env } from 'cloudflare:workers';
import { MATE_INVITE_LIFETIME_MS, type Mate, type MateInviteLink } from '../domain';
import { remainingMateInviteMs } from '../mate-invite';
import { StoreError } from './errors';

type InviteRow = {
  token: string;
  created_by_player_id: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

function db() {
  if (!env.DB) throw new Error('The scoreboard database is unavailable.');
  return env.DB;
}

export function inviteUrlFor(token: string): string {
  const origin = process.env.BETTER_AUTH_URL ?? '';
  return `${origin}/invite/${token}`;
}

export async function createMateInvite(playerId: string): Promise<MateInviteLink> {
  const token = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + MATE_INVITE_LIFETIME_MS).toISOString();

  // A player has one unused invite at a time. Delete leftover open links
  // before inserting, so a replaced URL cannot still be accepted.
  await db().batch([
    db().prepare(
      'DELETE FROM mate_invites WHERE created_by_player_id = ? AND consumed_at IS NULL',
    ).bind(playerId),
    db().prepare(
      `INSERT INTO mate_invites (token, created_by_player_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(token, playerId, expiresAt, createdAt),
  ]);

  return { token, url: inviteUrlFor(token), createdAt, expiresAt };
}

type OpenInvite = InviteRow & { inviter: Mate };

async function loadOpenInvite(playerId: string, tokenValue: unknown): Promise<OpenInvite> {
  const token = String(tokenValue ?? '').trim();
  if (!token) throw new StoreError(400, 'That invite link is not valid.');

  const invite = await db().prepare(
    'SELECT token, created_by_player_id, expires_at, consumed_at, created_at FROM mate_invites WHERE token = ?',
  ).bind(token).first<InviteRow>();

  if (!invite) throw new StoreError(404, 'That invite link is not valid.');
  if (invite.consumed_at) throw new StoreError(409, 'That invite link has already been used.');
  if (remainingMateInviteMs(invite.created_at) <= 0) {
    throw new StoreError(410, 'That invite link has expired. Ask for a new one.');
  }

  const inviterId = invite.created_by_player_id;
  if (inviterId === playerId) throw new StoreError(400, 'You cannot invite yourself.');

  const inviter = await db().prepare('SELECT id, name, created_at FROM player_profiles WHERE id = ?')
    .bind(inviterId).first<{ id: string; name: string; created_at: string }>();
  if (!inviter) throw new StoreError(404, 'The player who sent this invite no longer exists.');

  return {
    ...invite,
    inviter: { id: inviter.id, name: inviter.name, createdAt: inviter.created_at },
  };
}

export async function peekMateInvite(playerId: string, tokenValue: unknown) {
  const invite = await loadOpenInvite(playerId, tokenValue);
  return { inviter: invite.inviter, expiresAt: invite.expires_at };
}

/**
 * Consumes an invite and records the friendship in both directions.
 *
 * The token is marked consumed in the same batch as the relationship, and the
 * update is guarded on `consumed_at IS NULL`, so two people racing on the same
 * link cannot both succeed.
 */
export async function acceptMateInvite(playerId: string, tokenValue: unknown): Promise<{ mate: Mate }> {
  const invite = await loadOpenInvite(playerId, tokenValue);
  const now = new Date().toISOString();
  const [claim] = await db().batch([
    db().prepare('UPDATE mate_invites SET consumed_at = ?, consumed_by_player_id = ? WHERE token = ? AND consumed_at IS NULL')
      .bind(now, playerId, invite.token),
    db().prepare('INSERT OR IGNORE INTO mates (player_id, mate_player_id, created_at) VALUES (?, ?, ?)')
      .bind(playerId, invite.inviter.id, now),
    db().prepare('INSERT OR IGNORE INTO mates (player_id, mate_player_id, created_at) VALUES (?, ?, ?)')
      .bind(invite.inviter.id, playerId, now),
  ]);

  if (!claim.meta.changes) throw new StoreError(409, 'That invite link has already been used.');

  return { mate: invite.inviter };
}

export async function rejectMateInvite(playerId: string, tokenValue: unknown): Promise<{ ok: true }> {
  const invite = await loadOpenInvite(playerId, tokenValue);
  const now = new Date().toISOString();
  const claim = await db().prepare(
    'UPDATE mate_invites SET consumed_at = ?, consumed_by_player_id = ? WHERE token = ? AND consumed_at IS NULL',
  ).bind(now, playerId, invite.token).run();

  if (!claim.meta.changes) throw new StoreError(409, 'That invite link has already been used.');
  return { ok: true };
}

export async function getOpenMateInvite(playerId: string): Promise<MateInviteLink | null> {
  const createdAfter = new Date(Date.now() - MATE_INVITE_LIFETIME_MS).toISOString();
  const row = await db().prepare(
    `SELECT token, expires_at, created_at FROM mate_invites
     WHERE created_by_player_id = ? AND consumed_at IS NULL AND created_at > ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(playerId, createdAfter).first<{ token: string; expires_at: string; created_at: string }>();

  if (!row) return null;
  return {
    token: row.token,
    url: inviteUrlFor(row.token),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function deleteOpenMateInvite(playerId: string): Promise<{ ok: true }> {
  const result = await db().prepare(
    'DELETE FROM mate_invites WHERE created_by_player_id = ? AND consumed_at IS NULL',
  ).bind(playerId).run();

  if (!result.meta.changes) {
    throw new StoreError(409, 'That invite link has already been used or is no longer available.');
  }
  return { ok: true };
}

export async function listMates(playerId: string): Promise<Mate[]> {
  const result = await db().prepare(
    `SELECT p.id, p.name, p.created_at
     FROM mates m JOIN player_profiles p ON p.id = m.mate_player_id
     WHERE m.player_id = ? ORDER BY p.name COLLATE NOCASE`,
  ).bind(playerId).all<{ id: string; name: string; created_at: string }>();

  return result.results.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export async function removeMate(playerId: string, matePlayerIdValue: unknown): Promise<{ ok: true }> {
  const matePlayerId = String(matePlayerIdValue ?? '');
  if (!matePlayerId) throw new StoreError(400, 'Choose a mate to remove.');

  const [removal] = await db().batch([
    db().prepare('DELETE FROM mates WHERE player_id = ? AND mate_player_id = ?').bind(playerId, matePlayerId),
    db().prepare('DELETE FROM mates WHERE player_id = ? AND mate_player_id = ?').bind(matePlayerId, playerId),
  ]);

  if (!removal.meta.changes) throw new StoreError(404, 'That player is not one of your mates.');
  return { ok: true };
}
