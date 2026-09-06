# Padel Scoreboard App - Product Requirements

## 1. Purpose

The Padel Scoreboard app helps groups of friends track live Padel games, sets, activities, and individual rankings.

Signing in makes you a player. Every account becomes a player automatically, and players find each other through invite links rather than a searchable directory. Scoring is isolated inside a scoreboard context made up of the registered players who took part. A player can appear in many contexts, and their score in each context is separate.

## 2. Product Principles

- The app must be fast and clear during play.
- The live scoreboard must be readable from a distance.
- The UI must be designed primarily for mobile phones and must support both vertical portrait and horizontal landscape orientation.
- Scoring must never update important results silently when a game or set is concluded.
- The user must explicitly configure an activity before starting it.
- Each scoreboard context owns its own leaderboard.
- Teams are selected per set, so players can mix partners between sets.
- Scoring logic should be deterministic, testable, and separated from the visual interface.
- Every live score update must be saved to the backend so an active game can resume from the latest known state after a refresh, crash, or momentary app issue.
- Live score persistence protects only the active in-game state. It must not update set results or individual leaderboard scoring until the set is explicitly concluded and confirmed.
- An active activity session must be shareable so a second device can join and see live score updates from the same session.
- When one connected device updates the in-game score, the other connected device must reflect the update in near real time.
- Sign-in is required at the global app level before viewing scoring contexts, past activities, managing mates, opening activities, or joining shared sessions.
- Only registered players accumulate leaderboard score. A guest may fill a match slot so play is never blocked, but a guest never ranks.

## 3. Core Domain Definitions

### User Account

An authenticated app user.

The MVP starts with Google Sign-In, while the design should allow future sign-in providers.

User accounts can:

- Invite mates and manage their mate list.
- Select scoreboard contexts.
- Start and join activity sessions.
- View context dashboards and past activity logs.
- Be identified in live score update history.

### Player

A player is a user account. The two are the same person and share the same identifier.

A player record is created automatically the first time an account signs in, using the name from the sign-in provider. There is no separate profile to create and no linking step.

A player can take part in many scoreboard contexts, and their score in each context is separate. The player record outlives the account, so completed match history and leaderboards never develop holes if an account is later removed.

### Mate

Another player you have connected with, and the only people you can build a scoreboard context from.

Mates are established by invite link. A player generates a single-use link with an expiry and shares it directly. The person who opens it while signed in sees who sent it and must accept or decline. Accepting creates the mate relationship both ways. Declining consumes the link without creating a relationship. There is deliberately no way to search the app for other users, so the membership list cannot be enumerated.

### Guest

An unregistered person filling one of the four match slots.

A guest is anonymous. They are not named, not stored as a player, and carry no history between matches. A guest occupies a slot so a match with a substitute can still be scored, appears in that match's set log, and never receives leaderboard points. Their registered partner earns full points as normal.

### Device

A browser or phone currently connected to an activity session.

Device labels in logs should use the signed-in user's name, such as:

```text
Yoni's device
```

If the same user connects from multiple devices, the app may add a suffix, such as:

```text
Yoni's device 2
```

### Scoreboard Context

An automatically identified scoring context created from the registered players in a match. A match always has four slots, of which two to four must be registered players; any remaining slots are guests. The context is made up of the registered players only.

Because guests are anonymous and excluded, the same three mates produce the same context no matter which guest fills the fourth slot.

A consequence worth stating plainly: a context is defined by exactly which registered players took part, so a group of four and the same group minus one are different contexts with separate leaderboards.

The order of selection must not matter.

Example:

```text
A, B, C, D
```

is the same context as:

```text
D, C, B, A
```

But:

```text
A, B, C, D
```

is a different context from:

```text
A, B, C, E
```

Each context has its own leaderboard and activity history.

If a member later removes another member as a mate, the existing context stays visible with its leaderboard and past set logs. It becomes history-only: nobody can start a new activity there until the registered members are mates of the host again.

### Activity

A play session opened only after selecting a scoreboard context.

Activity duration is not part of the MVP logic. Before starting an activity, the user must select its scoring configuration.

An activity is numbered only after the first set starts. Until then the UI shows Activity, not Activity #N. Creating, sharing, waiting for accepts, or finishing with no sets does not take a number. Numbers are sequential per context among activities that have been played.

