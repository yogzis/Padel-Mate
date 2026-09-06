'use client';

import Link from 'next/link';
import { useState } from 'react';

export function InviteDecision({ token, inviterName }: { token: string; inviterName: string }) {
  const [outcome, setOutcome] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (action: 'accept-invite' | 'reject-invite') => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/padel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'That invite could not be updated.');
      setOutcome(action === 'accept-invite' ? 'accepted' : 'rejected');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That invite could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  if (outcome === 'accepted') {
    return (
      <>
        <h1>You are now mates</h1>
        <p>You and {inviterName} can now score matches together.</p>
        <Link className="primary-button" href="/">Go to Padel Mate</Link>
      </>
    );
  }

  if (outcome === 'rejected') {
    return (
      <>
        <h1>Invite declined</h1>
        <p>You did not become mates with {inviterName}. This link cannot be used again.</p>
        <Link className="primary-button" href="/">Go to Padel Mate</Link>
      </>
    );
  }

  return (
    <>
      <h1>{inviterName} invited you</h1>
      <p>Accept to become mates and score matches together. You can decline if you do not want this connection.</p>
      {error && <p className="sign-in-error">{error}</p>}
      <div className="invite-actions">
        <button className="primary-button" onClick={() => decide('accept-invite')} disabled={busy}>
          Accept invite
        </button>
        <button className="danger-button" onClick={() => decide('reject-invite')} disabled={busy}>
          Decline
        </button>
      </div>
    </>
  );
}
