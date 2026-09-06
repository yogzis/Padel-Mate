import { redirect } from 'next/navigation';
import { GoHomeButton } from '../../../components/go-home-button';
import { InviteDecision } from '../../../components/invite-decision';
import { StoreError } from '../../../lib/server/errors';
import { peekMateInvite } from '../../../lib/server/mates';
import { ensurePlayerRecord } from '../../../lib/server/players';
import { getAppUser, SIGN_IN_PATH } from '../../auth-session';

export const dynamic = 'force-dynamic';

type InvitePreview =
  | { ok: true; inviterName: string }
  | { ok: false; message: string };

async function loadInvitePreview(playerId: string, token: string): Promise<InvitePreview> {
  try {
    const preview = await peekMateInvite(playerId, token);
    return { ok: true, inviterName: preview.inviter.name };
  } catch (error) {
    if (!(error instanceof StoreError)) console.error('Could not open the mate invite', error);
    return {
      ok: false,
      message: error instanceof StoreError
        ? error.message
        : 'Something went wrong opening this invite.',
    };
  }
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const user = await getAppUser();
  if (!user) redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(`/invite/${token}`)}`);

  await ensurePlayerRecord(user.userId, user.displayName, user.email);

  const preview = await loadInvitePreview(user.userId, token);

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        {preview.ok ? (
          <InviteDecision token={token} inviterName={preview.inviterName} />
        ) : (
          <>
            <h1>Invite not available</h1>
            <p>{preview.message}</p>
            <GoHomeButton />
          </>
        )}
      </div>
    </main>
  );
}
