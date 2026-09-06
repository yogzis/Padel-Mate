# Padel Scoreboard App - Development Design

## 1. Engineering Goals

The app should be built as a reliable single-page web application with clean separation between presentation, domain logic, and persistence.

The most important engineering rule is that scoring decisions must be handled by deterministic domain functions, not scattered across UI event handlers.

Live game state must be persisted to the backend after every score update. The backend is the source of truth for active scoring recovery.

Activity sessions must support up to 2 connected devices. Updates accepted by the backend must be broadcast to all devices in the shared session so both devices converge to the same live score.

## 2. Suggested Architecture

```text
UI Components
  -> Application State
    -> Domain Services
      -> Auth Service
      -> Scoring Engine
      -> Context Engine
      -> Leaderboard Engine
    -> Backend API Client
    -> Realtime Session Client
    -> Local Recovery Cache
```

## 3. Technology Stack

The implemented stack:

- Framework: [vinext](https://www.npmjs.com/package/vinext) — a Next.js App Router-compatible framework running on Vite.
- Frontend: React 19 with React Server Components.
- Language: TypeScript.
- Hosting: Cloudflare Workers, deployed with `@vinext/cloudflare`.
- Database: Cloudflare D1 (serverless SQLite), bound as `DB` in `wrangler.jsonc`.
- Schema and migrations: Drizzle ORM with drizzle-kit. Migrations in `drizzle/` are the single source of truth; the schema is never created at runtime.
- Authentication: [better-auth](https://better-auth.com) with the Google social provider and the `admin` plugin.
- Styling: mobile-first responsive CSS with explicit portrait and landscape layouts, strong color contrast, and restrained animations.
- Testing: unit tests for scoring, leaderboard, and admin-access functions, run with the Node test runner.
- Deployment: GitHub Actions on push to the `production` branch.

Notes that constrain the implementation:

- `wrangler.jsonc` must keep `nodejs_compat` and a compatibility date of at least `2025-05-05`. `2025-04-01` is what makes Cloudflare populate `process.env` for better-auth, and `2025-05-05` is what makes `WeakRef` available, which React's RSC client requires.
- D1 has no interactive transactions, so the Drizzle adapter must stay in its default sequential mode. Enabling `transaction: true` breaks every write.
- Local development requires `npm run db:migrate` once to create the schema, because nothing creates tables at runtime any more.

A backend is required because live game score updates must be durably saved after every point.

A realtime update path is required because two devices may be connected to the same activity session.

## 4. Module Responsibilities

### UI Layer

Responsible for:

- Rendering screens.
- Displaying dialogs.
- Handling user input.
- Calling domain actions.
- Showing validation errors.
- Showing Groups and Mates in the header menu on phones, where the header tabs are hidden.

The UI layer should not contain scoring rule complexity.

### Auth Service

better-auth owns identity. It is configured in `lib/auth.ts` and served from `app/api/auth/[...all]/route.ts`, which exposes every better-auth endpoint (sign-in, callback, session, sign-out, and the admin plugin's routes).

Responsible for:

- Requiring sign-in before app data is viewed or changed.
- Supporting Google Sign-In for the MVP, with further providers added through better-auth configuration.
- Issuing and validating the session cookie.
- Providing the signed-in user's ID and display name to audit logs, session joins, and mate management.
- Creating the player record on first sign-in, through a `databaseHooks.user.create.after` hook that writes a `player_profiles` row whose id is the new `user.id`. There is no linking step, because the player and the account are the same identity.

better-auth owns four tables — `user`, `session`, `account`, and `verification` — generated into `db/auth-schema.ts`. The app does not write to them directly; the only supported way to suspend a user is through `auth.api.banUser`, because suspension is enforced by a better-auth session hook rather than by a column check on read.

#### Authorization

`app/auth-session.ts` maps the better-auth session onto the app's own `AppUser` type and provides the guards:

- `requireAppUser()` — for pages. Redirects signed-out visitors to `/sign-in`.
- `requireActiveUser()` — for API routes. Returns 401 when signed out and 403 when suspended.
- `requireAdminUser()` — as above, plus a 403 unless the user is the administrator.

Administrator status is derived from `ADMIN_EMAIL` in `lib/admin-access.ts`. The `role` column on `user` is a cache of that decision, written by a `databaseHooks.user.create.before` hook so that better-auth's own admin endpoints authorize correctly. `ADMIN_EMAIL` remains the source of truth, and `requireAdminUser()` checks both.

### State Layer

Responsible for:

- Holding signed-in user state.
- Holding the mate list.
- Holding selected scoreboard context.
- Holding active activity and set.
- Holding shared session connection state.
- Coordinating updates between UI and domain services.

### Context Engine

Responsible for:

- Creating stable context keys.
- Identifying existing scoreboard contexts.
- Creating new contexts when needed.

Context key requirement:

```text
Take the registered player IDs from the four match slots, ignoring guests.
Sort them.
Join them into a stable key.
Use that key to find or create the context.
```

Guest slots are deliberately absent from the key, so the same mates always land in the same context regardless of who substitutes.

### Scoring Engine

Responsible for:

- Advancing point scores.
- Handling deuce rules.
- Detecting game-winning states.
- Detecting set-winning states.
- Returning pending confirmation states.

### Leaderboard Engine

Responsible for:

- Calculating player points after confirmed set completion.
- Updating context-specific player statistics.
- Skipping guest slots, which never receive points or statistics.
- Sorting leaderboard entries.

### Storage Adapter

Responsible for:

- Saving players, mates, and invites.
- Saving contexts.
- Saving activities.
- Saving activity consents.
- Saving sets.
- Restoring state after page refresh.
- Saving every live current game update to the backend.
- Reading the latest active game state from the backend on app load.
- Retrying failed live score saves safely.

The rest of the app should not depend directly on the storage mechanism.

### Local Recovery Cache

Responsible for:

- Keeping the most recent optimistic score state on the device.
- Supporting instant UI updates while backend persistence is in progress.
- Helping recover from brief network interruption.

The local cache is not the source of truth. Once the backend responds, backend state wins.

### Backend API

Responsible for:

- Persisting each scoring event idempotently.
- Returning the latest active game state for a selected context or activity.
- Storing pending game and set confirmations.
- Preventing duplicate point application during retries.
- Keeping in-game persistence separate from set completion and leaderboard updates.
- Creating and resolving shareable activity session links or codes.
- Enforcing the 2-device limit for each activity session.
- Recording activity consent separately from device slots.
- Blocking a new activity when any registered context member is no longer a mate of the host.
- Blocking the first set until every registered context member has accepted.
- Releasing a session slot when a device logs out or leaves.
- Reserving an unexpectedly disconnected device slot for 1-2 minutes.
- Marking unconcluded sessions as abandoned after 3 hours with no connected devices.
- Broadcasting accepted scoring events and confirmation updates to connected devices.
- Enforcing event ordering for concurrent device updates.
- Returning current-game score update history.
- Returning retained set logs for the last 5 numbered activity sessions in a scoring context. Empty sessions that never started a set are excluded.

### Realtime Session Client

The MVP syncs by polling. `GET /api/padel?action=activity` also heartbeats `last_seen_at`, so the device slot stays occupied. The open context dashboard polls `GET /api/padel?action=context` and does not occupy a device slot.

Cadence:

- Live scoreboard (`phase === 'live'`): every 1.5 seconds, so both devices show the same point, Advantage, and pending confirmations in near real time.
- Team setup and other active-but-not-live screens: every 5 seconds. That is enough to notice a late accept or the other device starting or finishing a set, and it stays well under the 30-second heartbeat window that would otherwise reserve the slot.
- Context dashboard: every 5 seconds, and again when the tab becomes visible, so Join appears when another member creates an activity.
- Team setup also has a Refresh button that runs the same fetch once. It is a shortcut, not a replacement for the slow poll.

Responsible for:

- Joining a shared activity session.
- Polling accepted activity state at the cadence above.
- Refreshing the open context dashboard so a newly created activity offers Join without a page reload.
- Restoring the last open scoring group after a browser refresh, unless the user had gone back to Groups or Mates.
- Applying backend-accepted updates from other devices.
- Showing connected, reconnecting, or offline status.
- Fetching the latest backend state after reconnect before enabling scoring.

## 5. Domain Model

```typescript
// Owned and migrated by better-auth (db/auth-schema.ts). Shown here for
// reference only; change it through better-auth configuration, not by hand.
type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  role?: "admin" | "user";
  banned?: boolean;
  banReason?: string;
  banExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
};

// One row per external identity. `issuer` plus `accountId` is unique.
type Account = {
  id: string;
  issuer: string;
  accountId: string;
  providerId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

// What the rest of the app passes around, produced by app/auth-session.ts.
type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  isSuspended: boolean;
};

// `id` holds the better-auth `user.id`. The row is created by the sign-in hook
// and deliberately outlives the account so history keeps its names.
type Player = {
  id: string;
  name: string;
  createdAt: string;
};

type Mate = {
  playerId: string;
  matePlayerId: string;
  createdAt: string;
};

type MateInvite = {
  token: string;
  createdByPlayerId: string;
  expiresAt: string;
  consumedAt?: string;
  consumedByPlayerId?: string;
};

// A guest occupies a match slot without being a player. The identifier is
// positional within one activity and never reaches the leaderboard.
type GuestSlotId = `guest:${number}`;

type MatchSlotId = string | GuestSlotId;

type ScoreboardContext = {
  id: string;
  // Two to four registered players. Guests are excluded by design.
  playerIds: string[];
  contextKey: string;
  createdAt: string;
};

type ActivityConfig = {
  deuceRule: "classic-advantage" | "golden-point" | "star-point";
  setWinRule: "standard-set" | "short-set";
  tieBreakRule: "standard-tiebreak" | "deciding-game" | "no-tiebreak";
  pointsFormula: "default-margin";
};

type Activity = {
  id: string;
  contextId: string;
  activityNumber?: number;
  config: ActivityConfig;
  status: "active" | "completed" | "abandoned";
  createdByUserId: string;
  shareCode?: string;
  shareUrl?: string;
  maxConnectedDevices: 2;
  allDevicesDisconnectedAt?: string;
  abandonedAt?: string;
  abandonmentSnapshotId?: string;
  startedAt: string;
  endedAt?: string;
  setIds: string[];
};

type ActivityConsent = {
  activityId: string;
  playerId: string;
  acceptedAt: string;
};

type ActivitySessionParticipant = {
  id: string;
  activityId: string;
  userId: string;
  deviceId: string;
  userDisplayName: string;
  deviceLabel: string;
  role: "host" | "participant";
  connectionStatus: "connected" | "reconnecting" | "offline" | "left";
  slotStatus: "active" | "reserved" | "released";
  slotReservedUntil?: string;
  joinedAt: string;
  lastSeenAt: string;
  leftAt?: string;
};

type TeamId = "blue" | "red";

type SetRecord = {
  id: string;
  activityId: string;
  blueSlotIds: [MatchSlotId, MatchSlotId];
  redSlotIds: [MatchSlotId, MatchSlotId];
  blueGames: number;
  redGames: number;
  status: "active" | "completed";
  winnerTeam?: TeamId;
  conclusionType?: "normal" | "manual-partial";
  disregardedAt?: string;
  completedAt?: string;
};

type PointScore = "0" | "15" | "30" | "40" | "A";

type CurrentGame = {
  id: string;
  setId: string;
  blueScore: PointScore;
  redScore: PointScore;
  deuceReturnCount: number;
  pendingWinnerTeam?: TeamId;
  decisivePointActive: boolean;
  history: GameSnapshot[];
  version: number;
  lastAppliedEventId?: string;
  lastSavedAt?: string;
  saveStatus: "saved" | "saving" | "failed";
};

type GameSnapshot = {
  blueScore: PointScore;
  redScore: PointScore;
  deuceReturnCount: number;
  decisivePointActive: boolean;
};

type ScoreEvent = {
  id: string;
  activityId: string;
  setId: string;
  currentGameId: string;
  team: TeamId;
  previousSnapshot: GameSnapshot;
  nextSnapshot: GameSnapshot;
  pendingWinnerTeam?: TeamId;
  createdAt: string;
  clientMutationId: string;
  sequenceNumber?: number;
  createdByDeviceId: string;
  createdByUserId: string;
  userDisplayName: string;
  deviceLabel: string;
};

type SetLogEntry = {
  id: string;
  contextId: string;
  activityId: string;
  activityNumber: number;
  activityDate: string;
  setId: string;
  // Guest slots are preserved here so match history stays complete.
  blueSlotIds: [MatchSlotId, MatchSlotId];
  redSlotIds: [MatchSlotId, MatchSlotId];
  blueGames: number;
  redGames: number;
  winnerTeam?: TeamId;
  conclusionType: "normal" | "manual-partial" | "disregarded" | "abandoned";
  createdAt: string;
};

// Only ever written for registered players; guest slots are skipped.
type LeaderboardEntry = {
  contextId: string;
  playerId: string;
  totalPoints: number;
  setsPlayed: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
};
```

## 6. Screen Design

### 6.0 Authentication Screen

Purpose:

Require the user to sign in before accessing app data.

Controls:

- Continue with Google.

Validation:

- Scoring contexts, mate management, past activities, and shared activity sessions are unavailable until sign-in succeeds.

### 6.1 My Padel Mates Screen

Purpose:

Manage the people you can play scored matches with. This screen requires a signed-in user.

Controls:

- Generate invite link.
- Copy invite link.
- Mate list.
- Remove mate.

Validation:

- The signed-in user is already a player, so nothing needs creating here.
- Invite links are single-use and expire; an exhausted or expired link is refused with a clear message.
- Opening a valid link shows the inviter and requires accept or decline before any relationship is written.
- Declining consumes the link without creating mates.
- A user cannot become their own mate.
- There is no search field, by design. Other users can only be reached through a link shared directly.

### 6.2 Select Scoreboard Context Screen

Purpose:

Pick two to four registered players from your mates, then open the matching scoreboard context. Remaining court spots become guests automatically and are not shown in this picker.

Controls:

- Mate selection list.
- Selected count indicator.
- Continue button.

Validation:

- Continue disabled unless at least two registered players are selected, including the signed-in user.
- Continue disabled if more than four registered players are selected.
- Guests are filled automatically on submit when fewer than four people are selected. They are not toggled or displayed here.
- The context is identified from the registered players only, so guests never change which context opens.
- App automatically identifies or creates the context.

### 6.3 Context Dashboard Screen

Purpose:

Show the selected context's leaderboard and activity history.

Controls:

- Start activity.
- Leaderboard info control. Tapping the `i` icon opens a hint that explains points, guests, columns, and sort order. Tapping outside or pressing Escape closes it.
- Join a live activity the viewer has not accepted yet. The dashboard poll reveals this without a page reload.
- Resume a live activity the viewer has already accepted.
- View previous activities.
- Return to slot selection.

Display:

- The registered players in this context.
- Context leaderboard, with an info hint that explains the points formula, guest rule, columns, and sort order.
- Cards, tables, and set-log names stay inside the page width on phones. Names wrap instead of overflowing.
- Last 5 numbered activity session set logs, grouped by activity number and date. Empty sessions that never started a set are excluded.
- A live activity card with Join or Resume scoring, depending on whether the viewer has accepted. The card appears from the dashboard poll when another member starts an activity.

### 6.4 Activity Configuration Screen

Purpose:

Require the user to select settings before starting play.

Controls:

- Deuce rule selector. Star Point is listed first and is selected by default.
- Set win rule selector.
- Tie-break rule selector.
- Start activity button.

Each option must display explanatory text next to or below the option.

### 6.5 Set Setup Screen

Purpose:

Choose teams for the next set.

Controls:

- Blue Team selection.
- Red Team selection.
- Start set button.

Validation:

- Each team has exactly 2 players.
- Every context player is assigned once.
- Start set stays disabled until every registered member is In.

Display:

- A roster of every registered member as In or Pending. Guests are not listed.
- Current activity session set log only.
- Completed sets.
- Manual partial sets.
- Disregarded sets.

### 6.6 Live Scoreboard Screen

Purpose:

Track live game and set score.

The live scoreboard is primarily a mobile phone interface. It must provide a clear portrait layout and a clear landscape layout.

Display:

- Blue side with blue background.
- Red side with red background.
- Large current game score.
- Current set score on each team's color, with the leader emphasized.
- Player names.
- Deuce mode indicator.
- Decisive point indicator when relevant.
- Save status indicator: Saving, Saved, or Retry needed.
- Shared session status: Connected, Reconnecting, or Offline.
- Joined device count when available.
- Current-game history action.

Portrait layout requirements:

- Stack Blue Team and Red Team vertically.
- Place each team's games on that team's half, next to the divider, so the set score is not a left-to-right pair.
- Keep the current game score as the largest visual element for each team.
- Keep point buttons reachable near the lower part of the screen.
- Keep set score, save status, and controls visible without covering team scores.

Landscape layout requirements:

- Place Blue Team and Red Team side by side.
- Use the extra horizontal space for larger score blocks.
- Keep controls accessible without shrinking the main scores.
- Ensure dialogs fit without hiding the current score context.

Orientation behavior:

- Rotating the device must not reset score state.
- Rotating the device must not dismiss pending game or set confirmations.
- The layout may reorganize, but all current scoring information must remain visible.

Controls:

- Add point to Blue.
- Add point to Red.
- Undo.
- Share session.
- Open current-game score history.
- Manually end unfinished set.
- End activity navigation where appropriate.

Dialogs:

- Game completion confirmation.
- Set completion confirmation.
- Manual unfinished set confirmation with calculate or disregard actions.
- Current-game score update history modal.

## 7. State Transition Rules

### 7.0 Signing In

Preconditions:

- App is opened.
- User is not authenticated.

Postconditions:

- User signs in with Google.
- User account is loaded or created.
- App data access is enabled.

### 7.1 Starting an Activity

Preconditions:

- A scoreboard context is selected.
- Every registered member of that context is still a mate of the host.
- Activity configuration is complete.
- User is signed in.

Postconditions:

- New activity is created without an activity number.
- Activity status is active.
- Host is recorded as accepted.
- Host device joins the activity session.
- User moves to set setup.
- Start set stays disabled until every other registered member is In.
- Set setup shows every registered member as In or Pending.

### 7.2 Starting a Set

Preconditions:

- Active activity exists.
- Every registered context member has accepted this activity.
- Blue Team has 2 players.
- Red Team has 2 players.
- All 4 context players are assigned exactly once.

Postconditions:

- New active set is created.
- If this is the first set, the activity receives the next number in the context.
- Current game starts at 0-0.

### 7.3 Scoring a Point

Preconditions:

- Active set exists.
- No unresolved game completion confirmation is open.
- Latest backend state has been loaded.
- Shared session connection is either connected or the app has confirmed it can safely queue/retry the update.

Postconditions:

- Current game score advances.
- A score event is created with a unique client mutation ID.
- The updated game state is saved to the backend.
- The backend assigns an ordered sequence to the accepted event.
- The accepted event is broadcast to connected devices in the same activity session.
- This save updates only recoverable in-game state. It does not update set completion, context leaderboard, or individual player points.
- If a game-winning state is reached, a game confirmation is opened.
- If no game-winning state is reached, the scoreboard updates immediately.

### 7.4 Confirming a Game

Preconditions:

- A pending game winner exists.
- Pending winner state has been saved to the backend.

Postconditions:

- Winning team's set game count increments.
- Current game resets to 0-0.
- Updated set score and reset game state are saved to the backend.
- App checks whether the set has ended.
- If set ended, set confirmation is opened.

### 7.5 Confirming a Set

Preconditions:

- A pending set winner exists.
- Pending set result has been saved to the backend.

Postconditions:

- Set status becomes completed.
- Leaderboard entries are updated.
- Completed set and leaderboard update are saved to the backend in one consistent operation.
- Connected devices receive the completed set and leaderboard update.
- User may start another set.

### 7.6 Manually Ending an Unfinished Set

Preconditions:

- Active set exists.
- The set has not reached a normal set-ending state.
- The set score is not tied if the user wants to calculate it.

Postconditions:

- The app shows a confirmation explaining that the set is unfinished.
- If the user chooses Calculate, the current set leader is treated as the manual winner.
- If the user chooses Calculate, individual scoring uses half the finished-set win bonus plus the current game difference.
- If the user chooses Disregard, the set is closed or discarded without leaderboard impact.
- The backend records whether the set was completed as a manual partial result or disregarded.
- Connected devices receive the manual set conclusion or disregard update.

### 7.7 Sharing an Activity Session

Preconditions:

- Active activity exists.
- User is signed in.

Postconditions:

- The app generates or displays a share link or session code.
- The app generates a shareable message suitable for WhatsApp or plain text.
- A second device can join the same activity session.
- The joining device loads the latest backend state.
- The joining device subscribes to realtime updates.

### 7.8 Joining a Shared Activity Session

Preconditions:

- User opens a share link or enters a session code.
- User is signed in.

Postconditions:

- The user must be a registered member of the activity's context.
- Consent is written first.
- If fewer than 2 devices are connected or reserved, the device also joins the session.
- If 2 devices are already connected or reserved, the member is still accepted and the activity is returned. They do not occupy a live slot.
- A connected joining device receives a label based on the signed-in user's display name, such as `Yoni's device`.
- The client loads the latest backend state, including who has accepted and who is still pending.
- If the activity is already finished, the client opens that context dashboard instead of the activity screen.

### 7.9 Leaving a Shared Activity Session

Preconditions:

- Device is connected to an activity session.

Postconditions:

- Explicit logout or leave releases the device slot immediately.
- Other connected devices receive an updated participant count.
- Another signed-in device may join if a slot is available.

### 7.10 Unexpected Device Disconnect

Preconditions:

- Device stops sending heartbeat or loses realtime connection unexpectedly.

Postconditions:

- Device slot is marked reserved.
- The reservation expires after 1-2 minutes.
- If the device reconnects during the reservation window, it reclaims the same slot.
- If the reservation expires, another device may join.

### 7.11 Abandoning an Unconcluded Activity Session

Preconditions:

- All devices are disconnected.
- The activity has not been concluded.

Postconditions:

- The activity remains live for 3 hours.
- If no device reconnects within 3 hours, the activity is marked abandoned.
- The latest saved scoring snapshot is preserved.
- The leaderboard is not updated automatically.
- A signed-in user may later reopen the abandoned activity and manually choose whether to calculate a partial result or disregard it.

### 7.12 Receiving Remote Score Updates

Preconditions:

- Device is connected to a shared activity session.
- Backend broadcasts an accepted event from another device.

Postconditions:

- The local app applies the event only if it is newer than the current known version.
- The current game, pending confirmations, set score, or leaderboard display updates as needed.
- Local UI converges to the backend-accepted session state.

### 7.13 Viewing Current-Game Score History

Preconditions:

- Active game exists.
- User is signed in.

Postconditions:

- The app opens a modal with score events for the current game only.
- Each event is labeled with the signed-in user's device label.
- Both connected devices can view the same current-game history.

### 7.14 Restoring Active Scoring

Preconditions:

- App loads or reloads.
- An active context, activity, set, or game may exist.

Postconditions:

- The app fetches the latest active scoring state from the backend.
- The live scoreboard restores the latest saved score.
- Pending confirmations are restored if present.
- Realtime subscription is re-established for shared sessions.
- New score updates are blocked until restore completes.
- If the restored activity is already finished, the client opens that context dashboard instead of the activity screen.

### 7.15 Finishing an Activity

Preconditions:

- Active activity exists.
- There is no live set still in progress.

Postconditions:

- Activity status becomes completed.
- Every device still viewing that activity opens the context dashboard.
- Opening the share link or last-session recovery for a finished activity also opens the context dashboard.

## 8. Error Handling

The app should handle these cases:

- Attempt to use app data without sign-in.
- Attempt to start a context without four filled slots, or with fewer than two registered players.
- Attempt to consume an expired, already-used, or self-issued invite link.
- Attempt to decline a valid invite link.
- Attempt to start a set with invalid teams.
- Attempt to score without an active set.
- Attempt to confirm a game without a pending winner.
- Attempt to confirm a set without a pending winner.
- Attempt to start an activity after unmating a member of the context.
- Attempt to start a set before every registered member has accepted.
- Attempt to accept an activity the user is not a member of.
- Attempt to score from a disconnected or unrecovered device.
- Attempt to calculate a tied manual partial set.
- Attempt to reopen an abandoned activity.
- Backend save failure.
- Backend restore failure.
- Realtime connection loss.
- Concurrent score updates from two devices.
- Local cache unavailable or corrupted.
- Duplicate score event retry.

Recovery should prefer preserving user-entered data and clearly explaining what action is needed.

## 9. Persistence Strategy

For MVP, use backend persistence for all durable state and local browser persistence only as a short-term recovery cache.

Recommended persisted collections:

```text
userAccounts
authIdentities
players
scoreboardContexts
activities
activityConsents
sets
currentGames
scoreEvents
activitySessionParticipants
setLogEntries
leaderboardEntries
activeSessionState
```

Persistence rules:

- Save current live game state to the backend after every point.
- Treat live game saves as recovery-only state that does not affect set completion or leaderboard scoring.
- Save pending game confirmation state to the backend before showing the confirmation as durable.
- Save set score updates to the backend after every confirmed game.
- Save pending set confirmation state to the backend before showing the confirmation as durable.
- Save leaderboard updates with confirmed set completion.
- Save manually concluded partial sets only after the user confirms Calculate.
- Save disregarded unfinished sets without updating leaderboard entries.
- Keep enough history to support undo.
- Store activity configuration with the activity.
- Store authenticated user identity with activity creation and session participation.
- Store guest slots on the set record so match history stays complete, while excluding them from leaderboard writes.
- Store score event history for the current game.
- Store device labels using the signed-in user's display name.
- Use idempotent score event IDs to prevent duplicate scoring on retry.
- Use backend-assigned ordering so all connected devices apply score events in the same sequence.
- Broadcast accepted events to all connected devices in the activity session.
- After reconnect, fetch backend state before applying queued or new score updates.
- Show save status in the live scoreboard.
- Restore from backend first on reload; use local cache only as a fallback display state while retrying backend restore.
- Retain the last 5 numbered activity session set logs per scoring context. Empty sessions that never started a set do not occupy this window.
- Purge older detailed set logs for that context according to retention policy while preserving leaderboard aggregates.
- Mark abandoned sessions without applying leaderboard updates.

### 9.1 Backend Consistency Requirements

The backend should treat each point tap as a score event.

Each event must include:

- Unique client mutation ID.
- Activity ID.
- Set ID.
- Current game ID.
- Team that received the point.
- Previous score snapshot.
- Next score snapshot.
- Current game version.
- Device ID.
- User ID.
- User display name.
- Device label, such as `Yoni's device`.
- Timestamp.

The backend must reject or safely ignore duplicate mutation IDs.

The backend must assign a monotonically increasing sequence number or version to accepted events within an activity session.

### 9.2 Realtime Synchronization Requirements

Realtime messages should include:

- Activity ID.
- Event type.
- Accepted sequence number or state version.
- Latest score state or enough event data to update it.
- Originating device ID.
- Originating user display name.
- Originating device label.

Connected devices must ignore stale events and fetch the latest backend state if they detect a gap in sequence numbers.

### 9.3 Optimistic UI Requirements

The UI may update immediately after a point tap, but it must clearly track save status:

- Saving: score changed locally and save is in progress.
- Saved: backend confirmed the latest state.
- Retry needed: backend save failed and automatic retry is active.

If save repeatedly fails, the app should warn the user that the displayed score may not be safely stored yet.

### 9.4 Concurrency Requirements

When two devices update the score at nearly the same time:

- The backend decides the accepted order.
- Each accepted event is applied once.
- Both devices receive the same ordered updates.
- If a local optimistic update conflicts with backend order, the UI reconciles to the backend state.

### 9.5 Authentication Requirements

The backend must require a signed-in user for:

- Viewing scoring contexts.
- Viewing activity history.
- Inviting or removing mates.
- Opening activity sessions.
- Joining shared activity sessions.
- Sending score updates.

Google is the MVP provider. Provider records should be stored separately from user accounts so additional providers can be added later.

### 9.6 Session Capacity Requirements

Each activity session supports exactly 2 connected or reserved device slots.

Consent is a separate record on `activity_consents`. Accepting does not consume a slot.

Rules:

- Explicit leave or logout releases a slot immediately.
- Unexpected disconnect changes the slot to reserved.
- Reserved slots expire after 1-2 minutes.
- A registered member who accepts while both slots are taken is accepted and not connected.
- A person who is not a registered context member cannot accept or take a slot.
- If all devices disconnect, the activity remains live for 3 hours.
- After 3 hours with no connected devices, the activity is marked abandoned.
- Abandoned activity sessions preserve the latest scoring snapshot but do not update the leaderboard.

### 9.7 In-Game History Requirements

The current-game history modal is backed by score events for the active current game only.

Each visible history entry should include:

- Timestamp.
- User/device label, such as `Yoni's device`.
- Action taken.
- Previous score.
- Next score.
- Resulting state, such as Deuce, Advantage, Game pending confirmation, or Star Point.

When a game is confirmed and the next game starts, the displayed history resets to the new current game.

### 9.8 Activity Set Log Retention Requirements

The Context Dashboard shows the last 5 numbered activity session set logs for the selected scoring context. Empty sessions that never started a set are excluded.

Retention rules:

- Logs are grouped by activity number and date.
- Older detailed logs for that context may be purged.
- Purging old detailed logs must not change leaderboard aggregate totals.
- The Set Setup page shows only the current activity session set log.
- Current activity logs include normal completed sets, manual partial sets, disregarded sets, and abandoned activity markers where relevant.

## 10. Testing Strategy

### Unit Tests

Required:

- Auth-required access guards.
- Automatic player creation on first sign-in, including the idempotent fallback.
- Invite link creation, single use, expiry, and self-invite rejection.
- Context key generation from registered players only, ignoring guest slots.
- Guest slots excluded from leaderboard writes while their partner still scores.
- Context visibility limited to members.
- Context key generation.
- Context lookup and creation.
- Classic Advantage scoring.
- Golden Point scoring.
- Star Point scoring.
- Advantage stripped when opposing team wins.
- Game completion detection.
- Set completion detection.
- Leaderboard point calculation.
- Score event idempotency.
- Backend restore behavior.
- Manual partial set winner detection.
- Disregarded set behavior.
- Shared session join behavior.
- Shared session 2-device capacity.
- Slot release and 1-2 minute reservation expiry.
- Abandoned session marking with no leaderboard impact.
- Realtime event ordering.
- Concurrent device score update reconciliation.
- Current-game history filtering and labels.
- Last-5 activity log retention.

### Integration Tests

Recommended:

- Accept an invite link after confirming and see the new mate.
- Decline an invite link and remain without that mate.
- Fill four slots with three mates and one guest, then create the context.
- Start activity after configuration.
- Start set with teams.
- Share an activity session and join from a second device.
- Score and confirm game.
- Score and confirm set.
- Verify leaderboard update.
- Reload during an active game and verify latest saved score is restored.
- Retry the same score event and verify the point is applied once.
- Manually end an unfinished set and calculate the partial result.
- Manually end an unfinished set and disregard it.
- Score from one device and verify the other device updates.
- Trigger near-simultaneous score updates and verify both devices converge.
- Verify a third registered member can accept without taking a device slot.
- Verify Start set stays disabled until every registered member has accepted.
- Verify New activity is hidden after unmating a member of the group.
- Verify explicit leave releases a device slot.
- Verify the current-game history modal shows user-based device labels.
- Verify the Context Dashboard shows only the last 5 numbered activity logs.

### Manual QA

Required:

- Scoreboard readability on mobile portrait.
- Scoreboard readability on mobile landscape.
- Scoreboard readability on desktop as a secondary experience.
- Confirmation dialog clarity.
- Undo behavior.
- Refresh recovery during an active set.
- Save status behavior during simulated backend delay or failure.
- Realtime disconnect and reconnect recovery.

## 11. Implementation Order

1. Build domain models.
2. Build authentication and user account foundation.
3. Build automatic player provisioning and the mate invite system.
4. Build context engine.
5. Build scoring engine.
6. Build leaderboard engine.
7. Build backend persistence model and API.
8. Build realtime shared session channel with 2-device capacity.
9. Build local recovery cache.
10. Build the My Padel Mates screen.
11. Build context selection screen.
12. Build context dashboard with last-5 activity logs.
13. Build activity configuration screen.
14. Build set setup screen with current activity set log.
15. Build live scoreboard with save, connection, and history controls.
16. Add confirmation dialogs.
17. Add tests.
18. Polish mobile portrait layout, mobile landscape layout, and accessibility.

## 12. Configuration and Deployment

### Environment values

| Name | Secret | Local | Production |
| ---- | ------ | ----- | ---------- |
| `BETTER_AUTH_SECRET` | yes | `.dev.vars` | `wrangler secret put` |
| `GOOGLE_CLIENT_SECRET` | yes | `.dev.vars` | `wrangler secret put` |
| `BETTER_AUTH_URL` | no | `.dev.vars` | `vars` in `wrangler.jsonc` |
| `GOOGLE_CLIENT_ID` | no | `.dev.vars` | `vars` in `wrangler.jsonc` |
| `ADMIN_EMAIL` | no | `.dev.vars` | `vars` in `wrangler.jsonc` |

`.dev.vars` is gitignored; `.dev.vars.example` is the committed template. `BETTER_AUTH_URL` must exactly match an Authorized redirect URI origin on the Google OAuth client, because better-auth derives `{BETTER_AUTH_URL}/api/auth/callback/google` from it. The dev server port is pinned in `vite.config.ts` for the same reason.

### Local setup

```bash
cp .dev.vars.example .dev.vars   # then fill in the values
npm install
npm run db:migrate               # required: nothing creates tables at runtime
npm run dev
```

### Resetting local data

The local database is a plain SQLite file that Miniflare keeps in `.wrangler/state/v3/d1/`, so a reset is just a delete plus a re-migrate:

```bash
npm run db:reset                 # stop the dev server first
```

`scripts/reset-local-db.sh` refuses to run while the dev server holds the file open, and it never authenticates against Cloudflare, so there is no path from this command to the deployed database. After a reset the schema is rebuilt from `drizzle/` and all rows are gone, including your user; signing in again recreates it, with the admin role reapplied from `ADMIN_EMAIL`.

### Deployment

A local production ship is `npm run deploy`, which runs `vinext build` and then `wrangler deploy --config dist/server/wrangler.json`. The Vite Cloudflare plugin emits the Worker entry and a resolved Wrangler config under `dist/server/`; the repo-root `wrangler.jsonc` is the source for bindings and production `vars`, not the file Wrangler uploads.

`@vinext/cloudflare deploy` is not used. That CLI dropped `--config` and its setup check only recognizes a static `import { cloudflare }` from `@cloudflare/vite-plugin`. This repo loads that plugin dynamically in `vite.config.ts` so Wrangler log paths are set before the plugin snapshots them.

Pushing to the `production` branch runs `.github/workflows/deploy.yml`, which lints, tests, type-checks, builds, applies D1 migrations with `npm run db:migrate:remote`, and then deploys with `npm run deploy`. Migrations run before the deploy so new code never meets an old schema.

The workflow needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
