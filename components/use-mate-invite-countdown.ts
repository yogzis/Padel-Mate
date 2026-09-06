'use client';

import { useEffect, useState } from 'react';
import { remainingMateInviteMs } from '../lib/mate-invite';

export function useMateInviteCountdown(createdAt: string | undefined) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!createdAt) return;
    const id = window.setInterval(() => setTick((current) => current + 1), 1000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  return createdAt ? remainingMateInviteMs(createdAt) : 0;
}
