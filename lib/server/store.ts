import { env } from 'cloudflare:workers';
import type { AppUser } from '../../app/auth-session';
import { copy } from '../../copy';
import type {
  ActivityConfig,
  ContextSummary,
  GameSnapshot,
  LeaderboardEntry,
  LiveActivityState,
  Player,
  ScoreEvent,
  SetLogEntry,
  TeamId,
} from '../domain';
import { EMPTY_LIVE_STATE } from '../domain';
import {
  activityIsPaused,
  closeOwnedOutcome,
  controllersOf,
  exclusiveReleaseKind,
  normalizeControllerIds,
  stripController,
} from '../activity-roles';
import {
  MATCH_SLOT_COUNT,
  MIN_REGISTERED_PLAYERS_PER_CONTEXT,
  contextKeyFor,
  guestSlotId,
  registeredPlayerIdsOf,
} from '../player-identity';
import { directedMateKey, firstMissingMatePair } from '../mate-circle';
import { awardPoint, isSetWinningScore, snapshot, undoPoint, winningPlayerPoints } from '../scoring';
import { StoreError } from './errors';
import { listMateCircle, listMates } from './mates';
import { ensurePlayerRecord } from './players';

export { StoreError };

const ACTIVE_HEARTBEAT_MS = 30_000;
const SLOT_RESERVATION_MS = 120_000;
const ABANDONMENT_MS = 3 * 60 * 60 * 1000;
const RETAINED_NUMBERED_ACTIVITIES = 5;

function lastNumberedActivityIdsSql() {
  return `SELECT id FROM activities
    WHERE context_id = ? AND activity_number IS NOT NULL
    ORDER BY started_at DESC
    LIMIT ${RETAINED_NUMBERED_ACTIVITIES}`;
}


type ActivityRow = {
  id: string;
  context_id: string;
  activity_number: number | null;
  status: 'active' | 'completed' | 'abandoned';
  config_json: string;
  share_code: string;
  state_json: string;
  version: number;
  created_by_user_id: string;
  controller_user_ids_json: string | null;
  started_at: string;
  updated_at: string;
  abandoned_at: string | null;
  ended_at: string | null;
};

function db() {
  if (!env.DB) throw new Error('The scoreboard database is unavailable.');
  return env.DB;
}


export async function getBootstrap(user: AppUser) {
  // Repairs the row if the signup hook ever failed, so a signed-in user is
  // never stranded without a player.
  await ensurePlayerRecord(user.userId, user.displayName, user.email);

  const [mates, contexts] = await Promise.all([
    listMates(user.userId),
    listContextsForPlayer(user.userId),
  ]);
  const mateCircle = await listMateCircle(user.userId, mates.map((mate) => mate.id));

  return {
    user: {
      id: user.userId,
      displayName: user.displayName,
      email: user.email,
      isAdmin: user.isAdmin,
    },
    mates,
    mateCircle,
    contexts,
  };
}

/** Scoped to membership: a context belongs to the people in it, nobody else. */
async function listContextsForPlayer(playerId: string): Promise<ContextSummary[]> {
  const [contextResult, membershipResult] = await db().batch([
    db().prepare(
      `SELECT c.id, c.name, c.created_at,
        (SELECT MAX(a.updated_at) FROM activities a WHERE a.context_id = c.id) AS last_played_at
       FROM scoreboard_contexts c
       JOIN context_players cp ON cp.context_id = c.id
       WHERE cp.player_id = ?`,
    ).bind(playerId),
    db().prepare(
      `SELECT context_id, player_id FROM context_players
       WHERE context_id IN (SELECT context_id FROM context_players WHERE player_id = ?)
       ORDER BY context_id, player_id`,
    ).bind(playerId),
  ]);

  const memberships = membershipResult.results as { context_id: string; player_id: string }[];
  return (contextResult.results as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    lastPlayedAt: row.last_played_at == null ? null : String(row.last_played_at),
    playerIds: memberships.filter((item) => item.context_id === row.id).map((item) => item.player_id),
  }));
}

/**
 * Opens the context for a match line-up.
 *
 * Four slots are always filled, but only the registered ones identify the
 * context, so swapping which guest turns up keeps the same leaderboard.
 */
