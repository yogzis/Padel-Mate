# Padel Scoreboard App - Scoring and Configuration Specification

## 1. Purpose

This document defines the scoring behavior, activity configuration settings, confirmation rules, and leaderboard calculations.

Every live score update must be persisted to the backend so the active game can resume from the latest saved position after a refresh, crash, or momentary app issue.

Live score persistence is for in-game recovery only. It must not update set results, individual player points, or the context leaderboard until a set is explicitly concluded and confirmed.

An activity session can be shared with another device. In-game score updates accepted by the backend must be synchronized to all connected devices in the session.

Score update history must identify the signed-in user's device label, such as `Yoni's device`, rather than generic labels like `Device 1`.

## 2. Activity Configuration

The user must configure every activity before starting it.

Configuration is stored with the activity and applies to all sets played inside that activity.

## 3. Required Settings

### 3.1 Deuce Rule

Star Point is listed first on the activity configuration screen and is selected by default. Scoring behavior for each rule is unchanged.

#### Star Point

Explanation shown in UI:

```text
After two Advantage cycles are lost, the next deuce becomes a single deciding point. This limits very long games.
```

Behavior:

- At first 40-40, winning a point gives Advantage.
- If the advantaged team wins the next point, it wins the game.
- If the advantaged team loses the next point, score returns to 40-40 and one deuce return is counted.
- At second 40-40, the same Advantage flow applies.
- If the second Advantage is also lost, the next point becomes a decisive Star Point.
- The winner of the Star Point wins the game.

#### Classic Advantage

Explanation shown in UI:

```text
At 40-40, a team must win two points in a row. Winning one point gives Advantage. Losing Advantage returns the game to 40-40.
```

Behavior:

- At 40-40, winning a point gives that team Advantage.
- If the advantaged team wins the next point, it wins the game.
- If the other team wins the next point, score returns to 40-40.
- This can repeat without limit.

#### Golden Point

Explanation shown in UI:

```text
At 40-40, the next point immediately wins the game. Use this for faster games.
```

Behavior:

- At 40-40, the next point wins the game.
- No Advantage is displayed.
- The app should visually indicate that the next point is decisive.

## 4. Point Score Transition Rules

### 4.1 Normal Progression

```text
0 -> 15 -> 30 -> 40
```

If a team wins a point before both teams reach 40:

- 0 becomes 15.
- 15 becomes 30.
- 30 becomes 40.
- 40 may become game-winning state depending on opponent score.

After every point transition, the app must create a score event and persist the updated current game state to the backend.

### 4.2 Win Before Deuce

If a team has 40 and the opposing team has less than 40, the next point creates a pending game winner.

Example:

```text
Blue 40, Red 30
Blue wins point
Pending game winner: Blue
Show game confirmation
```

### 4.3 Deuce

Deuce occurs when:

```text
Blue 40, Red 40
```

Behavior depends on selected deuce rule.

### 4.4 Advantage Stripping

When one side has Advantage and the other side wins the point, the score must automatically return to 40-40.

Example:

```text
Blue A, Red 40
Red wins point
Blue 40, Red 40
```

Example:

```text
Blue 40, Red A
Blue wins point
Blue 40, Red 40
```

No confirmation is shown because the game has not ended.

The restored backend state must preserve this transition. If the app reloads after Advantage is stripped, the score must return as 40-40, not as the previous Advantage state.

## 5. Game Completion Confirmation

The app must not apply game results automatically.

When a game-winning state is reached, show a confirmation dialog.

Before or while showing the confirmation, the pending game winner state must be saved to the backend. If the app reloads at this point, the same confirmation should be restored.

Example:

```text
Blue Team won this game. Update the set score?
```

Confirmation actions:

- Confirm: increment the winning team's games in the active set.
- Cancel: do not update the set score.

After Confirm:

- Reset current game score to 0-0.
- Clear current game history.
- Save the updated set score and reset current game state to the backend.
- Check whether the set has reached completion.

After Cancel:

- Keep the previous score state or allow undo correction.
- Do not update set games.

## 6. Set Win Rules

### 6.1 Standard Set

Explanation shown in UI:

```text
First team to 6 games wins the set, but they must lead by 2 games. At 6-6, use the selected tie-break rule.
```

Behavior:

- 6-0 through 6-4 wins the set.
- 7-5 wins the set.
- At 6-6, apply the selected tie-break rule.

### 6.2 Short Set

Explanation shown in UI:

```text
First team to 4 games wins the set, but they must lead by 2 games. Useful when time is limited.
```

Behavior:

- 4-0 through 4-2 wins the set.
- 5-3 wins the set.
- At 4-4, apply the selected tie-break rule.

## 7. Tie-Break Rules

### 7.1 Standard Tie-Break

Explanation shown in UI:

```text
At 6-6, play a tie-break. First team to 7 points wins, but they must lead by 2.
```

MVP note:

The app can initially treat a confirmed tie-break winner as the set winner and store the set score as 7-6 or 6-7.

### 7.2 Deciding Game

Explanation shown in UI:

```text
At the set limit, play one final game to decide the set. Simpler for casual play.
```

Behavior:

- At the tied limit, the next confirmed game wins the set.

Examples:

- Standard set: at 6-6, next game creates 7-6 set result.
- Short set: at 4-4, next game creates 5-4 set result.

### 7.3 No Tie-Break

Explanation shown in UI:

```text
Continue games until one team leads by 2 games.
```

Behavior:

- The set continues until one team leads by 2 games after reaching the configured target.

## 8. Set Completion Confirmation

The app must not update the leaderboard automatically.

When a set-winning state is reached, show a confirmation dialog.

The pending set completion state must be persisted to the backend. If the app reloads at this point, the same pending set confirmation should be restored before any new scoring can continue.

Example:

```text
Blue Team won the set 6-3. Update the scoreboard?
```

Confirmation actions:

- Confirm: complete the set and update the leaderboard.
- Cancel: do not update the leaderboard.

After Confirm:

- Mark set as completed.
- Store winning team.
- Calculate individual points.
- Update leaderboard entries for the registered players in the context, skipping any guest slots.
- Allow user to start another set with new team pairing.
- Save completed set and leaderboard updates to the backend in one consistent operation.

After Cancel:

- Keep set active.
- Do not update leaderboard.

## 9. Manual Early Set Conclusion

The user may manually end an unfinished set when the real-world Padel activity ends before the set reaches a normal set-winning score.

This flow is different from normal set completion because the set did not naturally end by score.

### 9.1 Manual End Trigger

The live scoreboard must provide an action to manually end the current set.

When selected, the app must inspect the current set game score.

### 9.2 Confirmation Dialog

If the set has not reached a normal set-ending state, show a confirmation dialog.

Example:

```text
This set is not finished. Current score is Blue 4, Red 2.

