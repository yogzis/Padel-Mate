import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivityConfig, LiveActivityState } from './domain';
import { EMPTY_LIVE_STATE } from './domain';
import { awardPoint, isSetWinningScore, undoPoint, winningPlayerPoints } from './scoring';

const standardConfig: ActivityConfig = {
  deuceRule: 'classic-advantage',
  setWinRule: 'standard-set',
  tieBreakRule: 'standard-tiebreak',
  pointsFormula: 'default-margin',
};

function live(overrides: Partial<LiveActivityState> = {}): LiveActivityState {
  return {
    ...EMPTY_LIVE_STATE,
    phase: 'live',
    activeSetId: 'set-1',
    currentGameId: 'game-1',
    bluePlayerIds: ['a', 'b'],
    redPlayerIds: ['c', 'd'],
    ...overrides,
  };
}

test('normal points progress to a pending game winner', () => {
  let state = live();
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.blueScore, '15');
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.blueScore, '30');
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.blueScore, '40');
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.pendingGameWinner, 'blue');
});

test('classic Advantage is stripped back to deuce', () => {
  let state = live({ blueScore: '40', redScore: '40' });
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.blueScore, 'A');
  state = awardPoint(state, 'red', 'classic-advantage');
  assert.equal(state.blueScore, '40');
  assert.equal(state.redScore, '40');
  assert.equal(state.pendingGameWinner, null);
});

test('Golden Point creates a winner directly from deuce', () => {
  const state = awardPoint(live({ blueScore: '40', redScore: '40' }), 'red', 'golden-point');
  assert.equal(state.pendingGameWinner, 'red');
  assert.equal(state.redScore, '40');
});

test('Star Point becomes decisive after two lost Advantage cycles', () => {
  let state = live({ blueScore: '40', redScore: '40' });
  state = awardPoint(state, 'blue', 'star-point');
  state = awardPoint(state, 'red', 'star-point');
  assert.equal(state.deuceReturnCount, 1);
  assert.equal(state.decisivePointActive, false);
  state = awardPoint(state, 'red', 'star-point');
  state = awardPoint(state, 'blue', 'star-point');
  assert.equal(state.deuceReturnCount, 2);
  assert.equal(state.decisivePointActive, true);
  state = awardPoint(state, 'blue', 'star-point');
  assert.equal(state.pendingGameWinner, 'blue');
});

test('undo restores the previous score and clears a pending winner', () => {
  let state = live({ blueScore: '40', redScore: '15' });
  state = awardPoint(state, 'blue', 'classic-advantage');
  assert.equal(state.pendingGameWinner, 'blue');
  state = undoPoint(state);
  assert.equal(state.blueScore, '40');
  assert.equal(state.redScore, '15');
  assert.equal(state.pendingGameWinner, null);
});

test('standard and short set completion rules are enforced', () => {
  assert.equal(isSetWinningScore(6, 0, standardConfig), 'blue');
  assert.equal(isSetWinningScore(6, 5, standardConfig), null);
  assert.equal(isSetWinningScore(7, 5, standardConfig), 'blue');
  assert.equal(isSetWinningScore(7, 6, standardConfig), 'blue');
  assert.equal(isSetWinningScore(7, 6, { ...standardConfig, tieBreakRule: 'no-tiebreak' }), null);
  assert.equal(isSetWinningScore(8, 6, { ...standardConfig, tieBreakRule: 'no-tiebreak' }), 'blue');
  assert.equal(isSetWinningScore(4, 2, { ...standardConfig, setWinRule: 'short-set' }), 'blue');
  assert.equal(isSetWinningScore(4, 3, { ...standardConfig, setWinRule: 'short-set' }), null);
});

test('winning points use the base plus game margin formula', () => {
  assert.equal(winningPlayerPoints(6, 0), 16);
  assert.equal(winningPlayerPoints(6, 3), 13);
  assert.equal(winningPlayerPoints(7, 5), 12);
  assert.equal(winningPlayerPoints(7, 6), 11);
});