export async function selectContext(user: AppUser, slotIdsValue: unknown) {
  const slotIds = Array.isArray(slotIdsValue) ? slotIdsValue.map(String) : [];
  if (slotIds.length !== MATCH_SLOT_COUNT) {
    throw new StoreError(400, copy.errors.fillAllSlots);
  }

  const playerIds = [...new Set(registeredPlayerIdsOf(slotIds))].sort();
  if (playerIds.length < MIN_REGISTERED_PLAYERS_PER_CONTEXT) {
    throw new StoreError(400, copy.errors.chooseTwoRegistered);
  }

  const placeholders = playerIds.map(() => '?').join(',');
  const found = await db().prepare(`SELECT id, name FROM player_profiles WHERE id IN (${placeholders})`)
    .bind(...playerIds).all<{ id: string; name: string }>();
  if (found.results.length !== playerIds.length) {
    throw new StoreError(400, copy.errors.playersNoLongerExist);
  }

  await assertPlayersFormMateClique(user.userId, playerIds, found.results);

  const key = contextKeyFor(slotIds);
  const existing = await db().prepare('SELECT id FROM scoreboard_contexts WHERE context_key = ?')
    .bind(key).first<{ id: string }>();
  if (existing) return getContext(existing.id, user.userId);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const orderedNames = playerIds.map((playerId) => found.results.find((item) => item.id === playerId)?.name ?? 'Player');
  const guestCount = slotIds.length - playerIds.length;
  const name = guestCount > 0
    ? `${orderedNames.join(', ')} +${guestCount} guest${guestCount > 1 ? 's' : ''}`
    : orderedNames.join(', ');
  await db().batch([
    db().prepare(
      `INSERT INTO scoreboard_contexts (id, context_key, name, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, key, name, user.userId, now),
    ...playerIds.map((playerId) => db().prepare(
      'INSERT INTO context_players (context_id, player_id) VALUES (?, ?)',
    ).bind(id, playerId)),
    ...playerIds.map((playerId) => db().prepare(
      `INSERT INTO leaderboard_entries (context_id, player_id) VALUES (?, ?)
       ON CONFLICT(context_id, player_id) DO NOTHING`,
    ).bind(id, playerId)),
  ]);
  return getContext(id, user.userId);
}

/**
 * The creator must be playing, because contexts are only visible to their
 * members: a line-up the creator is absent from would vanish on the next load.
 */
async function assertPlayersAreMates(userId: string, playerIds: readonly string[]) {
  if (!playerIds.includes(userId)) {
    throw new StoreError(400, copy.errors.mustBeInMatch);
  }

  if (!(await playersAreStillMates(userId, playerIds))) {
    throw new StoreError(403, copy.errors.onlyScoreWithMates);
  }
}

async function assertPlayersFormMateClique(
  userId: string,
  playerIds: readonly string[],
  players: readonly { id: string; name: string }[],
) {
  if (!playerIds.includes(userId)) {
    throw new StoreError(400, copy.errors.mustBeInMatch);
  }

  const placeholders = playerIds.map(() => '?').join(',');
  const edges = await db().prepare(
    `SELECT player_id, mate_player_id FROM mates
     WHERE player_id IN (${placeholders}) AND mate_player_id IN (${placeholders})`,
  ).bind(...playerIds, ...playerIds).all<{ player_id: string; mate_player_id: string }>();

  const directedKeys = new Set(
    edges.results.map((row) => directedMateKey(row.player_id, row.mate_player_id)),
  );
  const missing = firstMissingMatePair(playerIds, directedKeys);
  if (!missing) return;

  const names = new Map(players.map((player) => [player.id, player.name]));
  const labelFor = (playerId: string) => (
    playerId === userId ? copy.chrome.you : names.get(playerId) ?? copy.chrome.playerFallback
  );
  throw new StoreError(
    403,
    copy.errors.needToBeMates(labelFor(missing[0]), labelFor(missing[1])),
  );
}

async function playersAreStillMates(userId: string, playerIds: readonly string[]): Promise<boolean> {
  const otherPlayerIds = playerIds.filter((playerId) => playerId !== userId);
  if (!otherPlayerIds.length) return true;

  const placeholders = otherPlayerIds.map(() => '?').join(',');
  const confirmed = await db().prepare(
    `SELECT mate_player_id FROM mates
     WHERE player_id = ? AND mate_player_id IN (${placeholders})`,
  ).bind(userId, ...otherPlayerIds).all<{ mate_player_id: string }>();

  return confirmed.results.length === otherPlayerIds.length;
}

async function registeredPlayerIdsFor(contextId: string): Promise<string[]> {
  const rows = await db().prepare('SELECT player_id FROM context_players WHERE context_id = ?')
    .bind(contextId).all<{ player_id: string }>();
  return rows.results.map((row) => row.player_id).sort();
}

async function recordConsent(activityId: string, playerId: string) {
  await db().prepare(
    'INSERT OR IGNORE INTO activity_consents (activity_id, player_id, accepted_at) VALUES (?, ?, ?)',
  ).bind(activityId, playerId, new Date().toISOString()).run();
}

async function assignActivityNumber(activity: ActivityRow): Promise<number> {
  if (activity.activity_number != null) return activity.activity_number;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await db().prepare('SELECT activity_number FROM activities WHERE id = ?')
      .bind(activity.id).first<{ activity_number: number | null }>();
    if (latest?.activity_number != null) {
      activity.activity_number = latest.activity_number;
      return latest.activity_number;
    }

    const next = await db().prepare(
      'SELECT COALESCE(MAX(activity_number), 0) + 1 AS next FROM activities WHERE context_id = ?',
    ).bind(activity.context_id).first<{ next: number }>();
    const number = Number(next?.next ?? 1);
    try {
      const claim = await db().prepare(
        'UPDATE activities SET activity_number = ? WHERE id = ? AND activity_number IS NULL',
      ).bind(number, activity.id).run();
      if (claim.meta.changes) {
        activity.activity_number = number;
        return number;
      }
    } catch {
      continue;
    }
  }

  throw new StoreError(409, copy.errors.couldNotNumberActivity);
}

async function consentStatus(activityId: string, registeredIds: readonly string[]) {
  const rows = await db().prepare('SELECT player_id FROM activity_consents WHERE activity_id = ?')
    .bind(activityId).all<{ player_id: string }>();
  const accepted = new Set(rows.results.map((row) => row.player_id));
  return {
    acceptedPlayerIds: registeredIds.filter((id) => accepted.has(id)),
    pendingPlayerIds: registeredIds.filter((id) => !accepted.has(id)),
  };
}

function controllerIdsOf(activity: ActivityRow): string[] {
  return controllersOf(activity.controller_user_ids_json, activity.created_by_user_id);
}

async function namesForPlayers(playerIds: readonly string[]): Promise<string> {
  if (playerIds.length === 0) return '';
  const placeholders = playerIds.map(() => '?').join(',');
  const rows = await db().prepare(
    `SELECT id, name FROM player_profiles WHERE id IN (${placeholders})`,
  ).bind(...playerIds).all<{ id: string; name: string }>();
  const byId = new Map(rows.results.map((row) => [row.id, row.name]));
  const names = playerIds.map((id) => byId.get(id) ?? copy.chrome.playerFallback);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

async function ownerNameOf(ownerUserId: string): Promise<string> {
  const row = await db().prepare('SELECT name FROM player_profiles WHERE id = ?')
    .bind(ownerUserId).first<{ name: string }>();
  return row?.name ?? copy.chrome.playerFallback;
}

async function assertOwner(activity: ActivityRow, userId: string) {
  if (activity.created_by_user_id !== userId) {
    throw new StoreError(403, copy.errors.onlyOwnerCanManageActivity);
  }
}

async function assertController(activity: ActivityRow, userId: string) {
  if (!controllerIdsOf(activity).includes(userId)) {
    throw new StoreError(403, copy.errors.onlyControllersCanScore);
  }
}

async function assertEveryoneIn(activityId: string, contextId: string) {
  const { pendingPlayerIds } = await consentStatus(activityId, await registeredPlayerIdsFor(contextId));
  if (!activityIsPaused(pendingPlayerIds)) return;
  const names = await namesForPlayers(pendingPlayerIds);
  throw new StoreError(409, copy.errors.activityPausedUntilRejoin(names));
}

async function writeControllers(activityId: string, controllerUserIds: readonly string[]) {
  await db().prepare(
    `UPDATE activities SET controller_user_ids_json = ?, version = version + 1, updated_at = ?
     WHERE id = ?`,
  ).bind(JSON.stringify(controllerUserIds), new Date().toISOString(), activityId).run();
}

async function deviceLabelFor(activityId: string, deviceId: string, user: AppUser) {
  const row = await db().prepare(
    'SELECT device_label FROM activity_devices WHERE activity_id = ? AND device_id = ?',
  ).bind(activityId, deviceId).first<{ device_label: string }>();
  return row?.device_label ?? deviceLabel(user.displayName);
}

async function ensureDevicePresence(
  activity: ActivityRow,
  user: AppUser,
  deviceId: string,
) {
  const now = new Date().toISOString();
  const existing = await db().prepare(
    'SELECT id FROM activity_devices WHERE activity_id = ? AND device_id = ?',
  ).bind(activity.id, deviceId).first<{ id: string }>();
  if (existing) {
    await db().prepare(
      `UPDATE activity_devices SET user_id = ?, user_display_name = ?, slot_status = 'active',
       reserved_until = NULL, last_seen_at = ?, left_at = NULL WHERE id = ?`,
    ).bind(user.userId, user.displayName, now, existing.id).run();
    return;
  }

  const sameUser = await db().prepare(
    `SELECT COUNT(*) AS count FROM activity_devices
     WHERE activity_id = ? AND user_id = ? AND slot_status != 'released'`,
  ).bind(activity.id, user.userId).first<{ count: number }>();
  const suffix = Number(sameUser?.count ?? 0) + 1;
  const label = deviceLabel(user.displayName, suffix > 1 ? suffix : undefined);
  const role = activity.created_by_user_id === user.userId ? 'host' : 'participant';
  await db().prepare(
    `INSERT INTO activity_devices
      (id, activity_id, device_id, user_id, user_display_name, device_label, role,
       slot_status, reserved_until, joined_at, last_seen_at, left_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, NULL)`,
  ).bind(
    crypto.randomUUID(), activity.id, deviceId, user.userId, user.displayName, label, role, now, now,
  ).run();
}

async function finishActivityRecord(activity: ActivityRow) {
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  const next = { ...state, phase: 'ended' as const };
  const now = new Date().toISOString();
  await db().prepare(
    `UPDATE activities SET status = 'completed', state_json = ?, version = version + 1,
     updated_at = ?, ended_at = ? WHERE id = ? AND status = 'active'`,
  ).bind(JSON.stringify(next), now, now, activity.id).run();
}

async function abandonActivityNow(activity: ActivityRow) {
  if (activity.status !== 'active') return;
  const now = new Date().toISOString();
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  const statements: D1PreparedStatement[] = [
    db().prepare(
      `UPDATE activities SET status = 'abandoned', abandoned_at = ?, updated_at = ?,
       version = version + 1 WHERE id = ? AND status = 'active'`,
    ).bind(now, now, activity.id),
  ];
  if (state.activeSetId) {
    const activityNumber = await assignActivityNumber(activity);
    statements.push(db().prepare(
      `INSERT OR IGNORE INTO set_logs
        (id, context_id, activity_id, activity_number, activity_date, set_id, set_number,
         blue_player_ids_json, red_player_ids_json, blue_games, red_games, winner_team,
         conclusion_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'abandoned', ?)`,
    ).bind(
      `abandoned-${activity.id}`, activity.context_id, activity.id, activityNumber,
      activity.started_at, state.activeSetId, state.setNumber,
      JSON.stringify(state.bluePlayerIds), JSON.stringify(state.redPlayerIds),
      state.blueGames, state.redGames, now,
    ));
  }
  await db().batch(statements);
}

async function closeOwnedActivity(activity: ActivityRow) {
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (closeOwnedOutcome(state.phase) === 'abandon') {
    await abandonActivityNow(activity);
    return;
  }
  await finishActivityRecord(activity);
}

async function leaveAsParticipant(activity: ActivityRow, userId: string, deviceId: string) {
  const now = new Date().toISOString();
  await db().batch([
    db().prepare(
      'DELETE FROM activity_consents WHERE activity_id = ? AND player_id = ?',
    ).bind(activity.id, userId),
    db().prepare(
      `UPDATE activity_devices SET slot_status = 'released', reserved_until = NULL,
       left_at = ?, last_seen_at = ? WHERE activity_id = ? AND (device_id = ? OR user_id = ?)`,
    ).bind(now, now, activity.id, deviceId, userId),
  ]);
  const nextControllers = stripController(controllerIdsOf(activity), userId, activity.created_by_user_id);
  await writeControllers(activity.id, nextControllers);
  const occupied = await countOccupiedSlots(activity.id);
  if (occupied === 0) {
    await db().prepare(
      `UPDATE activities SET all_devices_disconnected_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
    ).bind(now, now, activity.id).run();
  }
}

async function releaseOtherActivities(user: AppUser, exceptActivityId?: string) {
  const rows = await db().prepare(
    `SELECT DISTINCT a.id, a.created_by_user_id FROM activities a
     LEFT JOIN activity_consents c ON c.activity_id = a.id AND c.player_id = ?
     WHERE a.status = 'active' AND (a.created_by_user_id = ? OR c.player_id IS NOT NULL)`,
  ).bind(user.userId, user.userId).all<{ id: string; created_by_user_id: string }>();

  for (const row of rows.results) {
    if (row.id === exceptActivityId) continue;
    const activity = await getActivityRow(row.id);
    if (exclusiveReleaseKind(activity.created_by_user_id === user.userId) === 'close-owned') {
      await closeOwnedActivity(activity);
      continue;
    }
    await leaveAsParticipant(activity, user.userId, '');
  }
}


async function attachViewerAcceptance<T extends { id: string }>(
  activities: T[],
  viewerPlayerId?: string,
): Promise<Array<T & { viewerAccepted: boolean }>> {
  if (!viewerPlayerId || activities.length === 0) {
    return activities.map((activity) => ({ ...activity, viewerAccepted: false }));
  }

  const placeholders = activities.map(() => '?').join(',');
  const rows = await db().prepare(
    `SELECT activity_id FROM activity_consents WHERE player_id = ? AND activity_id IN (${placeholders})`,
  ).bind(viewerPlayerId, ...activities.map((activity) => activity.id)).all<{ activity_id: string }>();
  const acceptedIds = new Set(rows.results.map((row) => row.activity_id));

  return activities.map((activity) => ({
    ...activity,
    viewerAccepted: acceptedIds.has(activity.id),
  }));
}

export async function getContext(contextId: string, viewerPlayerId?: string) {
  const context = await db().prepare(
    `SELECT id, name, created_at,
      (SELECT MAX(a.updated_at) FROM activities a WHERE a.context_id = scoreboard_contexts.id) AS last_played_at
     FROM scoreboard_contexts WHERE id = ?`,
  ).bind(contextId).first<{ id: string; name: string; created_at: string; last_played_at: string | null }>();
  if (!context) throw new StoreError(404, copy.errors.groupNotFound);

  if (viewerPlayerId) {
    const member = await db().prepare(
      'SELECT player_id FROM context_players WHERE context_id = ? AND player_id = ?',
    ).bind(contextId, viewerPlayerId).first<{ player_id: string }>();
    if (!member) throw new StoreError(403, copy.errors.groupNotAvailable);
  }

  const [playersResult, leaderboardResult, logsResult, activitiesResult] = await db().batch([
    db().prepare(
      `SELECT p.id, p.name, p.created_at
       FROM context_players cp JOIN player_profiles p ON p.id = cp.player_id
       WHERE cp.context_id = ? ORDER BY p.name COLLATE NOCASE`,
    ).bind(contextId),
    db().prepare(
      `SELECT l.player_id, p.name AS player_name, l.total_points, l.sets_played,
        l.sets_won, l.sets_lost, l.games_won, l.games_lost, l.game_differential
       FROM leaderboard_entries l JOIN player_profiles p ON p.id = l.player_id
       WHERE l.context_id = ?
       ORDER BY l.total_points DESC, l.sets_won DESC, l.game_differential DESC,
         l.games_won DESC, p.name COLLATE NOCASE`,
    ).bind(contextId),
    db().prepare(
      `SELECT id, activity_id, activity_number, activity_date, set_id, set_number,
        blue_player_ids_json, red_player_ids_json, blue_games, red_games,
        winner_team, conclusion_type, created_at
       FROM set_logs WHERE context_id = ?
       AND activity_id IN (${lastNumberedActivityIdsSql()})
       ORDER BY activity_date DESC, set_number DESC`,
    ).bind(contextId, contextId),
    db().prepare(
      `SELECT a.id, a.activity_number, a.status, a.started_at, a.updated_at, a.share_code,
        a.created_by_user_id, p.name AS owner_name
       FROM activities a
       JOIN player_profiles p ON p.id = a.created_by_user_id
       WHERE a.context_id = ? AND a.status IN ('active', 'abandoned')
       ORDER BY a.started_at DESC`,
    ).bind(contextId),
  ]);

  return {
    context: {
      id: context.id,
      name: context.name,
      createdAt: context.created_at,
      lastPlayedAt: context.last_played_at == null ? null : context.last_played_at,
      playerIds: (playersResult.results as Record<string, unknown>[]).map((row) => String(row.id)),
    },
    players: (playersResult.results as Record<string, unknown>[]).map(mapPlayer),
    leaderboard: (leaderboardResult.results as Record<string, unknown>[]).map(mapLeaderboard),
    logs: (logsResult.results as Record<string, unknown>[]).map(mapSetLog),
    activities: await attachViewerAcceptance(
      (activitiesResult.results as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        activityNumber: row.activity_number == null ? null : Number(row.activity_number),
        status: String(row.status),
        startedAt: String(row.started_at),
        updatedAt: String(row.updated_at),
        shareCode: String(row.share_code),
        ownerUserId: String(row.created_by_user_id),
        ownerName: String(row.owner_name),
      })),
      viewerPlayerId,
    ),
    canCreateActivity: viewerPlayerId
      ? await playersAreStillMates(
        viewerPlayerId,
        (playersResult.results as Record<string, unknown>[]).map((row) => String(row.id)),
      )
      : false,
  };
}

