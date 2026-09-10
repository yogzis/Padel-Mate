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
import { activityIsEnterable, activityIsPaused, shouldShowLiveScoreboard, toggleControllerSelection } from '../lib/activity-roles';
import {
  filterGroupList,
  groupListPrefsKey,
  parseGroupListPrefs,
  serializeGroupListPrefs,
  viewerCanPlayInGroup,
  type GroupListFilter,
  type GroupListSort,
} from '../lib/group-list';
import { visiblePickerPlayers, type MateCircle } from '../lib/mate-circle';
import { formatMateInviteCountdown } from '../lib/mate-invite';
import { awardPoint } from '../lib/scoring';
import { copy } from '../copy';
import { AppFooter } from './app-footer';
import { ShareInviteDialog } from './share-invite-dialog';
import { ChromeSelect } from './chrome-select';
import { TeamVsTeamBanner } from './team-vs-banner';
import { useMateInviteCountdown } from './use-mate-invite-countdown';

type AppUser = { id: string; displayName: string; email: string; isAdmin: boolean };
type BootstrapData = { user: AppUser; mates: Mate[]; mateCircle: MateCircle; contexts: ContextSummary[] };
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
    ownerUserId: string;
    ownerName: string;
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
  ownerUserId: string;
  ownerName: string;
  controllerUserIds: string[];
  viewerIsOwner: boolean;
  viewerIsController: boolean;
};
type Screen = 'groups' | 'mates' | 'context' | 'configure' | 'set-setup' | 'scoreboard';
function activityScreen(data: ActivityData): Screen {
  return shouldShowLiveScoreboard({
    phase: data.activity.state.phase,
  }) ? 'scoreboard' : 'set-setup';
}

function pendingPlayerNames(data: ActivityData) {
  const names = data.pendingPlayerIds.map((id) => (
    data.players.find((player) => player.id === id)?.name ?? copy.chrome.playerFallback
  ));
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
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
    label: copy.configure.deuce.starPoint.label,
    description: copy.configure.deuce.starPoint.description,
  },
  {
    value: 'classic-advantage' as const,
    label: copy.configure.deuce.classicAdvantage.label,
    description: copy.configure.deuce.classicAdvantage.description,
  },
  {
    value: 'golden-point' as const,
    label: copy.configure.deuce.goldenPoint.label,
    description: copy.configure.deuce.goldenPoint.description,
  },
];

const SET_OPTIONS = [
  {
    value: 'standard-set' as const,
    label: copy.configure.set.standard.label,
    description: copy.configure.set.standard.description,
  },
  {
    value: 'short-set' as const,
    label: copy.configure.set.short.label,
    description: copy.configure.set.short.description,
  },
];

