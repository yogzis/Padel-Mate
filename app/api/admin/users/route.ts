import { headers } from 'next/headers';
import { copy } from '../../../../copy';
import { auth } from '../../../../lib/auth';
import { listAdminUsers } from '../../../../lib/server/admin-users';
import { StoreError } from '../../../../lib/server/store';
import { requireAdminUser } from '../../../auth-session';

export const dynamic = 'force-dynamic';

const SECONDS_PER_DAY = 24 * 60 * 60;

export async function GET() {
  try {
    await requireAdminUser();
    return json({ users: await listAdminUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const userId = requiredString(body.userId, 'userId');

    if (userId === admin.userId) {
      throw new StoreError(400, copy.admin.cannotSuspendSelf);
    }

    if (action === 'suspend') {
      await auth.api.banUser({
        headers: await headers(),
        body: {
          userId,
          banReason: optionalString(body.reason),
          banExpiresIn: toBanSeconds(body.durationDays),
        },
      });
    } else if (action === 'restore') {
      await auth.api.unbanUser({ headers: await headers(), body: { userId } });
    } else {
      throw new StoreError(400, copy.admin.unknownRequest);
    }

    return json({ users: await listAdminUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

/** better-auth expects a duration in seconds; omitting it suspends indefinitely. */
function toBanSeconds(durationDays: unknown): number | undefined {
  if (durationDays === undefined || durationDays === null || durationDays === '') return undefined;

  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw new StoreError(400, copy.admin.suspensionDaysInvalid);
  }
  return Math.round(days * SECONDS_PER_DAY);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new StoreError(400, copy.admin.missingParam(name));
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorResponse(error: unknown) {
  if (error instanceof StoreError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: copy.admin.genericError }, 500);
}