export async function createActivity(
  user: AppUser,
  contextIdValue: unknown,
  configValue: unknown,
  deviceIdValue: unknown,
) {
  const contextId = String(contextIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const config = validateConfig(configValue);
  await getContext(contextId, user.userId);
  const playerIds = await registeredPlayerIdsFor(contextId);
  await assertPlayersAreMates(user.userId, playerIds);
  await releaseOtherActivities(user);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const shareCode = await makeShareCode();
  const state = { ...EMPTY_LIVE_STATE };
  const label = deviceLabel(user.displayName);

  await db().batch([
    db().prepare(
      `INSERT INTO activities
        (id, context_id, status, config_json, share_code, state_json,
         version, created_by_user_id, controller_user_ids_json, started_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).bind(
      id, contextId, JSON.stringify(config), shareCode, JSON.stringify(state),
      user.userId, JSON.stringify([user.userId]), now, now,
    ),
    db().prepare(
      `INSERT INTO activity_devices
        (id, activity_id, device_id, user_id, user_display_name, device_label, role,
         slot_status, reserved_until, joined_at, last_seen_at, left_at)
       VALUES (?, ?, ?, ?, ?, ?, 'host', 'active', NULL, ?, ?, NULL)`,
    ).bind(crypto.randomUUID(), id, deviceId, user.userId, user.displayName, label, now, now),
    db().prepare(
      'INSERT INTO activity_consents (activity_id, player_id, accepted_at) VALUES (?, ?, ?)',
    ).bind(id, user.userId, now),
  ]);
  return getActivity(id, deviceId, false, user.userId);
}

export async function joinActivity(
  user: AppUser,
  activityRefValue: unknown,
  deviceIdValue: unknown,
) {
  const ref = String(activityRefValue ?? '').trim();
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await db().prepare(
    'SELECT * FROM activities WHERE id = ? OR UPPER(share_code) = UPPER(?)',
  ).bind(ref, ref).first<ActivityRow>();
  if (!activity) throw new StoreError(404, copy.errors.activityNotFound);

  const memberIds = await registeredPlayerIdsFor(activity.context_id);
  if (!memberIds.includes(user.userId)) {
    throw new StoreError(403, copy.errors.onlyGroupCanAccept);
  }
  if (activity.status === 'completed') {
    return getActivity(activity.id, deviceId, false, user.userId);
  }

  if (activity.status === 'active') {
    await releaseOtherActivities(user, activity.id);
  }

  await recordConsent(activity.id, user.userId);
  await refreshDeviceSlots(activity.id);
  await ensureDevicePresence(activity, user, deviceId);
  return getActivity(activity.id, deviceId, false, user.userId);
}

export async function getActivity(
  activityId: string,
  deviceIdValue: unknown,
  heartbeat = true,
  viewerUserId?: string,
) {
  const deviceId = cleanDeviceId(deviceIdValue);
  await refreshDeviceSlots(activityId);

  const activity = await db().prepare('SELECT * FROM activities WHERE id = ?')
    .bind(activityId).first<ActivityRow>();
  if (!activity) throw new StoreError(404, copy.errors.activityNotFound);

  const registeredIds = await registeredPlayerIdsFor(activity.context_id);
  const consents = await consentStatus(activityId, registeredIds);

  if (heartbeat) {
    const result = await db().prepare(
      `UPDATE activity_devices SET slot_status = 'active', reserved_until = NULL,
       last_seen_at = ?, left_at = NULL WHERE activity_id = ? AND device_id = ?
       AND slot_status != 'released'`,
    ).bind(new Date().toISOString(), activityId, deviceId).run();
    const acceptedWithoutDevice = Boolean(
      viewerUserId && consents.acceptedPlayerIds.includes(viewerUserId),
    );
    if (!result.meta.changes && !acceptedWithoutDevice) {
      throw new StoreError(403, copy.errors.deviceNotConnected);
    }
  }

  await abandonIfExpired(activity);
  const refreshed = await db().prepare('SELECT * FROM activities WHERE id = ?')
    .bind(activityId).first<ActivityRow>();
  if (!refreshed) throw new StoreError(404, copy.errors.activityNotFound);

  const state = parseJson<LiveActivityState>(refreshed.state_json, EMPTY_LIVE_STATE);
  const controllerUserIds = controllerIdsOf(refreshed);
  const [contextData, devicesResult, logsResult, historyResult, ownerName] = await Promise.all([
    getContext(refreshed.context_id),
    db().prepare(
      `SELECT device_id, device_label, role, slot_status, last_seen_at, reserved_until
       FROM activity_devices WHERE activity_id = ? AND slot_status != 'released'
       ORDER BY joined_at`,
    ).bind(activityId).all<Record<string, unknown>>(),
    db().prepare(
      `SELECT id, activity_id, activity_number, activity_date, set_id, set_number,
        blue_player_ids_json, red_player_ids_json, blue_games, red_games,
        winner_team, conclusion_type, created_at
       FROM set_logs WHERE activity_id = ? ORDER BY set_number DESC`,
    ).bind(activityId).all<Record<string, unknown>>(),
    state.currentGameId
      ? db().prepare(
        `SELECT id, action, team, previous_snapshot_json, next_snapshot_json,
          device_label, sequence_number, created_at
         FROM score_events WHERE current_game_id = ? ORDER BY sequence_number DESC LIMIT 50`,
      ).bind(state.currentGameId).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    ownerNameOf(refreshed.created_by_user_id),
  ]);

  return {
    activity: {
      id: refreshed.id,
      contextId: refreshed.context_id,
      activityNumber: refreshed.activity_number == null ? null : Number(refreshed.activity_number),
      status: refreshed.status,
      config: parseJson<ActivityConfig>(refreshed.config_json, validateConfig({})),
      shareCode: refreshed.share_code,
      state,
      version: refreshed.version,
      startedAt: refreshed.started_at,
      updatedAt: refreshed.updated_at,
      abandonedAt: refreshed.abandoned_at,
    },
    context: contextData.context,
    players: contextData.players,
    devices: devicesResult.results.map((row) => ({
      deviceId: String(row.device_id),
      deviceLabel: String(row.device_label),
      role: String(row.role),
      slotStatus: String(row.slot_status),
      lastSeenAt: String(row.last_seen_at),
      reservedUntil: row.reserved_until ? String(row.reserved_until) : null,
    })),
    logs: logsResult.results.map(mapSetLog),
    history: historyResult.results.map(mapScoreEvent).reverse(),
    acceptedPlayerIds: consents.acceptedPlayerIds,
    pendingPlayerIds: consents.pendingPlayerIds,
    ownerUserId: refreshed.created_by_user_id,
    ownerName,
    controllerUserIds,
    viewerIsOwner: viewerUserId === refreshed.created_by_user_id,
    viewerIsController: Boolean(viewerUserId && controllerUserIds.includes(viewerUserId)),
  };
}

export async function setupSet(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  blueIdsValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  if (activity.status !== 'active') throw new StoreError(409, copy.errors.activityNotActive);
  const { pendingPlayerIds } = await consentStatus(
    activityId,
    await registeredPlayerIdsFor(activity.context_id),
  );
  if (pendingPlayerIds.length) {
    throw new StoreError(409, copy.errors.waitForAccepts);
  }
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (state.phase !== 'set-setup') throw new StoreError(409, copy.errors.finishSetBeforeTeams);
  await assignActivityNumber(activity);

  const allIds = await matchSlotsFor(activity.context_id);
  const blueIds = Array.isArray(blueIdsValue) ? [...new Set(blueIdsValue.map(String))].sort() : [];
  if (blueIds.length !== 2 || !blueIds.every((id) => allIds.includes(id))) {
    throw new StoreError(400, copy.errors.chooseExactlyTwoBlue);
  }
  const redIds = allIds.filter((id) => !blueIds.includes(id));
  const setId = crypto.randomUUID();
  const gameId = crypto.randomUUID();
  const now = new Date().toISOString();
  const next: LiveActivityState = {
    ...EMPTY_LIVE_STATE,
    phase: 'live',
    setNumber: state.setNumber,
    activeSetId: setId,
    currentGameId: gameId,
    bluePlayerIds: blueIds,
    redPlayerIds: redIds,
  };
  await db().batch([
    db().prepare(
      `INSERT INTO sets
        (id, activity_id, set_number, blue_player_ids_json, red_player_ids_json,
         blue_games, red_games, status, started_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 'active', ?)`,
    ).bind(setId, activityId, state.setNumber, JSON.stringify(blueIds), JSON.stringify(redIds), now),
    db().prepare(
      `UPDATE activities SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(next), now, activityId),
  ]);
  return getActivity(activityId, deviceId, false, user.userId);
}

/**
 * The four slots for a match, derived rather than stored: the context holds
 * exactly the registered players of this line-up, so the remainder of the four
 * are always guests.
 */
async function matchSlotsFor(contextId: string): Promise<string[]> {
  const contextPlayers = await db().prepare('SELECT player_id FROM context_players WHERE context_id = ?')
    .bind(contextId).all<{ player_id: string }>();

  const registeredIds = contextPlayers.results.map((row) => row.player_id).sort();
  const guestIds = Array.from(
    { length: MATCH_SLOT_COUNT - registeredIds.length },
    (_unused, index) => guestSlotId(index + 1),
  );

  return [...registeredIds, ...guestIds];
}

export async function scorePoint(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  teamValue: unknown,
  mutationIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const team = teamValue === 'blue' || teamValue === 'red' ? teamValue : null;
  const mutationId = String(mutationIdValue ?? '');
  if (!team || !mutationId) throw new StoreError(400, copy.errors.invalidScoreUpdate);
  const activityGuard = await getActivityRow(activityId);
  await assertController(activityGuard, user.userId);
  await assertEveryoneIn(activityId, activityGuard.context_id);
  const participantLabel = await deviceLabelFor(activityId, deviceId, user);
  const duplicate = await db().prepare('SELECT id FROM score_events WHERE client_mutation_id = ?')
    .bind(mutationId).first<{ id: string }>();
  if (duplicate) return getActivity(activityId, deviceId, false, user.userId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const activity = await getActivityRow(activityId);
    if (activity.status !== 'active') throw new StoreError(409, copy.errors.activityNotActive);
    const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
    if (!state.activeSetId || !state.currentGameId) throw new StoreError(409, copy.errors.startSetBeforeScoring);
    const config = parseJson<ActivityConfig>(activity.config_json, validateConfig({}));
    const previous = snapshot(state);
    let next: LiveActivityState;
    try {
      next = awardPoint(state, team, config.deuceRule);
    } catch (error) {
      throw new StoreError(409, error instanceof Error ? error.message : copy.errors.scoreUpdateUnavailable);
    }
    const nextVersion = activity.version + 1;
    const now = new Date().toISOString();
    const update = await db().prepare(
      `UPDATE activities SET state_json = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).bind(JSON.stringify(next), nextVersion, now, activityId, activity.version).run();
    if (!update.meta.changes) continue;

    await db().prepare(
      `INSERT OR IGNORE INTO score_events
        (id, client_mutation_id, activity_id, set_id, current_game_id, sequence_number,
         action, team, previous_snapshot_json, next_snapshot_json, created_by_device_id,
         created_by_user_id, user_display_name, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'point', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), mutationId, activityId, state.activeSetId, state.currentGameId,
      nextVersion, team, JSON.stringify(previous), JSON.stringify(snapshot(next)), deviceId,
      user.userId, user.displayName, participantLabel, now,
    ).run();
    return getActivity(activityId, deviceId, false, user.userId);
  }
  throw new StoreError(409, copy.errors.scoreChangedTryPointAgain);
}

export async function undoScore(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  mutationIdValue: unknown,
) {
  return changeScoreState(user, activityIdValue, deviceIdValue, mutationIdValue, 'undo');
}

export async function cancelGame(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  mutationIdValue: unknown,
) {
  return changeScoreState(user, activityIdValue, deviceIdValue, mutationIdValue, 'cancel-game');
}

async function changeScoreState(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  mutationIdValue: unknown,
  action: 'undo' | 'cancel-game',
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const mutationId = String(mutationIdValue ?? crypto.randomUUID());
  const activityGuard = await getActivityRow(activityId);
  await assertOwner(activityGuard, user.userId);
  await assertEveryoneIn(activityId, activityGuard.context_id);
  const participantLabel = await deviceLabelFor(activityId, deviceId, user);
  const duplicate = await db().prepare('SELECT id FROM score_events WHERE client_mutation_id = ?')
    .bind(mutationId).first<{ id: string }>();
  if (duplicate) return getActivity(activityId, deviceId, false, user.userId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const activity = await getActivityRow(activityId);
    const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
    if (!state.activeSetId || !state.currentGameId) throw new StoreError(409, copy.errors.noActiveGame);
    if (action === 'cancel-game' && !state.pendingGameWinner) throw new StoreError(409, copy.errors.noGameResultToCancel);
    const previous = snapshot(state);
    let next: LiveActivityState;
    try {
      next = undoPoint(state);
    } catch (error) {
      throw new StoreError(409, error instanceof Error ? error.message : copy.errors.nothingToUndo);
    }
    const now = new Date().toISOString();
    const nextVersion = activity.version + 1;
    const update = await db().prepare(
      `UPDATE activities SET state_json = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`,
    ).bind(JSON.stringify(next), nextVersion, now, activityId, activity.version).run();
    if (!update.meta.changes) continue;
    await db().prepare(
      `INSERT OR IGNORE INTO score_events
        (id, client_mutation_id, activity_id, set_id, current_game_id, sequence_number,
         action, team, previous_snapshot_json, next_snapshot_json, created_by_device_id,
         created_by_user_id, user_display_name, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), mutationId, activityId, state.activeSetId, state.currentGameId,
      nextVersion, action, JSON.stringify(previous), JSON.stringify(snapshot(next)), deviceId,
      user.userId, user.displayName, participantLabel, now,
    ).run();
    return getActivity(activityId, deviceId, false, user.userId);
  }
  throw new StoreError(409, copy.errors.scoreChangedTryAgain);
}

export async function confirmGame(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  await assertEveryoneIn(activityId, activity.context_id);
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (!state.pendingGameWinner || !state.activeSetId) throw new StoreError(409, copy.errors.noGameResultToConfirm);
  const config = parseJson<ActivityConfig>(activity.config_json, validateConfig({}));
  const blueGames = state.blueGames + (state.pendingGameWinner === 'blue' ? 1 : 0);
  const redGames = state.redGames + (state.pendingGameWinner === 'red' ? 1 : 0);
  const setWinner = isSetWinningScore(blueGames, redGames, config);
  const next: LiveActivityState = {
    ...state,
    blueGames,
    redGames,
    blueScore: '0',
    redScore: '0',
    deuceReturnCount: 0,
    decisivePointActive: false,
    pendingGameWinner: null,
    pendingSetWinner: setWinner,
    currentGameId: crypto.randomUUID(),
    history: [],
  };
  const now = new Date().toISOString();
  await db().batch([
    db().prepare('UPDATE sets SET blue_games = ?, red_games = ? WHERE id = ?')
      .bind(blueGames, redGames, state.activeSetId),
    db().prepare(
      `UPDATE activities SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(next), now, activityId),
  ]);
  return getActivity(activityId, deviceId, false, user.userId);
}