Do you want to calculate this partial set result or disregard it?
```

Available actions:

- Calculate partial result.
- Disregard this set.
- Continue playing.

### 9.3 Calculate Partial Result

If the user chooses to calculate the partial result:

- The app determines the winner from the current set game score.
- The team with more games won is the set winner.
- The set is marked as completed with conclusion type `manual-partial`.
- Individual player points are calculated using the current set score and the partial-set formula: half the finished-set win bonus plus the game difference.
- The context leaderboard is updated.
- The result should be visibly marked as manually concluded in activity history.

Examples:

```text
Blue 4, Red 2
Manual winner: Blue
Scoring input: 4-2
```

```text
Blue 5, Red 3
Manual winner: Blue
Scoring input: 5-3
```

### 9.4 Disregard Set

If the user chooses to disregard the set:

- The set does not update the context leaderboard.
- No individual player points are added.
- The set may be stored as disregarded for activity history, or removed from scoring history.
- The user can start another set or end the activity.

### 9.5 Tied Partial Score

If the current set score is tied, there is no automatic winner.

The app must not calculate individual points from a tied partial set.

Allowed actions:

- Continue playing.
- Disregard the set.

The app may optionally allow a future manual winner override, but this is outside MVP scope.

## 10. Individual Points Formula

The context dashboard shows this formula in a hint opened from the info icon next to Group leaderboard.

### 10.0 Guest Slots

A match slot may be filled by an anonymous guest. Guests never receive points and never gain a leaderboard entry.

The formula below is applied per player, not per team, so a guest simply drops out of the calculation:

- A registered player whose partner is a guest earns full points exactly as if their partner were registered. Winning the set is what earns the points; who partnered them does not change the amount.
- A guest slot on either team is skipped when leaderboard entries are written.
- Guest slots are still recorded on the set log, so the match history remains complete and readable.

Default MVP formula for a finished set:

```text
winning_player_points = 10 + abs(winning_games - losing_games)
losing_player_points = 0
```

Examples:

```text
6-0: winning players get 16 points each
6-3: winning players get 13 points each
7-5: winning players get 12 points each
7-6: winning players get 11 points each
```

Manual partial sets still count as a set win, but use half the win bonus:

```text
winning_player_points = 5 + abs(winning_games - losing_games)
losing_player_points = 0
```

Stats updated for winning players:

- totalPoints increases.
- setsPlayed increases by 1.
- setsWon increases by 1.
- gamesWon increases by winning games.
- gamesLost increases by losing games.
- gameDifferential increases by the game margin.

Stats updated for losing players:

- setsPlayed increases by 1.
- setsLost increases by 1.
- gamesWon increases by losing games.
- gamesLost increases by winning games.
- gameDifferential decreases by the game margin.

For manually concluded partial sets, use the half-bonus formula with the current partial set score.

Examples:

```text
4-2 manual partial: winning players get 7 points each
5-3 manual partial: winning players get 7 points each
5-4 manual partial: winning players get 6 points each
5-0 manual partial: winning players get 10 points each
```

## 11. Leaderboard Sorting

The dashboard hint also states this sort order.

Default sorting:

1. Higher total points.
2. Higher sets won.
3. Higher game differential.
4. Higher games won.
5. Player name alphabetically.

## 12. Undo Rules

Undo applies to live point scoring before game confirmation.

Requirements:

- Every point action stores the previous current game snapshot.
- Every point action is persisted as a backend score event.
- Undo restores the most recent snapshot.
- Undo creates its own backend event or state update so reload restores the undone state.
- Undo should not reverse confirmed set leaderboard updates in the MVP.
- If a game confirmation is visible, undo should first dismiss the pending confirmation and restore the pre-winning score state.

## 13. Current-Game Score Update History

Every visible score change in the current game must be traceable from the live scoreboard.

The history is shown through a modal opened from the in-game scoreboard page.

Requirements:

- The modal shows only the current game in the active set and activity.
- Both connected devices can open and view the history.
- History entries are based on backend-accepted score events.
- Each entry shows the timestamp, action, previous score, next score, and user/device label.
- User/device labels use the signed-in user's display name, such as `Yoni's device`.
- If the same signed-in user connects from multiple devices, the app may add a suffix, such as `Yoni's device 2`.
- When the current game is confirmed and a new game starts, the visible history resets for the new current game.