An activity can be shared with another device through a session link or session code. Connected devices view and operate on the same active scoring state.

New scores require two things: the registered members are still mates of the host, and every registered member has accepted this activity. The host accepts by creating it. Everyone else accepts by entering the session code or opening the share link. Guests never accept and never rank.

Consent is not a device slot. Only 2 devices may be connected or temporarily reserved at the same time. If a registered member accepts when both slots are taken, they are still accepted and the first set can start. One connected phone can score for everyone after that.

A connected device can log out or leave the session to release its slot for another device.

If a device disconnects unexpectedly, its slot remains reserved for 1-2 minutes before becoming available.

If all devices disconnect and the activity is not concluded, the activity remains live for 3 hours. After 3 hours, it is marked abandoned with the latest saved score snapshot and no leaderboard impact.

### Set

A set belongs to an activity.

Before every set, the user must choose the team pairing from the four match slots, which may include guest slots.

Example:

```text
Set 1: Blue A+B, Red C+D
Set 2: Blue A+C, Red B+D
Set 3: Blue A+D, Red B+C
```

### Game

A game belongs to a set and follows the selected deuce rule.

### Leaderboard

A ranking table calculated only inside the selected scoreboard context, and only for its registered players.

The leaderboard is updated only after a set is confirmed as completed. Guest slots are skipped when the leaderboard is updated, so nothing untraceable can ever reach a ranking.

## 4. User Roles

The MVP has authenticated users, who are also the players.

Platform roles:

- Administrator: a single operator who can view all accounts and suspend or restore them. The administrator is identified only by the `ADMIN_EMAIL` configuration value. There is deliberately no way to promote another user from inside the app.
- Member: every other signed-in user. Signup is open, so any user who completes Google Sign-In becomes a member and can use the app immediately with no approval step.

Activity roles:

- Host: the signed-in user who creates the activity session and is accepted immediately.
- Participant: a registered member of the context who accepts the activity by code or share link. They also connect as a live device when a slot is free.

Both connected devices may view and update the live scoreboard unless future permissions restrict this.

### Account Suspension

The administrator may suspend a member either for a fixed number of days or until the suspension is lifted manually.

Suspension rules:

- Suspending a member immediately ends all of that member's active sessions.
- A suspended member cannot sign back in and is shown an account-suspended screen instead.
- A suspension with an expiry lifts itself once that time passes; no administrator action is needed.
- The administrator cannot suspend their own account.
- Suspension is corrective rather than preventive. It cannot stop a new person from signing up, only stop an existing member from continuing.

Match participation:

- Registered player: a signed-in account, automatically a player, who ranks on the leaderboard.
- Guest: an anonymous slot filled by someone without an account, who plays but never ranks.

Authentication is required for global app access in the MVP.

## 5. Main User Flow

1. The user opens the app.
2. The user signs in.
3. The user invites mates by link, or already has mates.
4. The user fills four match slots with two to four mates and any remaining slots as guests.
5. The app automatically identifies an existing scoreboard context or creates a new one.
6. The app opens the context dashboard.
7. If another member starts an activity in this group, Join appears on the open dashboard without a page reload.
8. The user opens new activity setup.
9. The user selects required activity configuration settings.
10. The user starts the configured activity and is recorded as accepted.
11. The user shares the activity session so every other registered member can accept.
12. After every registered member has accepted, the user starts the first set.
13. The user selects Blue Team and Red Team for the set.
14. The user tracks points in the live scoreboard.
15. After each point tap, the app persists the updated current game state to the backend.
16. Other devices connected to the same activity session receive the updated score.
17. If the app reloads during a live activity, the latest saved game state is restored. If the user was on a group dashboard, that group opens again.
18. When a game-ending score is reached, the app asks for confirmation before updating the set score.
19. When a set-ending score is reached, the app asks for confirmation before updating the context leaderboard.
20. The user may manually end an unfinished set when the real activity time is over.
21. If a set is manually ended, the user must confirm whether to calculate the partial set score or disregard the set.
22. The user may start another set with a new team pairing.
23. The user may end the activity and return to the context dashboard. If the activity is already finished, any device that still has that session open, reloads it, or opens its share link is taken to the same context dashboard instead of staying on the activity screen.

