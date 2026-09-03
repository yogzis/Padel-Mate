import { getChatGPTUser } from '../../chatgpt-auth';
import {
  cancelGame,
  cancelSet,
  concludeManualSet,
  confirmGame,
  confirmSet,
  createActivity,
  createPlayer,
  finishActivity,
  getActivity,
  getBootstrap,
  getContext,
  joinActivity,
  leaveActivity,
  linkPlayer,
  scorePoint,
  selectContext,
  setupSet,
  StoreError,
  undoScore,
} from '../../../lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') ?? 'bootstrap';
    let data: unknown;

    if (action === 'bootstrap') {
      data = await getBootstrap(user);
    } else if (action === 'context') {
      data = await getContext(requiredParam(url, 'contextId'));
    } else if (action === 'activity') {
      data = await getActivity(
        requiredParam(url, 'activityId'),
        requiredParam(url, 'deviceId'),
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
    const user = await requireUser();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    let data: unknown;

    switch (action) {
      case 'create-player':
        data = await createPlayer(user, body.name);
        break;
      case 'link-player':
        data = await linkPlayer(user, body.playerId);
        break;
      case 'select-context':
        data = await selectContext(user, body.playerIds);
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

async function requireUser() {
  const user = await getChatGPTUser();
  if (!user) throw new StoreError(401, 'Sign in to continue.');
  return user;
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
