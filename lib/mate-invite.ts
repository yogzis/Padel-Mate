import { MATE_INVITE_LIFETIME_MS } from './domain';

export function remainingMateInviteMs(createdAt: string, now = Date.now()) {
  return Math.max(0, new Date(createdAt).getTime() + MATE_INVITE_LIFETIME_MS - now);
}

export function formatMateInviteCountdown(remainingMs: number) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
