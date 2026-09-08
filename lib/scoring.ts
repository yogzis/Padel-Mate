import type {
  ActivityConfig,
  DeuceRule,
  GameSnapshot,
  LiveActivityState,
  PointScore,
  TeamId,
} from './domain';
import { copy } from '../copy';

const NEXT_SCORE: Record<Exclude<PointScore, '40' | 'A'>, PointScore> = {
  '0': '15',
  '15': '30',
  '30': '40',
};

export function snapshot(state: LiveActivityState): GameSnapshot {
  return {
    blueScore: state.blueScore,
    redScore: state.redScore,
    deuceReturnCount: state.deuceReturnCount,
    decisivePointActive: state.decisivePointActive,
  };
}

export function awardPoint(
  state: LiveActivityState,
  team: TeamId,
  deuceRule: DeuceRule,
): LiveActivityState {
  if (state.phase !== 'live' || state.pendingGameWinner || state.pendingSetWinner) {
    throw new Error(copy.errors.scoringUnavailable);
  }

  const previous = snapshot(state);
  const ownKey = team === 'blue' ? 'blueScore' : 'redScore';
  const opponentKey = team === 'blue' ? 'redScore' : 'blueScore';
  const own = state[ownKey];
  const opponent = state[opponentKey];
  const next: LiveActivityState = {
    ...state,
    history: [...state.history, previous].slice(-30),
  };

  if (own === 'A') {
    next.pendingGameWinner = team;
    return next;
  }

  if (opponent === 'A') {
    next.blueScore = '40';
    next.redScore = '40';
    if (deuceRule === 'star-point') {
      next.deuceReturnCount += 1;
      next.decisivePointActive = next.deuceReturnCount >= 2;
    }
    return next;
  }

  if (own === '40' && opponent === '40') {
    if (deuceRule === 'golden-point' || state.decisivePointActive) {
      next.pendingGameWinner = team;
    } else {
      next[ownKey] = 'A';
    }
    return next;
  }

  if (own === '40') {
    next.pendingGameWinner = team;
    return next;
  }

  next[ownKey] = NEXT_SCORE[own as Exclude<PointScore, '40' | 'A'>];
  return next;
}

export function undoPoint(state: LiveActivityState): LiveActivityState {
  const previous = state.history.at(-1);
  if (!previous) throw new Error(copy.errors.noScoreChangeToUndo);

  return {
    ...state,
    ...previous,
    pendingGameWinner: null,
    history: state.history.slice(0, -1),
  };
}

export function isSetWinningScore(
  blueGames: number,
  redGames: number,
  config: ActivityConfig,
): TeamId | null {
  const target = config.setWinRule === 'standard-set' ? 6 : 4;
  const high = Math.max(blueGames, redGames);
  const low = Math.min(blueGames, redGames);
  const leader: TeamId = blueGames > redGames ? 'blue' : 'red';

  if (high < target) return null;
  if (high - low >= 2) return leader;
  if (config.tieBreakRule !== 'no-tiebreak' && low >= target) return leader;
  return null;
}

const FINISHED_SET_WIN_BONUS = 10;
const PARTIAL_SET_WIN_BONUS = 5;

export function winningPlayerPoints(
  winningGames: number,
  losingGames: number,
  conclusionType: 'normal' | 'manual-partial' = 'normal',
) {
  const winBonus = conclusionType === 'manual-partial'
    ? PARTIAL_SET_WIN_BONUS
    : FINISHED_SET_WIN_BONUS;
  return winBonus + Math.abs(winningGames - losingGames);
}

export function scoreLabel(state: Pick<LiveActivityState, 'blueScore' | 'redScore'>) {
  return `${state.blueScore}-${state.redScore}`;
}
