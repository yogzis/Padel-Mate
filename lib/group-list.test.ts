import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContextSummary } from './domain';
import {
  filterGroupList,
  parseGroupListPrefs,
  viewerCanPlayInGroup,
} from './group-list';

const viewerId = 'you';
const mateIds = new Set(['dana', 'noam']);

function group(overrides: Partial<ContextSummary> & Pick<ContextSummary, 'id' | 'name' | 'playerIds'>): ContextSummary {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    lastPlayedAt: null,
    ...overrides,
  };
}

const groups: ContextSummary[] = [
  group({
    id: 'played-late',
    name: 'You, Dana',
    playerIds: ['you', 'dana'],
    createdAt: '2026-01-02T00:00:00.000Z',
    lastPlayedAt: '2026-03-01T00:00:00.000Z',
  }),
  group({
    id: 'played-early',
    name: 'You, Noam',
    playerIds: ['you', 'noam'],
    createdAt: '2026-01-03T00:00:00.000Z',
    lastPlayedAt: '2026-02-01T00:00:00.000Z',
  }),
  group({
    id: 'never-played',
    name: 'Alex group',
    playerIds: ['you', 'dana', 'alex'],
    createdAt: '2026-04-01T00:00:00.000Z',
  }),
  group({
    id: 'history-named',
    name: 'Weekend crew',
    playerIds: ['you', 'alex'],
    createdAt: '2026-01-04T00:00:00.000Z',
    lastPlayedAt: '2026-05-01T00:00:00.000Z',
  }),
];

test('a group is playable when every other member is still a mate', () => {
  assert.equal(viewerCanPlayInGroup(viewerId, ['you', 'dana'], mateIds), true);
  assert.equal(viewerCanPlayInGroup(viewerId, ['you', 'dana', 'alex'], mateIds), false);
});

test('search ignores case and trims the query', () => {
  const found = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '  WEEKEND  ',
    filter: 'all',
    sort: 'name',
  });
  assert.deepEqual(found.map((item) => item.id), ['history-named']);
});

test('Can play vs History follows whether every other member is a mate of the viewer', () => {
  const playable = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '',
    filter: 'can-play',
    sort: 'name',
  });
  const history = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '',
    filter: 'history',
    sort: 'name',
  });
  assert.deepEqual(playable.map((item) => item.id), ['played-late', 'played-early']);
  assert.deepEqual(history.map((item) => item.id), ['never-played', 'history-named']);
});

test('last played sorts never-played groups last', () => {
  const ordered = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '',
    filter: 'all',
    sort: 'last-played',
  });
  assert.deepEqual(ordered.map((item) => item.id), [
    'history-named',
    'played-late',
    'played-early',
    'never-played',
  ]);
});

test('date created sorts newest first and name sort is case-insensitive', () => {
  const byCreated = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '',
    filter: 'all',
    sort: 'date-created',
  });
  assert.equal(byCreated[0].id, 'never-played');

  const byName = filterGroupList(groups, {
    viewerId,
    mateIds,
    query: '',
    filter: 'all',
    sort: 'name',
  });
  assert.deepEqual(byName.map((item) => item.name), [
    'Alex group',
    'Weekend crew',
    'You, Dana',
    'You, Noam',
  ]);
});

test('missing group list prefs use Last played and All', () => {
  assert.deepEqual(parseGroupListPrefs(null), { sort: 'last-played', filter: 'all' });
});

test('junk group list prefs use Last played and All', () => {
  assert.deepEqual(parseGroupListPrefs('{not json'), { sort: 'last-played', filter: 'all' });
  assert.deepEqual(parseGroupListPrefs('[]'), { sort: 'last-played', filter: 'all' });
});

test('unknown enum values fall back per field', () => {
  assert.deepEqual(
    parseGroupListPrefs(JSON.stringify({ sort: 'popular', filter: 'history' })),
    { sort: 'last-played', filter: 'history' },
  );
  assert.deepEqual(
    parseGroupListPrefs(JSON.stringify({ sort: 'name', filter: 'favorites' })),
    { sort: 'name', filter: 'all' },
  );
});

test('a valid stored pair is kept', () => {
  assert.deepEqual(
    parseGroupListPrefs(JSON.stringify({ sort: 'date-created', filter: 'history' })),
    { sort: 'date-created', filter: 'history' },
  );
});
