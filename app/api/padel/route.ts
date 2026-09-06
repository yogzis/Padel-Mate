import { requireActiveUser } from '../../auth-session';
import {
  acceptMateInvite,
  createMateInvite,
  deleteOpenMateInvite,
  getOpenMateInvite,
  peekMateInvite,
  rejectMateInvite,
  listMates,
  removeMate,
} from '../../../lib/server/mates';
import {
  cancelGame,
  cancelSet,
  concludeManualSet,
  confirmGame,
  confirmSet,
  createActivity,
  finishActivity,
  getActivity,
  getBootstrap,
  getContext,
  joinActivity,
  leaveActivity,
  scorePoint,
  selectContext,
  setupSet,
  StoreError,
  undoScore,
} from '../../../lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') ?? 'bootstrap';
    let data: unknown;

    if (action === 'bootstrap') {
      data = await getBootstrap(user);
    } else if (action === 'mates') {
      data = await listMates(user.userId);
    } else if (action === 'open-invite') {
      data = await getOpenMateInvite(user.userId);
    } else if (action === 'context') {
      data = await getContext(requiredParam(url, 'contextId'), user.userId);
    } else if (action === 'invite') {
      data = await peekMateInvite(user.userId, requiredParam(url, 'token'));
    } else if (action === 'activity') {
      data = await getActivity(
        requiredParam(url, 'activityId'),
        requiredParam(url, 'deviceId'),
        true,
        user.userId,
      );
    } else {
      throw new StoreError(400, 'Unknown request.');
    }

    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    let data: unknown;

    switch (action) {
      case 'create-invite':
        data = await createMateInvite(user.userId);
        break;
      case 'delete-invite':
        data = await deleteOpenMateInvite(user.userId);
        break;
      case 'accept-invite':
        data = await acceptMateInvite(user.userId, body.token);
        break;
      case 'reject-invite':
        data = await rejectMateInvite(user.userId, body.token);
        break;
      case 'remove-mate':
        data = await removeMate(user.userId, body.matePlayerId);
        break;
      case 'select-context':
        data = await selectContext(user, body.slotIds);
        break;
      case 'create-activity':
        data = await createActivity(user, body.contextId, body.config, body.deviceId);
        break;
      case 'join-activity':
        data = await joinActivity(user, body.activityRef, body.deviceId);
        break;
      case 'setup-set':
        data = await setupSet(user, body.activityId, body.deviceId, body.bluePlayerIds);
        break;
      case 'score-point':
        data = await scorePoint(
          user,
          body.activityId,
          body.deviceId,
          body.team,
          body.clientMutationId,
        );
        break;
      case 'undo':
        data = await undoScore(user, body.activityId, body.deviceId, body.clientMutationId);
        break;
      case 'confirm-game':
        data = await confirmGame(body.activityId, body.deviceId);
        break;
      case 'cancel-game':
        data = await cancelGame(user, body.activityId, body.deviceId, body.clientMutationId);
        break;
      case 'confirm-set':
        data = await confirmSet(body.activityId, body.deviceId);
        break;
      case 'cancel-set':
        data = await cancelSet(body.activityId, body.deviceId);
        break;
      case 'manual-set':
        data = await concludeManualSet(body.activityId, body.deviceId, body.choice);
        break;
      case 'finish-activity':
        data = await finishActivity(body.activityId, body.deviceId);
        break;
      case 'leave-activity':
        data = await leaveActivity(body.activityId, body.deviceId);
        break;
      default:
        throw new StoreError(400, 'Unknown request.');
    }

    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

function requiredParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  if (!value) throw new StoreError(400, `Missing ${name}.`);
  return value;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof StoreError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: 'Something went wrong while saving. Please try again.' }, 500);
}
