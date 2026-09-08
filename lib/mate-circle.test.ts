import assert from 'node:assert/strict';
import test from 'node:test';
import type { Mate, Player } from './domain';
import {
  directedMateKey,
  firstMissingMatePair,
  mateCircleFromEdges,
  visiblePickerPlayers,
} from './mate-circle';

const self: Player = { id: 'you', name: 'You', createdAt: '' };
const dana: Mate = { id: 'dana', name: 'Dana', createdAt: '' };
const noam: Mate = { id: 'noam', name: 'Noam', createdAt: '' };
const alex: Mate = { id: 'alex', name: 'Alex', createdAt: '' };
const mates = [dana, noam, alex];

const mateCircle = mateCircleFromEdges(
  ['you', 'dana', 'noam', 'alex'],
  [
    { playerId: 'you', matePlayerId: 'dana' },
    { playerId: 'dana', matePlayerId: 'you' },
    { playerId: 'you', matePlayerId: 'noam' },
    { playerId: 'noam', matePlayerId: 'you' },
    { playerId: 'you', matePlayerId: 'alex' },
    { playerId: 'alex', matePlayerId: 'you' },
    { playerId: 'dana', matePlayerId: 'noam' },
    { playerId: 'noam', matePlayerId: 'dana' },
  ],
);

test('picker hides a mate who is not connected to the current selection', () => {
  const visible = visiblePickerPlayers(self, ['you', 'dana'], mates, mateCircle);
  assert.deepEqual(visible.map((player) => player.id), ['you', 'dana', 'noam']);
});

test('picker keeps a selected mate visible even if they are outside the remaining circle', () => {
  const visible = visiblePickerPlayers(self, ['you', 'alex'], mates, mateCircle);
  assert.deepEqual(visible.map((player) => player.id), ['you', 'alex']);
});

test('first missing pair is the first unordered pair without both directed edges', () => {
  const linked = new Set([
    directedMateKey('you', 'dana'),
    directedMateKey('dana', 'you'),
    directedMateKey('you', 'noam'),
    directedMateKey('noam', 'you'),
  ]);
  assert.deepEqual(firstMissingMatePair(['you', 'dana', 'noam'], linked), ['dana', 'noam']);
  assert.equal(firstMissingMatePair(['you', 'dana'], linked), null);
});
