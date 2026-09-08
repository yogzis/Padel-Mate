'use client';

import { ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { copy } from '../copy';
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
      setError(signInError.message ?? copy.signIn.startFailed);
    }
  };

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        {isSuspended ? (
          <>
            <span className="brand-mark"><ShieldOff size={18} /></span>
            <h1>{copy.signIn.suspendedTitle}</h1>
          </>
        ) : (
          <>
            <img className="sign-in-logo" src="/padel-mate-logo.png" alt="" />
            <h1 className="visually-hidden">{copy.chrome.appName}</h1>
          </>
        )}
        <p>
          {isSuspended
            ? copy.signIn.suspendedBody
            : copy.signIn.tagline}
        </p>
        <button className="primary-button" onClick={signInWithGoogle} disabled={isRedirecting}>
          {isRedirecting ? copy.signIn.redirecting : copy.signIn.continueWithGoogle}
        </button>
        {error && !isSuspended && <p className="sign-in-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

function messageForErrorCode(errorCode?: string): string | null {
  if (!errorCode) return null;
  if (errorCode.toLowerCase() === BANNED_ERROR_CODE) return null;
  return copy.signIn.didNotComplete;
}
