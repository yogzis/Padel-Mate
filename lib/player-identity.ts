/**
 * Pure rules about who is a player and what a guest slot is.
 *
 * A player and a user account are one identity and share an id. A guest is an
 * anonymous match slot with no account, no history, and no leaderboard entry.
 * Kept free of Worker imports so it can be unit tested under plain Node.
 */

const FALLBACK_PLAYER_NAME = 'Player';

/**
 * The colon matters: better-auth ids are generated from an alphanumeric
 * alphabet, so no real user id can ever be mistaken for a guest slot.
 */
const GUEST_SLOT_PREFIX = 'guest:';

export const MIN_REGISTERED_PLAYERS_PER_CONTEXT = 2;
export const MATCH_SLOT_COUNT = 4;

export function playerNameFrom(displayName: string | null | undefined, email?: string | null): string {
  const trimmedName = displayName?.trim();
  if (trimmedName) return trimmedName;

  const trimmedEmail = email?.trim();
  if (trimmedEmail) return trimmedEmail;

  return FALLBACK_PLAYER_NAME;
}

export function guestSlotId(position: number): string {
  return `${GUEST_SLOT_PREFIX}${position}`;
}

export function isGuestSlot(slotId: string): boolean {
  return slotId.startsWith(GUEST_SLOT_PREFIX);
}

export function registeredPlayerIdsOf(slotIds: readonly string[]): string[] {
  return slotIds.filter((slotId) => !isGuestSlot(slotId));
}

/**
 * The context is defined by its registered players only, so the same mates
 * always reopen the same leaderboard no matter who substitutes.
 */
export function contextKeyFor(slotIds: readonly string[]): string {
  return [...new Set(registeredPlayerIdsOf(slotIds))].sort().join(':');
}
