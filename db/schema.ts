import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// better-auth owns these tables; they are generated, not hand-edited.
export * from './auth-schema';

// `id` holds the better-auth `user.id`: a player and an account are the same
// identity. Kept as its own table so match history survives account removal,
// and so the generated auth schema never needs domain columns.
// Names are intentionally not unique; two people may share one.
export const playerProfiles = sqliteTable('player_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

// One row per direction, written as a pair, so listing a player's mates is a
// single indexed lookup instead of an or-condition across two columns.
export const mates = sqliteTable('mates', {
  playerId: text('player_id').notNull(),
  matePlayerId: text('mate_player_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.playerId, table.matePlayerId] }),
]);

// The only route to becoming mates. Pending state lives here rather than on
// `mates`, so an unaccepted invite never looks like a relationship.
export const mateInvites = sqliteTable('mate_invites', {
  token: text('token').primaryKey(),
  createdByPlayerId: text('created_by_player_id').notNull(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  consumedByPlayerId: text('consumed_by_player_id'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_mate_invites_creator').on(table.createdByPlayerId),
]);

export const scoreboardContexts = sqliteTable('scoreboard_contexts', {
  id: text('id').primaryKey(),
  contextKey: text('context_key').notNull(),
  name: text('name').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_scoreboard_contexts_key').on(table.contextKey)]);

export const contextPlayers = sqliteTable('context_players', {
  contextId: text('context_id').notNull(),
  playerId: text('player_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.contextId, table.playerId] }),
  index('idx_context_players_player').on(table.playerId),
]);

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  contextId: text('context_id').notNull(),
  activityNumber: integer('activity_number'),
  status: text('status').notNull(),
  configJson: text('config_json').notNull(),
  shareCode: text('share_code').notNull(),
  stateJson: text('state_json').notNull(),
  version: integer('version').notNull().default(0),
  createdByUserId: text('created_by_user_id').notNull(),
  controllerUserIdsJson: text('controller_user_ids_json'),
  startedAt: text('started_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  allDevicesDisconnectedAt: text('all_devices_disconnected_at'),
  abandonedAt: text('abandoned_at'),
  endedAt: text('ended_at'),
}, (table) => [
  uniqueIndex('idx_activities_share_code').on(table.shareCode),
  uniqueIndex('idx_activities_context_number').on(table.contextId, table.activityNumber),
  index('idx_activities_context_started').on(table.contextId, table.startedAt),
  index('idx_activities_status').on(table.status),
]);

export const activityDevices = sqliteTable('activity_devices', {
  id: text('id').primaryKey(),
  activityId: text('activity_id').notNull(),
  deviceId: text('device_id').notNull(),
  userId: text('user_id').notNull(),
  userDisplayName: text('user_display_name').notNull(),
  deviceLabel: text('device_label').notNull(),
  role: text('role').notNull(),
  slotStatus: text('slot_status').notNull(),
  reservedUntil: text('reserved_until'),
  joinedAt: text('joined_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  leftAt: text('left_at'),
}, (table) => [
  uniqueIndex('idx_activity_devices_device').on(table.activityId, table.deviceId),
  index('idx_activity_devices_slots').on(table.activityId, table.slotStatus),
]);

// Consent to be scored in this activity. Separate from activity_devices:
// a player can accept without occupying one of the two live slots.
export const activityConsents = sqliteTable('activity_consents', {
  activityId: text('activity_id').notNull(),
  playerId: text('player_id').notNull(),
  acceptedAt: text('accepted_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.activityId, table.playerId] }),
  index('idx_activity_consents_player').on(table.playerId),
]);

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  activityId: text('activity_id').notNull(),
  setNumber: integer('set_number').notNull(),
  bluePlayerIdsJson: text('blue_player_ids_json').notNull(),
  redPlayerIdsJson: text('red_player_ids_json').notNull(),
  blueGames: integer('blue_games').notNull().default(0),
  redGames: integer('red_games').notNull().default(0),
  status: text('status').notNull(),
  winnerTeam: text('winner_team'),
  conclusionType: text('conclusion_type'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => [
  uniqueIndex('idx_sets_activity_number').on(table.activityId, table.setNumber),
]);

export const scoreEvents = sqliteTable('score_events', {
  id: text('id').primaryKey(),
  clientMutationId: text('client_mutation_id').notNull(),
  activityId: text('activity_id').notNull(),
  setId: text('set_id').notNull(),
  currentGameId: text('current_game_id').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  action: text('action').notNull(),
  team: text('team'),
  previousSnapshotJson: text('previous_snapshot_json').notNull(),
  nextSnapshotJson: text('next_snapshot_json').notNull(),
  createdByDeviceId: text('created_by_device_id').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  userDisplayName: text('user_display_name').notNull(),
  deviceLabel: text('device_label').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_score_events_mutation').on(table.clientMutationId),
  index('idx_score_events_game_sequence').on(table.currentGameId, table.sequenceNumber),
]);

export const setLogs = sqliteTable('set_logs', {
  id: text('id').primaryKey(),
  contextId: text('context_id').notNull(),
  activityId: text('activity_id').notNull(),
  activityNumber: integer('activity_number').notNull(),
  activityDate: text('activity_date').notNull(),
  setId: text('set_id').notNull(),
  setNumber: integer('set_number').notNull(),
  bluePlayerIdsJson: text('blue_player_ids_json').notNull(),
  redPlayerIdsJson: text('red_player_ids_json').notNull(),
  blueGames: integer('blue_games').notNull(),
  redGames: integer('red_games').notNull(),
  winnerTeam: text('winner_team'),
  conclusionType: text('conclusion_type').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_set_logs_set').on(table.setId),
  index('idx_set_logs_context_activity').on(table.contextId, table.activityDate),
]);

export const leaderboardEntries = sqliteTable('leaderboard_entries', {
  contextId: text('context_id').notNull(),
  playerId: text('player_id').notNull(),
  totalPoints: integer('total_points').notNull().default(0),
  setsPlayed: integer('sets_played').notNull().default(0),
  setsWon: integer('sets_won').notNull().default(0),
  setsLost: integer('sets_lost').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  gamesLost: integer('games_lost').notNull().default(0),
  gameDifferential: integer('game_differential').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.contextId, table.playerId] }),
  index('idx_leaderboard_context_points').on(table.contextId, table.totalPoints),
]);
