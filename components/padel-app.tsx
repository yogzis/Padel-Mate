'use client';

import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Info,
  Link2,
  LogOut,
  Medal,
  Menu,
  Plus,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Signal,
  Smartphone,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityConfig,
  ContextSummary,
  LeaderboardEntry,
  LiveActivityState,
  Mate,
  MateInviteLink,
  Player,
  ScoreEvent,
  SetLogEntry,
  TeamId,
} from '../lib/domain';
import { authClient } from '../lib/auth-client';
import {
  MATCH_SLOT_COUNT,
  MIN_REGISTERED_PLAYERS_PER_CONTEXT,
  guestSlotId,
  isGuestSlot,
} from '../lib/player-identity';
import { formatMateInviteCountdown } from '../lib/mate-invite';
import { awardPoint } from '../lib/scoring';
import { ShareInviteDialog } from './share-invite-dialog';
import { useMateInviteCountdown } from './use-mate-invite-countdown';

type AppUser = { id: string; displayName: string; email: string; isAdmin: boolean };
type BootstrapData = { user: AppUser; mates: Mate[]; contexts: ContextSummary[] };
type ContextData = {
  context: ContextSummary;
  players: Player[];
  leaderboard: LeaderboardEntry[];
  logs: SetLogEntry[];
  activities: Array<{
    id: string;
    activityNumber: number | null;
    status: string;
    startedAt: string;
    updatedAt: string;
    shareCode: string;
    viewerAccepted: boolean;
  }>;
  canCreateActivity: boolean;
};
type ActivityData = {
  activity: {
    id: string;
    contextId: string;
    activityNumber: number | null;
    status: 'active' | 'completed' | 'abandoned';
    config: ActivityConfig;
    shareCode: string;
    state: LiveActivityState;
    version: number;
    startedAt: string;
    updatedAt: string;
    abandonedAt: string | null;
  };
  context: ContextSummary;
  players: Player[];
  devices: Array<{
    deviceId: string;
    deviceLabel: string;
    role: string;
    slotStatus: string;
    lastSeenAt: string;
    reservedUntil: string | null;
  }>;
  logs: SetLogEntry[];
  history: ScoreEvent[];
  acceptedPlayerIds: string[];
  pendingPlayerIds: string[];
};
type Screen = 'groups' | 'mates' | 'context' | 'configure' | 'set-setup' | 'scoreboard';
type SaveStatus = 'saved' | 'saving' | 'retry' | 'offline';

function landingScreen(): Screen {
  if (typeof window === 'undefined') return 'groups';
  const params = new URLSearchParams(window.location.search);
  if (!params.get('join') && params.get('screen') === 'mates') return 'mates';
  return 'groups';
}

const LIVE_POLL_MS = 1500;
const SETUP_POLL_MS = 5_000;
const LAST_CONTEXT_KEY = 'padel-mate-last-context-id';

const DEFAULT_CONFIG: ActivityConfig = {
  deuceRule: 'star-point',
  setWinRule: 'standard-set',
  tieBreakRule: 'standard-tiebreak',
  pointsFormula: 'default-margin',
};

const DEUCE_OPTIONS = [
  {
    value: 'star-point' as const,
    label: 'Star Point',
    description: 'After two lost Advantage cycles, the next deuce point decides the game.',
  },
  {
    value: 'classic-advantage' as const,
    label: 'Classic Advantage',
    description: 'At 40-40, win two points in a row. Losing Advantage returns the game to deuce.',
  },
  {
    value: 'golden-point' as const,
    label: 'Golden Point',
    description: 'At 40-40, the next point wins the game.',
  },
];

const SET_OPTIONS = [
  {
    value: 'standard-set' as const,
    label: 'Standard set',
    description: 'First to 6 games, leading by 2. The selected tie-break rule applies at 6-6.',
  },
  {
    value: 'short-set' as const,
    label: 'Short set',
    description: 'First to 4 games, leading by 2. A good fit when court time is limited.',
  },
];

const TIEBREAK_OPTIONS = [
  {
    value: 'standard-tiebreak' as const,
    label: 'Standard tie-break',
    description: 'At the tied limit, play the deciding tie-break and record the set as 7-6 or 5-4.',
  },
  {
    value: 'deciding-game' as const,
    label: 'Deciding game',
    description: 'At the tied limit, the next confirmed game wins the set.',
  },
  {
    value: 'no-tiebreak' as const,
    label: 'No tie-break',
    description: 'Continue playing until one team leads by 2 games.',
  },
];

