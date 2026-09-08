'use client';

import { useState } from 'react';
import { copy } from '../copy';
import { GoHomeButton } from './go-home-button';

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
      if (!response.ok) throw new Error(payload.error ?? copy.errors.inviteCouldNotUpdate);
      setOutcome(action === 'accept-invite' ? 'accepted' : 'rejected');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.errors.inviteCouldNotUpdate);
    } finally {
      setBusy(false);
    }
  };

  if (outcome === 'accepted') {
    return (
      <>
        <h1>{copy.invite.nowMatesTitle}</h1>
        <p>{copy.invite.nowMatesBody(inviterName)}</p>
        <GoHomeButton href="/?screen=mates">{copy.invite.goToMates}</GoHomeButton>
      </>
    );
  }

  if (outcome === 'rejected') {
    return (
      <>
        <h1>{copy.invite.declinedTitle}</h1>
        <p>{copy.invite.declinedBody(inviterName)}</p>
        <GoHomeButton />
      </>
    );
  }

  return (
    <>
      <h1>{copy.invite.invitedYou(inviterName)}</h1>
      <p>{copy.invite.acceptBody}</p>
      {error && <p className="sign-in-error">{error}</p>}
      <div className="invite-actions">
        <button className="primary-button" onClick={() => decide('accept-invite')} disabled={busy}>
          {copy.invite.accept}
        </button>
        <button className="danger-button" onClick={() => decide('reject-invite')} disabled={busy}>
          {copy.invite.decline}
        </button>
      </div>
    </>
  );
}