const TIEBREAK_OPTIONS = [
  {
    value: 'standard-tiebreak' as const,
    label: copy.configure.tieBreak.standard.label,
    description: copy.configure.tieBreak.standard.description,
  },
  {
    value: 'deciding-game' as const,
    label: copy.configure.tieBreak.decidingGame.label,
    description: copy.configure.tieBreak.decidingGame.description,
  },
  {
    value: 'no-tiebreak' as const,
    label: copy.configure.tieBreak.none.label,
    description: copy.configure.tieBreak.none.description,
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
  const [modal, setModal] = useState<'history' | 'share' | 'mate-invite' | 'replace-invite' | 'manual' | 'leave' | null>(null);
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
      const [data, openInvite] = await Promise.all([
        apiGet<BootstrapData>('bootstrap'),
        apiGet<MateInviteLink | null>('open-invite'),
      ]);
      setBootstrap(data);
      setInvite(openInvite);
      setSelectedPlayerIds((current) => keepSelectablePlayerIds(current, initialUser.id, data.mates));
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
    noticeText = copy.errors.notices.activityFinished,
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
      if (!activityIsEnterable(fresh.activity.status)) {
        await returnToContext(
          fresh.activity.contextId,
          fresh.activity.id,
          fresh.activity.status === 'abandoned'
            ? copy.errors.notices.ownerClosedActivity
            : copy.errors.notices.activityFinished,
        );
        return fresh;
      }
      rememberActivity(fresh);
      setActivityData((current) => {
        if (current && fresh.activity.version < current.activity.version) return current;
        return fresh;
      });
      setSaveStatus('saved');
      if (fresh.activity.status === 'active') setScreen(activityScreen(fresh));
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
      setError(copy.groups.needOneMate);
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
        ? copy.errors.notices.inviteReplaced
        : copy.errors.notices.inviteReady);
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
      setNotice(copy.errors.notices.inviteDeleted);
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
      setNotice(copy.errors.notices.mateRemoved);
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
      if (!activityIsEnterable(data.activity.status)) {
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
      setScreen(activityScreen(data));
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
              if (!activityIsEnterable(restored.activity.status)) {
                void returnToContext(restored.activity.contextId, restored.activity.id);
                return;
              }
              setActivityData(restored);
              setSaveStatus('offline');
              setScreen(activityScreen(restored));
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

  const assignControllers = async (controllerUserIds: string[]) => {
    await activityAction('assign-controllers', { controllerUserIds });
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
    if (!activityData.viewerIsController || activityIsPaused(activityData.pendingPlayerIds)) return;
    if (activityData.activity.state.phase !== 'live') return;
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

  const leaveActivity = async () => {
    if (!activityData) return;
    const contextId = activityData.activity.contextId;
    const activityId = activityData.activity.id;
    setBusy(true);
    setError('');
    try {
      const result = await apiPost<{ ok: true; closed: boolean; contextId: string }>({
        action: 'leave-activity',
        activityId,
        deviceId,
      });
      await returnToContext(
        result.contextId || contextId,
        activityId,
        result.closed ? copy.errors.notices.youClosedActivity : copy.errors.notices.leftActivity,
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const requestLeave = () => {
    setMenuOpen(false);
    setModal('leave');
  };

  const navigate = (next: Screen) => {
    if (activityData?.activity.status === 'active' && next !== 'scoreboard' && next !== 'set-setup') {
      setNotice(copy.errors.notices.leaveBeforeSwitching);
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
          onAssignControllers={assignControllers}
          onRefresh={async () => {
            setBusy(true);
            setError('');
            try {
              const fresh = await refreshActivity();
              if (fresh) setNotice(copy.errors.notices.activityUpdated);
            } finally {
              setBusy(false);
            }
          }}
          onLeave={requestLeave}
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
          onAssignControllers={assignControllers}
          onLeave={requestLeave}
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
        onLeave={requestLeave}
      />
      {error && (
        <div className="alert-bar" role="alert">
          <span>{error}</span>
          <button aria-label={copy.chrome.dismissMessageAria} onClick={() => setError('')}><X size={17} /></button>
        </div>
      )}
      {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}</div>}
      {main}
      {screen !== 'scoreboard' && <AppFooter />}

      {activityData?.activity.state.pendingGameWinner && activityData.viewerIsOwner && (
        <ConfirmDialog
          title={copy.live.gameWon(teamName(activityData.activity.state.pendingGameWinner))}
          description={copy.live.updateSetScorePrompt}
          confirmLabel={copy.live.updateSetScore}
          onConfirm={() => activityAction('confirm-game')}
          onCancel={() => activityAction('cancel-game', { clientMutationId: crypto.randomUUID() })}
          busy={busy}
        />
      )}

      {activityData?.activity.state.pendingSetWinner && activityData.viewerIsOwner && (
        <ConfirmDialog
          title={copy.live.setWon(teamName(activityData.activity.state.pendingSetWinner))}
          description={copy.live.setWonDescription(activityData.activity.state.blueGames, activityData.activity.state.redGames)}
          confirmLabel={copy.live.updateLeaderboard}
          onConfirm={async () => {
            const result = await activityAction('confirm-set');
            if (result) {
              setBluePlayerIds(firstTwoSlotIds(result.players));
              setScreen(activityScreen(result));
            }
          }}
          onCancel={() => activityAction('cancel-set')}
          busy={busy}
        />
      )}

      {modal === 'leave' && activityData && (
        <ConfirmDialog
          title={activityData.viewerIsOwner ? copy.live.endActivityTitle : copy.live.leaveConfirmTitle}
          description={activityData.viewerIsOwner ? copy.live.endActivityBody : copy.live.leaveConfirmBody}
          confirmLabel={activityData.viewerIsOwner ? copy.live.endActivityAction : copy.live.leaveConfirmAction}
          cancelLabel={copy.chrome.cancel}
          onConfirm={() => { void leaveActivity(); }}
          onCancel={() => setModal(null)}
          busy={busy}
        />
      )}
      {modal === 'history' && activityData && (
        <HistoryModal data={activityData} onClose={() => setModal(null)} />
      )}
      {modal === 'share' && activityData && (
        <ShareInviteDialog
          title={copy.live.shareTitle}
          description={copy.live.shareDescription}
          valueLabel={copy.live.sessionCode}
          displayValue={activityData.activity.shareCode}
          copyValue={`${window.location.origin}/?join=${activityData.activity.shareCode}`}
          whatsappMessage={copy.live.whatsappMessage(
            activityTitle(activityData.activity.activityNumber).toLowerCase(),
            `${window.location.origin}/?join=${activityData.activity.shareCode}`,
          )}
          devices={activityData.devices}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'mate-invite' && liveInvite && (
        <ShareInviteDialog
          title={copy.invite.shareTitle}
          description={copy.invite.shareDescription}
          valueLabel={copy.invite.shareValueLabel}
          displayValue={liveInvite.url}
          copyValue={liveInvite.url}
          whatsappMessage={copy.invite.whatsappMessage(liveInvite.url)}
          valueStyle="link"
          expiryLabel={copy.mates.expiresIn(formatMateInviteCountdown(inviteRemainingMs))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'replace-invite' && liveInvite && (
        <ConfirmDialog
          title={copy.invite.replaceTitle}
          description={copy.invite.replaceDescription}
          confirmLabel={copy.invite.createNewInvite}
          cancelLabel={copy.chrome.cancel}
          onConfirm={() => void createInvite()}
          onCancel={() => setModal(null)}
          busy={busy}
        />
      )}
      {modal === 'manual' && activityData && activityData.viewerIsOwner && (
        <ManualSetDialog
          data={activityData}
          busy={busy}
          onClose={() => setModal(null)}
          onChoose={async (choice) => {
            const result = await activityAction('manual-set', { choice });
            if (result) {
              setModal(null);
              setBluePlayerIds(firstTwoSlotIds(result.players));
              setScreen(activityScreen(result));
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
        <button className="brand" onClick={() => onNavigate('groups')} aria-label={copy.chrome.homeAria}>
          <picture>
            <source srcSet="/padel-mate-logo.webp" type="image/webp" />
            <img className="brand-logo" src="/padel-mate-logo.png" alt="" width={404} height={122} />
          </picture>
        </button>

        <nav className="desktop-nav" aria-label={copy.chrome.mainNavAria}>
          <button className={screen === 'groups' || screen === 'context' ? 'active' : ''} onClick={() => onNavigate('groups')}>{copy.chrome.groups}</button>
          <button className={screen === 'mates' ? 'active' : ''} onClick={() => onNavigate('mates')}>{copy.chrome.mates}</button>
        </nav>

        <div className="header-actions">
          {activity?.activity.status === 'active' && (
            <button className="live-pill" onClick={() => onNavigate(activityScreen(activity))}>
              <span /> {activityTitle(activity.activity.activityNumber)}
            </button>
          )}
          <button className="menu-button" onClick={onMenu} aria-label={copy.chrome.openMenuAria} aria-expanded={menuOpen}>
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="account-menu">
              <div className="account-row">
                <span className="avatar avatar-1">{initials(user.displayName)}</span>
                <div><strong>{displayName(user.displayName)}</strong><small>{user.email}</small></div>
              </div>
              <nav className="menu-nav" aria-label={copy.chrome.mainNavAria}>
                <button className={screen === 'groups' || screen === 'context' ? 'active' : ''} onClick={() => onNavigate('groups')}>
                  <Users size={17} /> {copy.chrome.groups}
                </button>
                <button className={screen === 'mates' ? 'active' : ''} onClick={() => onNavigate('mates')}>
                  <UsersRound size={17} /> {copy.chrome.mates}
                </button>
              </nav>
              {user.isAdmin && <a href="/admin"><ShieldCheck size={17} /> {copy.chrome.manageAccounts}</a>}
              {activity?.activity.status === 'active' && <button onClick={onLeave}><LogOut size={17} /> {copy.chrome.leaveActivity}</button>}
              <button onClick={onSignOut}><LogOut size={17} /> {copy.chrome.signOut}</button>
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
  const [groupQuery, setGroupQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [groupFilter, setGroupFilter] = useState<GroupListFilter>(
    () => loadGroupListPrefs(bootstrap.user.id).filter,
  );
  const [groupSort, setGroupSort] = useState<GroupListSort>(
    () => loadGroupListPrefs(bootstrap.user.id).sort,
  );

  useEffect(() => {
    saveGroupListPrefs(bootstrap.user.id, { sort: groupSort, filter: groupFilter });
  }, [bootstrap.user.id, groupFilter, groupSort]);
  const mateIds = useMemo(() => new Set(bootstrap.mates.map((mate) => mate.id)), [bootstrap.mates]);
  const visibleGroups = useMemo(() => filterGroupList(bootstrap.contexts, {
    viewerId: bootstrap.user.id,
    mateIds,
    query: groupQuery,
    filter: groupFilter,
    sort: groupSort,
  }), [bootstrap.contexts, bootstrap.user.id, mateIds, groupQuery, groupFilter, groupSort]);
  const selfPlayer = useMemo((): Player => ({
    id: bootstrap.user.id,
    name: bootstrap.user.displayName,
    createdAt: '',
  }), [bootstrap.user.displayName, bootstrap.user.id]);
  const selectable = useMemo(
    () => visiblePickerPlayers(selfPlayer, selectedIds, bootstrap.mates, bootstrap.mateCircle ?? {}),
    [bootstrap.mateCircle, bootstrap.mates, selectedIds, selfPlayer],
  );
  const canOpen = selectedIds.length >= MIN_REGISTERED_PLAYERS_PER_CONTEXT;
  const hiddenMateCount = bootstrap.mates.length - (selectable.length - 1);
  const hasVisibleUnselectedMate = selectable.some((player) => (
    player.id !== bootstrap.user.id && !selectedIds.includes(player.id)
  ));
  const showCircleHint = hiddenMateCount > 0 && !hasVisibleUnselectedMate && selectedIds.length < MATCH_SLOT_COUNT;
  const groupCountLabel = visibleGroups.length === bootstrap.contexts.length
    ? String(visibleGroups.length)
    : copy.groups.filteredCount(visibleGroups.length, bootstrap.contexts.length);

  return (
    <main className="page-content">
      <section className="page-heading">
        <div><span className="eyebrow">{copy.groups.eyebrow}</span><h1>{copy.groups.title}</h1></div>
        <div className="join-box">
          <label htmlFor="join-code">{copy.groups.joinActivity}</label>
          <div><input id="join-code" value={joinCode} onChange={(event) => onJoinCode(event.target.value.toUpperCase())} placeholder={copy.groups.joinCodePlaceholder} maxLength={8} /><button onClick={onJoin} disabled={!joinCode || busy}>{copy.groups.join}</button></div>
        </div>
      </section>

      {bootstrap.contexts.length > 0 && (
        <section className="section-band">
          <div className="section-title"><h2>{copy.groups.listTitle}</h2><span>{groupCountLabel}</span></div>
          <div className="group-panel">
            <div className="group-toolbar">
              <label className="group-search" htmlFor="group-search">{copy.groups.searchLabel}
                <span className="group-search-field">
                  <input
                    ref={searchInputRef}
                    id="group-search"
                    value={groupQuery}
                    onChange={(event) => setGroupQuery(event.target.value)}
                    placeholder={copy.groups.searchPlaceholder}
                  />
                  {groupQuery.length > 0 && (
                    <button
                      type="button"
                      className="group-search-clear"
                      aria-label={copy.groups.searchClearAria}
                      onClick={() => {
                        setGroupQuery('');
                        searchInputRef.current?.focus();
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </span>
              </label>
              <ChromeSelect
                id="group-sort"
                label={copy.groups.sortLabel}
                value={groupSort}
                onChange={setGroupSort}
                options={[
                  { value: 'last-played', label: copy.groups.sortLastPlayed },
                  { value: 'date-created', label: copy.groups.sortDateCreated },
                  { value: 'name', label: copy.groups.sortName },
                ]}
              />
              <ChromeSelect
                id="group-filter"
                label={copy.groups.filterLabel}
                value={groupFilter}
                onChange={setGroupFilter}
                options={[
                  { value: 'all', label: copy.groups.filterAll },
                  { value: 'can-play', label: copy.groups.filterCanPlay },
                  { value: 'history', label: copy.groups.filterHistory },
                ]}
              />
            </div>
            <div className="group-list">
              {visibleGroups.length === 0 ? (
                <div className="empty-line">{copy.groups.empty}</div>
              ) : visibleGroups.map((context) => {
                const canPlay = viewerCanPlayInGroup(bootstrap.user.id, context.playerIds, mateIds);
                return (
                  <button key={context.id} className="group-row" onClick={() => onOpen(context.id)}>
                    <div className="avatar-stack">{context.playerIds.slice(0, 4).map((id, index) => (
                      <span key={id} className={`avatar avatar-${index + 1}`}>{initials(nameForContextMember(bootstrap, id))}</span>
                    ))}</div>
                    <div className="group-copy">
                      <strong>{context.name}</strong>
                      <span>{copy.groups.memberSummary(context.playerIds.length, MATCH_SLOT_COUNT - context.playerIds.length)}</span>
                    </div>
                    <span className={canPlay ? 'history-pill is-empty' : 'history-pill'}>{copy.groups.historyPill}</span>
                    <ChevronRight size={20} />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="context-builder">
        <div className="builder-heading">
          <div><h2>{copy.groups.builderTitle}</h2><p>{copy.groups.builderIntro}</p></div>
          <span className={canOpen ? 'selection-count complete' : 'selection-count'}>{copy.groups.selectionCount(selectedIds.length)}</span>
        </div>
        {bootstrap.mates.length === 0 ? (
          <div className="empty-state"><UsersRound size={28} /><h3>{copy.groups.emptyTitle}</h3><p>{copy.groups.emptyBody}</p><button className="primary-button" onClick={onInviteMates}><UserPlus size={18} /> {copy.groups.inviteMates}</button></div>
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
                    <span><strong>{player.name}</strong><small>{isYou ? copy.chrome.you : copy.groups.mateRole}</small></span>
                    <span className="check-circle">{selected && <Check size={15} />}</span>
                  </button>
                );
              })}
            </div>
            {showCircleHint && (
              <p className="picker-hint">{copy.groups.circleHint}</p>
            )}
            <div className="builder-actions">
              <button className="secondary-button" onClick={onInviteMates}><UserPlus size={18} /> {copy.groups.inviteMates}</button>
              <button className="primary-button" disabled={!canOpen || busy} onClick={onContinue}>{copy.groups.openScoreboard} <ChevronRight size={18} /></button>
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
          <span className="eyebrow">{copy.mates.eyebrow}</span>
          <h1>{copy.mates.title}</h1>
          <p>{copy.mates.intro}</p>
        </div>
      </section>
      <section className="add-player-band">
        <label>{copy.mates.inviteLinkLabel}</label>
        {invite ? (
          <>
            <div className="invite-actions">
              <div className="invite-actions-main">
                <button className="primary-button" onClick={onShowInvite}><Link2 size={18} /> {copy.mates.showCurrentInvite}</button>
                <button className="secondary-button" onClick={onRequestReplaceInvite} disabled={busy}>
                  <Link2 size={18} /> {copy.mates.createNewInvite}
                </button>
              </div>
              <button
                type="button"
                className="icon-text-button invite-delete"
                onClick={onDeleteInvite}
                disabled={busy}
                aria-label={copy.mates.deleteInviteAria}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <p className="invite-expiry">{copy.mates.expiresIn(formatMateInviteCountdown(remainingMs))}</p>
          </>
        ) : (
          <div>
            <button className="primary-button" onClick={onCreateInvite} disabled={busy}><Link2 size={18} /> {copy.mates.createInviteLink}</button>
          </div>
        )}
      </section>
      <section className="player-directory">
        <div className="section-title">
          <h2>{copy.mates.listTitle}</h2>
          <div className="section-title-actions">
            <span>{mates.length}</span>
            <button className="icon-text-button" onClick={onRefresh} disabled={matesRefreshing}>
              <RefreshCw size={18} /> {copy.chrome.refresh}
            </button>
          </div>
        </div>
        {mates.length === 0 ? (
          <div className="empty-line">{copy.mates.empty}</div>
        ) : mates.map((mate, index) => (
          <div className="directory-row" key={mate.id}>
            <span className={`avatar avatar-${index % 4 + 1}`}>{initials(mate.name)}</span>
            <div><strong>{mate.name}</strong><small>{copy.mates.canJoinGroups}</small></div>
            <button className="quiet-button" onClick={() => onRemove(mate.id)} disabled={busy}><UserMinus size={15} /> {copy.mates.remove}</button>
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
        aria-label={copy.dashboard.hintAria}
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
          <h3 id="leaderboard-hint-title">{copy.dashboard.hintTitle}</h3>
          <p>{copy.dashboard.hintLive}</p>
          <p>{copy.dashboard.hintWin}</p>
          <p>{copy.dashboard.hintEarly}</p>
          <pre>
            {copy.dashboard.hintExamples}
          </pre>
          <p>{copy.dashboard.hintGuests}</p>
          <dl>
            <div><dt>{copy.dashboard.columnWl}</dt><dd>{copy.dashboard.columnWlHint}</dd></div>
            <div><dt>{copy.dashboard.columnDiff}</dt><dd>{copy.dashboard.columnDiffHint}</dd></div>
            <div><dt>{copy.dashboard.columnPoints}</dt><dd>{copy.dashboard.columnPointsHint}</dd></div>
          </dl>
          <p>{copy.dashboard.hintRank}</p>
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
  const liveActivities = data.activities.filter((activity) => activityIsEnterable(activity.status));
  return (
    <main className="page-content">
      <section className="context-topline">
        <div><span className="eyebrow">{copy.dashboard.eyebrow}</span><h1>{groupName(data.players)}</h1><p>{data.players.map((player) => player.name).join(' · ')}</p></div>
        {data.canCreateActivity ? (
          <button className="primary-button" onClick={onNewActivity}><Plus size={19} /> {copy.dashboard.newActivity}</button>
        ) : (
          <p className="history-only-note">{copy.dashboard.historyOnly}</p>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="leaderboard-panel">
          <div className="panel-heading">
            <div>
              <Trophy size={20} />
              <h2>{copy.dashboard.leaderboardTitle}</h2>
              <LeaderboardHint />
            </div>
            <span>{data.leaderboard.length ? data.leaderboard.reduce((sum, entry) => sum + entry.setsPlayed, 0) / data.leaderboard.length : 0} {copy.dashboard.setsSuffix}</span>
          </div>
          <div className="leaderboard-table">
            <div className="leaderboard-head"><span>{copy.dashboard.rankHeader}</span><span>{copy.dashboard.playerHeader}</span><span>{copy.dashboard.columnWl}</span><span>{copy.dashboard.columnDiff}</span><span>{copy.dashboard.columnPoints}</span></div>
            {data.leaderboard.map((entry, index) => (
              <div className="leaderboard-row" key={entry.playerId}>
                <span className={`rank rank-${index + 1}`}>{index + 1}</span>
                <div><span className={`avatar avatar-${index % 4 + 1}`}>{initials(entry.playerName)}</span><span><strong>{entry.playerName}</strong><small>{copy.dashboard.gamesRecord(entry.gamesWon, entry.gamesLost)}</small></span></div>
                <span>{entry.setsWon}-{entry.setsLost}</span>
                <span>{signed(entry.gameDifferential)}</span>
                <strong>{entry.totalPoints}</strong>
              </div>
            ))}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="players-strip">
            <div className="panel-heading"><div><UsersRound size={19} /><h2>{copy.dashboard.playersTitle}</h2></div></div>
            <div>{data.players.map((player, index) => <span key={player.id}><span className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span><small>{player.name}</small></span>)}</div>
          </section>
          {liveActivities.map((activity) => (
            <section className="resume-panel" key={activity.id}>
              <span className="live-dot"><span /> {copy.dashboard.liveActivity}</span>
              <h3>{copy.dashboard.ownerActivity(activity.ownerName)}</h3>
              <button className="secondary-button" onClick={() => onOpenActivity(activity.id)}>
                {activity.viewerAccepted ? copy.dashboard.resumeScoring : copy.dashboard.join}
                {' '}<ChevronRight size={17} />
              </button>
            </section>
          ))}
        </aside>
      </div>

      <section className="activity-history">
        <div className="section-title"><h2>{copy.dashboard.recentSetLog}</h2><span>{copy.dashboard.lastFive}</span></div>
        {logsByActivity.length === 0 ? <div className="empty-line">{copy.dashboard.emptyLogs}</div> : logsByActivity.map((group) => (
          <div className="activity-log" key={group.activityId}>
            <div className="activity-log-title"><div><strong>{copy.dashboard.activityNumber(group.activityNumber)}</strong><span>{formatDate(group.date)}</span></div><span>{group.logs.length} {group.logs.length === 1 ? copy.dashboard.setSingular : copy.dashboard.setPlural}</span></div>
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
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> {copy.configure.back}</button>
      <section className="page-heading"><div><span className="eyebrow">{copy.configure.eyebrow}</span><h1>{copy.configure.title}</h1><p>{copy.configure.intro}</p></div></section>
      <SettingGroup title={copy.configure.deuceRule} icon={<Activity size={19} />} options={DEUCE_OPTIONS} value={config.deuceRule} onChange={(value) => onChange({ ...config, deuceRule: value })} />
      <SettingGroup title={copy.configure.setLength} icon={<Medal size={19} />} options={SET_OPTIONS} value={config.setWinRule} onChange={(value) => onChange({ ...config, setWinRule: value })} />
      <SettingGroup title={copy.configure.tiedSet} icon={<RotateCcw size={19} />} options={TIEBREAK_OPTIONS} value={config.tieBreakRule} onChange={(value) => onChange({ ...config, tieBreakRule: value })} />
      <section className="points-rule"><ShieldCheck size={20} /><div><strong>{copy.configure.playerPoints}</strong><p>{copy.configure.playerPointsBody}</p></div></section>
      <div className="sticky-action"><button className="primary-button" onClick={onStart} disabled={busy}>{copy.configure.createActivity} <ChevronRight size={18} /></button></div>
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

function SetSetupView({ data, blueIds, onBlueChange, onStart, onShare, onRefresh, onAssignControllers, onLeave, busy }: {
  data: ActivityData;
  blueIds: string[];
  onBlueChange: (ids: string[]) => void;
  onStart: () => void;
  onShare: () => void;
  onRefresh: () => void;
  onAssignControllers: (ids: string[]) => void;
  onLeave: () => void;
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
  const paused = activityIsPaused(data.pendingPlayerIds);
  const isOwner = data.viewerIsOwner;
  const hasPlayedASet = data.logs.length > 0 || data.activity.state.setNumber > 1;
  const lobbyIntro = isOwner
    ? copy.live.setTeamsIntro
    : hasPlayedASet
      ? copy.live.waitingForNextSet(data.ownerName)
      : copy.live.ownerOnlyTeams;
  const toggleController = (playerId: string) => {
    const next = toggleControllerSelection(data.controllerUserIds, playerId);
    if (next) onAssignControllers(next);
  };
  return (
    <main className="page-content setup-page">
      <section className="activity-heading">
        <div>
          <span className="live-dot"><span /> {copy.dashboard.ownerActivity(data.ownerName)}</span>
          <h1>{copy.live.setTeamsHeading(data.activity.state.setNumber)}</h1>
          <p>{lobbyIntro}</p>
        </div>
        <div className="heading-actions">
          <button onClick={onLeave} disabled={busy} aria-label={copy.live.leaveActivity} title={copy.live.leaveActivity}><LogOut size={18} /></button>
          <button onClick={onRefresh} disabled={busy} aria-label={copy.chrome.refresh} title={copy.chrome.refresh}><RefreshCw size={18} /></button>
          <button onClick={onShare} aria-label={copy.live.shareActivity} title={copy.live.shareActivity}><Share2 size={18} /></button>
        </div>
      </section>

      {paused && (
        <p className="pause-banner">{copy.live.pausedWaiting(pendingPlayerNames(data))}</p>
      )}

      <TeamVsTeamBanner
        bluePlayers={bluePlayers.length === 2 ? bluePlayers : null}
        redPlayers={redPlayers.length === 2 ? redPlayers : null}
      />

      <section className={waitingForAccepts ? 'consent-roster waiting' : 'consent-roster'}>
        <div className="section-title">
          <h2>{waitingForAccepts ? copy.live.whoIsIn : copy.live.everyoneIn}</h2>
          <span>{copy.live.inCount(inCount, registeredPlayers.length)}</span>
        </div>
        {registeredPlayers.map((player, index) => {
          const isIn = consentKnown && acceptedIds.has(player.id);
          return (
            <div className="directory-row" key={player.id}>
              <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
              <div>
                <strong>{player.name}</strong>
                <small>{isIn ? copy.live.accepted : (
                  data.logs.length > 0 || data.activity.state.setNumber > 1
                    ? copy.live.leftWaitingToRejoin
                    : copy.live.notOpened
                )}</small>
              </div>
              <span className={isIn ? 'consent-status in' : 'consent-status pending'}>{isIn ? copy.live.in : copy.live.pending}</span>
            </div>
          );
        })}
        {waitingForAccepts && (
          <p>{copy.live.shareSoTheyAccept}</p>
        )}
      </section>

      {isOwner && (
        <section className="consent-roster">
          <div className="section-title">
            <h2>{copy.live.scoreControllers}</h2>
            <span>{copy.live.scoreControllerSlot(data.controllerUserIds.length)}</span>
          </div>
          <p>{copy.live.scoreControllersHint}</p>
          <div className="assign-grid">
            {registeredPlayers.filter((player) => acceptedIds.has(player.id)).map((player, index) => {
              const selected = data.controllerUserIds.includes(player.id);
              return (
                <button
                  key={player.id}
                  className={selected ? 'selected' : ''}
                  onClick={() => toggleController(player.id)}
                  disabled={busy || (!selected && data.controllerUserIds.length >= 2)}
                >
                  <span className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span>
                  <strong>{player.name}</strong>
                  <span className="check-circle">{selected && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="assign-panel">
          <div className="section-title"><h2>{copy.live.blueTeamPlayers}</h2><span>{copy.live.blueSelected(blueIds.length)}</span></div>
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
      )}

      <section className="current-log">
        <div className="section-title"><h2>{copy.live.thisActivity}</h2><span>{copy.live.completedCount(data.logs.length)}</span></div>
        {data.logs.length === 0 ? <div className="empty-line">{copy.live.noCompletedSets}</div> : data.logs.map((log) => <SetLogRow key={log.id} log={log} players={data.players} />)}
      </section>

      {isOwner && (
        <div className="setup-actions">
          <button className="quiet-button" onClick={onLeave}>{copy.live.finishActivity}</button>
          <button className="primary-button" onClick={onStart} disabled={blueIds.length !== 2 || busy || waitingForAccepts}>
            {copy.live.startSet(data.activity.state.setNumber)} <ChevronRight size={18} />
          </button>
        </div>
      )}
    </main>
  );
}

function Scoreboard({ data, status, busy, onPoint, onUndo, onHistory, onShare, onManual, onAssignControllers, onLeave }: {
  data: ActivityData;
  status: SaveStatus;
  busy: boolean;
  onPoint: (team: TeamId) => void;
  onUndo: () => void;
  onHistory: () => void;
  onShare: () => void;
  onManual: () => void;
  onAssignControllers: (ids: string[]) => void;
  onLeave: () => void;
}) {
  const state = data.activity.state;
  const blueNames = namesFor(data.players, state.bluePlayerIds);
  const redNames = namesFor(data.players, state.redPlayerIds);
  const paused = activityIsPaused(data.pendingPlayerIds);
  const canScore = data.viewerIsController && !paused && state.phase === 'live'
    && data.activity.status === 'active' && !busy && status !== 'offline'
    && !state.pendingGameWinner && !state.pendingSetWinner;
  const scoringDisabled = !canScore;
  const showWatching = !data.viewerIsController && state.phase === 'live';
  const banner = paused
    ? copy.live.pausedWaiting(pendingPlayerNames(data))
    : state.pendingGameWinner && !data.viewerIsOwner
      ? copy.live.waitingForOwnerToConfirmGame(data.ownerName)
      : state.pendingSetWinner && !data.viewerIsOwner
        ? copy.live.waitingForOwnerToConfirmSet(data.ownerName)
        : state.phase === 'set-setup'
          ? copy.live.waitingForNextSet(data.ownerName)
          : showWatching
            ? copy.live.watchingHint
            : null;
  const decisive = data.activity.config.deuceRule === 'golden-point' && state.blueScore === '40' && state.redScore === '40'
    ? copy.configure.deuce.goldenPoint.label
    : state.decisivePointActive ? copy.configure.deuce.starPoint.label : null;
  const gamesLead = state.blueGames === state.redGames
    ? null
    : state.blueGames > state.redGames ? 'blue' : 'red';
  return (
    <main className={banner ? 'scoreboard-page has-banner' : 'scoreboard-page'}>
      <section className="score-statusbar">
        <div><span>{activityTitle(data.activity.activityNumber)}</span><strong>{copy.live.setNumber(state.setNumber)}</strong></div>
        <div className="status-items">
          <StatusIndicator status={status} />
          <ControllerChip data={data} busy={busy} onAssign={onAssignControllers} />
          <button onClick={onHistory} aria-label={copy.live.scoreHistory} title={copy.live.scoreHistory}><History size={19} /></button>
          <button onClick={onShare} aria-label={copy.live.shareActivity} title={copy.live.shareActivity}><Share2 size={19} /></button>
          <button onClick={onLeave} aria-label={copy.live.leaveActivity} title={copy.live.leaveActivity}><LogOut size={19} /></button>
        </div>
      </section>

      {banner && (
        <p className={paused ? 'score-banner paused' : 'score-banner watching'}>{banner}</p>
      )}

      <section className="score-court" aria-label={copy.live.scoreboardAria}>
        <button className={gamesLead === 'blue' ? 'score-team blue-team leading' : 'score-team blue-team'} onClick={() => onPoint('blue')} disabled={scoringDisabled} aria-label={copy.live.pointToBlueAria(blueNames)}>
          <span className="team-label"><span className="team-dot" /> {copy.live.blueTeam}</span>
          <span className="team-names">{blueNames}</span>
          <span className="score-number">{state.blueScore}</span>
          <span className="score-actions">
            <span className={gamesLead === 'blue' ? 'team-games leading' : 'team-games'}>
              <span>{copy.live.games}</span><strong>{state.blueGames}</strong>
            </span>
            {canScore && <span className="tap-label"><Plus size={17} /> {copy.live.point}</span>}
          </span>
        </button>

        <div className="center-score" aria-label={copy.live.setGamesAria(state.blueGames, state.redGames)}>
          <span className="games-label">{copy.live.games}</span>
          <div className="games-score">
            <strong className={gamesLead === 'blue' ? 'games-count blue leading' : 'games-count blue'}>{state.blueGames}</strong>
            <span className="games-sep">:</span>
            <strong className={gamesLead === 'red' ? 'games-count red leading' : 'games-count red'}>{state.redGames}</strong>
          </div>
          {decisive && <span className="decisive-label">{decisive}</span>}
        </div>

        <button className={gamesLead === 'red' ? 'score-team red-team leading' : 'score-team red-team'} onClick={() => onPoint('red')} disabled={scoringDisabled} aria-label={copy.live.pointToRedAria(redNames)}>
          <span className="team-label"><span className="team-dot" /> {copy.live.redTeam}</span>
          <span className="team-names">{redNames}</span>
          <span className="score-number">{state.redScore}</span>
          <span className="score-actions">
            <span className={gamesLead === 'red' ? 'team-games leading' : 'team-games'}>
              <span>{copy.live.games}</span><strong>{state.redGames}</strong>
            </span>
            {canScore && <span className="tap-label"><Plus size={17} /> {copy.live.point}</span>}
          </span>
        </button>
      </section>

      <section className="score-controls">
        {data.viewerIsOwner ? (
          <button onClick={onUndo} disabled={state.history.length === 0 || busy || paused}><RotateCcw size={18} /> {copy.live.undo}</button>
        ) : <span />}
        <div className="rule-summary">{deuceLabel(data.activity.config.deuceRule)}<span>·</span>{setLabel(data.activity.config.setWinRule)}</div>
        {data.viewerIsOwner && state.phase === 'live' ? (
          <button onClick={onManual}><Clock3 size={18} /> {copy.live.endSet}</button>
        ) : <span />}
      </section>
    </main>
  );
}

function ControllerChip({
  data,
  busy,
  onAssign,
}: {
  data: ActivityData;
  busy: boolean;
  onAssign: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const acceptedIds = new Set(data.acceptedPlayerIds);
  const candidates = data.players.filter((player) => !isGuestSlot(player.id) && acceptedIds.has(player.id));
  const chip = (
    <>
      <Smartphone size={15} /> {copy.live.controllerCap(data.controllerUserIds.length)}
    </>
  );

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

  if (!data.viewerIsOwner) {
    return <span className="device-count">{chip}</span>;
  }

  return (
    <div className="controller-chip" ref={rootRef}>
      <button
        type="button"
        className="device-count controller-chip-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.live.scoreControllersAria}
        onClick={() => setOpen((current) => !current)}
      >
        {chip}
      </button>
      {open && (
        <div className="controller-menu" role="listbox" aria-label={copy.live.scoreControllers}>
          <p>{copy.live.scoreControllersHint}</p>
          {candidates.map((player, index) => {
            const selected = data.controllerUserIds.includes(player.id);
            return (
              <button
                key={player.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? 'selected' : ''}
                disabled={busy || (!selected && data.controllerUserIds.length >= 2)}
                onClick={() => {
                  const next = toggleControllerSelection(data.controllerUserIds, player.id);
                  if (next) onAssign(next);
                }}
              >
                <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
                <strong>{player.name}</strong>
                <span className="check-circle">{selected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'offline') return <span className="save-indicator offline"><WifiOff size={15} /> {copy.live.offline}</span>;
  if (status === 'retry') return <span className="save-indicator retry"><RotateCcw size={15} /> {copy.live.retrying}</span>;
  if (status === 'saving') return <span className="save-indicator saving"><Signal size={15} /> {copy.live.saving}</span>;
  return <span className="save-indicator saved"><CheckCircle2 size={15} /> {copy.live.saved}</span>;
}

function ConfirmDialog({ title, description, confirmLabel, cancelLabel = copy.live.cancelResult, onConfirm, onCancel, busy }: {
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
        <button className="modal-close" onClick={onClose} aria-label={copy.chrome.closeAria}><X size={19} /></button>
        <span className="dialog-icon"><Clock3 size={23} /></span>
        <h2 id="manual-title">{copy.live.endSetEarly}</h2>
        <p>{copy.live.partialSetScore(state.blueGames, state.redGames)}</p>
        {tied && <div className="inline-warning">{copy.live.tiedPartialWarning}</div>}
        <div className="choice-actions">
          {!tied && <button className="primary-button" onClick={() => onChoose('calculate')} disabled={busy}><Trophy size={18} /> {copy.live.calculatePartial}</button>}
          <button className="danger-button" onClick={() => onChoose('disregard')} disabled={busy}>{copy.live.disregardSet}</button>
          <button className="quiet-button" onClick={onClose}>{copy.live.continuePlaying}</button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ data, onClose }: { data: ActivityData; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="side-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-heading"><div><span className="eyebrow">{copy.live.historyEyebrow}</span><h2 id="history-title">{copy.live.scoreHistory}</h2></div><button className="modal-close" onClick={onClose} aria-label={copy.live.closeHistoryAria}><X size={20} /></button></div>
        <div className="history-list">
          {data.history.length === 0 ? <div className="empty-state compact"><History size={25} /><p>{copy.live.noScoreChanges}</p></div> : [...data.history].reverse().map((event) => (
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
      <span className="set-number">{copy.dashboard.setPrefix(log.setNumber)}</span>
      <div><span className="blue-text">{namesFor(players, log.bluePlayerIds)}</span><small>{copy.dashboard.vs}</small><span className="red-text">{namesFor(players, log.redPlayerIds)}</span></div>
      <div className="set-log-meta">
        <strong>{log.blueGames}-{log.redGames}</strong>
        <span className={`result-label ${log.conclusionType}`}>{conclusionLabel(log.conclusionType)}</span>
      </div>
    </div>
  );
}

function LoadingView() {
  return <main className="loading-view"><span className="brand-mark"><Activity size={22} /></span><strong>{copy.chrome.loading}</strong></main>;
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
  if (!response.ok) throw new Error(data.error ?? copy.errors.requestFailed);
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
  return number == null ? copy.live.activityUntitled : copy.live.activityTitle(number);
}

function matchSlotsFrom(players: Player[]): Player[] {
  const registered = [...players].sort((left, right) => left.id.localeCompare(right.id));
  const guests = Array.from(
    { length: MATCH_SLOT_COUNT - registered.length },
    (_unused, index) => ({
      id: guestSlotId(index + 1),
      name: copy.live.guestName(index + 1),
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

function nameForContextMember(bootstrap: BootstrapData, playerId: string) {
  if (playerId === bootstrap.user.id) return bootstrap.user.displayName;
  return bootstrap.mates.find((mate) => mate.id === playerId)?.name ?? copy.chrome.playerFallback;
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
  if (event.action === 'undo') return copy.live.undidLastPoint;
  if (event.action === 'cancel-game') return copy.live.canceledGameResult;
  return copy.live.pointToTeam(teamName(event.team ?? 'blue'));
}

function conclusionLabel(value: SetLogEntry['conclusionType']) {
  if (value === 'manual-partial') return copy.dashboard.conclusionPartial;
  if (value === 'disregarded') return copy.dashboard.conclusionDisregarded;
  if (value === 'abandoned') return copy.dashboard.conclusionAbandoned;
  return copy.dashboard.conclusionFinal;
}

function namesFor(players: Player[], ids: string[]) {
  return ids.map((id) => {
    if (isGuestSlot(id)) return copy.live.guestName(Number(id.slice('guest:'.length)));
    return players.find((player) => player.id === id)?.name ?? copy.chrome.playerFallback;
  }).join(' & ');
}

function groupName(players: Player[]) {
  if (!players.length) return copy.groups.emptyName;
  return players.map((player) => player.name.split(' ')[0]).join(' · ');
}

function teamName(team: TeamId) { return team === 'blue' ? copy.live.blueTeam : copy.live.redTeam; }
function deuceLabel(rule: ActivityConfig['deuceRule']) { return DEUCE_OPTIONS.find((option) => option.value === rule)?.label ?? rule; }
function setLabel(rule: ActivityConfig['setWinRule']) { return SET_OPTIONS.find((option) => option.value === rule)?.label ?? rule; }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
function displayName(value: string) { return value.includes('@') ? value.split('@')[0] : value; }
function initials(value: string) { return displayName(value).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'; }
function messageOf(error: unknown) { return error instanceof Error ? error.message : copy.errors.generic; }
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

function loadGroupListPrefs(userId: string) {
  if (typeof window === 'undefined') return parseGroupListPrefs(null);
  return parseGroupListPrefs(localStorage.getItem(groupListPrefsKey(userId)));
}

function saveGroupListPrefs(userId: string, prefs: { sort: GroupListSort; filter: GroupListFilter }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(groupListPrefsKey(userId), serializeGroupListPrefs(prefs));
}
