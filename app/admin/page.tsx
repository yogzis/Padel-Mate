import { redirect } from 'next/navigation';
import AdminUsersScreen from '../../components/admin-users-screen';
import { listAdminUsers } from '../../lib/server/admin-users';
import { requireAppUser } from '../auth-session';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireAppUser();
  if (!user.isAdmin) redirect('/');

  return (
    <AdminUsersScreen currentUserId={user.userId} initialUsers={await listAdminUsers()} />
  );
}
