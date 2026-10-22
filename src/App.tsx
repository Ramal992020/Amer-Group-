import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarCheck,
  ListOrdered,
  FileText,
  UserCog,
  Menu,
  X,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  RotateCcw,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  RotateCcw as RotateReset,
  Zap,
  Activity,
  Clock,
  Crown,
  UserCheck,
  PhoneCall,
  Users,
  Loader2,
  ArrowLeftRight,
  Moon,
  Sun,
} from 'lucide-react';
import {
  HEADS as DEFAULT_HEADS,
  MANAGERS as DEFAULT_MANAGERS,
  SALES as DEFAULT_SALES,
  computeTurnPlan,
  successorTeam,
  canAdoptRemoteOrg,
  swapInCustomOrder,
  teamRoundFrom,
  turnPinFor,
  availableTeamMembers,
  usesFixedTeamRotation,
  carryOverForNewDay,
  createNewDaySalesState,
  reconcileCounts,
  defaultSalesState,
  loadPersisted,
  savePersisted,
  hydrate,
  hydrateOrgChart,
  orgChartKey,
  mirrorOrgChart,
  mergeOrgCharts,
  normalizeTeamCycle,
  otherWorkspace,
  setActiveAccount,
  formatTime,
  changeSalesAttendance,
  setSalesAttendanceTime,
  activeOrg,
  clearSalesAttendance,
  isPersonDisabled,
} from './lib/walkin';
import {
  applyOrgChart,
  renameHead,
  renameManager,
  renameSalesPerson,
  setHeadDisabled,
  setManagerDisabled,
  setSalesPersonDisabled,
} from './lib/org';
import type { OrgState } from './lib/org';
import type {
  Assignment,
  CarryOver,
  TurnPlan,
  HeadGroup,
  ManagerTeam,
  OrgChart,
  OrgChartSource,
  SalesPerson,
  SalesState,
  PersistedWalkin,
  PinnedTurn,
  TeamCycleSettings,
  TeamTurn,
  UndoEntry,
  AttendanceAction,
} from './lib/walkin';
import { LoginScreen } from './components/LoginScreen';
import { WorkspaceGate } from './components/WorkspaceGate';
import {
  useSupabaseAuth,
  signOutFromSupabase,
  getGoogleProfile,
  getSavedWorkspace,
  saveWorkspace,
} from './lib/auth';
import type { GoogleProfile, Workspace } from './lib/auth';
import { SyncCard } from './components/SyncCard';
import { BackupPanel } from './components/BackupPanel';
import { saveAutomaticBackup } from './lib/backups';
import {
  pullRemote,
  pushRemote,
  subscribeRemote,
  syncNow,
  testConnection,
  normalizeUrl,
  getSyncConfig,
  getLastSyncError,
  SHARED_ORG_ACCOUNT,
} from './lib/sync';
import type { SyncConfig, SyncStatus } from './lib/sync';
import { decideSync, nextLocalRevision, pendingStampOf } from './lib/syncRevision';
import { CurrentTurn } from './components/CurrentTurn';
import type { BranchVisit, TeamMemberOption, UpcomingTeam } from './components/CurrentTurn';
import { AttendanceBoard } from './components/AttendanceBoard';
import { HistoryPanel } from './components/HistoryPanel';
import { ClientExcelBuilder } from './components/ClientExcelBuilder';
import { ClientRegistration } from './components/ClientRegistration';
import { DoneReceipt } from './components/DoneReceipt';
import { AddMemberPanel, ManageOrgPanel } from './components/ManageOrgPanel';
import { CycleSettingsPanel } from './components/CycleSettingsPanel';
import { AmerLogo } from './components/AmerLogo';
import {
  Modal,
  StatCard,
  SectionTitle,
  EmptyState,
  ToastProvider,
  useToast,
  SkeletonCard,
  SkeletonRow,
} from './components/ui';
import { cn } from './utils/cn';

interface DoneInfo {
  assignment: Assignment;
  /** The team that follows the served one (attendance ignored) — shown as «Next». */
  next: ManagerTeam | null;
}

/**
 * Default visit type for a branch: RESTA visits are «Resta», everything else
 * (SITE) is «Site». Restored after every confirmed client.
 */
const defaultVisitFor = (account: string): BranchVisit =>
  account.trim().toUpperCase() === 'RESTA' ? 'resta' : 'site';

type Tab = 'dashboard' | 'today' | 'log' | 'order' | 'manage';
type Branch = 'SITE' | 'RESTA';

const asBranch = (value: string | null | undefined): Branch | null => {
  const branch = value?.trim().toUpperCase();
  return branch === 'SITE' || branch === 'RESTA' ? branch : null;
};

const branchLabel = (branch: Branch): string => branch === 'SITE' ? 'الموقع' : 'ريستا';

type RemoteAttendanceResult =
  | { kind: 'ok'; state: PersistedWalkin; updatedAt: number; changed: boolean }
  | { kind: 'busy' }
  | { kind: 'missing' }
  | { kind: 'failed' };

// ─── Sync timings ───
/** How often we look for other devices' edits while the app is on screen. */
const SYNC_POLL_VISIBLE_MS = 4000;
/** Slower (but never zero) cadence for a backgrounded tab / locked phone. */
const SYNC_POLL_HIDDEN_MS = 15000;
/** Coalesce rapid taps (attendance toggles) into a single upload. */
const SYNC_PUSH_DEBOUNCE_MS = 400;
/** Automatic reconnect attempts after a failed boot sync (exponential backoff). */
const MAX_SYNC_RETRIES = 6;
/** Give up auto-retrying an upload after this many consecutive failures. */
const MAX_PUSH_RETRIES = 8;
/**
 * How often the SHARED org chart is polled (it changes far less often than
 * attendance, so it does not need the 4s cadence; Realtime + the foreground
 * sync make it instant when the table is published).
 */
const SYNC_ORG_POLL_MS = 20000;
const SYNC_ORG_POLL_HIDDEN_MS = 60000;

/** شاشة انتظار التحقق من الجلسة — لا يُعرض أي شيء من التطبيق قبل انتهائها. */
function AuthSplash() {
  return (
    <div dir="rtl" className="fixed inset-0 z-[999] grid place-items-center bg-ink-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-mesh" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="anim-fade-up rounded-2xl bg-white px-6 py-4 shadow-[0_10px_30px_-12px_rgba(20,23,31,0.18)] ring-1 ring-ink-100">
          <AmerLogo className="w-[150px]" variant="dark" />
        </div>
        <div className="flex items-center gap-2 text-[12px] font-bold text-ink-400">
          <Loader2 className="size-4 animate-spin text-brand-600" />
          جارٍ التحقق من الجلسة مع Supabase…
        </div>
      </div>
    </div>
  );
}

/**
 * جذر التطبيق — الحارس الوحيد للدخول:
 *   loading     ← شاشة التحقق من الجلسة ضد Supabase
 *   signed-out  ← شاشة Sign in with Google فقط (لا يوجد Mock/Guest/Auto Login)
 *   signed-in   ← اختيار مساحة العمل (إن لزم) ثم التطبيق
 */
export default function App() {
  const { status, user, verified } = useSupabaseAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [switching, setSwitching] = useState(false);

  // استرجاع/تصفير مساحة العمل المفضلة تبعاً لحالة الجلسة القادمة من Supabase.
  useEffect(() => {
    if (status === 'signed-in' && user) {
      setWorkspace(getSavedWorkspace(user.id));
      setSwitching(false);
    } else if (status === 'signed-out') {
      setWorkspace(null);
      setSwitching(false);
    }
  }, [status, user]);

  useEffect(() => {
    if (workspace) setActiveAccount(workspace);
  }, [workspace]);

  // 1) جارٍ التحقق من الجلسة مع Supabase — منع أي وميض للتطبيق أو شاشة الدخول.
  if (status === 'loading') return <AuthSplash />;

  // 2) لا توجد جلسة صالحة من Supabase → شاشة الدخول عبر Google فقط.
  if (status === 'signed-out' || !user) return <LoginScreen />;

  // 3) جلسة موثّقة بدون مساحة عمل محفوظة (أو المستخدم طلب تبديل الفرع).
  const profile = getGoogleProfile(user);
  if (!workspace || !profile || switching) {
    return (
      <WorkspaceGate
        profile={
          profile ?? { name: 'مستخدم Google', email: user.email ?? '', avatarUrl: null }
        }
        verified={verified}
        onPick={(ws) => {
          saveWorkspace(user.id, ws);
          setWorkspace(ws);
          setSwitching(false);
        }}
        onLogout={() => void signOutFromSupabase()}
        onCancel={switching ? () => setSwitching(false) : undefined}
      />
    );
  }

  // 4) الدخول للتطبيق — جلسة Supabase ناجحة + مساحة عمل محددة.
  return (
    <ToastProvider>
      <WalkInApp
        key={workspace}
        account={workspace}
        profile={profile}
        onLogout={() => void signOutFromSupabase()}
        onSwitchWorkspace={() => setSwitching(true)}
      />
    </ToastProvider>
  );
}

const NAV: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'today', label: 'الحضور', icon: CalendarCheck },
  { id: 'order', label: 'الترتيب', icon: ListOrdered },
  { id: 'log', label: 'السجل', icon: FileText },
  { id: 'manage', label: 'الهيكل', icon: UserCog },
];

const TITLES: Record<Tab, { title: string; sub: string }> = {
  dashboard: { title: 'لوحة التحكم', sub: 'نظرة شاملة على حركة الـ Walk-In اليوم' },
  today: { title: 'الحضور', sub: 'سجّل حضور السيلز وتابع الحالة لحظياً' },
  order: { title: 'الترتيب', sub: 'الترتيب بالمديرين — والسيلز يُختار يدوياً من التيم' },
  log: { title: 'السجل', sub: 'كل عمليات التوزيع التي تمت اليوم' },
  manage: { title: 'الهيكل', sub: 'إدارة الفرق والمزامنة بين الأجهزة' },
};