export async function cancelSet(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (!state.pendingSetWinner) throw new StoreError(409, copy.errors.noSetResultToCancel);
  const next = { ...state, pendingSetWinner: null };
  await db().prepare(
    `UPDATE activities SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
  ).bind(JSON.stringify(next), new Date().toISOString(), activityId).run();
  return getActivity(activityId, deviceId, false, user.userId);
}

export async function confirmSet(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  await assertEveryoneIn(activityId, activity.context_id);
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (!state.pendingSetWinner) throw new StoreError(409, copy.errors.noSetResultToConfirm);
  await completeSet(activity, state, state.pendingSetWinner, 'normal');
  return getActivity(activityId, deviceId, false, user.userId);
}

export async function concludeManualSet(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  choiceValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  await assertEveryoneIn(activityId, activity.context_id);
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (!state.activeSetId) throw new StoreError(409, copy.errors.noActiveSet);
  if (choiceValue === 'calculate') {
    if (state.blueGames === state.redGames) {
      throw new StoreError(409, copy.errors.tiedPartialCannotCalculate);
    }
    const winner: TeamId = state.blueGames > state.redGames ? 'blue' : 'red';
    await completeSet(activity, state, winner, 'manual-partial');
  } else if (choiceValue === 'disregard') {
    await disregardSet(activity, state);
  } else {
    throw new StoreError(400, copy.errors.chooseHowToConclude);
  }
  return getActivity(activityId, deviceId, false, user.userId);
}

export async function finishActivity(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  if (state.phase === 'live') throw new StoreError(409, copy.errors.concludeBeforeFinishing);
  await finishActivityRecord(activity);
  return { ok: true };
}

export async function leaveActivity(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  if (activity.status !== 'active') {
    return { ok: true, closed: true, contextId: activity.context_id };
  }
  if (activity.created_by_user_id === user.userId) {
    await closeOwnedActivity(activity);
    return { ok: true, closed: true, contextId: activity.context_id };
  }
  await leaveAsParticipant(activity, user.userId, deviceId);
  return { ok: true, closed: false, contextId: activity.context_id };
}

export async function assignControllers(
  user: AppUser,
  activityIdValue: unknown,
  deviceIdValue: unknown,
  controllerIdsValue: unknown,
) {
  const activityId = String(activityIdValue ?? '');
  const deviceId = cleanDeviceId(deviceIdValue);
  const activity = await getActivityRow(activityId);
  await assertOwner(activity, user.userId);
  if (activity.status !== 'active') throw new StoreError(409, copy.errors.activityNotActive);
  const { acceptedPlayerIds } = await consentStatus(
    activityId,
    await registeredPlayerIdsFor(activity.context_id),
  );
  const ids = Array.isArray(controllerIdsValue) ? controllerIdsValue : [];
  const normalized = normalizeControllerIds(ids, acceptedPlayerIds);
  if (!normalized.ok) {
    if (normalized.reason === 'guest') {
      throw new StoreError(400, copy.errors.guestsCannotControlScore);
    }
    if (normalized.reason === 'not-accepted') {
      throw new StoreError(409, copy.errors.cannotAssignPendingController);
    }
    throw new StoreError(400, copy.errors.chooseOneOrTwoControllers);
  }
  await writeControllers(activityId, normalized.controllerUserIds);
  return getActivity(activityId, deviceId, false, user.userId);
}

async function completeSet(
  activity: ActivityRow,
  state: LiveActivityState,
  winner: TeamId,
  conclusionType: 'normal' | 'manual-partial',
) {
  if (!state.activeSetId) throw new StoreError(409, copy.errors.noActiveSet);
  const now = new Date().toISOString();
  const claim = await db().prepare(
    `UPDATE sets SET blue_games = ?, red_games = ?, status = 'completed', winner_team = ?,
     conclusion_type = ?, completed_at = ? WHERE id = ? AND status = 'active'`,
  ).bind(state.blueGames, state.redGames, winner, conclusionType, now, state.activeSetId).run();
  if (!claim.meta.changes) return;
  const activityNumber = await assignActivityNumber(activity);
  // Guests play the set and stay in the log below, but never rank.
  const winnerIds = registeredPlayerIdsOf(winner === 'blue' ? state.bluePlayerIds : state.redPlayerIds);
  const loserIds = registeredPlayerIdsOf(winner === 'blue' ? state.redPlayerIds : state.bluePlayerIds);
  const winningGames = winner === 'blue' ? state.blueGames : state.redGames;
  const losingGames = winner === 'blue' ? state.redGames : state.blueGames;
  const margin = Math.abs(winningGames - losingGames);
  const points = winningPlayerPoints(winningGames, losingGames, conclusionType);
  const next: LiveActivityState = {
    ...EMPTY_LIVE_STATE,
    phase: 'set-setup',
    setNumber: state.setNumber + 1,
  };
  const statements: D1PreparedStatement[] = [
    db().prepare(
      `INSERT INTO set_logs
        (id, context_id, activity_id, activity_number, activity_date, set_id, set_number,
         blue_player_ids_json, red_player_ids_json, blue_games, red_games, winner_team,
         conclusion_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), activity.context_id, activity.id, activityNumber,
      activity.started_at, state.activeSetId, state.setNumber,
      JSON.stringify(state.bluePlayerIds), JSON.stringify(state.redPlayerIds),
      state.blueGames, state.redGames, winner, conclusionType, now,
    ),
    db().prepare(
      `UPDATE activities SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(next), now, activity.id),
  ];

  for (const playerId of winnerIds) {
    statements.push(db().prepare(
      `INSERT INTO leaderboard_entries
        (context_id, player_id, total_points, sets_played, sets_won, sets_lost,
         games_won, games_lost, game_differential)
       VALUES (?, ?, ?, 1, 1, 0, ?, ?, ?)
       ON CONFLICT(context_id, player_id) DO UPDATE SET
         total_points = total_points + excluded.total_points,
         sets_played = sets_played + 1, sets_won = sets_won + 1,
         games_won = games_won + excluded.games_won,
         games_lost = games_lost + excluded.games_lost,
         game_differential = game_differential + excluded.game_differential`,
    ).bind(activity.context_id, playerId, points, winningGames, losingGames, margin));
  }
  for (const playerId of loserIds) {
    statements.push(db().prepare(
      `INSERT INTO leaderboard_entries
        (context_id, player_id, total_points, sets_played, sets_won, sets_lost,
         games_won, games_lost, game_differential)
       VALUES (?, ?, 0, 1, 0, 1, ?, ?, ?)
       ON CONFLICT(context_id, player_id) DO UPDATE SET
         sets_played = sets_played + 1, sets_lost = sets_lost + 1,
         games_won = games_won + excluded.games_won,
         games_lost = games_lost + excluded.games_lost,
         game_differential = game_differential + excluded.game_differential`,
    ).bind(activity.context_id, playerId, losingGames, winningGames, -margin));
  }
  await db().batch(statements);
  await purgeOldLogs(activity.context_id);
}

async function disregardSet(activity: ActivityRow, state: LiveActivityState) {
  if (!state.activeSetId) throw new StoreError(409, copy.errors.noActiveSet);
  const now = new Date().toISOString();
  const claim = await db().prepare(
    `UPDATE sets SET blue_games = ?, red_games = ?, status = 'completed',
     conclusion_type = 'disregarded', completed_at = ? WHERE id = ? AND status = 'active'`,
  ).bind(state.blueGames, state.redGames, now, state.activeSetId).run();
  if (!claim.meta.changes) return;
  const activityNumber = await assignActivityNumber(activity);
  const next: LiveActivityState = {
    ...EMPTY_LIVE_STATE,
    phase: 'set-setup',
    setNumber: state.setNumber + 1,
  };
  await db().batch([
    db().prepare(
      `INSERT INTO set_logs
        (id, context_id, activity_id, activity_number, activity_date, set_id, set_number,
         blue_player_ids_json, red_player_ids_json, blue_games, red_games, winner_team,
         conclusion_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'disregarded', ?)`,
    ).bind(
      crypto.randomUUID(), activity.context_id, activity.id, activityNumber,
      activity.started_at, state.activeSetId, state.setNumber,
      JSON.stringify(state.bluePlayerIds), JSON.stringify(state.redPlayerIds),
      state.blueGames, state.redGames, now,
    ),
    db().prepare(
      `UPDATE activities SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(next), now, activity.id),
  ]);
  await purgeOldLogs(activity.context_id);
}

