import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_ROLE, isAdminEmail } from '../lib/admin-access';
import { auth } from '../lib/auth';
import { StoreError } from '../lib/server/store';

export const SIGN_IN_PATH = '/sign-in';

const SUSPENDED_MESSAGE = 'Your account is suspended. Contact the administrator.';

/**
 * The shape the app's own code passes around. Deliberately narrower than
 * better-auth's session user so store and UI code stay decoupled from it.
 */
export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  isSuspended: boolean;
};

export async function getAppUser(): Promise<AppUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const { user } = session;
  return {
    userId: user.id,
    displayName: user.name || user.email,
    email: user.email,
    isAdmin: isAdminEmail(user.email) && user.role === ADMIN_ROLE,
    isSuspended: isBanActive(user),
  };
}

/** For pages: sends signed-out visitors to the sign-in screen. */
export async function requireAppUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}

/**
 * For API routes. Banning revokes sessions and blocks new sign-ins, so a
 * suspended user should never reach here; this is a second line of defence in
 * case a ban is ever written straight to the database.
 */
export async function requireActiveUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) throw new StoreError(401, 'Sign in to continue.');
  if (user.isSuspended) throw new StoreError(403, SUSPENDED_MESSAGE);
  return user;
}

export async function requireAdminUser(): Promise<AppUser> {
  const user = await requireActiveUser();
  if (!user.isAdmin) throw new StoreError(403, 'Administrator access required.');
  return user;
}

function isBanActive(user: { banned?: boolean | null; banExpires?: Date | null }): boolean {
  if (!user.banned) return false;
  // An elapsed ban is cleared lazily by better-auth on the next sign-in, so
  // treat it as already lifted rather than locking the user out until then.
  if (user.banExpires && user.banExpires.getTime() <= Date.now()) return false;
  return true;
}