function WalkInApp({
  account,
  profile,
  onLogout,
  onSwitchWorkspace,
}: {
  account: string;
  profile: GoogleProfile;
  onLogout: () => void;
  onSwitchWorkspace: () => void;
}) {
  const toast = useToast();
  const isFixedTeamWorkspace = usesFixedTeamRotation(account);
  const [boot] = useState(() => {
    // Scope local storage to this account BEFORE reading it: the parent effect
    // that calls setActiveAccount() has not run yet on a cold start.
    setActiveAccount(account);
    return loadPersisted(account);
  });
  const [heads, setHeads] = useState<HeadGroup[]>(boot.customHeads || DEFAULT_HEADS);
  const [managers, setManagers] = useState<ManagerTeam[]>(boot.customManagers || DEFAULT_MANAGERS);
  const [sales, setSales] = useState<SalesPerson[]>(boot.customSales || DEFAULT_SALES);

  // Roster bookkeeping shared by SITE & RESTA: ids deleted by the user (so the
  // built-in defaults never resurrect them) and the revision of the shared
  // chart this device has already seen/published.
  const [removedIds, setRemovedIds] = useState<string[]>(boot.removedIds ?? []);
  const [sharedOrgRev, setSharedOrgRev] = useState<number>(boot.orgRevision ?? 0);

  // طريقة ترتيب الأدوار («الترتيب» tab) — shared by both branches through the
  // org row, so one choice re-orders SITE and RESTA together. Falls back to
  // the built-in fixed cycle when nothing was configured yet.
  const [cycleSettings, setCycleSettings] = useState<TeamCycleSettings>(() =>
    normalizeTeamCycle(boot.teamCycle),
  );

  const [salesState, setSalesState] = useState<Record<string, SalesState>>(boot.salesState);
  const [history, setHistory] = useState<Assignment[]>(boot.history);
  const [counter, setCounter] = useState(boot.counter);
  const [seq, setSeq] = useState(boot.seq);
  const [startingHead, setStartingHead] = useState(boot.startingHead);
  const [carryOver, setCarryOver] = useState<CarryOver | null>(boot.carryOver);
  // «الدور من هنا» — تيم مثبَّت عليه الدور باليد (بيمشي زي ما هو، من غير ما
  // يلمس ترتيب الدورة). بيتحفظ مع يوم الفرع وبيتشال أول ما التيم ده يخدم.
  const [pinnedTurn, setPinnedTurn] = useState<PinnedTurn | null>(boot.pinnedTurn ?? null);
  const [lastResetAt, setLastResetAt] = useState<string | null>(boot.lastResetAt);
  const [clientLabel, setClientLabel] = useState('');
  const [visitType, setVisitType] = useState<BranchVisit>(() => defaultVisitFor(account));
  useEffect(() => {
    setVisitType(defaultVisitFor(account));
  }, [account]);
  const [paused, setPaused] = useState(false);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('amer-theme') === 'dark';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('amer-theme', darkMode ? 'dark' : 'light');
    } catch {
      // Storage may be unavailable in private browsing contexts.
    }
  }, [darkMode]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState(true);

  // ── Sync (Supabase Project URL + Publishable Key) ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [syncRetry, setSyncRetry] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Bumped after every successful connect so the Realtime channel (re)opens.
  const [realtimeGen, setRealtimeGen] = useState(0);

  /**
   * Revision of the snapshot on screen: a revision the CLOUD confirmed (read
   * from the row, or accepted from a write) — or, while an edit is unsent, the
   * stamp of that edit. It is never bumped just because the screen re-rendered:
   * that is what let a device which only *opened* the app overwrite the row the
   * other device had worked on (see `src/lib/syncRevision.ts`).
   */
  const revisionRef = useRef<number>(boot.localPendingStamp ?? boot.updatedAt ?? 0);
  const applyingRemoteRef = useRef(false);
  const lastSavedStateRef = useRef<PersistedWalkin>(boot);
  /** The first save after a reload is the saved copy, not an edit. */
  const firstSaveDoneRef = useRef(false);
  // Cloud is usable only after a successful connect/pull this session.
  const syncReadyRef = useRef(false);
  // Local edits that are not confirmed in the cloud yet — they must never be
  // dropped, otherwise a toggle made on the phone can be lost on the laptop.
  // Sequence based (not a boolean) so a change that lands *while* an upload is
  // in flight is still recognised as pending.
  // An edit that was made offline and survived a reload still counts as
  // unsent, so it is pushed (if it is newer than the row) instead of lost.
  const dirtySeqRef = useRef(boot.localPendingStamp ? 1 : 0);
  const syncedSeqRef = useRef(0);
  const isDirty = (): boolean => dirtySeqRef.current !== syncedSeqRef.current;
  // One upload at a time (mobile networks hate parallel writes).
  const pushingRef = useRef(false);
  /** A two-branch attendance move owns both rows until it finishes. */
  const branchAttendanceInFlightRef = useRef(false);
  // Consecutive failed uploads / reconnect attempts.
  const pushFailuresRef = useRef(0);
  const syncAttemptsRef = useRef(0);
  // Break the push ⇄ pull cycle without stale closures.
  const flushPushRef = useRef<() => Promise<void>>(async () => {});
  const pullNowRef = useRef<() => Promise<void>>(async () => {});
  // Shared-roster plumbing (same pattern: refs, so intervals/timers never see
  // a stale closure).
  const sharedOrgRevRef = useRef<number>(boot.orgRevision ?? 0);
  /** Set when THIS device edited the roster and the shared row is not updated yet. */
  const orgDirtyRef = useRef(false);
  const localChartRef = useRef<OrgChart>({
    heads: boot.customHeads || DEFAULT_HEADS,
    managers: boot.customManagers || DEFAULT_MANAGERS,
    sales: boot.customSales || DEFAULT_SALES,
    removedIds: boot.removedIds ?? [],
    cycle: normalizeTeamCycle(boot.teamCycle),
  });
  const adoptSharedOrgRef = useRef<(chart: OrgChart, revision: number) => void>(() => {});
  const pullSharedOrgRef = useRef<() => Promise<boolean>>(async () => false);
  const pushSharedOrgRef = useRef<(chart?: OrgChart) => Promise<void>>(async () => {});

  const setOrgRevision = (revision: number): void => {
    sharedOrgRevRef.current = revision;
    setSharedOrgRev(revision);
  };

  // Undo log — persisted + synced so "تراجع" restores the exact queue position
  // even after a reload (or on another device).
  const [undoStack, setUndoStack] = useState<UndoEntry[]>(boot.undoStack || []);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 450);
    return () => clearTimeout(t);
  }, []);

  // Built-in people are merged into older saved data by `hydrate()` — which
  // `loadPersisted()` already ran before this component existed (the saved copy
  // wins for the same id, deleted ids stay deleted, new built-ins are appended).
  // It deliberately does NOT happen in a mount effect any more: that effect
  // rewrote the board right after a reload, which the save effect then read as
  // "the user edited something" and stamped with a brand-new revision.

  const snapshot = useMemo(
    () => ({
      salesState,
      history,
      counter,
      seq,
      startingHead,
      carryOver,
      pinnedTurn,
      lastResetAt,
      customHeads: heads,
      customManagers: managers,
      customSales: sales,
      removedIds,
      orgRevision: sharedOrgRev,
      teamCycle: cycleSettings,
      undoStack,
    }),
    [
      salesState,
      history,
      counter,
      seq,
      startingHead,
      carryOver,
      pinnedTurn,
      lastResetAt,
      heads,
      managers,
      sales,
      removedIds,
      sharedOrgRev,
      cycleSettings,
      undoStack,
    ],
  );

  /**
   * The roster as it is shared by SITE and RESTA: the built-in people plus the
   * saved/renamed ones, minus whoever was deleted.
   */
  const localChart = useMemo<OrgChart>(
    () => hydrateOrgChart({ heads, managers, sales, removedIds, cycle: cycleSettings }),
    [heads, managers, sales, removedIds, cycleSettings],
  );
  // Assigned during render on purpose: a network response that lands right
  // after another state change must never read the previous roster (an effect
  // would still be holding the old values at that moment).
  localChartRef.current = localChart;
  const liveRef = useRef({ heads, managers, sales, history, carryOver, removedIds });
  liveRef.current = { heads, managers, sales, history, carryOver, removedIds };

  // Keep the OTHER branch's local bucket in step with the roster, so switching
  // branch on this device shows the new names instantly — even before the
  // cloud is reachable. (Other devices get it from the shared row.)
  useEffect(() => {
    mirrorOrgChart(account, localChart, sharedOrgRevRef.current);
  }, [account, localChart]);

  // Latest render's snapshot, so a debounced upload never sends stale data.
  const latestSnapshotRef = useRef<PersistedWalkin>(snapshot);
  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  const applyRemote = useCallback((remote: Record<string, unknown>, revision?: number) => {
    const state = hydrate(remote as never);
    applyingRemoteRef.current = true;
    saveAutomaticBackup(account, lastSavedStateRef.current);
    // The revision of the row we just read — never `Date.now()`. A device that
    // invents a revision for data received from the cloud ends up outranking
    // it on the next comparison and pushing the older copy back.
    const confirmed =
      typeof revision === 'number' ? revision : typeof state.updatedAt === 'number' ? state.updatedAt : 0;
    revisionRef.current = confirmed;
    setSalesState(state.salesState);
    setHistory(state.history);
    setCounter(state.counter);
    setSeq(state.seq);
    setStartingHead(state.startingHead);
    setCarryOver(state.carryOver);
    setPinnedTurn(state.pinnedTurn ?? null);
    setLastResetAt(state.lastResetAt);
    // The roster (Heads / managers / sales) is SHARED by both branches, so a
    // branch row only wins when its copy is at least as fresh as the shared
    // chart this device already holds. An older copy is ignored and the row is
    // marked dirty, which republishes today's roster into it instead of
    // letting a stale row undo a name that was edited in the other branch.
    const incomingOrgRev = state.orgRevision ?? 0;
    // A same-revision copy must not replace a roster this device edited and has
    // not published yet (that is how a custom turn order used to revert to auto).
    let republishRoster = false;
    if (canAdoptRemoteOrg(incomingOrgRev, sharedOrgRevRef.current, orgDirtyRef.current)) {
      if (state.customHeads) setHeads(state.customHeads);
      if (state.customManagers) setManagers(state.customManagers);
      if (state.customSales) setSales(state.customSales);
      if (Array.isArray(state.removedIds)) setRemovedIds(state.removedIds);
      // The turn-order settings ride the same freshness guard as the roster,
      // so an older snapshot can never undo a newer cycle choice.
      setCycleSettings(normalizeTeamCycle(state.teamCycle));
      setOrgRevision(incomingOrgRev);
    } else if (state.customHeads) {
      republishRoster = true;
    }
    if (Array.isArray(state.undoStack)) setUndoStack(state.undoStack);
    // Our roster is newer than the row's copy, so the row is updated from this
    // device. That is an edit like any other: it needs its own stamp, otherwise
    // the revision-guarded write is refused as stale and the two devices keep
    // re-reading each other without ever converging.
    const stamp = republishRoster ? nextLocalRevision(confirmed, syncNow()) : confirmed;
    if (republishRoster) {
      revisionRef.current = stamp;
      dirtySeqRef.current += 1;
    }
    const saved: PersistedWalkin = republishRoster
      ? {
          ...state,
          // Keep OUR roster: it is the one being published back to the row.
          customHeads: localChartRef.current.heads,
          customManagers: localChartRef.current.managers,
          customSales: localChartRef.current.sales,
          removedIds: localChartRef.current.removedIds,
          teamCycle: localChartRef.current.cycle,
          updatedAt: stamp,
          localPendingStamp: stamp,
        }
      : { ...state, updatedAt: stamp, localPendingStamp: undefined };
    savePersisted(saved, account);
    lastSavedStateRef.current = saved;
    firstSaveDoneRef.current = true;
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, [account]);

  /**
   * Apply the SHARED roster (a chart that another branch just published).
   *
   * Renames go through `applyOrgChart`, so this branch's history, its
   * carried-over team and every served turn show the corrected name, and a
   * member added in the other branch gets an attendance row here (absent until
   * somebody checks them in — attendance itself stays per branch).
   */
  const adoptSharedOrg = useCallback(
    (chart: OrgChart, revision: number) => {
      if (orgChartKey(chart) === orgChartKey(localChartRef.current)) {
        // Same roster — only remember how fresh the shared row is.
        setOrgRevision(revision);
        return;
      }
      const live = liveRef.current;
      const next = applyOrgChart(
        {
          heads: live.heads,
          managers: live.managers,
          sales: live.sales,
          history: live.history,
          carryOver: live.carryOver,
          removedIds: live.removedIds,
        },
        chart,
      );
      setHeads(next.heads);
      setManagers(next.managers);
      setSales(next.sales);
      setHistory(next.history);
      setCarryOver(next.carryOver);
      setRemovedIds(next.removedIds ?? []);
      // نفس طريقة الترتيب على الفرعين — الدورة تسافر مع الهيكل المشترك.
      setCycleSettings(normalizeTeamCycle(chart.cycle));
      // New people start as «لم يحضر»; existing attendance is preserved unless
      // the person was disabled from «الهيكل» (which clears any active check-in).
      setSalesState((prev) => {
        const merged = defaultSalesState(next.sales);
        next.sales.forEach((person) => {
          if (prev[person.id]) {
            merged[person.id] = isPersonDisabled(person, next.managers, next.heads)
              ? { ...prev[person.id], status: 'absent', checkInOrder: null, checkInTime: null }
              : { ...merged[person.id], ...prev[person.id] };
          }
        });
        return merged;
      });
      setOrgRevision(revision);
      mirrorOrgChart(account, chart, revision);
      toast('info', 'تم تحديث الهيكل من الفرع الآخر');
    },
    [account, toast],
  );
  useEffect(() => {
    adoptSharedOrgRef.current = adoptSharedOrg;
  }, [adoptSharedOrg]);

  /** Read the shared roster row. Returns whether a row was found. */
  const pullSharedOrg = useCallback(async (): Promise<boolean> => {
    if (!syncReadyRef.current) return false;
    const remote = await pullRemote(SHARED_ORG_ACCOUNT, undefined, getSyncConfig(account));
    if (!remote) return false;
    const chart = hydrateOrgChart(remote.payload as OrgChartSource);
    if (remote.updatedAt > sharedOrgRevRef.current) {
      // A newer roster from the other branch — unless this device has its own
      // unpublished edit, which is pushed with a newer stamp instead.
      if (!orgDirtyRef.current) adoptSharedOrgRef.current(chart, remote.updatedAt);
      return true;
    }
    // The row is not ahead of us: publish ours when it differs (this also
    // re-creates the row if it was removed).
    if (orgDirtyRef.current || orgChartKey(chart) !== orgChartKey(localChartRef.current)) {
      await pushSharedOrgRef.current();
    }
    return true;
  }, [account]);
  useEffect(() => {
    pullSharedOrgRef.current = pullSharedOrg;
  }, [pullSharedOrg]);

  /** Publish a roster (default: this device's) to the row both branches read. */
  const pushSharedOrg = useCallback(async (chartToPush?: OrgChart): Promise<void> => {
    if (!syncReadyRef.current) return;
    const chart = chartToPush ?? localChartRef.current;
    const stamp = Math.max(syncNow(), sharedOrgRevRef.current + 1);
    const result = await pushRemote(
      SHARED_ORG_ACCOUNT,
      { ...chart, updatedAt: stamp },
      stamp,
      getSyncConfig(account),
    );
    if (result === 'written') {
      orgDirtyRef.current = false;
      setOrgRevision(stamp);
      mirrorOrgChart(account, chart, stamp);
    } else if (result === 'stale') {
      // Another device published a newer roster while we were writing.
      orgDirtyRef.current = false;
      await pullSharedOrgRef.current();
    }
    // 'failed' keeps `orgDirty` set so the next tick retries it.
  }, [account]);
  useEffect(() => {
    pushSharedOrgRef.current = pushSharedOrg;
  }, [pushSharedOrg]);

  /**
   * Boot/connect step: make this device and the shared row agree. Our own
   * pending edit wins; otherwise the fresher roster is adopted; when the row
   * does not exist yet it is created from this device's roster.
   */
  const reconcileSharedOrg = useCallback(async (): Promise<void> => {
    if (orgDirtyRef.current) {
      await pushSharedOrgRef.current();
      return;
    }
    const found = await pullSharedOrgRef.current();
    if (found) return;
    // No shared row yet (first run after this feature, or the row was deleted):
    // create it from BOTH branches so a member that only exists in the other
    // one is not dropped. From here on the shared chart is the source of truth.
    const other = otherWorkspace(account);
    const otherRow = other ? await pullRemote(other, undefined, getSyncConfig(account)) : null;
    const seed = otherRow
      ? mergeOrgCharts(localChartRef.current, hydrateOrgChart(otherRow.payload as OrgChartSource))
      : localChartRef.current;
    await pushSharedOrgRef.current(seed);
  }, [account]);

  /** Mark the roster as edited locally so the shared row is republished. */
  const markOrgEdited = (): void => {
    orgDirtyRef.current = true;
  };

  /** حفظ طريقة ترتيب جديدة («الترتيب» tab) ونشرها للفرع الآخر مع الهيكل المشترك. */
  const updateCycleSettings = (next: TeamCycleSettings, message?: string): void => {
    setCycleSettings(normalizeTeamCycle(next));
    markOrgEdited();
    toast('success', message ?? 'تم حفظ الدورة وتثبيتها');
  };

  /** Reconnect with exponential backoff after a transient failure. */
  const scheduleReconnect = useCallback(() => {
    if (syncAttemptsRef.current >= MAX_SYNC_RETRIES) return;
    syncAttemptsRef.current += 1;
    const delay = Math.min(30000, 4000 * 2 ** (syncAttemptsRef.current - 1));
    window.setTimeout(() => setSyncRetry((n) => n + 1), delay);
  }, []);

  /**
   * Upload the current local state. Returns without doing anything when an
   * upload is already in flight.
   *
   *  - 'written' → cloud is now in sync, local revision confirmed
   *  - 'stale'   → another device wrote something newer: adopt theirs instead
   *                of overwriting it (this is what used to erase a colleague's
   *                attendance registration)
   *  - 'failed'  → stay dirty so the next tick / foreground retries it
   */
  const flushPush = useCallback(async (): Promise<void> => {
    if (!syncReadyRef.current || pushingRef.current || branchAttendanceInFlightRef.current) return;
    pushingRef.current = true;
    const sentSeq = dirtySeqRef.current;
    // The stamp of the EDIT, not of the upload. Bumping it at upload time made
    // the server-side `updated_at=lt.` guard useless: every push looked like the
    // newest write on the shared clock, even one carrying a two-day-old board.
    // With the edit's own stamp, a row written later by another device makes
    // this upload answer `stale` — and its data is kept instead of clobbered.
    const stamp = revisionRef.current || syncNow();
    const payload: PersistedWalkin = {
      ...latestSnapshotRef.current,
      updatedAt: stamp,
      // Local bookkeeping must never ride the shared row.
      localPendingStamp: undefined,
    };
    try {
      const result = await pushRemote(account, payload, stamp);
      if (result === 'written') {
        // Only mark clean if nothing newer happened while we were uploading.
        if (sentSeq === dirtySeqRef.current) syncedSeqRef.current = sentSeq;
        pushFailuresRef.current = 0;
        revisionRef.current = stamp;
        lastSavedStateRef.current = payload;
        savePersisted(payload, account);
        setSyncStatus('synced');
        setLastSyncAt(Date.now());
      } else if (result === 'stale') {
        // A newer row exists (written later on the shared clock). Its data wins;
        // pulling is what makes the screen match every other device.
        if (sentSeq === dirtySeqRef.current) syncedSeqRef.current = sentSeq;
        await pullNowRef.current();
        toast('info', 'تم تحديث البيانات من جهاز آخر على نفس الحساب');
      } else {
        // Keep the edit (and its stamp) pending: the next tick retries it, and
        // it is stamped in localStorage so a reload does not lose it either.
        pushFailuresRef.current += 1;
        setSyncStatus('error');
        savePersisted({ ...payload, localPendingStamp: stamp }, account);
        lastSavedStateRef.current = payload;
      }
    } finally {
      pushingRef.current = false;
    }
  }, [account, toast]);
  useEffect(() => {
    flushPushRef.current = flushPush;
  }, [flushPush]);

  /** Pull the shared row and adopt it when it is newer than our copy. */
  const pullNow = useCallback(async (): Promise<void> => {
    if (!syncReadyRef.current) return;
    const remote = await pullRemote(account);
    if (!remote) {
      setSyncStatus('error');
      return;
    }
    setSyncStatus('synced');
    setLastSyncAt(Date.now());
    const action = decideSync({
      remoteRevision: remote.updatedAt,
      localRevision: revisionRef.current,
      hasPendingEdits: isDirty(),
      mode: 'poll',
    });
    if (action === 'adopt-remote') {
      if (isDirty()) {
        // Their write is newer than ours, so ours would be refused anyway. Say
        // it out loud instead of letting the screen keep a copy nobody else has.
        syncedSeqRef.current = dirtySeqRef.current;
        toast('info', 'تم تحديث البيانات من جهاز آخر على نفس الحساب');
      }
      applyRemote(remote.payload, remote.updatedAt);
    } else if (action === 'push-local') {
      // Our own edit is still pending — send it rather than dropping it.
      await flushPushRef.current();
    }
  }, [account, applyRemote, toast]);
  useEffect(() => {
    pullNowRef.current = pullNow;
  }, [pullNow]);

  /** One tick drives both directions: upload pending edits, else poll. */
  const syncTick = useCallback((): void => {
    if (!syncReadyRef.current) return;
    // A roster edit is tiny and independent from the attendance push.
    if (orgDirtyRef.current) void pushSharedOrgRef.current();
    if (isDirty() && pushFailuresRef.current < MAX_PUSH_RETRIES) {
      void flushPushRef.current();
    } else {
      void pullNowRef.current();
    }
  }, []);

  /**
   * Connect to Supabase (credentials typed or built-in defaults), then pull
   * this account's shared row and mark the session as cloud-ready.
   */
  const runSync = async (input?: { url: string; key: string }): Promise<void> => {
    setSyncStatus('connecting');
    syncReadyRef.current = false;
    // Built-in/default credentials on boot; typed values on explicit connect.
    const cfg: SyncConfig = input
      ? { url: normalizeUrl(input.url), key: input.key.trim() }
      : getSyncConfig(account);
    const test = await testConnection(cfg, account);

    if (test === 'bad-credentials') {
      setSyncStatus('error');
      toast('error', 'المفتاح أو الرابط غير صحيح');
      return;
    }
    if (test === 'network-error') {
      setSyncStatus('offline');
      scheduleReconnect();
      toast('info', 'لا يوجد اتصال بالإنترنت — يعمل التطبيق محلياً');
      return;
    }
    if (test === 'no-table') {
      setSyncStatus('error');
      toast('error', 'شغّل ملف SQL في Supabase أولاً (التعليمات في كارت المزامنة)');
      return;
    }
    if (test === 'no-access') {
      setSyncStatus('error');
      toast('error', 'الجدول موجود لكن سياسة الوصول (RLS) تمنع القراءة/الكتابة — شغّل ملف SQL مرة أخرى');
      return;
    }

    const seed = { ...latestSnapshotRef.current, updatedAt: revisionRef.current || syncNow() };
    const remote = await pullRemote(account, seed);
    if (!remote) {
      setSyncStatus('error');
      scheduleReconnect();
      toast('error', 'تعذّر قراءة بيانات المزامنة من المشروع');
      return;
    }
    syncAttemptsRef.current = 0;
    // ── The reference is the CLOUD row, not whatever this device had saved ──
    // Opening the app (or reconnecting) must show what the other devices
    // already did. Only edits this device made and never managed to upload may
    // outrank the row, and only while they are newer than it.
    const action = decideSync({
      remoteRevision: remote.updatedAt,
      localRevision: revisionRef.current,
      hasPendingEdits: isDirty(),
      mode: 'connect',
    });
    if (action === 'adopt-remote') {
      if (isDirty()) {
        syncedSeqRef.current = dirtySeqRef.current;
        toast('info', 'تم تحديث البيانات من جهاز آخر على نفس الحساب');
      }
      applyRemote(remote.payload, remote.updatedAt);
    } else if (action === 'push-local') {
      // This device holds edits made while offline / before connecting —
      // upload them now instead of waiting for the next local change.
      dirtySeqRef.current += 1;
    }
    syncReadyRef.current = true;
    setSyncStatus('synced');
    setLastSyncAt(Date.now());
    setRealtimeGen((n) => n + 1);
    // The roster is shared by SITE & RESTA — agree on it before uploading the
    // branch state, so the first push already carries the right names.
    await reconcileSharedOrg();
    if (input) toast('success', 'تم الاتصال بكل الأجهزة بنجاح');
    if (isDirty()) void flushPushRef.current();
  };

  // Auto-connect on boot (built-in credentials).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await runSync();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, syncRetry]);

  // Save locally + push to the cloud on every change.
  //
  // The stamp is taken from the EDIT (`nextLocalRevision`), and only from a
  // real edit: the first run after a reload is just the saved copy. Bumping the
  // revision for that first render (which is what the app used to do) made a
  // device that only opened the app outrank the row the other device worked on
  // — its stale board was uploaded and everyone pulled it.
  useEffect(() => {
    if (applyingRemoteRef.current) return;
    if (!firstSaveDoneRef.current) {
      firstSaveDoneRef.current = true;
      const restored: PersistedWalkin = {
        ...snapshot,
        updatedAt: revisionRef.current,
        localPendingStamp: pendingStampOf(revisionRef.current, isDirty()),
      };
      savePersisted(restored, account);
      lastSavedStateRef.current = restored;
      return;
    }
    const previousComparable = JSON.stringify({
      ...lastSavedStateRef.current,
      updatedAt: undefined,
      localPendingStamp: undefined,
    });
    const nextComparable = JSON.stringify({
      ...snapshot,
      updatedAt: undefined,
      localPendingStamp: undefined,
    });
    // The screen rendered, but the board is exactly what we already hold (the
    // usual case right after a cloud update). That is not an edit: it must not
    // get a new revision, otherwise every device keeps re-uploading the row it
    // just received and the newest real edit can lose the race.
    if (nextComparable === previousComparable) return;
    const stamp = nextLocalRevision(revisionRef.current, syncNow());
    revisionRef.current = stamp;
    const nextState: PersistedWalkin = {
      ...snapshot,
      updatedAt: stamp,
      localPendingStamp: stamp,
    };
    saveAutomaticBackup(account, lastSavedStateRef.current);
    savePersisted(nextState, account);
    lastSavedStateRef.current = nextState;

    // Not connected yet (or a previous upload failed): remember the edit so it
    // is uploaded as soon as the cloud is reachable again.
    dirtySeqRef.current += 1;
    if (!syncReadyRef.current) return;
    const t = setTimeout(() => {
      syncTick();
    }, SYNC_PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, account]);

  // Poll the shared row for other devices' edits.
  //
  // The old code bailed out on `document.hidden`, which meant a laptop whose
  // browser window was in the background (the normal case while the manager
  // holds the phone) stopped receiving attendance registrations entirely —
  // and a phone whose screen was locked froze its timers. The poll therefore
  // keeps running at all times, just slower while hidden, and every return to
  // the foreground forces an immediate sync.
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const onVisible = () => {
      const visible = typeof document === 'undefined' || !document.hidden;
      setPageVisible(visible);
      if (!visible) return;
      // Back in the foreground: phone unlocked, laptop tab re-focused,
      // or the page restored from the back/forward cache.
      syncAttemptsRef.current = 0;
      pushFailuresRef.current = 0;
      if (orgDirtyRef.current) void pushSharedOrgRef.current();
      else void pullSharedOrgRef.current();
      syncTick();
    };
    const onOnline = () => {
      syncAttemptsRef.current = 0;
      pushFailuresRef.current = 0;
      if (orgDirtyRef.current) void pushSharedOrgRef.current();
      else void pullSharedOrgRef.current();
      syncTick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [syncTick]);

  useEffect(() => {
    const id = setInterval(syncTick, pageVisible ? SYNC_POLL_VISIBLE_MS : SYNC_POLL_HIDDEN_MS);
    return () => clearInterval(id);
  }, [pageVisible, syncTick]);

  // The shared roster changes rarely, so it gets its own slower cadence.
  useEffect(() => {
    const id = setInterval(
      () => {
        if (!syncReadyRef.current) return;
        // An edit that could not be published (network hiccup while adding or
        // renaming a member) is retried here — otherwise it would stay on this
        // device until the next local change, and the other branch would keep
        // showing the old name.
        if (orgDirtyRef.current) void pushSharedOrgRef.current();
        else void pullSharedOrgRef.current();
      },
      pageVisible ? SYNC_ORG_POLL_MS : SYNC_ORG_POLL_HIDDEN_MS,
    );
    return () => clearInterval(id);
  }, [pageVisible]);

  // Realtime: when Supabase pushes a change made on another device, pull it
  // immediately instead of waiting for the next poll tick. Polling above stays
  // as the fallback in case Realtime is not enabled on the table.
  useEffect(() => {
    if (realtimeGen === 0) return;
    return subscribeRemote(account, (updatedAt) => {
      if (updatedAt > revisionRef.current) syncTick();
    });
  }, [account, realtimeGen, syncTick]);

  // A roster edit in the other branch arrives on the same table/channel.
  useEffect(() => {
    if (realtimeGen === 0) return;
    return subscribeRemote(
      SHARED_ORG_ACCOUNT,
      () => {
        if (!orgDirtyRef.current) void pullSharedOrgRef.current();
      },
      getSyncConfig(account),
    );
  }, [account, realtimeGen]);

  const connectWithConfig = (url: string, key: string) => runSync({ url, key });

  const retrySync = () => {
    syncAttemptsRef.current = 0;
    pushFailuresRef.current = 0;
    setSyncStatus('connecting');
    setSyncRetry((n) => n + 1);
  };

  const restoreBackup = (backupState: PersistedWalkin) => {
    const currentState: PersistedWalkin = { ...snapshot, updatedAt: revisionRef.current };
    saveAutomaticBackup(account, currentState);
    // A restore is a real edit: it gets the next stamp of the shared clock so
    // it beats the row it is restoring over (and is refused if that row is
    // already newer).
    const stamp = nextLocalRevision(revisionRef.current, syncNow());
    applyRemote({ ...backupState, updatedAt: stamp } as unknown as Record<string, unknown>, stamp);
    // `applyRemote` adopts what it is given, so the restored day has to be
    // registered as an unsent edit explicitly — otherwise it would only live on
    // this device (the save effect skips the render that applying causes).
    revisionRef.current = stamp;
    dirtySeqRef.current += 1;
    const pending: PersistedWalkin = { ...hydrate(backupState), updatedAt: stamp, localPendingStamp: stamp };
    savePersisted(pending, account);
    lastSavedStateRef.current = pending;
    if (syncReadyRef.current) {
      window.setTimeout(() => void flushPushRef.current(), SYNC_PUSH_DEBOUNCE_MS);
    }
    toast('success', 'تمت استعادة النسخة الاحتياطية ومزامنتها');
  };

  // ── Active roster (excludes anyone disabled from «الهيكل») ──
  const activeRoster = useMemo(() => activeOrg(heads, managers, sales), [heads, managers, sales]);
  const activeHeads = activeRoster.heads;
  const activeManagers = activeRoster.managers;
  const activeSales = activeRoster.sales;

  // ── Rotation ──
  const rotationOptions = useMemo(
    () => ({ workspace: account, carryOver, cycle: cycleSettings, pinnedTurn }),
    [account, carryOver, cycleSettings, pinnedTurn],
  );
  const effectiveStartingHead = useMemo(() => {
    if (!isFixedTeamWorkspace && history.length === 0 && carryOver?.headId) {
      // After yesterday's pinned person (skipped), the queue continues on the
      // OPPOSITE side: Kaled's team ⇄ Wael / Mohamed Samir's teams.
      return carryOver.headId === 'khaled'
        ? (activeHeads.find((h) => h.id !== 'khaled')?.id ?? 'wael')
        : 'khaled';
    }
    return startingHead;
  }, [isFixedTeamWorkspace, history.length, carryOver, activeHeads, startingHead]);

  // ── الدور على التيم (اختيار السيلز يدوي) ──
  // المحرّك يحدد التيم اللي عليه الدور فقط، ومين يقعد مع العميل يتم اختياره
  // يدوياً من نفس التيم — فلا يوجد أي اسم سيلز مقترح تلقائياً.
  // `turnPlan.onTurn` is the team the cycle points at (attendance ignored);
  // `turnPlan.serving` is who actually takes the client; the teams in between
  // (nobody free) are `shiftedTeams`.
  const turnPlan: TurnPlan | null = useMemo(
    () =>
      paused
        ? null
        : computeTurnPlan(
            salesState,
            history,
            activeManagers,
            activeSales,
            activeHeads,
            rotationOptions,
          ),
    [paused, salesState, history, activeManagers, activeSales, activeHeads, rotationOptions],
  );
  const onTurnTeam: ManagerTeam | null = turnPlan?.onTurn ?? null;
  const onTurnHeadName = onTurnTeam ? activeHeads.find((h) => h.id === onTurnTeam.headId)?.name ?? '' : '';
  const shiftedTeams = useMemo(() => turnPlan?.shiftedTeams ?? [], [turnPlan]);
  const nextTeam: TeamTurn | null = turnPlan?.serving ?? null;
  /** The team on turn has nobody free — the serving team is a later one (or none). */
  const turnShifted = Boolean(onTurnTeam) && nextTeam?.managerId !== onTurnTeam?.id;

  /**
   * كل أعضاء التيم اللي عليه الدور مع حالتهم، والأولوية للمتاحين — والمدير
   * نفسه يظهر كخيار عادي في القائمة (لو حاضر) عشان يقدر يقعد مع العميل لو
   * حد من تيمه مش موجود، ودوره يُحسب كدور عادي زي أي سيلز في التيم.
   */
  const teamRoster: TeamMemberOption[] = useMemo(() => {
    if (!nextTeam) return [];
    const priority = new Map(
      availableTeamMembers(nextTeam.managerId, salesState, activeSales).map((s, i) => [s.id, i]),
    );
    const weight = (status: TeamMemberOption['status']) =>
      status === 'available' ? 0 : status === 'busy' ? 1 : 2;
    return activeSales
      .filter((s) => s.managerId === nextTeam.managerId)
      .map((s) => {
        const st = salesState[s.id];
        const status: TeamMemberOption['status'] = st?.status ?? 'absent';
        return {
          id: s.id,
          name: s.name,
          status,
          walkCount: st?.walkCount ?? 0,
          coverCount: st?.coverCount ?? 0,
          checkInOrder: st?.checkInOrder ?? null,
          carried: nextTeam.carriedSalesId === s.id,
          isManager: Boolean(s.isManager),
        };
      })
      .sort(
        (a, b) =>
          weight(a.status) - weight(b.status) ||
          (priority.get(a.id) ?? 0) - (priority.get(b.id) ?? 0),
      );
  }, [nextTeam, activeSales, salesState]);

  /**
   * القائمة المعروضة على الشاشة — **نفس** دورة المحرّك بالحرف، ملفوفة على التيم
   * اللي عليه الدور. مفيش أي ترتيب تاني بيتطبّق فوقها: أسهم التبويب بتعدّل
   * الدورة المحفوظة نفسها، فاللي على الشاشة هو اللي بيتنفّذ في «الرئيسية».
   */
  const teamRound = useMemo(
    () =>
      teamRoundFrom(
        activeManagers,
        onTurnTeam?.id ?? nextTeam?.managerId,
        cycleSettings,
        activeSales,
      ),
    [activeManagers, onTurnTeam, nextTeam, cycleSettings, activeSales],
  );

  /** هل الترتيب الحالي مخصّص (اتعدّل بالأسهم) — بيظهر زرار الرجوع للتلقائي. */
  const orderCustomized = cycleSettings.mode === 'custom';

  /** آخر تيم اتخدم فعلاً — المحرّك بيكمّل الدور اللي بعده. */
  const lastServedManagerId = history.length > 0 ? history[history.length - 1].managerId : null;

  /**
   * التيم اللي اتخدم آخر مرة مايتحركش من مكانه: المحرّك بيكمّل الدور اللي
   * *بعده*، فتحريكه (أو تحريك تيم لمكانه) بيغيّر مين عليه الدور فجأة بدل ما
   * يغيّر الترتيب — المكانين دول بيتقفلوا والأسهم بتشتغل على الباقي.
   */
  const isServedAnchor = (teamId: string): boolean => teamId === lastServedManagerId;

  const moveInOrder = (fromIndex: number, dir: -1 | 1) => {
    const to = fromIndex + dir;
    if (to < 0 || to >= teamRound.length) return;
    // المكان الأول محجوز للتيم اللي عليه الدور: تغييره بيحصل بـ«الدور من هنا»
    // بس، عشان سحب تيم لمكانه (أو منها) يبان كأن الدور اتغيّر لوحده.
    if (to === 0 || fromIndex === 0) return;
    if (isServedAnchor(teamRound[fromIndex].id) || isServedAnchor(teamRound[to].id)) return;
    const moved = dir === -1 ? 'تم تقديم التيم في الترتيب' : 'تم تأخير التيم في الترتيب';
    // الترتيب المعروض هو رأس الدورة الحالية. بنحفظ اللي اتغيّر كترتيب دورة
    // (وطبعاً بيتنشر للفرع التاني مع الهيكل المشترك) عشان المحرّك يقرا نفس
    // الترتيب — قبل كده كان بيتحفظ على الجهاز وبس وماكانش بيأثر على الدور
    // أصلاً، فالصفحة الرئيسية كانت بتقول تيم تاني.
    const next = swapInCustomOrder(
      teamRound.map((t) => t.id),
      teamRound[fromIndex].id,
      teamRound[to].id,
    );
    updateCycleSettings({ mode: 'custom', order: next }, moved);
  };

  /** الرجوع لدورة الفرق التلقائية (بيلغي أي ترتيب مخصّص). */
  const resetOrder = () => {
    if (!orderCustomized) return;
    updateCycleSettings({ mode: 'auto', order: [] }, 'تمت العودة لترتيب الفرق التلقائي');
  };

  /**
   * «الدور من هنا» (▶) — التيم المختار يبقى عليه الدور دلوقتي، من غير أي تغيير
   * في الترتيب: الدورة تفضل زي ما هي (تلقائية أو مخصّصة)، وبعد ما التيم ده
   * يخدم بيكمّل التيم اللي بعده في نفس الدورة — لو دُست على هاني الشناوي يبقى
   * بعده بيري ثم أحمد سلطان … زي الترتيب التلقائي بالظبط.
   *
   * التثبيت بيتحفظ مع يوم الفرع (وبيتزامن زي الحضور)، وبيتشال أول ما التيم
   * المثبَّت يخدم أو عند «بدء يوم جديد».
   */
  const pinTurn = (team: ManagerTeam): void => {
    setPinnedTurn(turnPinFor(team, activeHeads));
    toast('success', `الدور بقى على تيم ${team.name}`);
  };

  /** إلغاء التثبيت والرجوع لدور الدورة الطبيعي. */
  const unpinTurn = (): void => {
    if (!pinnedTurn) return;
    setPinnedTurn(null);
    toast('info', 'رجع الدور للترتيب الطبيعي');
  };

  /** الفرق الجاية اللي عليها الدور فعلاً (اللي لها سيلز متاح) — بنفس ترتيب الدورة. */
  const upcomingTeams: UpcomingTeam[] = useMemo(() => {
    const nameOfHead = (headId: string) => activeHeads.find((h) => h.id === headId)?.name ?? headId;
    return teamRound
      .slice(1)
      .map((team) => ({
        managerId: team.id,
        managerName: team.name,
        headName: nameOfHead(team.headId),
        available: availableTeamMembers(team.id, salesState, activeSales).length,
      }))
      .filter((team) => team.available > 0)
      .slice(0, 4);
  }, [teamRound, salesState, activeSales, activeHeads]);

  const availableForTurn = teamRoster.filter((m) => m.status === 'available').length;


  const totalToday = history.length;
  const presentCount = activeSales.filter((s) => salesState[s.id]?.status !== 'absent').length;
  const busyList = activeSales.filter((s) => salesState[s.id]?.status === 'busy');
  const availableCount = activeSales.filter((s) => salesState[s.id]?.status === 'available').length;
  const absentCount = activeSales.length - presentCount;

  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // ── Org handlers ──
  // Every one of them is a ROSTER edit: it is mirrored to the shared row, so
  // the same Head/manager/sales shows up in BOTH branches (SITE & RESTA).
  // `removedIds` records deletions, otherwise the built-in defaults would bring
  // a deleted built-in member back on the next reload — and in the other branch.
  const keepRemoved = (ids: string[]) =>
    setRemovedIds((prev) => [...new Set([...prev, ...ids])]);
  const restoreRemoved = (ids: string[]) =>
    setRemovedIds((prev) => prev.filter((id) => !ids.includes(id)));

  const addHead = (name: string, ar?: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `head-${Date.now()}`;
    const id = heads.some((h) => h.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setHeads((prev) => [...prev, { id, name, ar: ar || name }]);
    restoreRemoved([id]);
    markOrgEdited();
  };

  const addManager = (name: string, headId: string, ar?: string, phone = '') => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `mgr-${Date.now()}`;
    const mgrId = managers.some((m) => m.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setManagers((prev) => [...prev, { id: mgrId, name, ar: ar || name, headId, phone }]);
    const personId = `${mgrId}-self`;
    setSales((prev) => [...prev, { id: personId, name, managerId: mgrId, headId, isManager: true, phone, shiftTime: '10:00' }]);
    setSalesState((prev) => ({
      ...prev,
      [personId]: { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null },
    }));
    restoreRemoved([mgrId, personId]);
    markOrgEdited();
  };

  const addSales = (name: string, managerId: string, headId: string, phone = '') => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sales-${Date.now()}`;
    const id = sales.some((s) => s.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setSales((prev) => [...prev, { id, name, managerId, headId, isManager: false, phone, shiftTime: '10:00' }]);
    setSalesState((prev) => ({
      ...prev,
      [id]: { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null },
    }));
    restoreRemoved([id]);
    markOrgEdited();
  };

  /**
   * Renaming edits the member in place — the id (and therefore the attendance,
   * the counters, the queue position and every already-served turn) is kept.
   */
  const orgState = (): OrgState => ({ heads, managers, sales, history, carryOver, removedIds });

  /** Apply a rename result and publish the new roster to the shared row. */
  const commitOrg = (next: OrgState) => {
    setHeads(next.heads);
    setManagers(next.managers);
    setSales(next.sales);
    setHistory(next.history);
    setCarryOver(next.carryOver);
    markOrgEdited();
  };

  const updateHeadName = (headId: string, name: string, ar?: string) => {
    commitOrg(renameHead(orgState(), headId, name, ar));
  };

  const updateManagerName = (managerId: string, name: string, ar?: string) => {
    commitOrg(renameManager(orgState(), managerId, name, ar));
  };

  const updateSalesName = (salesId: string, name: string) => {
    commitOrg(renameSalesPerson(orgState(), salesId, name));
  };

  /**
   * A manager's own number is stored TWICE for compatibility: on the team
   * (`ManagerTeam.phone`, the field printed in the attendance Excel) and on the
   * manager's own attendance row (the «مدير» row on the attendance board).
   * The two are always written together so they can never drift apart.
   */
  const updateManagerDetails = (managerId: string, phone: string) => {
    setManagers((prev) => prev.map((team) => (team.id === managerId ? { ...team, phone } : team)));
    setSales((prev) =>
      prev.map((person) => (person.isManager && person.managerId === managerId ? { ...person, phone } : person)),
    );
    markOrgEdited();
  };

  const updateSalesDetails = (salesId: string, phone: string, shiftTime: string) => {
    const person = sales.find((s) => s.id === salesId);
    setSales((prev) => prev.map((item) =>
      item.id === salesId ? { ...item, phone, shiftTime: shiftTime || '10:00' } : item,
    ));
    // Editing the manager's own row edits the team's number as well.
    if (person?.isManager) {
      setManagers((prev) => prev.map((team) => (team.id === person.managerId ? { ...team, phone } : team)));
    }
    markOrgEdited();
  };

  const deleteHead = (headId: string) => {
    setHeads((prev) => prev.filter((h) => h.id !== headId));
    const mgrIds = managers.filter((m) => m.headId === headId).map((m) => m.id);
    setManagers((prev) => prev.filter((m) => m.headId !== headId));
    const goneSales = sales
      .filter((s) => s.headId === headId || mgrIds.includes(s.managerId))
      .map((s) => s.id);
    setSales((prev) => prev.filter((s) => s.headId !== headId && !mgrIds.includes(s.managerId)));
    keepRemoved([headId, ...mgrIds, ...goneSales]);
    markOrgEdited();
    if (startingHead === headId) {
      const remaining = heads.filter((h) => h.id !== headId);
      if (remaining[0]) setStartingHead(remaining[0].id);
    }
  };

  const deleteManager = (mgrId: string) => {
    setManagers((prev) => prev.filter((m) => m.id !== mgrId));
    const goneSales = sales.filter((s) => s.managerId === mgrId).map((s) => s.id);
    setSales((prev) => prev.filter((s) => s.managerId !== mgrId));
    keepRemoved([mgrId, ...goneSales]);
    markOrgEdited();
  };

  const deleteSales = (salesId: string) => {
    setSales((prev) => prev.filter((s) => s.id !== salesId));
    setSalesState((prev) => {
      const copy = { ...prev };
      delete copy[salesId];
      return copy;
    });
    keepRemoved([salesId]);
    markOrgEdited();
  };

  /**
   * Clear attendance for newly disabled member IDs across BOTH branches so no
   * stale check-in lingers in either the open workspace or the sibling branch.
   */
  const clearDisabledAttendance = (ids: string[]) => {
    if (ids.length === 0) return;
    setSalesState((prev) => clearSalesAttendance(prev, ids).salesState);

    const other = otherWorkspace(account);
    if (other) {
      const otherLocal = loadPersisted(other);
      if (otherLocal?.salesState) {
        const cleaned = clearSalesAttendance(otherLocal.salesState, ids);
        if (cleaned.changed) {
          savePersisted({ ...otherLocal, salesState: cleaned.salesState }, other);
        }
      }

      const otherBranch = asBranch(other);
      if (syncReadyRef.current && otherBranch) {
        void (async () => {
          try {
            const config = getSyncConfig(account);
            const remote = await pullRemote(otherBranch, loadPersisted(otherBranch), config);
            if (!remote) return;
            const base = hydrate({ ...(remote.payload as Partial<PersistedWalkin>), updatedAt: remote.updatedAt });
            const cleaned = clearSalesAttendance(base.salesState, ids);
            if (!cleaned.changed) return;
            const stamp = Math.max(syncNow(), remote.updatedAt + 1, (base.updatedAt ?? 0) + 1);
            const nextState: PersistedWalkin = {
              ...base,
              salesState: cleaned.salesState,
              updatedAt: stamp,
            };
            const pushed = await pushRemote(otherBranch, nextState, stamp, config);
            if (pushed === 'written') savePersisted(nextState, otherBranch);
          } catch {
            // Shared ORG sync will still clear attendance when the sibling branch hydrates.
          }
        })();
      }
    }
  };

  const toggleHeadDisabled = (headId: string, disabled: boolean) => {
    const next = setHeadDisabled(orgState(), headId, disabled);
    commitOrg(next);
    if (disabled) {
      const affectedIds = next.sales
        .filter((s) => s.headId === headId || next.managers.some((m) => m.id === s.managerId && m.headId === headId))
        .map((s) => s.id);
      clearDisabledAttendance(affectedIds);
      if (startingHead === headId) {
        const remaining = next.heads.filter((h) => !h.disabled);
        if (remaining[0]) setStartingHead(remaining[0].id);
      }
    }
  };

  const toggleManagerDisabled = (managerId: string, disabled: boolean) => {
    const next = setManagerDisabled(orgState(), managerId, disabled);
    commitOrg(next);
    if (disabled) {
      const affectedIds = next.sales.filter((s) => s.managerId === managerId).map((s) => s.id);
      clearDisabledAttendance(affectedIds);
    }
  };

  const toggleSalesDisabled = (salesId: string, disabled: boolean) => {
    const next = setSalesPersonDisabled(orgState(), salesId, disabled);
    commitOrg(next);
    if (disabled) {
      clearDisabledAttendance([salesId]);
    }
  };

  // ── Attendance ──
  /** Read a branch row, creating it from its local mirror when this is its first cloud write. */
  const readBranchSnapshot = async (branch: Branch): Promise<PersistedWalkin | null> => {
    const remote = await pullRemote(branch, loadPersisted(branch), getSyncConfig(account));
    if (!remote) return null;
    return hydrate({ ...(remote.payload as Partial<PersistedWalkin>), updatedAt: remote.updatedAt });
  };

  /**
   * Change one attendance row directly in its selected branch account. A stale
   * response is retried once from the newest cloud copy, so tapping SITE/RESTA
   * cannot overwrite somebody else's attendance on that branch.
   */
  const writeBranchAttendance = async (
    branch: Branch,
    id: string,
    action: AttendanceAction,
    at?: string,
  ): Promise<RemoteAttendanceResult> => {
    const config = getSyncConfig(account);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remote = await pullRemote(branch, loadPersisted(branch), config);
      if (!remote) return { kind: 'failed' };

      const base = hydrate({ ...(remote.payload as Partial<PersistedWalkin>), updatedAt: remote.updatedAt });
      const change = changeSalesAttendance(base.salesState, base.counter, id, action, at);
      if (change.reason === 'busy') return { kind: 'busy' };
      if (change.reason === 'missing') return { kind: 'missing' };
      if (!change.changed) {
        return { kind: 'ok', state: base, updatedAt: remote.updatedAt, changed: false };
      }

      const stamp = Math.max(syncNow(), remote.updatedAt + 1, (base.updatedAt ?? 0) + 1);
      const next: PersistedWalkin = {
        ...base,
        salesState: change.salesState,
        counter: change.counter,
        updatedAt: stamp,
      };
      const result = await pushRemote(branch, next, stamp, config);
      if (result === 'written') {
        savePersisted(next, branch);
        return { kind: 'ok', state: next, updatedAt: stamp, changed: true };
      }
      if (result !== 'stale') return { kind: 'failed' };
    }
    return { kind: 'failed' };
  };

  const writeBranchAttendanceTime = async (
    branch: Branch,
    id: string,
    timeISO: string,
  ): Promise<RemoteAttendanceResult> => {
    const config = getSyncConfig(account);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remote = await pullRemote(branch, loadPersisted(branch), config);
      if (!remote) return { kind: 'failed' };
      const base = hydrate({ ...(remote.payload as Partial<PersistedWalkin>), updatedAt: remote.updatedAt });
      const change = setSalesAttendanceTime(base.salesState, id, timeISO);
      if (!change.changed) {
        return { kind: 'ok', state: base, updatedAt: remote.updatedAt, changed: false };
      }
      const stamp = Math.max(syncNow(), remote.updatedAt + 1, (base.updatedAt ?? 0) + 1);
      const next: PersistedWalkin = {
        ...base,
        salesState: change.salesState,
        updatedAt: stamp,
      };
      const result = await pushRemote(branch, next, stamp, config);
      if (result === 'written') {
        savePersisted(next, branch);
        return { kind: 'ok', state: next, updatedAt: stamp, changed: true };
      }
      if (result !== 'stale') return { kind: 'failed' };
    }
    return { kind: 'failed' };
  };

  /** Apply a non-transfer action to the account currently open on this device. */
  const changeLocalAttendance = (id: string, action: AttendanceAction, at?: string): void => {
    const change = changeSalesAttendance(salesState, counter, id, action, at);
    if (change.reason === 'busy') {
      toast('warning', 'الشخص مشغول مع عميل الآن');
      return;
    }
    if (!change.changed) return;
    setCounter(change.counter);
    setSalesState(change.salesState);
  };

  const updateLocalAttendanceTime = (id: string, timeISO: string): void => {
    const change = setSalesAttendanceTime(salesState, id, timeISO);
    if (!change.changed) return;
    setSalesState(change.salesState);
  };

  /**
   * Register a person in exactly one branch.
   *
   * The destination is written first (so a network problem never makes a
   * present person disappear), then their attendance is cleared from the other
   * branch. The active screen adopts its changed row immediately, and the toast
   * explicitly confirms when the selected destination is the other account.
   */
  const registerAttendanceInBranch = async (
    id: string,
    targetBranch: Branch,
    at?: string,
  ): Promise<void> => {
    const person = sales.find((item) => item.id === id);
    const currentBranch = asBranch(account);
    if (!person || !currentBranch) {
      toast('error', 'تعذر العثور على سجل هذا الشخص');
      return;
    }
    if (!syncReadyRef.current) {
      toast('info', 'انتظر اكتمال المزامنة قبل تسجيل الحضور بين الفرعين');
      return;
    }
    if (branchAttendanceInFlightRef.current || pushingRef.current) {
      toast('info', 'جارٍ حفظ تعديل آخر، حاول بعد لحظات');
      return;
    }

    // Do not compose a branch move over an unsent local snapshot: flush it
    // first, otherwise a delayed normal upload could restore old attendance.
    if (isDirty()) {
      await flushPushRef.current();
      if (isDirty()) {
        toast('info', 'جارٍ مزامنة آخر تعديل، أعد المحاولة بعد لحظات');
        return;
      }
    }

    branchAttendanceInFlightRef.current = true;
    try {
      const otherBranch = asBranch(otherWorkspace(targetBranch));

      // A person serving a client cannot be moved. Checking before the target
      // write avoids creating duplicate attendance when the other branch is busy.
      if (otherBranch) {
        const otherBefore = await readBranchSnapshot(otherBranch);
        if (!otherBefore) {
          toast('error', 'تعذر قراءة حساب الفرع الآخر — تحقق من الاتصال وحاول مجدداً');
          return;
        }
        if (otherBefore.salesState[id]?.status === 'busy') {
          toast('warning', `${person.name} مشغول مع عميل في فرع ${otherBranch}`);
          return;
        }
      }

      const target = await writeBranchAttendance(targetBranch, id, 'check-in', at);
      if (target.kind === 'busy') {
        toast('warning', `${person.name} مشغول مع عميل في فرع ${targetBranch}`);
        return;
      }
      if (target.kind === 'missing') {
        toast('error', 'سجل الشخص لم يصل إلى الفرع المختار بعد — حدّث الهيكل ثم أعد المحاولة');
        return;
      }
      if (target.kind === 'failed') {
        toast('error', 'لم يتم حفظ الحضور في الفرع المختار — تحقق من الاتصال وحاول مجدداً');
        return;
      }

      // If this is the open account, reflect the successful check-in at once.
      if (targetBranch === currentBranch) {
        applyRemote(
          { ...target.state, updatedAt: target.updatedAt } as Record<string, unknown>,
          target.updatedAt,
        );
      }

      let clearedOther = false;
      if (otherBranch) {
        const source = await writeBranchAttendance(otherBranch, id, 'check-out');
        if (source.kind === 'busy') {
          toast('warning', `تم تسجيل ${person.name} في ${targetBranch}، لكن لا يمكن إلغاء حضوره من ${otherBranch} لأنه مشغول`);
          return;
        }
        if (source.kind === 'failed') {
          toast('warning', `تم تسجيل ${person.name} في ${targetBranch}، لكن تعذر إلغاء حضوره من ${otherBranch}`);
          return;
        }
        // `missing` here means an old branch snapshot had no such roster row;
        // there is no attendance to remove, so the selected branch is already
        // the only place that can count this person.
        if (source.kind === 'ok') {
          clearedOther = source.changed;
          if (otherBranch === currentBranch) {
            applyRemote(
              { ...source.state, updatedAt: source.updatedAt } as Record<string, unknown>,
              source.updatedAt,
            );
          }
        }
      }

      setSyncStatus('synced');
      setLastSyncAt(Date.now());
      if (!target.changed && !clearedOther) {
        toast('info', `${person.name} مسجل بالفعل في فرع ${targetBranch}`);
      } else if (targetBranch !== currentBranch) {
        toast('success', `تم تسجيل ${person.name} في الفرع الآخر (${targetBranch})`);
      } else {
        toast('success', `تم تثبيت حضور ${person.name} في فرع ${targetBranch} فقط`);
      }
    } catch {
      toast('error', 'تعذر الاتصال بحساب الفرع المختار');
    } finally {
      branchAttendanceInFlightRef.current = false;
    }
  };

  const updateAttendanceTimeInBranch = async (
    id: string,
    targetBranch: Branch,
    timeISO: string,
  ): Promise<void> => {
    const person = sales.find((item) => item.id === id);
    if (!person) {
      toast('error', 'تعذر العثور على سجل هذا الشخص');
      return;
    }
    if (!syncReadyRef.current) {
      toast('info', 'انتظر اكتمال المزامنة');
      return;
    }
    if (branchAttendanceInFlightRef.current || pushingRef.current) {
      toast('info', 'جارٍ حفظ تعديل آخر، حاول بعد لحظات');
      return;
    }
    if (isDirty()) {
      await flushPushRef.current();
      if (isDirty()) {
        toast('info', 'جارٍ مزامنة آخر تعديل، أعد المحاولة بعد لحظات');
        return;
      }
    }
    branchAttendanceInFlightRef.current = true;
    try {
      const result = await writeBranchAttendanceTime(targetBranch, id, timeISO);
      if (result.kind === 'busy') {
        toast('error', 'الشخص مشغول الآن — أنهِ المقابلة قبل تعديل وقته');
        return;
      }
      if (result.kind === 'missing') {
        toast('error', 'تعذر العثور على سجل هذا الشخص في الفرع المختار');
        return;
      }
      if (result.kind === 'failed') {
        toast('error', 'تعذر تحديث وقت الحضور');
        return;
      }
      const currentBranch = asBranch(account);
      if (targetBranch === currentBranch) {
        applyRemote(
          { ...result.state, updatedAt: result.updatedAt } as Record<string, unknown>,
          result.updatedAt,
        );
      }
      setSyncStatus('synced');
      setLastSyncAt(Date.now());
      toast('success', `تم تحديث وقت حضور ${person.name} إلى ${formatTime(timeISO)}`);
    } catch {
      toast('error', 'تعذر تحديث وقت الحضور');
    } finally {
      branchAttendanceInFlightRef.current = false;
    }
  };

  const toggleAttendance = async (id: string, targetBranch?: Branch, at?: string): Promise<void> => {
    const selectedBranch = targetBranch ?? asBranch(account);
    const currentBranch = asBranch(account);
    const state = salesState[id];
    if (!selectedBranch || !currentBranch || !state) return;

    // Tapping a person already present in the open branch keeps the familiar
    // «انصراف» behavior. Selecting the other branch always means «move/check in»
    // instead — it must never toggle the other branch back to absent.
    if (selectedBranch === currentBranch && state.status === 'available') {
      changeLocalAttendance(id, 'check-out');
      return;
    }
    if (selectedBranch === currentBranch && state.status === 'busy') {
      toast('warning', 'أنهِ مقابلة العميل أولاً');
      return;
    }
    await registerAttendanceInBranch(id, selectedBranch, at);
  };

  /** Remove attendance from the selected branch, including the other branch. */
  const checkOutAttendance = async (id: string, targetBranch?: Branch): Promise<void> => {
    const selectedBranch = targetBranch ?? asBranch(account);
    const currentBranch = asBranch(account);
    const person = sales.find((item) => item.id === id);
    if (!selectedBranch || !currentBranch || !person) return;

    if (selectedBranch === currentBranch) {
      changeLocalAttendance(id, 'check-out');
      return;
    }
    if (!syncReadyRef.current) {
      toast('info', 'انتظر اكتمال المزامنة قبل إلغاء الحضور من الفرع الآخر');
      return;
    }
    if (branchAttendanceInFlightRef.current || pushingRef.current) {
      toast('info', 'جارٍ حفظ تعديل آخر، حاول بعد لحظات');
      return;
    }
    if (isDirty()) {
      await flushPushRef.current();
      if (isDirty()) {
        toast('info', 'جارٍ مزامنة آخر تعديل، أعد المحاولة بعد لحظات');
        return;
      }
    }

    branchAttendanceInFlightRef.current = true;
    try {
      const result = await writeBranchAttendance(selectedBranch, id, 'check-out');
      if (result.kind === 'busy') {
        toast('warning', `لا يمكن إلغاء حضور ${person.name} من فرع ${selectedBranch} أثناء مقابلته لعميل`);
        return;
      }
      if (result.kind === 'missing') {
        toast('error', 'لم يتم العثور على سجل الشخص في الفرع المختار');
        return;
      }
      if (result.kind === 'failed') {
        toast('error', 'تعذر إلغاء الحضور من الفرع المختار — تحقق من الاتصال وحاول مجدداً');
        return;
      }
      setSyncStatus('synced');
      setLastSyncAt(Date.now());
      toast(
        result.changed ? 'success' : 'info',
        result.changed
          ? `تم إلغاء حضور ${person.name} من فرع ${branchLabel(selectedBranch)}`
          : `${person.name} غير مسجل حضور في فرع ${branchLabel(selectedBranch)}`,
      );
    } catch {
      toast('error', 'تعذر الاتصال بحساب الفرع المختار');
    } finally {
      branchAttendanceInFlightRef.current = false;
    }
  };

  const freeSales = async (id: string, targetBranch?: Branch, at?: string): Promise<void> => {
    const selectedBranch = targetBranch ?? asBranch(account);
    const currentBranch = asBranch(account);
    if (!selectedBranch || !currentBranch) return;
    // With a different selected branch this is a requested move, not «إنهاء»
    // for the current branch. The transfer guard rejects a person who is busy.
    if (selectedBranch !== currentBranch) {
      await registerAttendanceInBranch(id, selectedBranch, at);
      return;
    }
    changeLocalAttendance(id, 'free');
  };

  const updateAttendanceTime = async (id: string, targetBranch?: Branch, timeISO?: string): Promise<void> => {
    if (!timeISO) return;
    const selectedBranch = targetBranch ?? asBranch(account);
    const currentBranch = asBranch(account);
    if (!selectedBranch || !currentBranch) return;
    if (selectedBranch === currentBranch) {
      updateLocalAttendanceTime(id, timeISO);
    } else {
      await updateAttendanceTimeInBranch(id, selectedBranch, timeISO);
    }
  };

  // ── Assignment ──
  /**
   * Confirm the client with the sales chosen MANUALLY from the team on turn.
   * There is no substitute concept any more: whoever is picked from the team is
   * the person serving, and the team's turn is what the queue advances on.
   */
  const confirmWith = (salesId: string) => {
    const s = activeSales.find((x) => x.id === salesId);
    if (!s) return;
    const mgr = activeManagers.find((m) => m.id === s.managerId) || { id: s.managerId, name: s.managerId };
    const head = activeHeads.find((h) => h.id === s.headId) || { id: s.headId, name: s.headId };
    const n = seq + 1;
    const assignment: Assignment = {
      id: `${Date.now()}-${n}`,
      n,
      salesId: s.id,
      salesName: s.name,
      managerId: mgr.id,
      managerName: mgr.name,
      headId: head.id,
      headName: head.name,
      time: new Date().toISOString(),
      clientLabel: clientLabel.trim(),
      substituted: false,
      visitType,
      shiftedTeams: shiftedTeams.map((t) => ({ ...t })),
    };

    // Compact undo record: restores the person's state and yesterday's carried
    // turn. The team order needs no copy — it is the shared cycle, and undo
    // only moves `history`, which is what the engine reads the turn from.
    const entry: UndoEntry = {
      personId: salesId,
      prevState: salesState[salesId]
        ? typeof structuredClone === 'function'
          ? structuredClone(salesState[salesId])
          : (JSON.parse(JSON.stringify(salesState[salesId])) as SalesState)
        : { status: 'available', checkInOrder: null, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null },
      skippedIds: [],
      carryOver: carryOver ?? null,
      pinnedTurn: pinnedTurn ?? null,
      seq,
      counter,
    };
    setUndoStack((prev) => [...prev, entry].slice(-30));

    const newHistory = [...history, assignment];
    const newSalesState: Record<string, SalesState> = {
      ...salesState,
      [salesId]: {
        ...salesState[salesId],
        status: 'busy',
        // The chosen sales served their own turn — this is what keeps the
        // rotation inside the team fair.
        walkCount: (salesState[salesId]?.walkCount ?? 0) + 1,
        lastServedAt: new Date().toISOString(),
      },
    };
    // دور أمس المرحَّل يُستهلك بمجرد خدمة التيم الخاص به.
    const carryAfter = carryOver && carryOver.managerId === mgr.id ? null : carryOver;
    // «الدور من هنا» بيتشال أول ما التيم المثبَّت نفسه يخدم — وبعدها الدور
    // بيكمّل طبيعي بالتيم اللي بعده في نفس الترتيب.
    const pinAfter = pinnedTurn && pinnedTurn.managerId === mgr.id ? null : pinnedTurn;
    // «Next» is the team that follows the served one in the cycle, attendance aside.
    const nextAfter = successorTeam(activeManagers, mgr.id, cycleSettings, activeSales);
    setSeq(n);
    setHistory(newHistory);
    setSalesState(newSalesState);
    setCarryOver(carryAfter);
    setPinnedTurn(pinAfter);
    setClientLabel('');
    setVisitType(defaultVisitFor(account));
    setAssignOpen(false);
    setDoneInfo({ assignment, next: nextAfter });
  };

  const undoLast = () => {
    const entry = undoStack[undoStack.length - 1];
    const last = history[history.length - 1];
    if (!last) return;

    if (entry) {
      // Full restore: the undone person returns to the exact queue position —
      // the engine reads the turn from `history`, so dropping the last
      // assignment is enough to put their team back on turn.
      // Counters are reconciled from the restored history.
      const restoredHistory = history.slice(0, -1);
      setUndoStack((prev) => prev.slice(0, -1));
      setHistory(restoredHistory);
      setSalesState((prev) => reconcileCounts({ ...prev, [entry.personId]: entry.prevState }, restoredHistory));
      setCarryOver(entry.carryOver);
      setPinnedTurn(entry.pinnedTurn ?? null);
      setSeq(entry.seq);
      setCounter(entry.counter);
      toast('info', `تم التراجع عن ${last.salesName} وعاد لنفس ترتيبه`);
      return;
    }

    // Fallback when no undo record exists (e.g. imported data).
    const restoredHistory = history.slice(0, -1);
    setHistory(restoredHistory);
    setSalesState((prev) => {
      const nextState = {
        ...prev,
        [last.salesId]: {
          ...prev[last.salesId],
          status: 'available' as const,
          walkCount: Math.max(0, (prev[last.salesId]?.walkCount ?? 1) - 1),
        },
      };
      return reconcileCounts(nextState, restoredHistory);
    });
    setSeq((v) => Math.max(0, v - 1));
    toast('info', `تم التراجع عن ${last.salesName}`);
  };

  const resetDay = () => {
    if (!window.confirm('بدء يوم جديد؟ سيتم مسح الحضور والسجل وترحيل الدور المتبقي.')) return;
    // ترحيل دور التيم المتبقي: التيم اللي عليه الدور لم يُخدم بعد يبدأ اليوم الجديد،
    // وإلا يبدأ اليوم من التيم التالي لآخر تيم اتخدم في الدورة.
    // التيم المثبَّت اللي لسه ما خدمش بيبدأ اليوم الجديد، وإلا التيم اللي عليه
    // الدور. التثبيت نفسه مقصود لليوم الحالي بس، فبيتشال مع بداية اليوم.
    const pinnedPending =
      pinnedTurn && !history.some((a) => a.managerId === pinnedTurn.managerId)
        ? { managerId: pinnedTurn.managerId, managerName: pinnedTurn.managerName, headId: pinnedTurn.headId, headName: pinnedTurn.headName }
        : null;
    const pending = paused ? null : pinnedPending ?? nextTeam;
    const servedToday = carryOver?.managerId
      ? history.some((a) => a.managerId === carryOver.managerId)
      : false;
    setCarryOver(carryOverForNewDay(servedToday ? null : carryOver, pending, history, activeHeads, account, undefined, activeManagers, cycleSettings, activeSales));
    // Keep saved custom-team members in both RESTA and SITE's fresh attendance map.
    setSalesState(createNewDaySalesState(account, sales));
    setHistory([]);
    setCounter(0);
    setSeq(0);
    setClientLabel('');
    setPinnedTurn(null);
    setUndoStack([]);
    setLastResetAt(new Date().toISOString());
    toast('success', 'تم بدء يوم جديد');
  };

  const syncMeta = {
    synced: { cls: 'badge-green', icon: <Cloud className="size-3" /> },
    connecting: { cls: 'badge-gray', icon: <RefreshCw className="size-3 animate-spin" /> },
    error: { cls: 'badge-red', icon: <CloudOff className="size-3" /> },
    offline: { cls: 'badge-amber', icon: <CloudOff className="size-3" /> },
  }[syncStatus];

  const go = (t: Tab) => {
    setTab(t);
    setMenuOpen(false);
  };

  const NavItem = ({ item }: { item: (typeof NAV)[number] }) => {
    const active = tab === item.id;
    return (
      <button
        onClick={() => go(item.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition-all',
          active
            ? 'bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(227,6,19,0.55)]'
            : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
        )}
      >
        <item.icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
        <span className="truncate">{item.label}</span>
        {active && <ChevronUp className="mr-auto hidden size-4 rotate-90 opacity-70 lg:block" />}
      </button>
    );
  };

  return (
    <div
      dir="rtl"
      className={cn(
        'min-h-screen bg-ink-50 font-body text-ink-900 transition-colors duration-200',
        darkMode && 'theme-dark',
      )}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
        {/* ══════════ Desktop sidebar ══════════ */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-l border-ink-100 bg-white lg:flex">
          <div className="border-b border-ink-100 px-5 py-5">
            <AmerLogo className="w-[128px]" variant="dark" />
            <p className="mt-2 text-[11px] font-bold text-ink-400">منظّم الـ Walk-In</p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-300">
              القائمة
            </p>
            {NAV.map((item) => (
              <NavItem key={item.id} item={item} />
            ))}
          </nav>

          <div className="space-y-2 border-t border-ink-100 p-3">
            <button onClick={resetDay} className="btn btn-neutral w-full text-[12.5px]">
              <RotateCcw className="size-4" />
              يوم جديد
            </button>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-white"
                  />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-[11px] font-black text-white">
                    {profile.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-extrabold text-ink-900">{profile.name}</p>
                  <p dir="ltr" className="truncate text-right text-[10px] font-semibold text-ink-400">
                    {account} · {profile.email}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  onClick={onSwitchWorkspace}
                  title="تبديل الفرع"
                  aria-label="تبديل الفرع"
                  className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-brand-600"
                >
                  <ArrowLeftRight className="size-4" />
                </button>
                <button
                  onClick={onLogout}
                  title="تسجيل الخروج"
                  aria-label="تسجيل الخروج"
                  className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-brand-600"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════ Main ══════════ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* header */}
          <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setMenuOpen(true)}
                  aria-label="فتح القائمة"
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-ink-200 text-ink-500 transition hover:bg-ink-50 lg:hidden"
                >
                  <Menu className="size-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate font-display text-[19px] font-black leading-tight text-ink-900 sm:text-[22px]">
                    {TITLES[tab].title}
                  </h1>
                  <p className="hidden truncate text-[12px] font-medium text-ink-400 sm:block">
                    {tab === 'order' && isFixedTeamWorkspace
                      ? 'التناوب بين التيمات — خصّص طريقة الترتيب من «طريقة ترتيب الأدوار»'
                      : TITLES[tab].sub}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((value) => !value)}
                  aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الليلي'}
                  aria-pressed={darkMode}
                  title={darkMode ? 'الوضع الفاتح' : 'الوضع الليلي'}
                  className="theme-toggle grid size-9 shrink-0 place-items-center rounded-xl border border-ink-200 text-ink-500 transition hover:bg-ink-50"
                >
                  {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
                <span className={cn('badge hidden sm:inline-flex', syncMeta.cls)} title={`الحساب: ${account}`}>
                  {syncMeta.icon}
                  {account}
                </span>
                <span className="badge badge-red tnum">
                  <UserCheck className="size-3" />
                  {presentCount} حاضر
                </span>
                <div className="lg:hidden">
                  <AmerLogo className="w-[76px]" variant="dark" />
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-8">
            {/* ═══════ DASHBOARD ═══════ */}
            {tab === 'dashboard' && (
              <div className="space-y-5">
                {/* welcome */}
                <section className="surface anim-fade-up relative overflow-hidden p-3 sm:p-4">
                  <div aria-hidden className="hero-mesh pointer-events-none absolute inset-0" />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -left-8 -top-8 size-24 rounded-full border-[8px] border-brand-600/[0.06]"
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="badge badge-red mb-1 px-2 py-0.5">
                        <Activity className="size-3" />
                        {account}
                      </span>
                      <h2 className="font-display text-[16px] font-black leading-snug text-ink-900 sm:text-[20px]">
                        أهلاً بك في منظّم الـ Walk-In
                      </h2>
                      <p className="mt-0.5 text-[11px] font-semibold text-ink-400">{today}</p>
                    </div>
                    <div className="min-w-[82px] shrink-0 rounded-xl border border-ink-100 bg-white px-2.5 py-2 text-center">
                      <p className="text-[9px] font-bold leading-tight text-ink-400">العميل القادم</p>
                      <p className="tnum font-display text-[22px] font-black leading-none text-brand-600">
                        #{totalToday + 1}
                      </p>
                    </div>
                  </div>
                </section>

                <nav aria-label="اختصارات سريعة" className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignOpen(true)}
                    disabled={paused || !nextTeam}
                    className="btn btn-neutral flex h-[68px] w-full flex-col gap-1.5 px-1 text-[11px] sm:h-auto sm:flex-row sm:px-3 sm:text-[13px]"
                    title="اختيار السيلز وبدء مقابلة جديدة"
                  >
                    <UserCheck className="size-[18px] text-brand-600" />
                    <span>إسناد عميل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => go('today')}
                    className="btn btn-neutral flex h-[68px] w-full flex-col gap-1.5 px-1 text-[11px] sm:h-auto sm:flex-row sm:px-3 sm:text-[13px]"
                  >
                    <CalendarCheck className="size-[18px] text-brand-600" />
                    <span>تسجيل الحضور</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => go('log')}
                    className="btn btn-neutral flex h-[68px] w-full flex-col gap-1.5 px-1 text-[11px] sm:h-auto sm:flex-row sm:px-3 sm:text-[13px]"
                  >
                    <FileText className="size-[18px] text-brand-600" />
                    <span>السجل</span>
                  </button>
                </nav>

                {/* current turn + quick actions */}
                <div className="grid gap-4">
                  <section className="surface anim-fade-up overflow-hidden">
                    <div className="brand-bar h-1 w-full" />
                    <div className="p-5">
                      <SectionTitle
                        title="الدور الحالي"
                        subtitle="التيم اللي عليه الدور — تختار السيلز بنفسك"
                        icon={<Crown className="size-4.5" strokeWidth={2.1} />}
                      />
                      {paused ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                          <Pause className="mx-auto size-6 text-amber-600" />
                          <p className="mt-2 text-[14px] font-extrabold text-ink-900">الترتيب متوقف مؤقتاً</p>
                        </div>
                      ) : !onTurnTeam ? (
                        <EmptyState
                          icon={<UserCheck className="size-6" />}
                          title="لا يوجد تيم متاح"
                          description="سجّل الحضور من شاشة الحضور ليظهر دور التيم."
                          action={
                            <button onClick={() => go('today')} className="btn btn-secondary">
                              الذهاب للحضور
                            </button>
                          }
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
                            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600 pulse-ring text-[15px] font-black text-white">
                              {onTurnTeam.name.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-[20px] font-black leading-tight text-ink-900">
                                الدور على تيم {onTurnTeam.name}
                              </p>
                              {turnPlan?.onTurnPinned && (
                                <button
                                  type="button"
                                  onClick={unpinTurn}
                                  title="إلغاء تثبيت الدور والرجوع للترتيب الطبيعي"
                                  className="badge badge-amber mt-1"
                                >
                                  مثبَّت باليد — إلغاء
                                </button>
                              )}
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                {onTurnHeadName && <span className="badge badge-red">{onTurnHeadName}</span>}
                                <span className={cn('badge', nextTeam ? 'badge-green' : 'badge-gray')}>
                                  {nextTeam ? `${availableForTurn} سيلز متاح للاختيار` : 'لا أحد متاح'}
                                </span>
                                {nextTeam?.carriedSalesName && (
                                  <span className="badge badge-amber">دور أمس: {nextTeam.carriedSalesName}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setAssignOpen(true)}
                            disabled={!nextTeam}
                            className="btn btn-primary mt-3 w-full py-3.5 disabled:opacity-50"
                          >
                            <UserCheck className="size-5" />
                            {!nextTeam
                              ? 'لا يوجد سيلز متاح'
                              : turnShifted
                                ? `ابدأ المقابلة مع تيم ${nextTeam.managerName}`
                                : 'اختر السيلز وابدأ المقابلة'}
                          </button>
                        </>
                      )}
                    </div>
                  </section>

                  <ClientRegistration account={account} />
                </div>

                {/* recent + status */}
                <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                  <section className="surface anim-fade-up p-5">
                    <SectionTitle
                      title="آخر النشاطات"
                      subtitle="أحدث عمليات التوزيع"
                      icon={<Clock className="size-4.5" strokeWidth={2.1} />}
                      action={
                        history.length > 0 ? (
                          <button onClick={() => go('log')} className="btn btn-ghost px-2 py-1.5 text-[12px]">
                            عرض الكل
                          </button>
                        ) : undefined
                      }
                    />
                    {booting ? (
                      <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                      </div>
                    ) : history.length === 0 ? (
                      <EmptyState
                        icon={<Clock className="size-6" />}
                        title="لا يوجد نشاط بعد"
                        description="أول عملية إسناد ستظهر هنا."
                      />
                    ) : (
                      <div className="space-y-2">
                        {[...history]
                          .reverse()
                          .slice(0, 5)
                          .map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5"
                            >
                              <span className="tnum grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-[12px] font-black text-brand-600">
                                {a.n}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-extrabold text-ink-900">{a.salesName}</p>
                                <p className="truncate text-[11px] font-semibold text-ink-400">
                                  {a.managerName} · {a.headName}
                                </p>
                              </div>
                              <span className="tnum shrink-0 text-[11px] font-bold text-ink-400" dir="ltr">
                                {formatTime(a.time)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>

                  <ClientExcelBuilder account={account} sales={activeSales} />
                </div>

                {/* ملخص أرقام اليوم — في نهاية الصفحة */}
                {booting ? (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : (
                  <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <StatCard
                      label="إجمالي اليوم"
                      value={totalToday}
                      hint="عميل تم توزيعه"
                      accent="red"
                      compact
                      icon={<Zap className="size-5" strokeWidth={2.2} />}
                    />
                    <StatCard
                      label="متاح الآن"
                      value={availableCount}
                      hint="جاهز لاستقبال عميل"
                      accent="green"
                      compact
                      icon={<UserCheck className="size-5" strokeWidth={2.2} />}
                      progress={activeSales.length ? (availableCount / activeSales.length) * 100 : 0}
                    />
                    <StatCard
                      label="مشغول"
                      value={busyList.length}
                      hint="في مقابلة حالياً"
                      accent="amber"
                      compact
                      icon={<PhoneCall className="size-5" strokeWidth={2.2} />}
                      progress={activeSales.length ? (busyList.length / activeSales.length) * 100 : 0}
                    />
                    <StatCard
                      label="لم يحضر"
                      value={absentCount}
                      hint={`من أصل ${activeSales.length} فرد`}
                      accent="gray"
                      compact
                      icon={<Users className="size-5" strokeWidth={2.2} />}
                      progress={activeSales.length ? (absentCount / activeSales.length) * 100 : 0}
                    />
                  </div>
                )}

              </div>
            )}

            {/* ═══════ TODAY ═══════ */}
            {tab === 'today' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className="surface surface-hover anim-fade-up flex w-full items-center justify-between gap-3 overflow-hidden p-0 text-right"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 p-4">
                    <span
                      className={cn(
                        'grid size-11 shrink-0 place-items-center rounded-2xl text-white',
                        onTurnTeam ? 'bg-brand-600' : 'bg-ink-300',
                      )}
                    >
                      <Crown className="size-5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-brand-600">الدور الحالي — على التيم</p>
                      <p className="truncate font-display text-[17px] font-black text-ink-900">
                        {onTurnTeam ? `تيم ${onTurnTeam.name}` : 'لا يوجد تيم متاح'}
                      </p>
                      {turnShifted ? (
                        <p className="truncate text-[11.5px] font-extrabold text-amber-700">
                          {nextTeam
                            ? `محدش حضر منه — المقابلة بالتيم التالي (${nextTeam.managerName})`
                            : 'محدش حضر خالص — سجّل الحضور'}
                        </p>
                      ) : (
                        <p className="truncate text-[11.5px] font-semibold text-ink-400">
                          {!onTurnTeam
                            ? 'سجّل الحضور ليظهر دور التيم'
                            : `${onTurnHeadName} · اختر السيلز من التيم يدوياً (${availableForTurn} متاح)`}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'me-4 shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-black',
                      nextTeam ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400',
                    )}
                  >
                    اختيار السيلز
                  </span>
                </button>

                {busyList.length > 0 && (
                  <section className="surface anim-fade-up p-4">
                    <SectionTitle
                      title="مشغول الآن"
                      subtitle={`${busyList.length} في مقابلة`}
                      icon={<PhoneCall className="size-4.5" strokeWidth={2.1} />}
                    />
                    <div className="space-y-2">
                      {busyList.map((s) => {
                        // The team is part of the identity here too: two sales
                        // with similar names are told apart by their team chip.
                        const busyTeam = managers.find((m) => m.id === s.managerId);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-extrabold text-ink-900">{s.name}</p>
                              <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-amber-700">
                                مشغول مع عميل
                                {busyTeam && (
                                  <span className="badge badge-gray shrink-0">
                                    <Users className="size-2.5" />
                                    تيم {busyTeam.name}
                                  </span>
                                )}
                              </p>
                            </div>
                            <button onClick={() => freeSales(s.id)} className="btn btn-neutral shrink-0 px-3 py-2 text-[12px]">
                              إنهاء
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {booting ? (
                  <div className="space-y-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                ) : (
                  <AttendanceBoard
                    account={account}
                    salesState={salesState}
                    onToggle={toggleAttendance}
                    onCheckOut={checkOutAttendance}
                    onFree={freeSales}
                    onUpdateTime={updateAttendanceTime}
                    heads={activeHeads}
                    managers={activeManagers}
                    sales={activeSales}
                  />
                )}
              </div>
            )}

            {/* ═══════ LOG ═══════ */}
            {tab === 'log' && <HistoryPanel history={history} onUndoLast={undoLast} />}

            {/* ═══════ ORDER ═══════ */}
            {tab === 'order' && (
              <div className="space-y-4">
                <section className="surface anim-fade-up p-4">
                  <SectionTitle
                    title="ترتيب المديرين"
                    subtitle={paused ? 'الترتيب متوقف مؤقتاً' : `${teamRound.length} فرق في الدورة`}
                    icon={<ListOrdered className="size-4.5" strokeWidth={2.1} />}
                    action={
                      <div className="flex items-center gap-1.5">
                        {orderCustomized && (
                          <button
                            onClick={resetOrder}
                            title="العودة لترتيب الفرق التلقائي"
                            className="grid size-9 place-items-center rounded-lg border border-ink-200 bg-white text-ink-400 transition hover:border-brand-300 hover:text-brand-600"
                          >
                            <RotateReset className="size-4" />
                          </button>
                        )}
                        <button onClick={() => setPaused((v) => !v)} className="btn btn-neutral px-3 py-2 text-[12px]">
                          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                          {paused ? 'استئناف' : 'إيقاف'}
                        </button>
                      </div>
                    }
                  />

                  {paused ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
                      <Pause className="mx-auto size-7 text-amber-600" />
                      <p className="mt-2 font-display text-[15px] font-extrabold text-ink-900">الترتيب متوقف مؤقتاً</p>
                      <p className="mt-1 text-[12px] font-medium text-ink-400">اضغط استئناف لعرض الدور</p>
                    </div>
                  ) : teamRound.length === 0 ? (
                    <EmptyState
                      icon={<ListOrdered className="size-6" />}
                      title="لا يوجد ترتيب حالياً"
                      description="سجّل حضور السيلز من شاشة الحضور ليظهر دور التيم."
                      action={
                        <button onClick={() => go('today')} className="btn btn-secondary">
                          الذهاب للحضور
                        </button>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="mb-1 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] font-semibold text-ink-500">
                        <p>
                          الترتيب بالمديرين — والسيلز يُختار يدوياً من التيم عند الدور. الأسهم بتعدّل الترتيب
                          الفعلي اللي بيمشي عليه الدور، وأول تيم هنا هو اللي في الرئيسية.
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span>
                            زرار ▶ بيثبّت الدور على التيم من غير ما يغيّر الترتيب — وبعد كده الدور بيكمّل
                            بالتيم اللي بعده في نفس الترتيب.
                          </span>
                          {pinnedTurn && (
                            <button
                              type="button"
                              onClick={unpinTurn}
                              className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-ink-500 transition hover:border-brand-300 hover:text-brand-600"
                            >
                              إلغاء التثبيت
                            </button>
                          )}
                        </p>
                      </div>
                      {teamRound.map((team, index) => {
                        const members = activeSales.filter((s) => s.managerId === team.id);
                        const membersAvailable = members.filter((s) => salesState[s.id]?.status === 'available').length;
                        const headName = activeHeads.find((h) => h.id === team.headId)?.name ?? team.headId;
                        return (
                          <div
                            key={team.id}
                            className={cn(
                              'rounded-xl border px-3 py-2.5 transition',
                              index === 0
                                ? 'border-brand-200 bg-brand-50/60 shadow-[0_4px_12px_-6px_rgba(227,6,19,0.3)]'
                                : 'border-ink-100 bg-white hover:border-ink-200',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => index === 0 && setAssignOpen(true)}
                                className={cn(
                                  'tnum grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[14px] font-black',
                                  index === 0 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500',
                                )}
                                aria-label={`الترتيب ${index + 1}`}
                              >
                                {index + 1}
                              </button>
                              <button
                                type="button"
                                onClick={() => index === 0 && setAssignOpen(true)}
                                className="min-w-0 flex-1 text-right"
                              >
                                <p className="flex items-center gap-1.5 truncate text-[14.5px] font-extrabold text-ink-900">
                                  <span
                                    className={cn(
                                      'inline-block size-2 shrink-0 rounded-full',
                                      membersAvailable > 0 ? 'bg-emerald-500' : 'bg-ink-200',
                                    )}
                                  />
                                  <span className="truncate">تيم {team.name}</span>
                                </p>
                                <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-400">
                                  {headName}
                                  {index === 0
                                    ? pinnedTurn?.managerId === team.id
                                      ? ' · الدور الحالي (مثبَّت)'
                                      : ' · الدور الحالي'
                                    : team.id === lastServedManagerId
                                      ? ' · آخر تيم اتخدم'
                                      : ''}
                                  {membersAvailable === 0
                                    ? ' · لا يوجد متاح — يُتخطّى'
                                    : ` · متاح ${membersAvailable}/${members.length}`}
                                </p>
                              </button>
                              {isFixedTeamWorkspace && team.id !== onTurnTeam?.id && (
                                <button
                                  type="button"
                                  onClick={() => pinTurn(team)}
                                  title={`الدور من هنا — يبقى تيم ${team.name} عليه الدور حالاً، والترتيب يفضل زي ما هو`}
                                  aria-label={`خلّي الدور على تيم ${team.name}`}
                                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-200 bg-white text-ink-400 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
                                >
                                  <Play className="size-3.5" strokeWidth={2.4} />
                                </button>
                              )}
                              <div className="flex shrink-0 flex-col">
                                <button
                                  type="button"
                                  onClick={() => moveInOrder(index, -1)}
                                  disabled={
                                    index <= 1 ||
                                    team.id === lastServedManagerId ||
                                    teamRound[index - 1]?.id === lastServedManagerId
                                  }
                                  aria-label="تقديم التيم"
                                  className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                                >
                                  <ChevronUp className="size-4" strokeWidth={2.4} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveInOrder(index, 1)}
                                  disabled={
                                    index === 0 ||
                                    index >= teamRound.length - 1 ||
                                    team.id === lastServedManagerId ||
                                    teamRound[index + 1]?.id === lastServedManagerId
                                  }
                                  aria-label="تأخير التيم"
                                  className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                                >
                                  <ChevronDown className="size-4" strokeWidth={2.4} />
                                </button>
                              </div>
                            </div>
                            {members.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-100/80 pt-2">
                                {members.map((s) => {
                                  const st = salesState[s.id]?.status ?? 'absent';
                                  return (
                                    <span
                                      key={s.id}
                                      className={cn(
                                        'badge',
                                        st === 'available' ? 'badge-green' : st === 'busy' ? 'badge-amber' : 'badge-gray',
                                      )}
                                    >
                                      {s.name}
                                      {s.isManager ? ' (مدير)' : ''}
                                      {st === 'busy' ? ' · مشغول' : st === 'absent' ? ' · لم يحضر' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="surface anim-fade-up p-4" style={{ animationDelay: '0.08s' }}>
                  {isFixedTeamWorkspace ? (
                    <CycleSettingsPanel
                      managers={activeManagers}
                      heads={activeHeads}
                      sales={activeSales}
                      settings={cycleSettings}
                      onChange={updateCycleSettings}
                    />
                  ) : (
                    <>
                      <SectionTitle
                        title="بداية تناوب اليوم"
                        subtitle="اختر الـ Head الذي يبدأ به الدور"
                        icon={<Crown className="size-4.5" strokeWidth={2.1} />}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        {activeHeads.map((h) => (
                          <button
                            key={h.id}
                            onClick={() => setStartingHead(h.id)}
                            className={cn(
                              'rounded-xl border-2 px-3 py-3 text-[13px] font-extrabold transition',
                              effectiveStartingHead === h.id
                                ? 'border-brand-600 bg-brand-50 text-brand-700'
                                : 'border-ink-100 bg-white text-ink-700 hover:border-ink-200',
                            )}
                          >
                            {h.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {/* ═══════ MANAGE ═══════ */}
            {tab === 'manage' && (
              <div className="space-y-4">
                {/* Top: add a member (shows up in BOTH branches). */}
                <AddMemberPanel
                  heads={heads}
                  managers={managers}
                  sales={sales}
                  onAddHead={addHead}
                  onAddManager={addManager}
                  onAddSales={addSales}
                />
                <ManageOrgPanel
                  heads={heads}
                  managers={managers}
                  sales={sales}
                  onRenameHead={updateHeadName}
                  onRenameManager={updateManagerName}
                  onRenameSales={updateSalesName}
                  onUpdateSalesDetails={updateSalesDetails}
                  onUpdateManagerDetails={updateManagerDetails}
                  onDeleteHead={deleteHead}
                  onDeleteManager={deleteManager}
                  onDeleteSales={deleteSales}
                  onToggleHeadDisabled={toggleHeadDisabled}
                  onToggleManagerDisabled={toggleManagerDisabled}
                  onToggleSalesDisabled={toggleSalesDisabled}
                />

                {/* Bottom: backup/restore + device sync. */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[12px] font-extrabold text-ink-400">النسخ الاحتياطي والمزامنة بين الأجهزة</span>
                  <span className="h-px flex-1 bg-ink-100" />
                </div>
                <BackupPanel
                  account={account}
                  state={{ ...snapshot, updatedAt: revisionRef.current }}
                  onRestore={restoreBackup}
                />
                <SyncCard
                  account={account}
                  status={syncStatus}
                  lastSyncAt={lastSyncAt}
                  errorDetail={syncStatus === 'error' ? getLastSyncError() : null}
                  onConnect={connectWithConfig}
                  onRetry={retrySync}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ══════════ Mobile drawer ══════════ */}
      {menuOpen && (
        <div className="anim-fade fixed inset-0 z-[100] lg:hidden" onMouseDown={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]" />
          <aside
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 flex w-[270px] flex-col bg-white shadow-2xl"
            style={{ animation: 'amer-slide-in 0.25s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-4">
              <AmerLogo className="w-[112px]" variant="dark" />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="إغلاق القائمة"
                className="grid size-9 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV.map((item) => (
                <NavItem key={item.id} item={item} />
              ))}
            </nav>
            <div className="space-y-2 border-t border-ink-100 p-3">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  resetDay();
                }}
                className="btn btn-neutral w-full"
              >
                <RotateCcw className="size-4" />
                يوم جديد
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSwitchWorkspace();
                  }}
                  className="btn btn-neutral w-full"
                >
                  <ArrowLeftRight className="size-4" />
                  تبديل الفرع
                </button>
                <button onClick={onLogout} className="btn btn-danger w-full">
                  <LogOut className="size-4" />
                  خروج ({account})
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ══════════ Mobile bottom nav ══════════ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 px-2 pb-2 pt-1.5 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-lg transition-all',
                    active ? 'bg-brand-50 text-brand-600' : 'text-ink-400',
                  )}
                >
                  <item.icon className="size-[19px]" strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className={cn('text-[10.5px] font-extrabold', active ? 'text-brand-600' : 'text-ink-400')}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ══════════ Assign modal ══════════ */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="إسناد عميل"
        subtitle={`العميل رقم #${totalToday + 1}`}
      >
        {paused ? (
          <div className="px-6 py-12 text-center">
            <Pause className="mx-auto size-8 text-amber-500" />
            <p className="mt-3 font-display text-[16px] font-extrabold text-ink-900">الدور متوقف مؤقتاً</p>
          </div>
        ) : (
          <CurrentTurn
            team={nextTeam}
            shiftedTeams={shiftedTeams}
            onTurnName={onTurnTeam?.name ?? null}
            members={teamRoster}
            upcoming={upcomingTeams}
            clientLabel={clientLabel}
            setClientLabel={setClientLabel}
            visitType={visitType}
            setVisitType={setVisitType}
            onConfirm={(salesId) => confirmWith(salesId)}
            totalToday={totalToday}
          />
        )}
      </Modal>

      {doneInfo && (
        <DoneReceipt assignment={doneInfo.assignment} next={doneInfo.next} onClose={() => setDoneInfo(null)} />
      )}
    </div>
  );
}