async function purgeOldLogs(contextId: string) {
  await db().prepare(
    `DELETE FROM set_logs WHERE context_id = ? AND activity_id NOT IN (${lastNumberedActivityIdsSql()})`,
  ).bind(contextId, contextId).run();
}

async function refreshDeviceSlots(activityId: string) {
  const nowMs = Date.now();
  const rows = await db().prepare(
    `SELECT id, slot_status, last_seen_at, reserved_until FROM activity_devices
     WHERE activity_id = ? AND slot_status != 'released'`,
  ).bind(activityId).all<{
    id: string;
    slot_status: string;
    last_seen_at: string;
    reserved_until: string | null;
  }>();

  const updates: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    const lastSeen = Date.parse(row.last_seen_at);
    if (row.slot_status === 'active' && nowMs - lastSeen > ACTIVE_HEARTBEAT_MS) {
      if (lastSeen + SLOT_RESERVATION_MS <= nowMs) {
        updates.push(db().prepare(
          `UPDATE activity_devices SET slot_status = 'released', reserved_until = NULL WHERE id = ?`,
        ).bind(row.id));
      } else {
        const reservedUntil = new Date(lastSeen + SLOT_RESERVATION_MS).toISOString();
        updates.push(db().prepare(
          `UPDATE activity_devices SET slot_status = 'reserved', reserved_until = ? WHERE id = ?`,
        ).bind(reservedUntil, row.id));
      }
    }
    const expiry = row.reserved_until ? Date.parse(row.reserved_until) : lastSeen + SLOT_RESERVATION_MS;
    if (row.slot_status === 'reserved' && expiry <= nowMs) {
      updates.push(db().prepare(
        `UPDATE activity_devices SET slot_status = 'released', reserved_until = NULL WHERE id = ?`,
      ).bind(row.id));
    }
  }
  if (updates.length) await db().batch(updates);
}

