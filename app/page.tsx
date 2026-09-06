import PadelApp from '../components/padel-app';
import { requireAppUser } from './auth-session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireAppUser();
  return (
    <PadelApp
      initialUser={{
        id: user.userId,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
      }}
    />
  );
}
