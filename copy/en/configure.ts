export const configure = {
  back: 'Back to group',
  eyebrow: 'New activity',
  title: 'Choose the match rules',
  intro: 'These settings stay fixed for every set in this activity.',
  deuceRule: 'Deuce rule',
  setLength: 'Set length',
  tiedSet: 'Tied set',
  playerPoints: 'Player points',
  playerPointsBody: 'Winning players receive 10 points plus the set score difference. Losing players receive 0. A set ended early still counts as a win, with half that bonus plus the same difference.',
  createActivity: 'Create activity',
  deuce: {
    starPoint: {
      label: 'Star Point',
      description: 'After two lost Advantage cycles, the next deuce point decides the game.',
    },
    classicAdvantage: {
      label: 'Classic Advantage',
      description: 'At 40-40, win two points in a row. Losing Advantage returns the game to deuce.',
    },
    goldenPoint: {
      label: 'Golden Point',
      description: 'At 40-40, the next point wins the game.',
    },
  },
  set: {
    standard: {
      label: 'Standard set',
      description: 'First to 6 games, leading by 2. The selected tie-break rule applies at 6-6.',
    },
    short: {
      label: 'Short set',
      description: 'First to 4 games, leading by 2. A good fit when court time is limited.',
    },
  },
  tieBreak: {
    standard: {
      label: 'Standard tie-break',
      description: 'At the tied limit, play the deciding tie-break and record the set as 7-6 or 5-4.',
    },
    decidingGame: {
      label: 'Deciding game',
      description: 'At the tied limit, the next confirmed game wins the set.',
    },
    none: {
      label: 'No tie-break',
      description: 'Continue playing until one team leads by 2 games.',
    },
  },
};
