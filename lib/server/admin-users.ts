import { headers } from 'next/headers';
import { auth } from '../auth';

const MAX_USERS_LISTED = 200;

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  isSuspended: boolean;
  suspendedReason: string | null;
  suspendedUntil: string | null;
};

/** Callers are responsible for authorising the request first. */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const { users } = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: MAX_USERS_LISTED, sortBy: 'createdAt', sortDirection: 'desc' },
  });

  return users.map(toAdminUserRow);
}

function toAdminUserRow(user: {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}): AdminUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role ?? null,
    isSuspended: Boolean(user.banned),
    suspendedReason: user.banReason ?? null,
    suspendedUntil: user.banExpires ? user.banExpires.toISOString() : null,
  };
}
