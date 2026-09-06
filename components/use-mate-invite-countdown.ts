'use client';

import { useEffect, useState } from 'react';
import { remainingMateInviteMs } from '../lib/mate-invite';

export function useMateInviteCountdown(createdAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!createdAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [createdAt]);

  return createdAt ? remainingMateInviteMs(createdAt, now) : 0;
}
