import type { Mate, Player } from './domain';

export type MateCircle = Record<string, string[]>;

export function directedMateKey(fromId: string, toId: string): string {
  return `${fromId}:${toId}`;
}

export function firstMissingMatePair(
  playerIds: readonly string[],
  directedKeys: ReadonlySet<string>,
): readonly [string, string] | null {
  for (let index = 0; index < playerIds.length; index += 1) {
    for (let other = index + 1; other < playerIds.length; other += 1) {
      const leftId = playerIds[index];
      const rightId = playerIds[other];
      const linked = directedKeys.has(directedMateKey(leftId, rightId))
        && directedKeys.has(directedMateKey(rightId, leftId));
      if (!linked) return [leftId, rightId];
    }
  }
  return null;
}

export function isLinkedToEveryone(
  playerId: string,
  selectedIds: readonly string[],
  mateCircle: MateCircle,
): boolean {
  const fellows = new Set(mateCircle[playerId] ?? []);
  return selectedIds.every((selectedId) => selectedId === playerId || fellows.has(selectedId));
}

export function visiblePickerPlayers(
  self: Player,
  selectedIds: readonly string[],
  mates: readonly Mate[],
  mateCircle: MateCircle,
): Player[] {
  const visibleMates = mates.filter((mate) => (
    selectedIds.includes(mate.id) || isLinkedToEveryone(mate.id, selectedIds, mateCircle)
  ));
  return [self, ...visibleMates];
}

export function mateCircleFromEdges(
  playerIds: readonly string[],
  edges: readonly { playerId: string; matePlayerId: string }[],
): MateCircle {
  const circle: MateCircle = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  for (const edge of edges) {
    const fellows = circle[edge.playerId];
    if (!fellows || fellows.includes(edge.matePlayerId)) continue;
    fellows.push(edge.matePlayerId);
  }
  return circle;
}
