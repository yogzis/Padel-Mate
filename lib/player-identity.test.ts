import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCH_SLOT_COUNT,
  MIN_REGISTERED_PLAYERS_PER_CONTEXT,
  contextKeyFor,
  guestSlotId,
  isGuestSlot,
  playerNameFrom,
  registeredPlayerIdsOf,
} from './player-identity';

test('the player name prefers the provider display name', () => {
  assert.equal(playerNameFrom('Yogev Ziskind', 'yogzis@gmail.com'), 'Yogev Ziskind');
  assert.equal(playerNameFrom('  Yogev  ', 'yogzis@gmail.com'), 'Yogev');
});

test('the player name falls back to email, then a generic label', () => {
  assert.equal(playerNameFrom('', 'yogzis@gmail.com'), 'yogzis@gmail.com');
  assert.equal(playerNameFrom(null, '  yogzis@gmail.com  '), 'yogzis@gmail.com');
  assert.equal(playerNameFrom(undefined, undefined), 'Player');
  assert.equal(playerNameFrom('   ', ''), 'Player');
});

test('guest slot ids use a prefix no better-auth user id can collide with', () => {
  assert.equal(guestSlotId(1), 'guest:1');
  assert.equal(guestSlotId(2), 'guest:2');
  assert.equal(isGuestSlot('guest:1'), true);
  assert.equal(isGuestSlot('q5tKsHIFabc'), false);
  assert.equal(isGuestSlot('guest'), false);
});

test('the context key is the sorted registered ids and ignores guests', () => {
  const sameLineUp = contextKeyFor(['player-b', 'guest:1', 'player-a', 'guest:2']);
  const differentGuest = contextKeyFor(['player-a', 'player-b', 'guest:1', 'guest:2']);
  const differentOrder = contextKeyFor(['guest:2', 'player-a', 'guest:1', 'player-b']);

  assert.equal(sameLineUp, 'player-a:player-b');
  assert.equal(differentGuest, sameLineUp);
  assert.equal(differentOrder, sameLineUp);
});

test('a different registered line-up produces a different context key', () => {
  assert.notEqual(
    contextKeyFor(['player-a', 'player-b', 'guest:1', 'guest:2']),
    contextKeyFor(['player-a', 'player-c', 'guest:1', 'guest:2']),
  );
});

test('registeredPlayerIdsOf drops guests and keeps the match slot count rule', () => {
  const slots = ['player-a', 'player-b', 'guest:1', 'guest:2'];
  assert.deepEqual(registeredPlayerIdsOf(slots), ['player-a', 'player-b']);
  assert.equal(slots.length, MATCH_SLOT_COUNT);
  assert.ok(registeredPlayerIdsOf(slots).length >= MIN_REGISTERED_PLAYERS_PER_CONTEXT);
});