## 6. Activity Configuration Requirements

Before an activity starts, the user must select these settings.

Each setting must include a short explanation in the UI.

### 6.1 Deuce Rule

The user must select one. Star Point is listed first and is selected by default.

#### Star Point

UI explanation:

```text
After two Advantage cycles are lost, the next deuce becomes a single deciding point. This limits very long games.
```

#### Classic Advantage

UI explanation:

```text
At 40-40, a team must win two points in a row. Winning one point gives Advantage. Losing Advantage returns the game to 40-40.
```

#### Golden Point

UI explanation:

```text
At 40-40, the next point immediately wins the game. Use this for faster games.
```

### 6.2 Set Win Rule

The user must select one:

#### Standard Set

UI explanation:

```text
First team to 6 games wins the set, but they must lead by 2 games. At 6-6, use the selected tie-break rule.
```

#### Short Set

UI explanation:

```text
First team to 4 games wins the set, but they must lead by 2 games. Useful when time is limited.
```

### 6.3 Tie-Break Rule

The user must select one:

#### Standard Tie-Break

UI explanation:

```text
At 6-6, play a tie-break. First team to 7 points wins, but they must lead by 2.
```

#### Deciding Game

UI explanation:

```text
At the set limit, play one final game to decide the set. Simpler for casual play.
```

#### No Tie-Break

UI explanation:

```text
Continue games until one team leads by 2 games.
```

### 6.4 Point Formula

The MVP should provide a default formula and may allow choosing a formula later.

Default UI explanation:

```text
Winning players receive base points plus a bonus for the set score difference. Bigger wins earn more points.
```

## 7. Functional Requirements

### FR-1 Authentication

The app must require sign-in before a user can access global app data.

Acceptance criteria:

- User must sign in before viewing scoring contexts.
- User must sign in before viewing past activities.
- User must sign in before inviting or managing mates.
- User must sign in before opening an activity session.
- User must sign in before joining a shared activity session.
- MVP sign-in provider is Google.
- Authentication design must allow additional providers later.
- The app must store the signed-in user's display name for session logs and device labels.
- Signup is open: a first-time Google sign-in creates the account and grants access immediately, with no approval queue.
- A suspended user must be refused at sign-in and shown an account-suspended screen.

### FR-1a Account Administration

The app must let the administrator manage member access.

Acceptance criteria:

- The administrator is determined solely by the `ADMIN_EMAIL` configuration value.
- The administrator can list all accounts with their current status.
- The administrator can suspend an account for a chosen number of days, or until lifted.
- The administrator can record an optional reason for a suspension.
- The administrator can restore a suspended account.
- Suspending an account revokes its active sessions immediately.
- Non-administrators must receive an authorization error from every administration endpoint.

### FR-2 Mate Management

The app must allow a signed-in user to build a mate list through invite links.

Acceptance criteria:

- A player record is created automatically on first sign-in, named from the sign-in provider, with no action from the user.
- A signed-in user can generate an invite link to share directly.
- An invite link is single-use and expires.
- Opening a valid invite link while signed in shows who sent it and asks the recipient to accept or decline.
- Accepting establishes the mate relationship in both directions.
- Declining consumes the link and does not create a mate relationship.
- An expired, already-used, or self-issued invite link is refused with a clear message.
- A user can view their mate list and remove a mate.
- Removing a mate leaves existing shared contexts visible as history. New activity is blocked there until the members are mates again.
- The app provides no way to search or browse other users, so the membership list cannot be enumerated.
- Player names may be duplicated between accounts; players are distinguished by identity, not by name.

### FR-3 Scoreboard Context Selection

The app must allow the signed-in user to fill four match slots from their mates and guest slots.

Acceptance criteria:

- Exactly four slots must be filled.
- Between two and four slots must be registered players chosen from the user's mates.
- Remaining slots may be anonymous guests.
- User cannot continue with fewer than two registered players.
- The app creates a deterministic context key from the registered player IDs only.
- Guest slots never affect which context is selected.
- If the context exists, it is opened.
- If the context does not exist, it is created automatically.
- A user only sees contexts they are a member of.

### FR-4 Context Dashboard

