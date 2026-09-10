import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityIsEnterable,
  activityIsPaused,
  closeOwnedOutcome,
  controllersOf,
  exclusiveReleaseKind,
  normalizeControllerIds,
  setLogIsVisible,
  shouldShowLiveScoreboard,
  stripController,
  toggleControllerSelection,
} from './activity-roles';

test('null or empty controller JSON falls back to the owner', () => {
  assert.deepEqual(controllersOf(null, 'owner-1'), ['owner-1']);
  assert.deepEqual(controllersOf('[]', 'owner-1'), ['owner-1']);
  assert.deepEqual(controllersOf('not-json', 'owner-1'), ['owner-1']);
});

test('stored controller ids are kept, guests dropped, and capped at two', () => {
  assert.deepEqual(
    controllersOf(JSON.stringify(['a', 'b', 'c', 'guest:1']), 'owner-1'),
    ['a', 'b'],
  );
});

test('normalizeControllerIds requires 1-2 accepted registered players', () => {
  const accepted = ['owner-1', 'player-b'];
  assert.deepEqual(
    normalizeControllerIds(['owner-1'], accepted),
    { ok: true, controllerUserIds: ['owner-1'] },
  );
  assert.deepEqual(
    normalizeControllerIds(['owner-1', 'player-b'], accepted),
    { ok: true, controllerUserIds: ['owner-1', 'player-b'] },
  );
  assert.equal(normalizeControllerIds([], accepted).ok, false);
  assert.equal(normalizeControllerIds(['owner-1', 'player-b', 'player-c'], accepted).ok, false);
  assert.deepEqual(
    normalizeControllerIds(['player-c'], accepted),
    { ok: false, reason: 'not-accepted' },
  );
  assert.deepEqual(
    normalizeControllerIds(['guest:1'], accepted),
    { ok: false, reason: 'guest' },
  );
});

test('activity is paused when any registered member lacks consent', () => {
  assert.equal(activityIsPaused([]), false);
  assert.equal(activityIsPaused(['player-c']), true);
});

test('owner close is abandon during a live set and finish otherwise', () => {
  assert.equal(closeOwnedOutcome('live'), 'abandon');
  assert.equal(closeOwnedOutcome('set-setup'), 'finish');
  assert.equal(closeOwnedOutcome('ended'), 'finish');
});

test('only an active activity is enterable', () => {
  assert.equal(activityIsEnterable('active'), true);
  assert.equal(activityIsEnterable('completed'), false);
  assert.equal(activityIsEnterable('abandoned'), false);
});

test('abandoned set-log markers stay hidden; concluded sets stay visible', () => {
  assert.equal(setLogIsVisible('abandoned'), false);
  assert.equal(setLogIsVisible('normal'), true);
  assert.equal(setLogIsVisible('manual-partial'), true);
  assert.equal(setLogIsVisible('disregarded'), true);
});

test('exclusive join closes an owned activity and leaves a participated one', () => {
  assert.equal(exclusiveReleaseKind(true), 'close-owned');
  assert.equal(exclusiveReleaseKind(false), 'leave-as-participant');
});

test('removing the last controller restores the owner', () => {
  assert.deepEqual(stripController(['player-b'], 'player-b', 'owner-1'), ['owner-1']);
  assert.deepEqual(stripController(['owner-1', 'player-b'], 'player-b', 'owner-1'), ['owner-1']);
});

test('live scoreboard is only for a live set', () => {
  assert.equal(shouldShowLiveScoreboard({ phase: 'live' }), true);
  assert.equal(shouldShowLiveScoreboard({ phase: 'set-setup' }), false);
  assert.equal(shouldShowLiveScoreboard({ phase: 'ended' }), false);
});

test('controller toggle keeps at least one and at most two', () => {
  assert.equal(toggleControllerSelection(['owner-1'], 'owner-1'), null);
  assert.deepEqual(toggleControllerSelection(['owner-1'], 'player-b'), ['owner-1', 'player-b']);
  assert.equal(toggleControllerSelection(['owner-1', 'player-b'], 'player-c'), null);
  assert.deepEqual(toggleControllerSelection(['owner-1', 'player-b'], 'player-b'), ['owner-1']);
});