Example:

```text
10:14:03 - Yoni's device gave point to Blue. Score: 0-0 -> 15-0
10:14:31 - Dana's device gave point to Red. Score: 15-0 -> 15-15
10:15:02 - Yoni's device gave point to Blue. Score: 40-40 -> A-40
```

## 14. Set Score Log History

Set score logs support transparency for all players in a scoreboard context.

Context Dashboard requirements:

- Show the last 5 numbered activity session set logs for the selected scoreboard context. Empty sessions that never started a set do not occupy this window.
- Group logs by activity number and date.
- Include normal completed sets, manual partial sets, disregarded sets, and abandoned activity markers when relevant.
- Detailed logs older than the most recent 5 numbered activity sessions for the context may be deleted or purged.
- Purging old detailed logs must not change leaderboard aggregate totals.

Live activity requirements:

- The Set Setup page shows only the current activity session set log.
- The current activity set log updates after confirmed sets, manual partial sets, disregarded sets, and abandoned session markers.
- The current activity set log must not show unrelated context history.

## 15. Backend Persistence Rules

The backend is the source of truth for active scoring.

All score updates, session joins, and session leave actions require a signed-in user so each event can be traced to a user/device label.

### 15.1 Required Saved State

The backend must persist:

- Active context ID.
- Active activity ID.
- Active share session ID or code.
- Active set ID.
- Team assignments for the active set.
- Current game score.
- Deuce rule state.
- Star Point deuce return count.
- Decisive point active flag.
- Pending game winner, if any.
- Pending set winner, if any.
- Undo history or enough score events to rebuild undo history.
- Latest current game version.
- Latest accepted score event sequence number.
- Connected, reserved, and released device slots.
- Device slot reservation expiry.
- Abandonment deadline when all devices are disconnected.

This active scoring state must not mutate leaderboard entries or individual player scores by itself.

### 15.2 Score Event Requirements

Every point tap must create a durable event with:

- Unique client mutation ID.
- Team receiving the point.
- Previous score snapshot.
- Next score snapshot.
- Activity ID.
- Set ID.
- Current game ID.
- Originating device ID.
- Originating user ID.
- Originating user display name.
- Originating device label.
- Backend-assigned sequence number after acceptance.
- Created timestamp.

