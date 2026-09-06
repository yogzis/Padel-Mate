# Padel Scoreboard App - Implementation Requirements Checklist

## 1. Product Readiness Checklist

- [x] User must sign in before accessing app data.
- [x] Google Sign-In is available as the MVP auth provider.
- [x] Signup is open: a first-time Google sign-in grants access with no approval step.
- [x] Administrator is identified only by `ADMIN_EMAIL`, with no promote-in-UI path.
- [x] Administrator can list all accounts with their current status.
- [x] Administrator can suspend an account for a set number of days or until lifted.
- [x] Administrator can record an optional reason for a suspension.
- [x] Administrator can restore a suspended account.
- [x] Suspending an account revokes its active sessions immediately.
- [x] A suspended user is refused at sign-in and sees an account-suspended screen.
- [x] A time-limited suspension lifts itself when it expires.
- [x] Administrator cannot suspend their own account.
- [x] Non-administrators are refused by every administration endpoint.
- [x] Signing in creates a player automatically, with no profile step and no linking step.
- [x] User can generate a single-use invite link that expires.
- [x] Opening a valid invite link while signed in shows who sent it and asks to accept or decline.
- [x] Accepting an invite creates the mate relationship both ways.
- [x] Declining an invite consumes the link and does not create a mate relationship.
- [x] Expired, already-used, and self-issued invite links are refused with a clear reason.
- [x] User can view and remove mates.
- [x] Removing a mate leaves existing shared contexts visible as history.
- [x] New activity is blocked when any registered member is no longer a mate.
- [x] The app offers no way to search or browse other users.
- [x] User fills four match slots from mates and guest slots.
- [x] At least two slots must be registered mates.
- [x] Guest slots play and appear in set logs but never rank.
- [x] A registered player partnered with a guest still earns full points.
- [x] App automatically identifies existing context or creates a new one from the registered players only.
- [ ] Context dashboard displays only the selected context.
- [x] The group leaderboard has an info hint that explains points, guests, columns, and sort order.
- [x] A user only sees contexts they belong to.
- [x] Context dashboard displays the last 5 numbered activity session set logs by activity number and date. Empty sessions do not occupy that window.
- [ ] Activity cannot start without required configuration.
- [x] Star Point is listed first and selected by default on the activity configuration screen.
- [ ] Every activity configuration setting includes a UI explanation.
- [ ] User can select teams before every set.
- [ ] Players can mix team pairings between sets.
- [ ] UI is designed primarily for mobile phone use.
- [x] Context dashboard cards stay inside the page width with all leaderboard columns and set-log names visible.
- [ ] Live scoreboard supports vertical portrait orientation.
- [ ] Live scoreboard supports horizontal landscape orientation.
- [ ] Live scoreboard displays Blue and Red teams clearly.
- [x] Portrait set score sits on each team's color, with the leader emphasized.
- [ ] Advantage scoring is displayed as A.
- [ ] Advantage is stripped automatically when the other team wins the point.
- [ ] Every live score update is saved to the backend.
- [ ] Live scoreboard shows whether the latest score is saved.
- [ ] Reload restores the latest active score from the backend.
- [ ] User can share an active activity session with another device.
- [ ] Share action can create WhatsApp-friendly or plain-text invite message.
- [x] Creating an activity records the host as accepted.
- [x] Entering a code or opening a share link records consent for a registered member.
- [x] A registered member can accept when both device slots are taken.
- [x] Start set stays disabled until every registered member has accepted.
- [x] Set setup shows every registered member as In or Pending. Guests are not listed.
- [x] A live activity the viewer has not accepted offers Join instead of Resume scoring.
- [x] The open context dashboard polls every 5 seconds so a newly created activity offers Join without a page reload.
- [x] A browser refresh returns to the last open scoring group unless the user had gone back to Groups or Mates.
- [x] An activity is numbered only after the first set starts. Empty sessions do not take a number.
- [x] A finished activity sends the user to that context dashboard instead of leaving them on the activity screen.
- [ ] A second device can join the shared activity session.
- [x] A third registered member can accept without occupying a device slot.
- [ ] Connected device can leave or log out to release its slot.
- [ ] Unexpected disconnect reserves the slot for 1-2 minutes.
- [ ] Unconcluded activity with all devices disconnected is abandoned after 3 hours.
- [ ] Abandoned activity preserves latest score snapshot without leaderboard impact.
- [ ] Score updates on one device appear on the other connected device.
- [ ] Shared session connection status is visible.
- [ ] Current-game score update history is available from the live scoreboard.
- [ ] Current-game history entries use labels such as `Yoni's device`.
- [ ] Game completion requires confirmation.
- [ ] Set completion requires confirmation.
- [ ] User can manually end an unfinished set.
- [ ] Manually ended unfinished set asks whether to calculate or disregard.
- [ ] Disregarded unfinished set does not update the leaderboard.
- [ ] Leaderboard updates only after confirmed set completion.

