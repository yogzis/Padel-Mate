'use client';

import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  History,
  Link2,
  LogOut,
  Medal,
  Menu,
  Plus,
  RotateCcw,
  Share2,
  ShieldCheck,
  Signal,
  Smartphone,
  Trophy,
  UserRoundCheck,
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
  PlayerProfile,
  ScoreEvent,
  SetLogEntry,
  TeamId,
} from '../lib/domain';
import { awardPoint } from '../lib/scoring';

type AppUser = { id: string; displayName: string; email: string };
type BootstrapData = { user: AppUser; players: PlayerProfile[]; contexts: ContextSummary[] };
type ContextData = {
  context: ContextSummary;
  players: PlayerProfile[];
  leaderboard: LeaderboardEntry[];
  logs: SetLogEntry[];
  activities: Array<{
    id: string;
    activityNumber: number;
    status: string;
    startedAt: string;
    updatedAt: string;
    shareCode: string;
  }>;
};
type ActivityData = {
  activity: {
    id: string;
    contextId: string;
    activityNumber: number;
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
  players: PlayerProfile[];
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
};
type Screen = 'groups' | 'players' | 'context' | 'configure' | 'set-setup' | 'scoreboard';
type SaveStatus = 'saved' | 'saving' | 'retry' | 'offline';

const DEFAULT_CONFIG: ActivityConfig = {
  deuceRule: 'classic-advantage',
  setWinRule: 'standard-set',
  tieBreakRule: 'standard-tiebreak',
  pointsFormula: 'default-margin',
};

const DEUCE_OPTIONS = [
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
  {
    value: 'star-point' as const,
    label: 'Star Point',
    description: 'After two lost Advantage cycles, the next deuce point decides the game.',
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

export default function PadelApp({ initialUser, signOutPath }: { initialUser: AppUser; signOutPath: string }) {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [contextData, setContextData] = useState<ContextData | null>(null);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);
  const [screen, setScreen] = useState<Screen>('groups');
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
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [config, setConfig] = useState<ActivityConfig>(DEFAULT_CONFIG);
  const [bluePlayerIds, setBluePlayerIds] = useState<string[]>([]);
  const [modal, setModal] = useState<'history' | 'share' | 'manual' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const resumeAttempted = useRef(false);

  const loadBootstrap = useCallback(async () => {
    const data = await apiGet<BootstrapData>('bootstrap');
    setBootstrap(data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadBootstrap().catch((caught) => setError(messageOf(caught)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBootstrap]);

  const activeActivityId = activityData?.activity.status === 'active' ? activityData.activity.id : null;
  useEffect(() => {
    if (!activeActivityId || !deviceId) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await apiGet<ActivityData>('activity', {
          activityId: activeActivityId,
          deviceId,
        });
        rememberActivity(fresh);
        setActivityData((current) => {
          if (!current || fresh.activity.version >= current.activity.version) return fresh;
          return current;
        });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('offline');
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [activeActivityId, deviceId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openContext = async (contextId: string) => {
    setBusy(true);
    setError('');
    try {
      const data = await apiGet<ContextData>('context', { contextId });
      setContextData(data);
      setScreen('context');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const createOrOpenContext = async () => {
    if (selectedPlayerIds.length !== 4) {
      setError('Choose exactly four players for this scoring group.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await apiPost<ContextData>({ action: 'select-context', playerIds: selectedPlayerIds });
      setContextData(data);
      await loadBootstrap();
      setScreen('context');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = async () => {
    if (!newPlayerName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const player = await apiPost<PlayerProfile>({ action: 'create-player', name: newPlayerName });
      setBootstrap((current) => current ? { ...current, players: [...current.players, player].sort(nameSort) } : current);
      setNewPlayerName('');
      setNotice(`${player.name} was added.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const linkMe = async (playerId: string) => {
    setBusy(true);
    setError('');
    try {
      await apiPost({ action: 'link-player', playerId });
      await loadBootstrap();
      setNotice('Player profile linked to your account.');
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
      setBluePlayerIds(data.players.slice(0, 2).map((player) => player.id));
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
      setActivityData(data);
      rememberActivity(data);
      setContextData(null);
      setBluePlayerIds(data.activity.state.bluePlayerIds.length === 2
        ? data.activity.state.bluePlayerIds
        : data.players.slice(0, 2).map((player) => player.id));
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
  }, [deviceId, joinCode]);

  useEffect(() => {
    if (!deviceId || !bootstrap) return;
    if (resumeAttempted.current) return;
    resumeAttempted.current = true;
    const sharedCode = new URLSearchParams(window.location.search).get('join');
    const savedActivityId = localStorage.getItem('padel-mate-last-activity-id');
    const reference = sharedCode ?? savedActivityId;
    if (!reference) return;
    if (sharedCode) window.history.replaceState({}, '', window.location.pathname);
    const timer = window.setTimeout(() => {
      joinActivity(reference).then((joined) => {
        if (joined) return;
        if (!savedActivityId) return;
        const cached = localStorage.getItem(`padel-mate-recovery-${savedActivityId}`);
        if (!cached) return;
        try {
          const restored = JSON.parse(cached) as ActivityData;
          setActivityData(restored);
          setSaveStatus('offline');
          setScreen(restored.activity.state.phase === 'live' ? 'scoreboard' : 'set-setup');
        } catch {
          localStorage.removeItem(`padel-mate-recovery-${savedActivityId}`);
        }
      });
    }, 0);
    // The share code should be consumed only once after bootstrap.
    return () => window.clearTimeout(timer);
  }, [deviceId, bootstrap, joinActivity]);

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
      const contextId = activityData.activity.contextId;
      forgetActivity(activityData.activity.id);
      setActivityData(null);
      await loadBootstrap();
      await openContext(contextId);
      setNotice('Activity finished and saved.');
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
    setScreen(next);
  };

  const currentUser = bootstrap?.user ?? initialUser;
  const main = (() => {
    if (!bootstrap) return <LoadingView />;
    if (screen === 'players') {
      return (
        <PlayersView
          players={bootstrap.players}
          user={currentUser}
          name={newPlayerName}
          onNameChange={setNewPlayerName}
          onAdd={addPlayer}
          onLink={linkMe}
          busy={busy}
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
          onBack={() => setScreen('context')}
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
        onToggle={(id) => setSelectedPlayerIds((current) => togglePlayer(current, id))}
        onContinue={createOrOpenContext}
        onOpen={openContext}
        joinCode={joinCode}
        onJoinCode={setJoinCode}
        onJoin={() => joinActivity()}
        onAddPlayers={() => setScreen('players')}
        busy={busy}
      />
    );
  })();

  return (
    <div className={`app-shell ${screen === 'scoreboard' ? 'scoreboard-shell' : ''}`}>
      <AppHeader
        user={currentUser}
        signOutPath={signOutPath}
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
              setBluePlayerIds(result.players.slice(0, 2).map((player) => player.id));
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
        <ShareModal data={activityData} onClose={() => setModal(null)} />
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
              setBluePlayerIds(result.players.slice(0, 2).map((player) => player.id));
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
  signOutPath,
  screen,
  activity,
  menuOpen,
  onMenu,
  onNavigate,
  onLeave,
}: {
  user: AppUser;
  signOutPath: string;
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
          <button className={screen === 'players' ? 'active' : ''} onClick={() => onNavigate('players')}>Players</button>
        </nav>

        <div className="header-actions">
          {activity?.activity.status === 'active' && (
            <button className="live-pill" onClick={() => onNavigate(activity.activity.state.phase === 'live' ? 'scoreboard' : 'set-setup')}>
              <span /> Activity #{activity.activity.activityNumber}
            </button>
          )}
          <button className="menu-button" onClick={onMenu} aria-label="Open account menu" aria-expanded={menuOpen}>
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="account-menu">
              <div className="account-row">
                <span className="avatar avatar-1">{initials(user.displayName)}</span>
                <div><strong>{displayName(user.displayName)}</strong><small>{user.email}</small></div>
              </div>
              <button onClick={() => onNavigate('players')}><UsersRound size={17} /> Manage players</button>
              {activity?.activity.status === 'active' && <button onClick={onLeave}><LogOut size={17} /> Leave activity</button>}
              <a href={signOutPath}><LogOut size={17} /> Sign out</a>
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
  onAddPlayers,
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
  onAddPlayers: () => void;
  busy: boolean;
}) {
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
            {bootstrap.contexts.map((context) => {
              const players = context.playerIds.map((id) => bootstrap.players.find((player) => player.id === id)).filter(Boolean) as PlayerProfile[];
              return (
                <button key={context.id} className="group-row" onClick={() => onOpen(context.id)}>
                  <div className="avatar-stack">{players.map((player, index) => <span key={player.id} className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span>)}</div>
                  <div className="group-copy"><strong>{groupName(players)}</strong><span>{players.map((player) => player.name).join(', ')}</span></div>
                  <ChevronRight size={20} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="context-builder">
        <div className="builder-heading">
          <div><h2>Create or find a scoring group</h2><p>Select the exact four players. The matching leaderboard opens automatically.</p></div>
          <span className={selectedIds.length === 4 ? 'selection-count complete' : 'selection-count'}>{selectedIds.length}/4</span>
        </div>
        {bootstrap.players.length === 0 ? (
          <div className="empty-state"><UsersRound size={28} /><h3>Add your players first</h3><button className="primary-button" onClick={onAddPlayers}><Plus size={18} /> Add players</button></div>
        ) : (
          <>
            <div className="player-pick-grid">
              {bootstrap.players.map((player, index) => {
                const selected = selectedIds.includes(player.id);
                return (
                  <button key={player.id} className={`player-pick ${selected ? 'selected' : ''}`} onClick={() => onToggle(player.id)} disabled={!selected && selectedIds.length === 4}>
                    <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
                    <span><strong>{player.name}</strong><small>{player.profileType === 'linked' ? 'Linked player' : 'Managed player'}</small></span>
                    <span className="check-circle">{selected && <Check size={15} />}</span>
                  </button>
                );
              })}
            </div>
            <div className="builder-actions"><button className="secondary-button" onClick={onAddPlayers}><Plus size={18} /> New player</button><button className="primary-button" disabled={selectedIds.length !== 4 || busy} onClick={onContinue}>Open scoreboard <ChevronRight size={18} /></button></div>
          </>
        )}
      </section>
    </main>
  );
}

function PlayersView({ players, user, name, onNameChange, onAdd, onLink, busy }: {
  players: PlayerProfile[];
  user: AppUser;
  name: string;
  onNameChange: (value: string) => void;
  onAdd: () => void;
  onLink: (id: string) => void;
  busy: boolean;
}) {
  const alreadyLinked = players.some((player) => player.linkedUserId === user.id);
  return (
    <main className="page-content narrow-page">
      <section className="page-heading"><div><span className="eyebrow">Global players</span><h1>Player profiles</h1><p>Managed profiles can play and earn points without signing in.</p></div></section>
      <section className="add-player-band">
        <label htmlFor="player-name">Player name</label>
        <div><input id="player-name" value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onAdd(); }} placeholder="e.g. Maya Cohen" maxLength={40} /><button className="primary-button" onClick={onAdd} disabled={!name.trim() || busy}><Plus size={18} /> Add player</button></div>
      </section>
      <section className="player-directory">
        <div className="section-title"><h2>All players</h2><span>{players.length}</span></div>
        {players.length === 0 ? <div className="empty-line">No players yet.</div> : players.map((player, index) => (
          <div className="directory-row" key={player.id}>
            <span className={`avatar avatar-${index % 4 + 1}`}>{initials(player.name)}</span>
            <div><strong>{player.name}</strong><small>{player.profileType === 'linked' ? 'Linked to an account' : 'Managed profile'}</small></div>
            {player.linkedUserId === user.id ? <span className="linked-label"><UserRoundCheck size={15} /> You</span> : player.profileType === 'managed' && !alreadyLinked ? <button className="quiet-button" onClick={() => onLink(player.id)}>Link to me</button> : null}
          </div>
        ))}
      </section>
    </main>
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
        <button className="primary-button" onClick={onNewActivity}><Plus size={19} /> New activity</button>
      </section>

      <div className="dashboard-grid">
        <section className="leaderboard-panel">
          <div className="panel-heading"><div><Trophy size={20} /><h2>Group leaderboard</h2></div><span>{data.leaderboard.reduce((sum, entry) => sum + entry.setsPlayed, 0) / 4 || 0} sets</span></div>
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
        </section>

        <aside className="dashboard-side">
          <section className="players-strip">
            <div className="panel-heading"><div><UsersRound size={19} /><h2>Players</h2></div></div>
            <div>{data.players.map((player, index) => <span key={player.id}><span className={`avatar avatar-${index + 1}`}>{initials(player.name)}</span><small>{player.name}</small></span>)}</div>
          </section>
          {recoverableActivity && (
            <section className="resume-panel">
              <span className="live-dot"><span /> {recoverableActivity.status === 'active' ? 'Live activity' : 'Saved partial activity'}</span>
              <h3>Activity #{recoverableActivity.activityNumber}</h3>
              <button className="secondary-button" onClick={() => onOpenActivity(recoverableActivity.id)}>{recoverableActivity.status === 'active' ? 'Resume scoring' : 'Review result'} <ChevronRight size={17} /></button>
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
      <section className="points-rule"><ShieldCheck size={20} /><div><strong>Player points</strong><p>Winning players receive 10 points plus the set score difference. Losing players receive 0.</p></div></section>
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

function SetSetupView({ data, blueIds, onBlueChange, onStart, onShare, onFinish, busy }: {
  data: ActivityData;
  blueIds: string[];
  onBlueChange: (ids: string[]) => void;
  onStart: () => void;
  onShare: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const redPlayers = data.players.filter((player) => !blueIds.includes(player.id));
  const bluePlayers = data.players.filter((player) => blueIds.includes(player.id));
  return (
    <main className="page-content setup-page">
      <section className="activity-heading">
        <div><span className="live-dot"><span /> Activity #{data.activity.activityNumber}</span><h1>Set {data.activity.state.setNumber} teams</h1><p>Pick two players for Blue Team. The other two play for Red Team.</p></div>
        <button className="icon-text-button" onClick={onShare}><Share2 size={18} /> Share</button>
      </section>

      <section className="team-builder">
        <div className="team-preview blue-preview"><span>Blue Team</span><strong>{bluePlayers.length === 2 ? bluePlayers.map((player) => player.name).join(' & ') : 'Choose 2 players'}</strong></div>
        <div className="versus">VS</div>
        <div className="team-preview red-preview"><span>Red Team</span><strong>{redPlayers.length === 2 ? redPlayers.map((player) => player.name).join(' & ') : 'Waiting'}</strong></div>
      </section>

      <section className="assign-panel">
        <div className="section-title"><h2>Blue Team players</h2><span>{blueIds.length}/2 selected</span></div>
        <div className="assign-grid">
          {data.players.map((player, index) => {
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

      <div className="setup-actions"><button className="quiet-button" onClick={onFinish}>Finish activity</button><button className="primary-button" onClick={onStart} disabled={blueIds.length !== 2 || busy}>Start set {data.activity.state.setNumber} <ChevronRight size={18} /></button></div>
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
  return (
    <main className="scoreboard-page">
      <section className="score-statusbar">
        <div><span>Activity #{data.activity.activityNumber}</span><strong>Set {state.setNumber}</strong></div>
        <div className="status-items">
          <StatusIndicator status={status} />
          <span className="device-count"><Smartphone size={15} /> {data.devices.filter((device) => device.slotStatus !== 'released').length}/2</span>
          <button onClick={onHistory} aria-label="Score history" title="Score history"><History size={19} /></button>
          <button onClick={onShare} aria-label="Share activity" title="Share activity"><Share2 size={19} /></button>
          <button onClick={onLeave} aria-label="Leave activity" title="Leave activity"><LogOut size={19} /></button>
        </div>
      </section>

      <section className="score-court" aria-label="Live Padel scoreboard">
        <button className="score-team blue-team" onClick={() => onPoint('blue')} disabled={scoringDisabled} aria-label={`Point to Blue Team, ${blueNames}`}>
          <span className="team-label"><span className="team-dot" /> Blue Team</span>
          <span className="team-names">{blueNames}</span>
          <span className="score-number">{state.blueScore}</span>
          <span className="tap-label"><Plus size={17} /> Point</span>
        </button>

        <div className="center-score">
          <span className="games-label">Games</span>
          <div><strong>{state.blueGames}</strong><span>:</span><strong>{state.redGames}</strong></div>
          {decisive && <span className="decisive-label">{decisive}</span>}
        </div>

        <button className="score-team red-team" onClick={() => onPoint('red')} disabled={scoringDisabled} aria-label={`Point to Red Team, ${redNames}`}>
          <span className="team-label"><span className="team-dot" /> Red Team</span>
          <span className="team-names">{redNames}</span>
          <span className="score-number">{state.redScore}</span>
          <span className="tap-label"><Plus size={17} /> Point</span>
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

function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel, busy }: {
  title: string;
  description: string;
  confirmLabel: string;
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
        <div className="dialog-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Cancel result</button><button className="primary-button" onClick={onConfirm} disabled={busy}><Check size={18} /> {confirmLabel}</button></div>
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

function ShareModal({ data, onClose }: { data: ActivityData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/?join=${data.activity.shareCode}`;
  const message = `Join Padel Mate activity #${data.activity.activityNumber}. Session code: ${data.activity.shareCode}. ${link}`;
  const copy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <span className="dialog-icon"><Link2 size={23} /></span>
        <h2 id="share-title">Invite the second device</h2>
        <p>Only two connected or reserved devices can use this activity.</p>
        <div className="share-code"><span>Session code</span><strong>{data.activity.shareCode}</strong></div>
        <div className="share-actions">
          <button className="primary-button" onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Copied' : 'Copy invite'}</button>
          <a className="whatsapp-button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><Share2 size={18} /> WhatsApp</a>
        </div>
        <div className="device-slots">{data.devices.map((device) => <div key={device.deviceId}><Smartphone size={17} /><span><strong>{device.deviceLabel}</strong><small>{device.slotStatus}</small></span></div>)}</div>
      </div>
    </div>
  );
}

function SetLogRow({ log, players }: { log: SetLogEntry; players: PlayerProfile[] }) {
  return (
    <div className="set-log-row">
      <span className="set-number">S{log.setNumber}</span>
      <div><span className="blue-text">{namesFor(players, log.bluePlayerIds)}</span><small>vs</small><span className="red-text">{namesFor(players, log.redPlayerIds)}</span></div>
      <strong>{log.blueGames}-{log.redGames}</strong>
      <span className={`result-label ${log.conclusionType}`}>{conclusionLabel(log.conclusionType)}</span>
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

function togglePlayer(current: string[], id: string) {
  if (current.includes(id)) return current.filter((value) => value !== id);
  return current.length < 4 ? [...current, id] : current;
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

function namesFor(players: PlayerProfile[], ids: string[]) {
  return ids.map((id) => players.find((player) => player.id === id)?.name ?? 'Player').join(' & ');
}

function groupName(players: PlayerProfile[]) {
  if (!players.length) return 'Four-player group';
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
function nameSort(a: PlayerProfile, b: PlayerProfile) { return a.name.localeCompare(b.name); }
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