The backend must use the client mutation ID to avoid applying the same point twice during retry.

The backend must broadcast accepted score events to all devices connected to the same activity session.

### 15.3 Shared Session Capacity

Each activity session allows a maximum of 2 connected or reserved device slots.

Rules:

- A signed-in host creates the activity session.
- The host can share a WhatsApp-friendly or plain-text message containing the join link or session code.
- A signed-in user can join if a device slot is available.
- A third device attempting to join receives an error stating that the activity session is full.
- Explicit logout or leave releases a device slot immediately.
- Unexpected disconnect reserves the device slot for 1-2 minutes.
- A reconnecting device can reclaim its reserved slot during the reservation window.
- After the reservation expires, another device may take the slot.

### 15.4 Abandoned Session Handling

If all devices disconnect and the activity has not been concluded:

- The activity remains live for 3 hours.
- If a device reconnects within 3 hours, the app restores the latest backend state and continues the activity.
- If no device reconnects within 3 hours, the activity is marked abandoned.
- The latest saved scoring snapshot is preserved.
- The abandoned activity does not update the set result, individual player score, or leaderboard automatically.
- A signed-in user may later reopen the abandoned activity and manually choose whether to calculate the partial score or disregard it.

### 15.5 Shared Session Synchronization

Shared activity sessions must keep connected devices aligned to the same backend-accepted score state.

Requirements:

- A shared session is identified by a session link or session code.
- A joining device must load the latest backend state before subscribing to live updates.
- Every accepted score event must be broadcast to connected devices.
- Every game confirmation, set confirmation, manual partial conclusion, and disregard action must be broadcast to connected devices.
- Devices must apply remote events in backend sequence order.
- Devices must ignore stale events that are older than the current local version.
- If a device detects a missed event or sequence gap, it must fetch the latest backend state.
- If a device reconnects after being offline, it must fetch the latest backend state before allowing new score input.

### 15.6 Concurrent Updates

If two devices submit score updates at nearly the same time:

- The backend determines the accepted order.
- Each accepted event is applied once.
- Both devices receive the same ordered event sequence.
- If a device made an optimistic local update that conflicts with backend order, the device must reconcile to the backend state.
- The app must prefer correctness over preserving a local optimistic score.

### 15.7 Reload Recovery

On app load:

1. Fetch the latest active scoring state from the backend.
2. Restore the current screen based on that state.
3. Restore pending game confirmation if present.
4. Restore pending set confirmation if present.
5. Rejoin the realtime session if the activity is shared.
6. Allow new scoring only after recovery completes.

### 15.8 Save Failure Behavior

If a save fails:

- Keep the visual score visible.
- Show that the latest score is not saved yet.
- Retry automatically.
- Prevent duplicate point application during retry.
- Warn the user if the save cannot be completed after repeated attempts.

## 16. Edge Cases

### Game Point Reached by Mistake

If the user taps the wrong side and reaches game-winning state:

- Confirmation appears.
- User cancels.
- User can undo or continue correction.

### Set Point Reached by Mistake

If the user confirms a game that creates a set-winning state:

- Set confirmation appears.
- User cancels.
- Leaderboard is not updated.

### Manual End Before Set Is Complete

If the user manually ends a set before it reaches a normal set-winning score:

- Show the manual partial set confirmation.
- Calculate the result only if the user explicitly chooses Calculate partial result.
- Disregard the set if the user chooses Disregard.
- Never update individual scoring silently.

### Player Pairing Changes

Player pairings can change only between sets, not during an active set.

### Activity Configuration Changes

Activity configuration should not change after the activity starts.

If changes are needed, the user should end the current activity and start a new one.

### Reload During Pending Confirmation

If the app reloads while a game or set confirmation is open:

- Restore the confirmation from the backend.
- Do not allow additional scoring until the confirmation is resolved.

### Backend Temporarily Unavailable

If the backend is temporarily unavailable:

- The app may keep the latest local score visible.
- The app must clearly show that the score is not safely saved yet.
- The app must retry saving.
- The app must not silently claim the score is saved.

### Second Device Joins Active Session

If a second device joins while a set is active:

- Load the current context, activity, configuration, teams, set score, game score, and pending confirmations.
- Subscribe to future session updates.
- Show the same live scoreboard state as the first device.

### Realtime Connection Interrupted

If realtime updates are interrupted:

- Show reconnecting or offline status.
- Continue to preserve local visible state.
- Fetch the latest backend state when reconnecting.
- Block new scoring if the app cannot guarantee safe ordering.
