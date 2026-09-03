import PadelApp from '../components/padel-app';
import { chatGPTSignOutPath, requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return (
    <PadelApp
      initialUser={{ id: user.userId, displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}
