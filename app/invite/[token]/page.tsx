import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InviteDecision } from '../../../components/invite-decision';
import { StoreError } from '../../../lib/server/errors';
import { peekMateInvite } from '../../../lib/server/mates';
import { ensurePlayerRecord } from '../../../lib/server/players';
import { getAppUser, SIGN_IN_PATH } from '../../auth-session';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const user = await getAppUser();
  if (!user) redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(`/invite/${token}`)}`);

  await ensurePlayerRecord(user.userId, user.displayName, user.email);

  try {
    const preview = await peekMateInvite(user.userId, token);
    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <InviteDecision token={token} inviterName={preview.inviter.name} />
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof StoreError
      ? error.message
      : 'Something went wrong opening this invite.';
    if (!(error instanceof StoreError)) console.error('Could not open the mate invite', error);

    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <h1>Invite not available</h1>
          <p>{message}</p>
          <Link className="primary-button" href="/">Go to Padel Mate</Link>
        </div>
      </main>
    );
  }
}
