import { redirect } from 'next/navigation';
import SignInScreen from '../../components/sign-in-screen';
import { getAppUser } from '../auth-session';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  const user = await getAppUser();
  if (user) redirect(safeReturnPath(next));

  return <SignInScreen errorCode={error} returnPath={safeReturnPath(next)} />;
}

/**
 * Only same-site paths may be returned to, so a crafted `next` cannot turn the
 * sign-in screen into an open redirect.
 */
function safeReturnPath(next: string | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
