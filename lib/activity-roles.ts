import type { LiveActivityState, SetLogEntry } from './domain';
import { isGuestSlot } from './player-identity';

export const MIN_SCORE_CONTROLLERS = 1;
export const MAX_SCORE_CONTROLLERS = 2;

export type CloseOwnedOutcome = 'abandon' | 'finish';
export type ExclusiveReleaseKind = 'close-owned' | 'leave-as-participant';
export type ControllerNormalizeResult =
  | { ok: true; controllerUserIds: string[] }
  | { ok: false; reason: 'count' | 'not-accepted' | 'guest' };

export function parseControllerUserIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const raw = JSON.parse(value) as unknown;
    if (!Array.isArray(raw)) return [];
    const unique: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string' || item.length === 0 || isGuestSlot(item)) continue;
      if (!unique.includes(item)) unique.push(item);
      if (unique.length === MAX_SCORE_CONTROLLERS) break;
    }
    return unique;
  } catch {
    return [];
  }
}

export function controllersOf(
  controllerUserIdsJson: string | null | undefined,
  ownerUserId: string,
): string[] {
  const parsed = parseControllerUserIds(controllerUserIdsJson);
  return parsed.length > 0 ? parsed : [ownerUserId];
}

export function normalizeControllerIds(
  ids: readonly unknown[],
  acceptedPlayerIds: readonly string[],
): ControllerNormalizeResult {
  const unique: string[] = [];
  for (const item of ids) {
    if (typeof item !== 'string' || item.length === 0) continue;
    if (isGuestSlot(item)) return { ok: false, reason: 'guest' };
    if (!unique.includes(item)) unique.push(item);
  }
  if (unique.length < MIN_SCORE_CONTROLLERS || unique.length > MAX_SCORE_CONTROLLERS) {
    return { ok: false, reason: 'count' };
  }
  if (unique.some((id) => !acceptedPlayerIds.includes(id))) {
    return { ok: false, reason: 'not-accepted' };
  }
  return { ok: true, controllerUserIds: unique };
}

export function activityIsPaused(pendingPlayerIds: readonly string[]): boolean {
  return pendingPlayerIds.length > 0;
}

export function closeOwnedOutcome(phase: LiveActivityState['phase']): CloseOwnedOutcome {
  return phase === 'live' ? 'abandon' : 'finish';
}

export function activityIsEnterable(status: string): status is 'active' {
  return status === 'active';
}

export function setLogIsVisible(conclusionType: SetLogEntry['conclusionType']): boolean {
  return conclusionType !== 'abandoned';
}

export function exclusiveReleaseKind(isOwner: boolean): ExclusiveReleaseKind {
  return isOwner ? 'close-owned' : 'leave-as-participant';
}

export function stripController(
  controllerUserIds: readonly string[],
  leavingUserId: string,
  ownerUserId: string,
): string[] {
  const remaining = controllerUserIds.filter((id) => id !== leavingUserId);
  return remaining.length > 0 ? remaining : [ownerUserId];
}

export function toggleControllerSelection(
  current: readonly string[],
  playerId: string,
): string[] | null {
  const selected = new Set(current);
  if (selected.has(playerId)) {
    if (selected.size <= MIN_SCORE_CONTROLLERS) return null;
    selected.delete(playerId);
  } else {
    if (selected.size >= MAX_SCORE_CONTROLLERS) return null;
    selected.add(playerId);
  }
  return [...selected];
}

export function shouldShowLiveScoreboard(options: {
  phase: LiveActivityState['phase'];
}): boolean {
  return options.phase === 'live';
}