export default function PadelApp({ initialUser }: { initialUser: AppUser }) {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [contextData, setContextData] = useState<ContextData | null>(null);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);
  const [screen, setScreen] = useState<Screen>(landingScreen);
  const [deviceId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const existing = localStorage.getItem('padel-mate-device-id');
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem('padel-mate-device-id', created);
    return created;
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([initialUser.id]);
  const [invite, setInvite] = useState<MateInviteLink | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [config, setConfig] = useState<ActivityConfig>(DEFAULT_CONFIG);
  const [bluePlayerIds, setBluePlayerIds] = useState<string[]>([]);
  const [modal, setModal] = useState<'history' | 'share' | 'mate-invite' | 'replace-invite' | 'manual' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matesRefreshing, setMatesRefreshing] = useState(false);
  const resumeAttempted = useRef(false);
  const inviteRemainingMs = useMateInviteCountdown(invite?.createdAt);
  const liveInvite = invite && inviteRemainingMs > 0 ? invite : null;

  const loadBootstrap = useCallback(async () => {
    const data = await apiGet<BootstrapData>('bootstrap');
    setBootstrap(data);
    setSelectedPlayerIds((current) => keepSelectablePlayerIds(current, data.user.id, data.mates));
  }, []);

  const refreshMates = useCallback(async () => {
    setMatesRefreshing(true);
    setError('');
    try {
      const [mates, openInvite] = await Promise.all([
        apiGet<Mate[]>('mates'),
        apiGet<MateInviteLink | null>('open-invite'),
      ]);
      setBootstrap((current) => (current ? { ...current, mates } : current));
      setInvite(openInvite);
      setSelectedPlayerIds((current) => keepSelectablePlayerIds(current, initialUser.id, mates));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setMatesRefreshing(false);
    }
  }, [initialUser.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadBootstrap().catch((caught) => setError(messageOf(caught)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBootstrap]);

  const openContext = useCallback(async (contextId: string) => {
    setBusy(true);
    setError('');
    try {
      const data = await apiGet<ContextData>('context', { contextId });
      setContextData(data);
      rememberContext(data.context.id);
      setScreen('context');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshContext = useCallback(async (contextId: string) => {
    try {
      const data = await apiGet<ContextData>('context', { contextId });
      setContextData((current) => {
        if (!current || current.context.id !== contextId) return current;
        return data;
      });
    } catch {
      // Keep the last good dashboard snapshot if a poll fails.
    }
  }, []);

  const returnToContext = useCallback(async (
    contextId: string,
    activityId: string,
    noticeText = 'This activity has already finished.',
  ) => {
    forgetActivity(activityId);
    setActivityData(null);
    setModal(null);
    await loadBootstrap().catch(() => undefined);
    await openContext(contextId);
    setNotice(noticeText);
  }, [loadBootstrap, openContext]);

  const activeActivityId = activityData?.activity.status === 'active' ? activityData.activity.id : null;
  const pollMs = activityData?.activity.status === 'active' && activityData.activity.state.phase === 'live'
    ? LIVE_POLL_MS
    : SETUP_POLL_MS;

  const refreshActivity = useCallback(async () => {
    if (!activeActivityId || !deviceId) return null;
    try {
      const fresh = await apiGet<ActivityData>('activity', {
        activityId: activeActivityId,
        deviceId,
      });
      if (fresh.activity.status === 'completed') {
        await returnToContext(fresh.activity.contextId, fresh.activity.id);
        return fresh;
      }
      rememberActivity(fresh);
      setActivityData((current) => {
        if (current && fresh.activity.version < current.activity.version) return current;
        return fresh;
      });
      setSaveStatus('saved');
      if (fresh.activity.status === 'active' && fresh.activity.state.phase === 'live') {
        setScreen('scoreboard');
      } else if (fresh.activity.status === 'active' && fresh.activity.state.phase === 'set-setup') {
        setScreen((current) => (current === 'scoreboard' ? 'set-setup' : current));
      }
      return fresh;
    } catch {
      setSaveStatus('offline');
      return null;
    }
  }, [activeActivityId, deviceId, returnToContext]);

  useEffect(() => {
    if (!activeActivityId || !deviceId) return;
    const id = window.setInterval(() => {
      void refreshActivity();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [activeActivityId, deviceId, pollMs, refreshActivity]);

  useEffect(() => {
    if (screen !== 'context' || !contextData?.context.id) return;
    const contextId = contextData.context.id;
    const pollDashboard = () => {
      void refreshContext(contextId);
    };
    const id = window.setInterval(pollDashboard, SETUP_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') pollDashboard();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [contextData?.context.id, refreshContext, screen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const createOrOpenContext = async () => {
    if (selectedPlayerIds.length < MIN_REGISTERED_PLAYERS_PER_CONTEXT) {
      setError('Choose at least one mate so two registered players are in the match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await apiPost<ContextData>({ action: 'select-context', slotIds: slotIdsFor(selectedPlayerIds) });
      setContextData(data);
      rememberContext(data.context.id);
      await loadBootstrap();
      setScreen('context');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    setBusy(true);
    setError('');
    const replacing = Boolean(liveInvite);
    try {
      const created = await apiPost<MateInviteLink>({ action: 'create-invite' });
      setInvite(created);
      setModal('mate-invite');
      setNotice(replacing
        ? 'New invite link ready. The previous link no longer works.'
        : 'Invite link ready. Share it directly with the person you want to play with.');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const deleteInvite = async () => {
    setBusy(true);
    setError('');
    try {
      await apiPost({ action: 'delete-invite' });
      setInvite(null);
      setModal(null);
      setNotice('Invite link deleted.');
    } catch (caught) {
      setError(messageOf(caught));
      await refreshMates().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const removeMate = async (matePlayerId: string) => {
    setBusy(true);
    setError('');
    try {
      await apiPost({ action: 'remove-mate', matePlayerId });
      await loadBootstrap();
      setSelectedPlayerIds((current) => current.filter((id) => id !== matePlayerId));
      setNotice('Mate removed.');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const createActivity = async () => {
    if (!contextData || !deviceId) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiPost<ActivityData>({
        action: 'create-activity',
        contextId: contextData.context.id,
        config,
        deviceId,
      });
      setActivityData(data);
      rememberActivity(data);
      setBluePlayerIds(firstTwoSlotIds(data.players));
      setScreen('set-setup');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const joinActivity = useCallback(async (reference = joinCode) => {
    if (!reference.trim() || !deviceId) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiPost<ActivityData>({
        action: 'join-activity',
        activityRef: reference.trim(),
        deviceId,
      });
      if (data.activity.status === 'completed') {
        await returnToContext(data.activity.contextId, data.activity.id);
        setJoinCode('');
        return data;
      }
      setActivityData(data);
      rememberActivity(data);
      setContextData(null);
      setBluePlayerIds(data.activity.state.bluePlayerIds.length === 2
        ? data.activity.state.bluePlayerIds
        : firstTwoSlotIds(data.players));
      setScreen(data.activity.state.phase === 'live' ? 'scoreboard' : 'set-setup');
      if (data.activity.status === 'abandoned' && data.activity.state.phase === 'live') {
        setModal('manual');
        setNotice('Review the saved partial set before continuing.');
      }
      setJoinCode('');
      return data;
    } catch (caught) {
      setError(messageOf(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [deviceId, joinCode, returnToContext]);

  useEffect(() => {
    if (!deviceId || !bootstrap) return;
    if (resumeAttempted.current) return;
    resumeAttempted.current = true;
    const params = new URLSearchParams(window.location.search);
    const sharedCode = params.get('join');
    const requestedScreen = params.get('screen');
    if (!sharedCode && requestedScreen === 'mates') {
      window.history.replaceState({}, '', window.location.pathname);
      forgetContext();
      const timer = window.setTimeout(() => {
        void refreshMates();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const savedActivityId = localStorage.getItem('padel-mate-last-activity-id');
    const savedContextId = localStorage.getItem(LAST_CONTEXT_KEY);
    const reference = sharedCode ?? savedActivityId;
    const restoreLastContext = () => {
      if (savedContextId) void openContext(savedContextId);
    };
    if (!reference) {
      restoreLastContext();
      return;
    }
    if (sharedCode) window.history.replaceState({}, '', window.location.pathname);
    const timer = window.setTimeout(() => {
      joinActivity(reference).then((joined) => {
        if (joined) return;
        if (savedActivityId) {
          const cached = localStorage.getItem(`padel-mate-recovery-${savedActivityId}`);
          if (cached) {
            try {
              const restored = JSON.parse(cached) as ActivityData;
              if (restored.activity.status === 'completed') {
                void returnToContext(restored.activity.contextId, restored.activity.id);
                return;
              }
              setActivityData(restored);
              setSaveStatus('offline');
              setScreen(restored.activity.state.phase === 'live' ? 'scoreboard' : 'set-setup');
              return;
            } catch {
              localStorage.removeItem(`padel-mate-recovery-${savedActivityId}`);
            }
          }
        }
        restoreLastContext();
      });
    }, 0);
    // The share code should be consumed only once after bootstrap.
    return () => window.clearTimeout(timer);
  }, [deviceId, bootstrap, joinActivity, openContext, refreshMates, returnToContext]);

  const startSet = async () => {
    if (!activityData || bluePlayerIds.length !== 2) return;
    await activityAction('setup-set', { bluePlayerIds }, 'scoreboard');
  };

  const activityAction = async (
    action: string,
    fields: Record<string, unknown> = {},
    nextScreen?: Screen,
  ) => {
    if (!activityData) return null;
    setBusy(true);
    setSaveStatus('saving');
    setError('');
    try {
      const data = await apiPost<ActivityData>({
        action,
        activityId: activityData.activity.id,
        deviceId,
        ...fields,
      });
      setActivityData(data);
      rememberActivity(data);
      setSaveStatus('saved');
      if (nextScreen) setScreen(nextScreen);
      return data;
    } catch (caught) {
      setSaveStatus('retry');
      setError(messageOf(caught));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addPoint = async (team: TeamId) => {
    if (!activityData || busy || saveStatus === 'offline') return;
    const mutationId = crypto.randomUUID();
    const current = activityData;
    try {
      const optimistic = awardPoint(current.activity.state, team, current.activity.config.deuceRule);
      const optimisticData = {
        ...current,
        activity: {
          ...current.activity,
          state: optimistic,
          version: current.activity.version + 1,
        },
      };
      setActivityData(optimisticData);
      rememberActivity(optimisticData);
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }

    setSaveStatus('saving');
    setBusy(true);
    const payload = {
      action: 'score-point',
      activityId: current.activity.id,
      deviceId,
      team,
      clientMutationId: mutationId,
    };
    try {
      let saved: ActivityData;
      try {
        saved = await apiPost<ActivityData>(payload);
      } catch {
        setSaveStatus('retry');
        await delay(700);
        saved = await apiPost<ActivityData>(payload);
      }
      setActivityData(saved);
      rememberActivity(saved);
      setSaveStatus('saved');
    } catch (caught) {
      setSaveStatus('retry');
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const finishActivity = async () => {
    if (!activityData) return;
    setBusy(true);
    try {
      await apiPost({ action: 'finish-activity', activityId: activityData.activity.id, deviceId });
      await returnToContext(
        activityData.activity.contextId,
        activityData.activity.id,
        'Activity finished and saved.',
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const leaveActivity = async () => {
    if (!activityData) return;
    try {
      await apiPost({ action: 'leave-activity', activityId: activityData.activity.id, deviceId });
    } finally {
      forgetActivity(activityData.activity.id);
      forgetContext();
      setActivityData(null);
      setContextData(null);
      setMenuOpen(false);
      await loadBootstrap().catch(() => undefined);
      setScreen('groups');
    }
  };

  const navigate = (next: Screen) => {
    if (activityData?.activity.status === 'active' && next !== 'scoreboard' && next !== 'set-setup') {
      setNotice('Leave or finish the live activity before switching sections.');
      return;
    }
    setMenuOpen(false);
    if (next === 'groups' || next === 'mates') {
      forgetContext();
      if (next === 'groups') setContextData(null);
    }
    setScreen(next);
    if (next === 'mates') void refreshMates();
  };

  const currentUser = bootstrap?.user ?? initialUser;

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = '/sign-in';
  };

  const main = (() => {
    if (!bootstrap) return <LoadingView />;
    if (screen === 'mates') {
      return (
        <MatesView
          mates={bootstrap.mates}
          invite={liveInvite}
          remainingMs={inviteRemainingMs}
          onCreateInvite={createInvite}
          onShowInvite={() => setModal('mate-invite')}
          onRequestReplaceInvite={() => setModal('replace-invite')}
          onDeleteInvite={deleteInvite}
          onRemove={removeMate}
          onRefresh={refreshMates}
          busy={busy}
          matesRefreshing={matesRefreshing}
        />
      );
    }
    if (screen === 'context' && contextData) {
      return <ContextDashboard data={contextData} onNewActivity={() => setScreen('configure')} onOpenActivity={joinActivity} />;
    }
    if (screen === 'configure' && contextData) {
      return (
        <ConfigurationView
          config={config}
          onChange={setConfig}
          onBack={() => {
            setScreen('context');
            void refreshContext(contextData.context.id);
          }}
          onStart={createActivity}
          busy={busy}
        />
      );
    }
    if (screen === 'set-setup' && activityData) {
      return (
        <SetSetupView
          data={activityData}
          blueIds={bluePlayerIds}
          onBlueChange={setBluePlayerIds}
          onStart={startSet}
          onShare={() => setModal('share')}
          onRefresh={async () => {
            setBusy(true);
            setError('');
            try {
              const fresh = await refreshActivity();
              if (fresh) setNotice('Activity updated.');
            } finally {
              setBusy(false);
            }
          }}
          onFinish={finishActivity}
          busy={busy}
        />
      );
    }
    if (screen === 'scoreboard' && activityData) {
      return (
        <Scoreboard
          data={activityData}
          status={saveStatus}
          busy={busy}
          onPoint={addPoint}
          onUndo={() => activityAction('undo', { clientMutationId: crypto.randomUUID() })}
          onHistory={() => setModal('history')}
          onShare={() => setModal('share')}
          onManual={() => setModal('manual')}
          onLeave={leaveActivity}
        />
      );
    }
    return (
      <GroupsView
        bootstrap={bootstrap}
        selectedIds={selectedPlayerIds}
        onToggle={(id) => setSelectedPlayerIds((current) => toggleRegistered(current, id, currentUser.id))}
        onContinue={createOrOpenContext}
        onOpen={openContext}
        joinCode={joinCode}
        onJoinCode={setJoinCode}
        onJoin={() => joinActivity()}
        onInviteMates={() => navigate('mates')}
        busy={busy}
      />
    );
  })();

  return (
    <div className={`app-shell ${screen === 'scoreboard' ? 'scoreboard-shell' : ''}`}>
      <AppHeader
        user={currentUser}
        onSignOut={signOut}
        screen={screen}
        activity={activityData}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((value) => !value)}
        onNavigate={navigate}
        onLeave={leaveActivity}
      />
      {error && (
        <div className="alert-bar" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss message" onClick={() => setError('')}><X size={17} /></button>
        </div>
      )}
      {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}</div>}
      {main}

      {activityData?.activity.state.pendingGameWinner && (
        <ConfirmDialog
          title={`${teamName(activityData.activity.state.pendingGameWinner)} won this game`}
          description="Update the set score and begin a fresh game?"
          confirmLabel="Update set score"
          onConfirm={() => activityAction('confirm-game')}
          onCancel={() => activityAction('cancel-game', { clientMutationId: crypto.randomUUID() })}
          busy={busy}
        />
      )}

      {activityData?.activity.state.pendingSetWinner && (
        <ConfirmDialog
          title={`${teamName(activityData.activity.state.pendingSetWinner)} won the set`}
          description={`Final set score: ${activityData.activity.state.blueGames}-${activityData.activity.state.redGames}. Confirm to update this group's leaderboard.`}
          confirmLabel="Update leaderboard"
          onConfirm={async () => {
            const result = await activityAction('confirm-set');
            if (result) {
              setBluePlayerIds(firstTwoSlotIds(result.players));
              setScreen('set-setup');
            }
          }}
          onCancel={() => activityAction('cancel-set')}
          busy={busy}
        />
      )}

      {modal === 'history' && activityData && (
        <HistoryModal data={activityData} onClose={() => setModal(null)} />
      )}
      {modal === 'share' && activityData && (
        <ShareInviteDialog
          title="Invite the second device"
          description="Only two connected or reserved devices can use this activity."
          valueLabel="Session code"
          displayValue={activityData.activity.shareCode}
          copyValue={`${window.location.origin}/?join=${activityData.activity.shareCode}`}
          whatsappMessage={`Join Padel Mate ${activityTitle(activityData.activity.activityNumber).toLowerCase()}. ${window.location.origin}/?join=${activityData.activity.shareCode}`}
          devices={activityData.devices}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'mate-invite' && liveInvite && (
        <ShareInviteDialog
          title="Invite a mate"
          description="Share this single-use link. There is no directory to search."
          valueLabel="Invite link"
          displayValue={liveInvite.url}
          copyValue={liveInvite.url}
          whatsappMessage={`Join me on Padel Mate: ${liveInvite.url}`}
          valueStyle="link"
          expiryLabel={`Expires in ${formatMateInviteCountdown(inviteRemainingMs)}`}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'replace-invite' && liveInvite && (
        <ConfirmDialog
          title="Replace this invite link?"
          description="Creating a new link deletes the current one. Anyone with the old link will not be able to use it."
          confirmLabel="Create new invite"
          cancelLabel="Cancel"
          onConfirm={() => void createInvite()}
          onCancel={() => setModal(null)}
          busy={busy}
        />
      )}
      {modal === 'manual' && activityData && (
        <ManualSetDialog
          data={activityData}
          busy={busy}
          onClose={() => setModal(null)}
          onChoose={async (choice) => {
            const result = await activityAction('manual-set', { choice });
            if (result) {
              setModal(null);
              setBluePlayerIds(firstTwoSlotIds(result.players));
              setScreen('set-setup');
            }
          }}
        />
      )}
    </div>
  );
}

function AppHeader({
  user,
  onSignOut,
  screen,
  activity,
  menuOpen,
  onMenu,
  onNavigate,
  onLeave,
}: {
  user: AppUser;
  onSignOut: () => void;
  screen: Screen;
  activity: ActivityData | null;
  menuOpen: boolean;
  onMenu: () => void;
  onNavigate: (screen: Screen) => void;
  onLeave: () => void;
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="brand" onClick={() => onNavigate('groups')} aria-label="Padel Mate home">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span>Padel Mate</span>
        </button>

        <nav className="desktop-nav" aria-label="Main navigation">
          <button className={screen === 'groups' || screen === 'context' ? 'active' : ''} onClick={() => onNavigate('groups')}>Groups</button>
          <button className={screen === 'mates' ? 'active' : ''} onClick={() => onNavigate('mates')}>Mates</button>
        </nav>

        <div className="header-actions">
          {activity?.activity.status === 'active' && (
            <button className="live-pill" onClick={() => onNavigate(activity.activity.state.phase === 'live' ? 'scoreboard' : 'set-setup')}>
              <span /> {activityTitle(activity.activity.activityNumber)}
            </button>
          )}
          <button className="menu-button" onClick={onMenu} aria-label="Open menu" aria-expanded={menuOpen}>
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="account-menu">
              <div className="account-row">
                <span className="avatar avatar-1">{initials(user.displayName)}</span>
                <div><strong>{displayName(user.displayName)}</strong><small>{user.email}</small></div>
              </div>
              <nav className="menu-nav" aria-label="Main navigation">
                <button className={screen === 'groups' || screen === 'context' ? 'active' : ''} onClick={() => onNavigate('groups')}>
                  <Users size={17} /> Groups
                </button>
                <button className={screen === 'mates' ? 'active' : ''} onClick={() => onNavigate('mates')}>
                  <UsersRound size={17} /> Mates
                </button>
              </nav>
              {user.isAdmin && <a href="/admin"><ShieldCheck size={17} /> Manage accounts</a>}
              {activity?.activity.status === 'active' && <button onClick={onLeave}><LogOut size={17} /> Leave activity</button>}
              <button onClick={onSignOut}><LogOut size={17} /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function GroupsView({
  bootstrap,
  selectedIds,
  onToggle,
  onContinue,
  onOpen,
  joinCode,
  onJoinCode,
  onJoin,
  onInviteMates,
  busy,
}: {
  bootstrap: BootstrapData;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onOpen: (id: string) => void;
  joinCode: string;
  onJoinCode: (value: string) => void;
  onJoin: () => void;
  onInviteMates: () => void;
  busy: boolean;
}) {
  const selectable = selectablePlayers(bootstrap);
  const canOpen = selectedIds.length >= MIN_REGISTERED_PLAYERS_PER_CONTEXT;

  return (
    <main className="page-content">
      <section className="page-heading">
        <div><span className="eyebrow">Scoring groups</span><h1>Choose your court crew</h1></div>
        <div className="join-box">
          <label htmlFor="join-code">Join activity</label>
          <div><input id="join-code" value={joinCode} onChange={(event) => onJoinCode(event.target.value.toUpperCase())} placeholder="6-digit code" maxLength={8} /><button onClick={onJoin} disabled={!joinCode || busy}>Join</button></div>
        </div>
      </section>

      {bootstrap.contexts.length > 0 && (
        <section className="section-band">
          <div className="section-title"><h2>Your scoring groups</h2><span>{bootstrap.contexts.length}</span></div>
          <div className="group-list">
            {bootstrap.contexts.map((context) => (
              <button key={context.id} className="group-row" onClick={() => onOpen(context.id)}>
                <div className="avatar-stack">{context.playerIds.slice(0, 4).map((id, index) => (
                  <span key={id} className={`avatar avatar-${index + 1}`}>{initials(nameForContextMember(bootstrap, id))}</span>
                ))}</div>
                <div className="group-copy"><strong>{context.name}</strong><span>{context.playerIds.length} registered{context.playerIds.length < MATCH_SLOT_COUNT ? ` · ${MATCH_SLOT_COUNT - context.playerIds.length} guest${MATCH_SLOT_COUNT - context.playerIds.length > 1 ? 's' : ''}` : ''}</span></div>
                <ChevronRight size={20} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="context-builder">
        <div className="builder-heading">
          <div><h2>Create or find a scoring group</h2><p>Pick two to four people. If you pick fewer than four, the remaining court spots are guests and do not rank.</p></div>
          <span className={canOpen ? 'selection-count complete' : 'selection-count'}>{selectedIds.length} of 2–4 selected</span>
        </div>
        {bootstrap.mates.length === 0 ? (
          <div className="empty-state"><UsersRound size={28} /><h3>Invite a mate to start scoring</h3><p>A match needs at least two registered players. Guests can fill the other slots.</p><button className="primary-button" onClick={onInviteMates}><UserPlus size={18} /> Invite mates</button></div>
        ) : (
          <>
            <div className="player-pick-grid">
              {selectable.map((player, index) => {
                const selected = selectedIds.includes(player.id);
                const isYou = player.id === bootstrap.user.id;
                return (
                  <button
                    key={player.id}
                    className={`player-pick ${selected ? 'selected' : ''}`}
                    onClick={() => onToggle(player.id)}
                    disabled={isYou || (!selected && selectedIds.length === MATCH_SLOT_COUNT)}
                  >
                    <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
                    <span><strong>{player.name}</strong><small>{isYou ? 'You' : 'Mate'}</small></span>
                    <span className="check-circle">{selected && <Check size={15} />}</span>
                  </button>
                );
              })}
            </div>
            <div className="builder-actions">
              <button className="secondary-button" onClick={onInviteMates}><UserPlus size={18} /> Invite mates</button>
              <button className="primary-button" disabled={!canOpen || busy} onClick={onContinue}>Open scoreboard <ChevronRight size={18} /></button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function MatesView({
  mates,
  invite,
  remainingMs,
  onCreateInvite,
  onShowInvite,
  onRequestReplaceInvite,
  onDeleteInvite,
  onRemove,
  onRefresh,
  busy,
  matesRefreshing,
}: {
  mates: Mate[];
  invite: MateInviteLink | null;
  remainingMs: number;
  onCreateInvite: () => void;
  onShowInvite: () => void;
  onRequestReplaceInvite: () => void;
  onDeleteInvite: () => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
  matesRefreshing: boolean;
}) {
  return (
    <main className="page-content narrow-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">My padel mates</span>
          <h1>People you can score with</h1>
          <p>Share a single-use invite link. There is no directory to search.</p>
        </div>
      </section>
      <section className="add-player-band">
        <label>Invite link</label>
        {invite ? (
          <>
            <div className="invite-actions">
              <div className="invite-actions-main">
                <button className="primary-button" onClick={onShowInvite}><Link2 size={18} /> Show current invite link</button>
                <button className="secondary-button" onClick={onRequestReplaceInvite} disabled={busy}>
                  <Link2 size={18} /> Create new invite
                </button>
              </div>
              <button
                type="button"
                className="icon-text-button invite-delete"
                onClick={onDeleteInvite}
                disabled={busy}
                aria-label="Delete invite link"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <p className="invite-expiry">Expires in {formatMateInviteCountdown(remainingMs)}</p>
          </>
        ) : (
          <div>
            <button className="primary-button" onClick={onCreateInvite} disabled={busy}><Link2 size={18} /> Create invite link</button>
          </div>
        )}
      </section>
      <section className="player-directory">
        <div className="section-title">
          <h2>Mates</h2>
          <div className="section-title-actions">
            <span>{mates.length}</span>
            <button className="icon-text-button" onClick={onRefresh} disabled={matesRefreshing}>
              <RefreshCw size={18} /> Refresh
            </button>
          </div>
        </div>
        {mates.length === 0 ? (
          <div className="empty-line">No mates yet. Share an invite link to add someone.</div>
        ) : mates.map((mate, index) => (
          <div className="directory-row" key={mate.id}>
            <span className={`avatar avatar-${index % 4 + 1}`}>{initials(mate.name)}</span>
            <div><strong>{mate.name}</strong><small>Can join your scoring groups</small></div>
            <button className="quiet-button" onClick={() => onRemove(mate.id)} disabled={busy}><UserMinus size={15} /> Remove</button>
          </div>
        ))}
      </section>
    </main>
  );
}

function LeaderboardHint() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="leaderboard-hint" ref={rootRef}>
      <button
        type="button"
        className={open ? 'leaderboard-hint-button open' : 'leaderboard-hint-button'}
        aria-expanded={open}
        aria-controls="leaderboard-hint-popover"
        aria-label="How leaderboard scoring works"
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={16} />
      </button>
      {open && (
        <div
          id="leaderboard-hint-popover"
          className="leaderboard-hint-popover"
          role="dialog"
          aria-labelledby="leaderboard-hint-title"
        >
          <h3 id="leaderboard-hint-title">How leaderboard scoring works</h3>
          <p>Points are added only after a set is confirmed. Live scoring does not change this table.</p>
          <p>Winning players receive 10 points plus the game difference. Losing players receive 0.</p>
          <p>A set ended early still counts as a win, with half the 10-point bonus plus the same difference.</p>
          <pre>
            {`6-3 → 13 points each
7-6 → 11 points each
4-2 early → 7 points each`}
          </pre>
          <p>Guests never rank. A registered player whose partner is a guest still earns full points.</p>
          <dl>
            <div><dt>W-L</dt><dd>Sets won and lost</dd></div>
            <div><dt>Diff</dt><dd>Game differential</dd></div>
            <div><dt>Points</dt><dd>Running total</dd></div>
          </dl>
          <p>Rank is by points, then sets won, then differential, then games won, then name.</p>
        </div>
      )}
    </div>
  );
}

function ContextDashboard({ data, onNewActivity, onOpenActivity }: {
  data: ContextData;
  onNewActivity: () => void;
  onOpenActivity: (id: string) => void;
}) {
  const logsByActivity = useMemo(() => groupLogs(data.logs), [data.logs]);
  const recoverableActivity = data.activities.find((activity) => activity.status === 'active')
    ?? data.activities.find((activity) => activity.status === 'abandoned');
  return (
    <main className="page-content">
      <section className="context-topline">
        <div><span className="eyebrow">Scoring context</span><h1>{groupName(data.players)}</h1><p>{data.players.map((player) => player.name).join(' · ')}</p></div>
        {data.canCreateActivity ? (
          <button className="primary-button" onClick={onNewActivity}><Plus size={19} /> New activity</button>
        ) : (
          <p className="history-only-note">This group is history only. A former mate must be invited again before new scores can start.</p>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="leaderboard-panel">
          <div className="panel-heading">
            <div>
              <Trophy size={20} />
              <h2>Group leaderboard</h2>
              <LeaderboardHint />
            </div>
            <span>{data.leaderboard.length ? data.leaderboard.reduce((sum, entry) => sum + entry.setsPlayed, 0) / data.leaderboard.length : 0} sets</span>
          </div>
          <div className="leaderboard-table">
            <div className="leaderboard-head"><span>#</span><span>Player</span><span>W-L</span><span>Diff</span><span>Points</span></div>
            {data.leaderboard.map((entry, index) => (
              <div className="leaderboard-row" key={entry.playerId}>
                <span className={`rank rank-${index + 1}`}>{index + 1}</span>
                <div><span className={`avatar avatar-${index % 4 + 1}`}>{initials(entry.playerName)}</span><span><strong>{entry.playerName}</strong><small>{entry.gamesWon}-{entry.gamesLost} games</small></span></div>
                <span>{entry.setsWon}-{entry.setsLost}</span>
                <span>{signed(entry.gameDifferential)}</span>
                <strong>{entry.totalPoints}</strong>
              </div>
            ))}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="players-strip">
            <div className="panel-heading"><div><UsersRound size={19} /><h2>Players</h2></div></div>
            <div>{data.players.map((player, index) => <span key={player.id}><span className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span><small>{player.name}</small></span>)}</div>
          </section>
          {recoverableActivity && (
            <section className="resume-panel">
              <span className="live-dot"><span /> {recoverableActivity.status === 'active' ? 'Live activity' : 'Saved partial activity'}</span>
              <h3>{activityTitle(recoverableActivity.activityNumber)}</h3>
              <button className="secondary-button" onClick={() => onOpenActivity(recoverableActivity.id)}>
                {recoverableActivity.status !== 'active'
                  ? 'Review result'
                  : recoverableActivity.viewerAccepted ? 'Resume scoring' : 'Join'}
                {' '}<ChevronRight size={17} />
              </button>
            </section>
          )}
        </aside>
      </div>

      <section className="activity-history">
        <div className="section-title"><h2>Recent set log</h2><span>Last 5 activities</span></div>
        {logsByActivity.length === 0 ? <div className="empty-line">Completed sets will appear here.</div> : logsByActivity.map((group) => (
          <div className="activity-log" key={group.activityId}>
            <div className="activity-log-title"><div><strong>Activity #{group.activityNumber}</strong><span>{formatDate(group.date)}</span></div><span>{group.logs.length} {group.logs.length === 1 ? 'set' : 'sets'}</span></div>
            <div className="set-log-list">{group.logs.map((log) => <SetLogRow key={log.id} log={log} players={data.players} />)}</div>
          </div>
        ))}
      </section>
    </main>
  );
}

function ConfigurationView({ config, onChange, onBack, onStart, busy }: {
  config: ActivityConfig;
  onChange: (config: ActivityConfig) => void;
  onBack: () => void;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <main className="page-content setup-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Back to group</button>
      <section className="page-heading"><div><span className="eyebrow">New activity</span><h1>Choose the match rules</h1><p>These settings stay fixed for every set in this activity.</p></div></section>
      <SettingGroup title="Deuce rule" icon={<Activity size={19} />} options={DEUCE_OPTIONS} value={config.deuceRule} onChange={(value) => onChange({ ...config, deuceRule: value })} />
      <SettingGroup title="Set length" icon={<Medal size={19} />} options={SET_OPTIONS} value={config.setWinRule} onChange={(value) => onChange({ ...config, setWinRule: value })} />
      <SettingGroup title="Tied set" icon={<RotateCcw size={19} />} options={TIEBREAK_OPTIONS} value={config.tieBreakRule} onChange={(value) => onChange({ ...config, tieBreakRule: value })} />
      <section className="points-rule"><ShieldCheck size={20} /><div><strong>Player points</strong><p>Winning players receive 10 points plus the set score difference. Losing players receive 0. A set ended early still counts as a win, with half that bonus plus the same difference.</p></div></section>
      <div className="sticky-action"><button className="primary-button" onClick={onStart} disabled={busy}>Create activity <ChevronRight size={18} /></button></div>
    </main>
  );
}

function SettingGroup<T extends string>({ title, icon, options, value, onChange }: {
  title: string;
  icon: React.ReactNode;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="setting-group">
      <legend>{icon}<span>{title}</span></legend>
      <div className="setting-options">
        {options.map((option) => (
          <label key={option.value} className={value === option.value ? 'selected' : ''}>
            <input type="radio" name={title} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="radio-mark">{value === option.value && <Check size={14} />}</span>
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SetSetupView({ data, blueIds, onBlueChange, onStart, onShare, onRefresh, onFinish, busy }: {
  data: ActivityData;
  blueIds: string[];
  onBlueChange: (ids: string[]) => void;
  onStart: () => void;
  onShare: () => void;
  onRefresh: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const slots = matchSlotsFrom(data.players);
  const redPlayers = slots.filter((player) => !blueIds.includes(player.id));
  const bluePlayers = slots.filter((player) => blueIds.includes(player.id));
  const registeredPlayers = data.players.filter((player) => !isGuestSlot(player.id));
  const consentKnown = Array.isArray(data.acceptedPlayerIds);
  const acceptedIds = new Set(data.acceptedPlayerIds ?? []);
  const inCount = consentKnown
    ? registeredPlayers.filter((player) => acceptedIds.has(player.id)).length
    : 0;
  const waitingForAccepts = !consentKnown || inCount < registeredPlayers.length;
  return (
    <main className="page-content setup-page">
      <section className="activity-heading">
        <div><span className="live-dot"><span /> {activityTitle(data.activity.activityNumber)}</span><h1>Set {data.activity.state.setNumber} teams</h1><p>Pick two slots for Blue Team. The other two play for Red Team. Guests play but do not rank.</p></div>
        <div className="heading-actions">
          <button className="icon-text-button" onClick={onRefresh} disabled={busy}><RefreshCw size={18} /> Refresh</button>
          <button className="icon-text-button" onClick={onShare}><Share2 size={18} /> Share</button>
        </div>
      </section>

      <section className="team-builder">
        <div className="team-preview blue-preview"><span>Blue Team</span><strong>{bluePlayers.length === 2 ? bluePlayers.map((player) => player.name).join(' & ') : 'Choose 2 players'}</strong></div>
        <div className="versus">VS</div>
        <div className="team-preview red-preview"><span>Red Team</span><strong>{redPlayers.length === 2 ? redPlayers.map((player) => player.name).join(' & ') : 'Waiting'}</strong></div>
      </section>

      <section className={waitingForAccepts ? 'consent-roster waiting' : 'consent-roster'}>
        <div className="section-title">
          <h2>{waitingForAccepts ? 'Who is in this activity' : 'Everyone is in'}</h2>
          <span>{inCount}/{registeredPlayers.length} in</span>
        </div>
        {registeredPlayers.map((player, index) => {
          const isIn = consentKnown && acceptedIds.has(player.id);
          return (
            <div className="directory-row" key={player.id}>
              <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
              <div>
                <strong>{player.name}</strong>
                <small>{isIn ? 'Accepted this activity' : 'Has not opened the code or link yet'}</small>
              </div>
              <span className={isIn ? 'consent-status in' : 'consent-status pending'}>{isIn ? 'In' : 'Pending'}</span>
            </div>
          );
        })}
        {waitingForAccepts && (
          <p>Share the code or link so they can accept. They do not need a free device slot.</p>
        )}
      </section>

      <section className="assign-panel">
        <div className="section-title"><h2>Blue Team players</h2><span>{blueIds.length}/2 selected</span></div>
        <div className="assign-grid">
          {slots.map((player, index) => {
            const selected = blueIds.includes(player.id);
            return (
              <button key={player.id} className={selected ? 'selected' : ''} onClick={() => onBlueChange(toggleBlue(blueIds, player.id))} disabled={!selected && blueIds.length === 2}>
                <span className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span><strong>{player.name}</strong><span className="check-circle">{selected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="current-log">
        <div className="section-title"><h2>This activity</h2><span>{data.logs.length} completed</span></div>
        {data.logs.length === 0 ? <div className="empty-line">No completed sets yet.</div> : data.logs.map((log) => <SetLogRow key={log.id} log={log} players={data.players} />)}
      </section>

      <div className="setup-actions"><button className="quiet-button" onClick={onFinish}>Finish activity</button><button className="primary-button" onClick={onStart} disabled={blueIds.length !== 2 || busy || waitingForAccepts}>Start set {data.activity.state.setNumber} <ChevronRight size={18} /></button></div>
    </main>
  );
}

function Scoreboard({ data, status, busy, onPoint, onUndo, onHistory, onShare, onManual, onLeave }: {
  data: ActivityData;
  status: SaveStatus;
  busy: boolean;
  onPoint: (team: TeamId) => void;
  onUndo: () => void;
  onHistory: () => void;
  onShare: () => void;
  onManual: () => void;
  onLeave: () => void;
}) {
  const state = data.activity.state;
  const blueNames = namesFor(data.players, state.bluePlayerIds);
  const redNames = namesFor(data.players, state.redPlayerIds);
  const scoringDisabled = data.activity.status !== 'active' || busy || status === 'offline'
    || Boolean(state.pendingGameWinner || state.pendingSetWinner);
  const decisive = data.activity.config.deuceRule === 'golden-point' && state.blueScore === '40' && state.redScore === '40'
    ? 'Golden Point'
    : state.decisivePointActive ? 'Star Point' : null;
  const gamesLead = state.blueGames === state.redGames
    ? null
    : state.blueGames > state.redGames ? 'blue' : 'red';
  return (
    <main className="scoreboard-page">
      <section className="score-statusbar">
        <div><span>{activityTitle(data.activity.activityNumber)}</span><strong>Set {state.setNumber}</strong></div>
        <div className="status-items">
          <StatusIndicator status={status} />
          <span className="device-count"><Smartphone size={15} /> {data.devices.filter((device) => device.slotStatus !== 'released').length}/2</span>
          <button onClick={onHistory} aria-label="Score history" title="Score history"><History size={19} /></button>
          <button onClick={onShare} aria-label="Share activity" title="Share activity"><Share2 size={19} /></button>
          <button onClick={onLeave} aria-label="Leave activity" title="Leave activity"><LogOut size={19} /></button>
        </div>
      </section>

      <section className="score-court" aria-label="Live Padel scoreboard">
        <button className={gamesLead === 'blue' ? 'score-team blue-team leading' : 'score-team blue-team'} onClick={() => onPoint('blue')} disabled={scoringDisabled} aria-label={`Point to Blue Team, ${blueNames}`}>
          <span className="team-label"><span className="team-dot" /> Blue Team</span>
          <span className="team-names">{blueNames}</span>
          <span className="score-number">{state.blueScore}</span>
          <span className="score-actions">
            <span className={gamesLead === 'blue' ? 'team-games leading' : 'team-games'}>
              <span>Games</span><strong>{state.blueGames}</strong>
            </span>
            <span className="tap-label"><Plus size={17} /> Point</span>
          </span>
        </button>

        <div className="center-score" aria-label={`Set games, Blue ${state.blueGames}, Red ${state.redGames}`}>
          <span className="games-label">Games</span>
          <div className="games-score">
            <strong className={gamesLead === 'blue' ? 'games-count blue leading' : 'games-count blue'}>{state.blueGames}</strong>
            <span className="games-sep">:</span>
            <strong className={gamesLead === 'red' ? 'games-count red leading' : 'games-count red'}>{state.redGames}</strong>
          </div>
          {decisive && <span className="decisive-label">{decisive}</span>}
        </div>

        <button className={gamesLead === 'red' ? 'score-team red-team leading' : 'score-team red-team'} onClick={() => onPoint('red')} disabled={scoringDisabled} aria-label={`Point to Red Team, ${redNames}`}>
          <span className="team-label"><span className="team-dot" /> Red Team</span>
          <span className="team-names">{redNames}</span>
          <span className="score-number">{state.redScore}</span>
          <span className="score-actions">
            <span className={gamesLead === 'red' ? 'team-games leading' : 'team-games'}>
              <span>Games</span><strong>{state.redGames}</strong>
            </span>
            <span className="tap-label"><Plus size={17} /> Point</span>
          </span>
        </button>
      </section>

      <section className="score-controls">
        <button onClick={onUndo} disabled={state.history.length === 0 || busy}><RotateCcw size={18} /> Undo</button>
        <div className="rule-summary">{deuceLabel(data.activity.config.deuceRule)}<span>·</span>{setLabel(data.activity.config.setWinRule)}</div>
        <button onClick={onManual}><Clock3 size={18} /> End set</button>
      </section>
    </main>
  );
}

function StatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'offline') return <span className="save-indicator offline"><WifiOff size={15} /> Offline</span>;
  if (status === 'retry') return <span className="save-indicator retry"><RotateCcw size={15} /> Retrying</span>;
  if (status === 'saving') return <span className="save-indicator saving"><Signal size={15} /> Saving</span>;
  return <span className="save-indicator saved"><CheckCircle2 size={15} /> Saved</span>;
}

function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Cancel result', onConfirm, onCancel, busy }: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="dialog-icon"><Trophy size={23} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>{cancelLabel}</button><button className="primary-button" onClick={onConfirm} disabled={busy}><Check size={18} /> {confirmLabel}</button></div>
      </div>
    </div>
  );
}

function ManualSetDialog({ data, onClose, onChoose, busy }: {
  data: ActivityData;
  onClose: () => void;
  onChoose: (choice: 'calculate' | 'disregard') => void;
  busy: boolean;
}) {
  const state = data.activity.state;
  const tied = state.blueGames === state.redGames;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="dialog wide-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <span className="dialog-icon"><Clock3 size={23} /></span>
        <h2 id="manual-title">End this set early?</h2>
        <p>The current set score is Blue {state.blueGames}, Red {state.redGames}.</p>
        {tied && <div className="inline-warning">A tied partial set cannot be calculated. Continue playing or disregard it.</div>}
        <div className="choice-actions">
          {!tied && <button className="primary-button" onClick={() => onChoose('calculate')} disabled={busy}><Trophy size={18} /> Calculate partial result</button>}
          <button className="danger-button" onClick={() => onChoose('disregard')} disabled={busy}>Disregard this set</button>
          <button className="quiet-button" onClick={onClose}>Continue playing</button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ data, onClose }: { data: ActivityData; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="side-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-heading"><div><span className="eyebrow">Current game only</span><h2 id="history-title">Score history</h2></div><button className="modal-close" onClick={onClose} aria-label="Close history"><X size={20} /></button></div>
        <div className="history-list">
          {data.history.length === 0 ? <div className="empty-state compact"><History size={25} /><p>No score changes in this game yet.</p></div> : [...data.history].reverse().map((event) => (
            <div className="history-row" key={event.id}>
              <span className={`history-dot ${event.team ?? 'neutral'}`} />
              <div><strong>{historyAction(event)}</strong><span>{event.deviceLabel} · {formatTime(event.createdAt)}</span></div>
              <code>{event.previousSnapshot.blueScore}-{event.previousSnapshot.redScore} → {event.nextSnapshot.blueScore}-{event.nextSnapshot.redScore}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SetLogRow({ log, players }: { log: SetLogEntry; players: Player[] }) {
  return (
    <div className="set-log-row">
      <span className="set-number">S{log.setNumber}</span>
      <div><span className="blue-text">{namesFor(players, log.bluePlayerIds)}</span><small>vs</small><span className="red-text">{namesFor(players, log.redPlayerIds)}</span></div>
      <div className="set-log-meta">
        <strong>{log.blueGames}-{log.redGames}</strong>
        <span className={`result-label ${log.conclusionType}`}>{conclusionLabel(log.conclusionType)}</span>
      </div>
    </div>
  );
}

function LoadingView() {
  return <main className="loading-view"><span className="brand-mark"><Activity size={22} /></span><strong>Loading your courts...</strong></main>;
}

async function apiGet<T>(action: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`/api/padel?${query}`, { cache: 'no-store' });
  return parseResponse<T>(response);
}

async function apiPost<T = { ok: boolean }>(body: Record<string, unknown>) {
  const response = await fetch('/api/padel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Request failed.');
  return data;
}

function toggleRegistered(current: string[], id: string, selfId: string) {
  if (id === selfId) return current.includes(selfId) ? current : [selfId, ...current];
  if (current.includes(id)) return current.filter((value) => value !== id);
  return current.length < MATCH_SLOT_COUNT ? [...current, id] : current;
}

function slotIdsFor(registeredIds: string[]) {
  const guests = Array.from(
    { length: MATCH_SLOT_COUNT - registeredIds.length },
    (_unused, index) => guestSlotId(index + 1),
  );
  return [...registeredIds, ...guests];
}

function activityTitle(number: number | null | undefined) {
  return number == null ? 'Activity' : `Activity #${number}`;
}

function matchSlotsFrom(players: Player[]): Player[] {
  const registered = [...players].sort((left, right) => left.id.localeCompare(right.id));
  const guests = Array.from(
    { length: MATCH_SLOT_COUNT - registered.length },
    (_unused, index) => ({
      id: guestSlotId(index + 1),
      name: `Guest ${index + 1}`,
      createdAt: '',
    }),
  );
  return [...registered, ...guests];
}

function firstTwoSlotIds(players: Player[]) {
  return matchSlotsFrom(players).slice(0, 2).map((player) => player.id);
}

function keepSelectablePlayerIds(current: string[], selfId: string, mates: Mate[]) {
  const matesAndSelf = new Set([selfId, ...mates.map((mate) => mate.id)]);
  const kept = current.filter((id) => matesAndSelf.has(id));
  return kept.includes(selfId) ? kept : [selfId, ...kept];
}

function selectablePlayers(bootstrap: BootstrapData): Player[] {
  const self: Player = {
    id: bootstrap.user.id,
    name: bootstrap.user.displayName,
    createdAt: '',
  };
  return [self, ...bootstrap.mates];
}

function nameForContextMember(bootstrap: BootstrapData, playerId: string) {
  if (playerId === bootstrap.user.id) return bootstrap.user.displayName;
  return bootstrap.mates.find((mate) => mate.id === playerId)?.name ?? 'Player';
}

function toggleBlue(current: string[], id: string) {
  if (current.includes(id)) return current.filter((value) => value !== id);
  return current.length < 2 ? [...current, id] : current;
}

function groupLogs(logs: SetLogEntry[]) {
  const groups = new Map<string, { activityId: string; activityNumber: number; date: string; logs: SetLogEntry[] }>();
  for (const log of logs) {
    const group = groups.get(log.activityId) ?? { activityId: log.activityId, activityNumber: log.activityNumber, date: log.activityDate, logs: [] };
    group.logs.push(log);
    groups.set(log.activityId, group);
  }
  return [...groups.values()];
}

function historyAction(event: ScoreEvent) {
  if (event.action === 'undo') return 'Undid the last point';
  if (event.action === 'cancel-game') return 'Canceled game result';
  return `Point to ${teamName(event.team ?? 'blue')}`;
}

function conclusionLabel(value: SetLogEntry['conclusionType']) {
  if (value === 'manual-partial') return 'Partial';
  if (value === 'disregarded') return 'Disregarded';
  if (value === 'abandoned') return 'Abandoned';
  return 'Final';
}

function namesFor(players: Player[], ids: string[]) {
  return ids.map((id) => {
    if (isGuestSlot(id)) return `Guest ${id.slice('guest:'.length)}`;
    return players.find((player) => player.id === id)?.name ?? 'Player';
  }).join(' & ');
}

function groupName(players: Player[]) {
  if (!players.length) return 'Scoring group';
  return players.map((player) => player.name.split(' ')[0]).join(' · ');
}

function teamName(team: TeamId) { return team === 'blue' ? 'Blue Team' : 'Red Team'; }
function deuceLabel(rule: ActivityConfig['deuceRule']) { return DEUCE_OPTIONS.find((option) => option.value === rule)?.label ?? rule; }
function setLabel(rule: ActivityConfig['setWinRule']) { return SET_OPTIONS.find((option) => option.value === rule)?.label ?? rule; }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
function displayName(value: string) { return value.includes('@') ? value.split('@')[0] : value; }
function initials(value: string) { return displayName(value).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'; }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong.'; }
function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function rememberActivity(data: ActivityData) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('padel-mate-last-activity-id', data.activity.id);
  localStorage.setItem(`padel-mate-recovery-${data.activity.id}`, JSON.stringify(data));
}

function forgetActivity(activityId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('padel-mate-last-activity-id');
  localStorage.removeItem(`padel-mate-recovery-${activityId}`);
}

function rememberContext(contextId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_CONTEXT_KEY, contextId);
}

function forgetContext() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_CONTEXT_KEY);
}
