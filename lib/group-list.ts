import type { ContextSummary } from './domain';

export type GroupListFilter = 'all' | 'can-play' | 'history';
export type GroupListSort = 'last-played' | 'date-created' | 'name';
export type GroupListPrefs = {
  sort: GroupListSort;
  filter: GroupListFilter;
};

export const DEFAULT_GROUP_LIST_SORT: GroupListSort = 'last-played';
export const DEFAULT_GROUP_LIST_FILTER: GroupListFilter = 'all';

const SORT_VALUES: readonly GroupListSort[] = ['last-played', 'date-created', 'name'];
const FILTER_VALUES: readonly GroupListFilter[] = ['all', 'can-play', 'history'];

export function groupListPrefsKey(userId: string): string {
  return `padel-mate-group-list:${userId}`;
}

export function parseGroupListPrefs(raw: string | null): GroupListPrefs {
  if (!raw) {
    return { sort: DEFAULT_GROUP_LIST_SORT, filter: DEFAULT_GROUP_LIST_FILTER };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GroupListPrefs>;
    return {
      sort: isGroupListSort(parsed.sort) ? parsed.sort : DEFAULT_GROUP_LIST_SORT,
      filter: isGroupListFilter(parsed.filter) ? parsed.filter : DEFAULT_GROUP_LIST_FILTER,
    };
  } catch {
    return { sort: DEFAULT_GROUP_LIST_SORT, filter: DEFAULT_GROUP_LIST_FILTER };
  }
}

export function serializeGroupListPrefs(prefs: GroupListPrefs): string {
  return JSON.stringify({ sort: prefs.sort, filter: prefs.filter });
}

function isGroupListSort(value: unknown): value is GroupListSort {
  return typeof value === 'string' && SORT_VALUES.includes(value as GroupListSort);
}

function isGroupListFilter(value: unknown): value is GroupListFilter {
  return typeof value === 'string' && FILTER_VALUES.includes(value as GroupListFilter);
}

export function viewerCanPlayInGroup(
  viewerId: string,
  playerIds: readonly string[],
  mateIds: ReadonlySet<string>,
): boolean {
  return playerIds.every((playerId) => playerId === viewerId || mateIds.has(playerId));
}

export function filterGroupList(
  groups: readonly ContextSummary[],
  options: {
    viewerId: string;
    mateIds: ReadonlySet<string>;
    query: string;
    filter: GroupListFilter;
    sort: GroupListSort;
  },
): ContextSummary[] {
  const needle = options.query.trim().toLowerCase();
  const matched = groups.filter((group) => {
    if (needle && !group.name.toLowerCase().includes(needle)) return false;
    if (options.filter === 'all') return true;
    const canPlay = viewerCanPlayInGroup(options.viewerId, group.playerIds, options.mateIds);
    return options.filter === 'can-play' ? canPlay : !canPlay;
  });

  return [...matched].sort((left, right) => compareGroups(left, right, options.sort));
}

function compareGroups(left: ContextSummary, right: ContextSummary, sort: GroupListSort): number {
  if (sort === 'name') {
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }

  if (sort === 'date-created') {
    return right.createdAt.localeCompare(left.createdAt);
  }

  const lastPlayed = compareLastPlayed(left.lastPlayedAt, right.lastPlayedAt);
  if (lastPlayed !== 0) return lastPlayed;
  return right.createdAt.localeCompare(left.createdAt);
}

function compareLastPlayed(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right.localeCompare(left);
}
