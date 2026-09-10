'use client';

import { ArrowLeft, ShieldCheck, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { copy } from '../copy';
import { AppFooter } from './app-footer';
import type { AdminUserRow } from '../lib/server/admin-users';

type AdminResponse = { users?: AdminUserRow[]; error?: string };

const ADMIN_USERS_ENDPOINT = '/api/admin/users';

export default function AdminUsersScreen({
  currentUserId,
  initialUsers,
}: {
  currentUserId: string;
  initialUsers: AdminUserRow[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const submitChange = async (body: Record<string, unknown>) => {
    setPendingUserId(String(body.userId));

    const response = await fetch(ADMIN_USERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as AdminResponse;
    setPendingUserId(null);

    if (!response.ok) {
      setError(payload.error ?? copy.admin.updateFailed);
      return;
    }
    setError(null);
    setUsers(payload.users ?? []);
  };

  const suspend = (user: AdminUserRow) => {
    const days = window.prompt(
      copy.admin.suspendPrompt(user.email),
      '7',
    );
    if (days === null) return;

    const reason = window.prompt(copy.admin.reasonOptional) ?? '';
    void submitChange({ action: 'suspend', userId: user.id, durationDays: days.trim(), reason });
  };

  const restore = (user: AdminUserRow) => {
    void submitChange({ action: 'restore', userId: user.id });
  };

  return (
    <div className="app-shell">
      <div className="page-content narrow-page">
        <Link className="back-button" href="/"><ArrowLeft size={16} /> {copy.admin.back}</Link>
        <div className="page-heading">
          <div>
            <span className="eyebrow">{copy.admin.eyebrow}</span>
            <h1>{copy.admin.title}</h1>
          </div>
        </div>

        {error && <p className="sign-in-error" role="alert">{error}</p>}

        <div className="player-directory">
          {users.map((user) => (
            <div className="directory-row" key={user.id}>
              <span className={`avatar ${user.isSuspended ? 'avatar-2' : 'avatar-1'}`}>
                {initials(user.name || user.email)}
              </span>
              <div className="group-copy">
                <strong>{user.name || user.email}</strong>
                <small>{user.email}</small>
                <small>{describeStatus(user)}</small>
              </div>
              {user.id === currentUserId ? (
                <span className="linked-label"><ShieldCheck size={14} /> {copy.chrome.you}</span>
              ) : user.isSuspended ? (
                <button
                  className="secondary-button"
                  disabled={pendingUserId === user.id}
                  onClick={() => restore(user)}
                >
                  <ShieldCheck size={15} /> {copy.admin.restore}
                </button>
              ) : (
                <button
                  className="danger-button"
                  disabled={pendingUserId === user.id}
                  onClick={() => suspend(user)}
                >
                  <ShieldOff size={15} /> {copy.admin.suspend}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}

function describeStatus(user: AdminUserRow): string {
  if (!user.isSuspended) return user.role === 'admin' ? copy.admin.administrator : copy.admin.active;

  const until = user.suspendedUntil
    ? copy.admin.untilDate(new Date(user.suspendedUntil).toLocaleDateString())
    : copy.admin.untilLifted;
  return user.suspendedReason
    ? copy.admin.suspendedWithReason(until, user.suspendedReason)
    : copy.admin.suspended(until);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
