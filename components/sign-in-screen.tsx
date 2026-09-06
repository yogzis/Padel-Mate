'use client';

import { LogIn, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { authClient } from '../lib/auth-client';

const BANNED_ERROR_CODE = 'banned_user';

export default function SignInScreen({
  errorCode,
  returnPath = '/',
}: {
  errorCode?: string;
  returnPath?: string;
}) {
  const [error, setError] = useState<string | null>(messageForErrorCode(errorCode));
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isSuspended = errorCode?.toLowerCase() === BANNED_ERROR_CODE;

  const signInWithGoogle = async () => {
    setError(null);
    setIsRedirecting(true);

    const { error: signInError } = await authClient.signIn.social({
      provider: 'google',
      // Carries an invite link through sign-up, so a first-time invitee lands
      // back on the invite instead of an empty home screen.
      callbackURL: returnPath,
      // Google redirects back through better-auth, so a rejected sign-in (a
      // suspended account) surfaces here rather than in the promise above.
      errorCallbackURL: '/sign-in',
    });

    if (signInError) {
      setIsRedirecting(false);
      setError(signInError.message ?? 'Could not start sign-in. Please try again.');
    }
  };

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        <span className="brand-mark">
          {isSuspended ? <ShieldOff size={18} /> : <LogIn size={18} />}
        </span>
        <h1>{isSuspended ? 'Account suspended' : 'Padel Mate'}</h1>
        <p>
          {isSuspended
            ? 'Your account is currently suspended. Contact the administrator if you think this is a mistake.'
            : 'Live scoring, shared activity sessions, and group leaderboards.'}
        </p>
        <button className="primary-button" onClick={signInWithGoogle} disabled={isRedirecting}>
          {isRedirecting ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && !isSuspended && <p className="sign-in-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

function messageForErrorCode(errorCode?: string): string | null {
  if (!errorCode) return null;
  if (errorCode.toLowerCase() === BANNED_ERROR_CODE) return null;
  return 'Sign-in did not complete. Please try again.';
}