The app must show the selected context.

Acceptance criteria:

- Show the registered players in the context.
- Show the leaderboard for this exact context.
- Dashboard cards stay inside the page width. Leaderboard columns, player names, and set-log pairings remain readable without horizontal scrolling.
- An info control next to the leaderboard heading explains how points and rankings are calculated. Tapping it opens a hint beside the icon; tapping outside or pressing Escape closes it.
- Show the last 5 numbered activity session set logs for this exact context, categorized by activity number and date. Empty sessions that never started a set do not occupy this window.
- Past activity logs older than the most recent 5 numbered activities for the context may be purged according to retention policy.
- Provide an action to start a new activity when every registered member is still a mate of the viewer.
- Hide or disable New activity when any registered member is no longer a mate. History, leaderboard, and old set logs stay.
- A live activity the viewer has not accepted yet offers Join. Resume scoring is only for a viewer who has already accepted.
- While the dashboard is open, the app refreshes that group every 5 seconds and again when the tab becomes visible, so Join appears without a page reload when another member starts an activity.
- A browser refresh returns to the last open scoring group. Going back to Groups or Mates clears that restore.

### FR-5 Activity Configuration

The app must require configuration before starting an activity.

Acceptance criteria:

- User must select deuce rule.
- User must select set win rule.
- User must select tie-break rule.
- Every setting must have a visible explanation.
- Activity cannot start until all required settings are selected.

### FR-6 Set Team Selection

The app must require team selection before each set.

Acceptance criteria:

- Blue Team must have exactly 2 players.
- Red Team must have exactly 2 players.
- A player cannot appear on both teams.
- All 4 context players must be assigned.
- Team pairing can change between sets.
- The Set Setup page must show the current activity session's set log for transparency.
- Start set stays disabled until every registered context member has accepted this activity.
- The Set Setup page shows every registered member as In or Pending. Guests are not in that list.

### FR-7 Live Game Scoreboard

The app must track live Padel scoring.

Acceptance criteria:

- Display Blue Team and Red Team with strong background colors.
- Display large scores: 0, 15, 30, 40, A.
- Support mobile portrait and mobile landscape layouts.
- Preserve score readability and tap comfort in both orientations.
- Provide a point button for Blue Team.
- Provide a point button for Red Team.
- Provide undo for recent scoring actions.
- Show the current set score on each team's color, with the leading team's games emphasized so it is clear who is ahead in portrait and landscape.
- Show the current activity and set state.
- Persist every current game score update to the backend.
- Restore the latest active game state after reload.
- Reflect score updates made from another connected device in near real time.
- Show whether the device is connected to the shared activity session.
- Provide a button to open the current game's in-game score update history.
- Display score update history in a modal without leaving the scoreboard.

### FR-8 Advantage Behavior

The app must automatically return to deuce when the non-advantaged team wins a point.

Acceptance criteria:

- If score is Blue A, Red 40 and Red wins the point, score becomes 40-40.
- If score is Blue 40, Red A and Blue wins the point, score becomes 40-40.
- No confirmation is shown because the game has not ended.

### FR-9 Game Completion Confirmation

The app must confirm before applying a game result to the set.

Acceptance criteria:

- When a team reaches game-winning state, show a confirmation message.
- If confirmed, increment that team's games in the set.
- If canceled, do not update the set games.
- After confirmation, reset the current game score to 0-0.
- After confirmation, check whether the set has reached a set-ending state.

### FR-10 Set Completion Confirmation

The app must confirm before applying a set result to the context leaderboard.

Acceptance criteria:

- When a team reaches set-winning state, show a confirmation message.
- If confirmed, mark the set completed.
- If confirmed, calculate individual player points.
- If confirmed, update the selected context leaderboard.
- If canceled, do not update the leaderboard.
- After set completion, user can start a new set with a new team pairing.
- Backend in-game saves must not update the leaderboard before this confirmation.

### FR-11 Leaderboard Calculation

The app must calculate player rankings for one selected context.

Acceptance criteria:

- Leaderboard includes only the registered players in the selected context.
- Guest slots are excluded from the leaderboard entirely.
- Leaderboard is updated only after confirmed set completion.
- Track total points.
- Track sets played, sets won, sets lost.
- Track games won, games lost, and game differential.
- Sort primarily by total points.
- A finished set awards 10 points plus the game difference to each winning player.
- A calculated partial set still counts as a win and awards 5 points plus the game difference.

### FR-12 Manual Early Set Conclusion

The app must allow the user to manually end an unfinished set when the real-world activity ends before the set reaches a normal set-winning score.

Acceptance criteria:

- The live scoreboard must provide an action to end the current set manually.
- If the current set has not reached a normal set-winning state, the app must show a confirmation dialog explaining that the set is unfinished.
- The dialog must ask whether to calculate the current partial score or disregard the set.
- If the user chooses to calculate the partial score, the app determines the winner from the current set game score.
- If the current set score is tied, the app must not calculate a winner and must require the user to disregard the set or continue playing.
- If the user confirms calculation, the set is marked as completed manually and individual scoring uses half the finished-set win bonus plus the current game difference.
- If the user chooses to disregard the set, the set is closed or discarded without changing the context leaderboard.
- The app must clearly record whether a completed set was concluded normally or manually.

### FR-13 Backend Live Score Persistence

The app must save every live game score update to the backend so scoring can continue after a refresh, crash, temporary app issue, or device interruption.

Acceptance criteria:

- Every point tap creates or updates a backend record for the active game state.
- Backend persistence must happen for ordinary point changes, deuce returns, Advantage changes, Golden Point pending winners, and Star Point state changes.
- The persisted state must include enough information to restore the current score, set score, activity, teams, deuce rule state, undo history, and pending confirmation state.
- On app load, if an active activity or set exists, the app must fetch the latest backend state before allowing new score updates.
- If a pending game confirmation existed before reload, the app must restore that pending confirmation.
- If a pending set confirmation existed before reload, the app must restore that pending confirmation.
- The app must show a clear saving or saved indicator on the live scoreboard.
- If the backend save fails, the app must clearly indicate that the latest point is not safely saved yet and retry automatically.
- The app must prevent duplicate point application caused by retrying the same score update.
- Backend live score persistence must not update set results or leaderboard entries by itself.

### FR-14 Shared Activity Session

The app must allow an active activity session to be shared with another device.

Acceptance criteria:

- The activity screen must provide a share action.
- The share action must provide a join link or session code.
- The share action must support creating a shareable message suitable for WhatsApp or plain text.
- A second device can open the session and load the same context, activity, active set, teams, configuration, current game score, and pending confirmations.
- Connected devices receive score updates made by another device in near real time.
- Connected devices receive game confirmation and set confirmation state changes made by another device.
- Connected devices receive manual unfinished-set conclusion state changes made by another device.
- The live scoreboard must show connection status for the shared session.
- No more than 2 devices may be connected or reserved in the same activity session.
- Opening a code or share link records consent for a registered context member before any device slot is taken.
- If both device slots are taken, a registered member is still accepted and can see the activity. They do not occupy a live slot.
- A person who is not a registered member of the context cannot accept or join.
- A connected device can log out or leave the session to release its slot.
- If a connected device disconnects unexpectedly, its slot remains reserved for 1-2 minutes before becoming available.
- If all devices disconnect before the activity is concluded, the activity remains live for 3 hours.
- After 3 hours with no connected devices, an unconcluded activity is marked abandoned with the latest saved scoring snapshot and no leaderboard impact.
- A signed-in user may later reopen an abandoned activity and manually choose whether to calculate a partial set or disregard it.
- If a device disconnects and reconnects, it must fetch the latest backend state before allowing new score updates.
- The backend must prevent duplicate or out-of-order score updates from corrupting the game state.
- If two devices attempt to score at the same time, the backend must apply a single ordered sequence of accepted events and both devices must converge to the same latest state.
- If the activity has already finished, the user is taken to that context dashboard. They must not remain on the finished activity screen.

### FR-15 In-Game Score Update History

The app must provide a traceable history of score updates for the current game.

Acceptance criteria:

- The live scoreboard must include a button to open score update history.
- The history opens in a modal.
- Both connected devices can access the history modal.
- The displayed history includes only the current game within the active set and activity.
- Each entry includes timestamp, action, previous score, next score, and the user/device label.
- User/device labels must use the signed-in user's display name, such as `Yoni's device`.
- When the current game is confirmed and a new game starts, the displayed in-game history resets for the new current game.

### FR-16 Set Score Log History

The app must provide transparent set score logs within a scoreboard context.

Acceptance criteria:

- The Context Dashboard displays the last 5 numbered activity session set logs for the selected scoring context.
- Logs are categorized by activity number and date.
- Empty sessions that never started a set do not occupy the retained log window.
- Activity logs older than the most recent 5 numbered activities for that context may be deleted or purged from the database according to the retention policy.
- Purging old activity logs must not corrupt the current leaderboard totals.
- The Set Setup page inside a live activity displays only the current activity session's set log.
- The current activity set log updates as sets are completed, manually calculated, or disregarded.

## 8. Non-Functional Requirements

### Usability

- Mobile phone usage is the primary experience.
- On phones, Groups and Mates are available from the header menu because the header tabs are hidden.
- Main scoring buttons must be large enough for quick use during play.
- The live scoreboard must be readable outdoors and from a distance.
- The live scoreboard must support portrait orientation for one-handed or upright phone use.
- The live scoreboard must support landscape orientation for wider courtside display.
- Orientation changes must not lose score state or reset the current game.
- Confirmation dialogs must be clear and hard to misread.

### Reliability

- User identity must be required before app data is viewed or changed.
- The app must avoid accidental leaderboard updates.
- Undo must be available for live point entry mistakes.
- Backend state must survive page refresh, crash, and momentary app issues.
- Local state may be used as a temporary cache, but the backend is the source of truth for active scoring.
- The app must avoid duplicate score updates when retrying after a failed save.
- The user must be able to continue scoring from the latest successfully saved backend state.
- The app must not let in-game persistence accidentally affect set scoring or individual scoring.
- Shared activity sessions must converge to the same score state across connected devices.
- A reconnecting device must restore from the backend before accepting new scoring input.
- Session slots must be released immediately when a device leaves intentionally.
- Unexpected disconnects must reserve the device slot for only 1-2 minutes.
- Abandoned sessions must preserve the latest snapshot without updating the leaderboard automatically.

### Maintainability

- Scoring logic must be separated from UI components.
- Score transitions must be implemented as pure functions.
- Domain models must be explicit and typed.
- Configuration should be stored with each activity.
- A player shares its identifier with the user account, while devices remain modeled separately.
- The player record must survive removal of its account so completed history stays intact.
- Sign-in providers must be modeled flexibly so providers beyond Google can be added later.

### Accessibility

- Buttons must have accessible labels.
- Color must not be the only indicator of team identity.
- Text contrast must be high.
- Dialogs must support keyboard interaction.

### Performance

- The app must load quickly.
- Score updates must feel instant while still being saved durably.
- Backend save feedback must not visually distract from the scoreboard.

## 9. MVP Scope

Included:

- Google sign-in.
- Automatic player creation on first sign-in.
- Mate lists built from single-use invite links.
- Anonymous guest slots that play without ranking.
- Context selection from two to four registered players, with automatic context creation.
- Context dashboard.
- Leaderboard scoring hint opened from an info icon.
- Context dashboard polls so Join appears when another member starts an activity.
- Context dashboard display of the last 5 numbered activity session set logs.
- Required activity configuration.
- Per-set team selection.
- Current activity set log on the Set Setup page.
- Live game scoring.
- Current-game score update history modal.
- Star Point (default), Classic Advantage, and Golden Point modes.
- Game completion confirmation.
- Set completion confirmation.
- Manual early set conclusion with calculate-or-disregard confirmation.
- Context-specific leaderboard.
- Backend persistence for every live score update.
- Local browser cache for short-term resilience while backend saves retry.
- Shareable activity sessions for up to 2 connected devices.
- Near real-time in-game score synchronization across connected devices.
- 2-device session capacity limit.
- 1-2 minute reservation window for unexpected device disconnects.
- 3-hour abandoned-session handling with no automatic leaderboard impact.

Deferred:

- Larger multi-device room management beyond the active activity session.
- Sign-in providers beyond Google.
- Payment or club management.
- Advanced tournaments.
- Player photos.
- Detailed analytics charts.