async function countOccupiedSlots(activityId: string) {
  await refreshDeviceSlots(activityId);
  const row = await db().prepare(
    `SELECT COUNT(*) AS count FROM activity_devices
     WHERE activity_id = ? AND slot_status IN ('active', 'reserved')`,
  ).bind(activityId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function abandonIfExpired(activity: ActivityRow) {
  if (activity.status !== 'active') return;
  const rows = await db().prepare(
    `SELECT last_seen_at, slot_status FROM activity_devices WHERE activity_id = ?`,
  ).bind(activity.id).all<{ last_seen_at: string; slot_status: string }>();
  if (rows.results.some((row) => row.slot_status === 'active' || row.slot_status === 'reserved')) return;
  const lastSeen = rows.results.reduce((latest, row) => Math.max(latest, Date.parse(row.last_seen_at)), 0);
  if (!lastSeen || Date.now() - lastSeen < ABANDONMENT_MS) return;
  const now = new Date().toISOString();
  const state = parseJson<LiveActivityState>(activity.state_json, EMPTY_LIVE_STATE);
  const statements: D1PreparedStatement[] = [
    db().prepare(
      `UPDATE activities SET status = 'abandoned', abandoned_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(now, now, activity.id),
  ];
  if (state.activeSetId) {
    const activityNumber = await assignActivityNumber(activity);
    statements.push(db().prepare(
      `INSERT OR IGNORE INTO set_logs
        (id, context_id, activity_id, activity_number, activity_date, set_id, set_number,
         blue_player_ids_json, red_player_ids_json, blue_games, red_games, winner_team,
         conclusion_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'abandoned', ?)`,
    ).bind(
      `abandoned-${activity.id}`, activity.context_id, activity.id, activityNumber,
      activity.started_at, state.activeSetId, state.setNumber,
      JSON.stringify(state.bluePlayerIds), JSON.stringify(state.redPlayerIds),
      state.blueGames, state.redGames, now,
    ));
  }
  await db().batch(statements);
}

async function getActivityRow(activityId: string) {
  const row = await db().prepare('SELECT * FROM activities WHERE id = ?')
    .bind(activityId).first<ActivityRow>();
  if (!row) throw new StoreError(404, copy.errors.activityNotFound);
  return row;
}

function validateConfig(value: unknown): ActivityConfig {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ActivityConfig>;
  return {
    deuceRule: raw.deuceRule === 'golden-point' || raw.deuceRule === 'star-point'
      ? raw.deuceRule
      : 'classic-advantage',
    setWinRule: raw.setWinRule === 'short-set' ? 'short-set' : 'standard-set',
    tieBreakRule: raw.tieBreakRule === 'deciding-game' || raw.tieBreakRule === 'no-tiebreak'
      ? raw.tieBreakRule
      : 'standard-tiebreak',
    pointsFormula: 'default-margin',
  };
}

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
  };
}

function mapLeaderboard(row: Record<string, unknown>): LeaderboardEntry {
  return {
    playerId: String(row.player_id),
    playerName: String(row.player_name),
    totalPoints: Number(row.total_points),
    setsPlayed: Number(row.sets_played),
    setsWon: Number(row.sets_won),
    setsLost: Number(row.sets_lost),
    gamesWon: Number(row.games_won),
    gamesLost: Number(row.games_lost),
    gameDifferential: Number(row.game_differential),
  };
}

function mapSetLog(row: Record<string, unknown>): SetLogEntry {
  return {
    id: String(row.id),
    activityId: String(row.activity_id),
    activityNumber: Number(row.activity_number),
    activityDate: String(row.activity_date),
    setNumber: Number(row.set_number),
    bluePlayerIds: parseJson<string[]>(String(row.blue_player_ids_json), []),
    redPlayerIds: parseJson<string[]>(String(row.red_player_ids_json), []),
    blueGames: Number(row.blue_games),
    redGames: Number(row.red_games),
    winnerTeam: row.winner_team === 'blue' || row.winner_team === 'red' ? row.winner_team : null,
    conclusionType: String(row.conclusion_type) as SetLogEntry['conclusionType'],
    createdAt: String(row.created_at),
  };
}

function mapScoreEvent(row: Record<string, unknown>): ScoreEvent {
  return {
    id: String(row.id),
    action: String(row.action) as ScoreEvent['action'],
    team: row.team === 'blue' || row.team === 'red' ? row.team : null,
    previousSnapshot: parseJson<GameSnapshot>(String(row.previous_snapshot_json), {
      blueScore: '0', redScore: '0', deuceReturnCount: 0, decisivePointActive: false,
    }),
    nextSnapshot: parseJson<GameSnapshot>(String(row.next_snapshot_json), {
      blueScore: '0', redScore: '0', deuceReturnCount: 0, decisivePointActive: false,
    }),
    deviceLabel: String(row.device_label),
    sequenceNumber: Number(row.sequence_number),
    createdAt: String(row.created_at),
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanDeviceId(value: unknown) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 100) throw new StoreError(400, copy.errors.deviceNeedsIdentity);
  return id;
}

function deviceLabel(displayName: string, suffix?: number) {
  const trimmed = displayName.trim();
  const friendly = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed.split(/\s+/)[0];
  return `${friendly || 'Player'}'s device${suffix ? ` ${suffix}` : ''}`;
}

async function makeShareCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = '';
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const existing = await db().prepare('SELECT id FROM activities WHERE share_code = ?')
      .bind(code).first<{ id: string }>();
    if (!existing) return code;
  }
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
}