## 2. Engineering Checklist

- [x] Domain types are explicitly defined.
- [x] A player shares its identifier with the user account, while devices stay separate.
- [x] The player record survives account removal so history keeps its names.
- [x] Guest slot identifiers cannot collide with a real user id.
- [x] Auth providers are modeled separately from user accounts (better-auth `account` table).
- [x] Database schema is created only by Drizzle migrations, never at runtime.
- [x] Authorization guards are centralised and applied to every API route.
- [x] Secrets are kept out of source control and out of `wrangler.jsonc`.
- [x] Deploys are automated from the `production` branch and run migrations first.
- [ ] Scoring engine is separated from UI.
- [x] Context engine creates deterministic context keys.
- [ ] Leaderboard calculation is separated from UI.
- [ ] Backend persistence is handled by a dedicated persistence layer.
- [ ] Local persistence is used only as a recovery cache.
- [ ] Configuration is stored with the activity.
- [ ] Undo uses score history snapshots.
- [ ] Score event saves are idempotent.
- [ ] Active game restore blocks new scoring until complete.
- [ ] In-game persistence does not update set results or individual scoring by itself.
- [ ] Realtime session updates use backend-accepted event ordering.
- [ ] Connected devices converge to the same active score state.
- [ ] Reconnecting devices fetch latest backend state before accepting score input.
- [ ] Session capacity logic counts connected and reserved device slots.
- [x] Activity consent is stored separately from device slots.
- [x] createActivity re-checks that registered members are still mates of the host.
- [x] setupSet refuses until every registered member has a consent row.
- [x] Activity log retention keeps the latest 5 numbered activity session logs per context. Empty sessions do not occupy that window.
- [ ] Activity log purging does not alter leaderboard aggregates.
- [ ] Invalid state transitions are guarded.
- [ ] Unit tests cover scoring edge cases.
- [ ] Unit tests cover leaderboard calculation.
- [ ] Manual QA covers mobile portrait scoreboard readability.
- [ ] Manual QA covers mobile landscape scoreboard readability.
- [ ] Manual QA covers desktop scoreboard readability as a secondary experience.

## 3. Required Unit Test Cases

### Authentication, Player and Mate Tests

- [ ] Unauthenticated user cannot view contexts.
- [ ] Unauthenticated user cannot view past activities.
- [ ] Unauthenticated user cannot invite or manage mates.
- [ ] Google sign-in creates or loads a user account.
- [x] The configured `ADMIN_EMAIL` is matched case-insensitively and ignoring padding.
- [x] Any other email is denied admin access.
- [x] Nobody is an admin when `ADMIN_EMAIL` is unset.
- [x] The admin role hook overrides the admin plugin's default role.
- [ ] A suspended user is refused at sign-in.
- [ ] An expired suspension allows sign-in again.
- [x] First sign-in creates the player row with the same id as the user.
- [x] Bootstrap recreates a missing player row idempotently.
- [ ] An invite link works exactly once.
- [ ] An expired invite link is refused.
- [ ] A self-issued invite link is refused.

### Context Tests

- [x] Same registered players in different order produce the same context key.
- [x] Different player combination produces a different context key.
- [x] Guest slots do not affect the context key.
- [ ] Fewer than two registered players is refused.
- [ ] Guests receive no leaderboard entry while their partner scores normally.
- [ ] Existing context is reused.
- [ ] Missing context is created.

### Classic Advantage Tests

- [ ] 40-40 plus Blue point becomes Blue A.
- [ ] Blue A plus Blue point creates pending Blue game winner.
- [ ] Blue A plus Red point returns to 40-40.
- [ ] Red A plus Blue point returns to 40-40.

### Golden Point Tests

- [ ] 40-40 plus Blue point creates pending Blue game winner.
- [ ] 40-40 plus Red point creates pending Red game winner.
- [ ] No Advantage state is displayed in Golden Point mode.

### Star Point Tests

- [ ] First lost Advantage returns to 40-40.
- [ ] Second lost Advantage activates Star Point.
- [ ] Star Point plus Blue point creates pending Blue game winner.
- [ ] Star Point plus Red point creates pending Red game winner.

### Game Confirmation Tests

- [ ] Pending game winner does not update set score before confirmation.
- [ ] Confirming game increments set games.
- [ ] Canceling game does not increment set games.
- [ ] Confirming game resets current game score.

### Set Confirmation Tests

- [ ] Pending set winner does not update leaderboard before confirmation.
- [ ] Confirming set updates leaderboard.
- [ ] Canceling set does not update leaderboard.
- [ ] Confirming set allows new set setup.

### Manual Early Set Tests

