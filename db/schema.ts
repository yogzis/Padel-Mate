import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const userAccounts = sqliteTable('user_accounts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  authProvider: text('auth_provider').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_user_accounts_email').on(table.email)]);

export const authIdentities = sqliteTable('auth_identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_auth_identities_provider_user').on(table.provider, table.providerUserId),
  index('idx_auth_identities_user').on(table.userId),
]);

export const playerProfiles = sqliteTable('player_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  linkedUserId: text('linked_user_id'),
  profileType: text('profile_type').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_player_profiles_normalized_name').on(table.normalizedName),
  index('idx_player_profiles_created_by').on(table.createdByUserId),
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
  activityNumber: integer('activity_number').notNull(),
  status: text('status').notNull(),
  configJson: text('config_json').notNull(),
  shareCode: text('share_code').notNull(),
  stateJson: text('state_json').notNull(),
  version: integer('version').notNull().default(0),
  createdByUserId: text('created_by_user_id').notNull(),
  startedAt: text('started_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  allDevicesDisconnectedAt: text('all_devices_disconnected_at'),
  abandonedAt: text('abandoned_at'),
  endedAt: text('ended_at'),
}, (table) => [
  uniqueIndex('idx_activities_share_code').on(table.shareCode),
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