- [ ] Manual end on unfinished non-tied set shows calculate/disregard/continue options.
- [ ] Calculate partial result chooses the team leading in current set games.
- [ ] Calculate partial result applies individual scoring from the current set score.
- [x] A calculated partial set awards 5 points plus the game difference, not the finished-set 10-point bonus.
- [ ] Disregard closes or discards the set without leaderboard changes.
- [ ] Tied partial score cannot be calculated automatically.
- [ ] Manually calculated set is marked as manual partial in history.

### Backend Persistence Tests

- [ ] Every point tap creates a backend score event.
- [ ] Advantage stripping is saved as the latest backend state.
- [ ] Pending game winner is restored after reload.
- [ ] Pending set winner is restored after reload.
- [ ] Duplicate mutation ID does not apply the same point twice.
- [ ] Failed save shows retry-needed status.
- [ ] Successful retry returns the scoreboard to saved status.
- [ ] Reload during active game restores the latest saved score.
- [ ] Reload blocks new scoring until restore completes.

### Shared Session Tests

- [ ] Host can generate or display a share link or session code.
- [ ] Host can generate a WhatsApp-friendly or plain-text invite message.
- [ ] Second device can join an active activity session.
- [x] Third registered member can accept when 2 device slots are connected or reserved.
- [x] Accepting when slots are full does not occupy a live device slot.
- [x] A person outside the context cannot accept or join.
- [ ] Explicit leave releases a device slot immediately.
- [ ] Unexpected disconnect reserves the slot for 1-2 minutes.
- [ ] Reconnect during the reservation window reclaims the slot.
- [ ] Reservation expiry allows a different device to join.
- [ ] All devices disconnected for 3 hours marks unconcluded activity as abandoned.
- [ ] Abandoned activity does not update leaderboard automatically.
- [ ] Abandoned activity can later be reopened for manual calculate-or-disregard decision.
- [ ] Joined device loads context, activity, teams, set score, game score, and configuration.
- [ ] Point scored on device A appears on device B.
- [ ] Point scored on device B appears on device A.
- [ ] Game confirmation opened on one device appears or is reflected on the other device.
- [ ] Set confirmation opened on one device appears or is reflected on the other device.
- [ ] Manual partial set conclusion on one device appears or is reflected on the other device.
- [ ] Reconnected device fetches latest backend state before allowing scoring.
- [ ] Near-simultaneous taps from two devices are applied in backend order.
- [ ] Duplicate or stale realtime events are ignored safely.

### History and Retention Tests

- [ ] Current-game history modal shows only the active current game.
- [ ] Both connected devices can open the current-game history modal.
- [ ] History entries include timestamp, action, previous score, next score, and user/device label.
- [ ] History entries use signed-in user display names in labels.
- [ ] New game resets the visible current-game history.
- [x] Context Dashboard shows only the latest 5 numbered activity session set logs.
- [ ] Older detailed logs can be purged per context.
- [ ] Current leaderboard totals remain intact after old detailed logs are purged.
- [ ] Set Setup page shows only the current activity session set log.

### Leaderboard Tests

- [ ] 6-0 win gives 16 points to each winning player.
- [ ] 6-3 win gives 13 points to each winning player.
- [ ] 7-5 win gives 12 points to each winning player.
- [x] 4-2 manual partial gives 7 points to each winning player.
- [x] 5-0 manual partial gives 10 points to each winning player.
- [ ] Losing players receive 0 points in MVP formula.
- [ ] Games won, games lost, and differential update correctly.
- [ ] Leaderboard sorting follows the defined sort order.

## 4. UI Acceptance Checklist

- [ ] Primary scoring numbers are large and readable.
- [ ] Blue and Red teams are visually distinct.
- [ ] Player names are visible under each team.
- [ ] Buttons are large enough for touch.
- [x] On phones, Groups and Mates are available from the header menu.
- [ ] Confirmation dialogs clearly state the consequence.
- [ ] The activity configuration screen explains each option.
- [ ] The app prevents starting a set with invalid teams.
- [ ] The Set Setup page displays the current activity session set log.
- [ ] The Context Dashboard displays retained set logs grouped by activity number and date.
- [x] Context dashboard cards stay inside the page width with all leaderboard columns and set-log names visible.
- [x] The group leaderboard info icon opens a scoring hint and closes when the user taps outside.
- [ ] The live scoreboard has a clear saved/saving/retry-needed indicator.
- [ ] The live scoreboard has a clear connected/reconnecting/offline indicator.
- [ ] The live scoreboard has a clear score history button.
- [ ] The app clearly warns when the latest score is not safely saved.
- [ ] Color is supported by labels, not used alone.
- [ ] Scoreboard works on mobile portrait.
- [ ] Scoreboard works on mobile landscape.
- [ ] Rotating between portrait and landscape does not reset scoring state.
- [ ] Pending confirmations remain visible after orientation change.
- [ ] Scoreboard works on desktop as a secondary experience.
