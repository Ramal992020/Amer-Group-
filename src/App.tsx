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
} from 'lucide-react';
import {
  HEADS as DEFAULT_HEADS,
  MANAGERS as DEFAULT_MANAGERS,
  SALES as DEFAULT_SALES,
  computeNextTeam,
  teamOrderFrom,
  availableTeamMembers,
  AUTOMATIC_TEAM_ORDER,
  usesFixedTeamRotation,
  carryOverForNewDay,
  createNewDaySalesState,
  reconcileCounts,
  loadPersisted,
  savePersisted,
  hydrate,
  setActiveAccount,
  formatTime,
} from './lib/walkin';
import {
  renameHead,
  renameManager,
  renameSalesPerson,
} from './lib/org';
import type { OrgState } from './lib/org';
import type {
  Assignment,
  CarryOver,
  HeadGroup,
  ManagerTeam,
  SalesPerson,
  SalesState,
  PersistedWalkin,
  TeamTurn,
  UndoEntry,
  VisitType,
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
} from './lib/sync';
import type { SyncConfig, SyncStatus } from './lib/sync';
import { CurrentTurn } from './components/CurrentTurn';
import type { TeamMemberOption, UpcomingTeam } from './components/CurrentTurn';
import { AttendanceBoard } from './components/AttendanceBoard';
import { HistoryPanel } from './components/HistoryPanel';
import { ClientExcelBuilder } from './components/ClientExcelBuilder';
import { ClientRegistration } from './components/ClientRegistration';
import { DoneReceipt } from './components/DoneReceipt';
import { ManageOrgPanel } from './components/ManageOrgPanel';
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
  /** Next team on turn — the sales is picked manually when that turn comes. */
  next: TeamTurn | null;
}

type Tab = 'dashboard' | 'today' | 'log' | 'order' | 'manage';

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
  // Manual team order (manager IDs) — the queue is ordered by managers now.
  const [manualOrder, setManualOrder] = useState<string[]>(() => {
    const ids = new Set((boot.customManagers || DEFAULT_MANAGERS).map((m) => m.id));
    return (boot.manualOrder || []).filter((id) => ids.has(id));
  });

  const [salesState, setSalesState] = useState<Record<string, SalesState>>(boot.salesState);
  const [history, setHistory] = useState<Assignment[]>(boot.history);
  const [counter, setCounter] = useState(boot.counter);
  const [seq, setSeq] = useState(boot.seq);
  const [startingHead, setStartingHead] = useState(boot.startingHead);
  const [carryOver, setCarryOver] = useState<CarryOver | null>(boot.carryOver);
  const [lastResetAt, setLastResetAt] = useState<string | null>(boot.lastResetAt);
  const [clientLabel, setClientLabel] = useState('');
  const [visitType, setVisitType] = useState<VisitType>('walkin');
  const [paused, setPaused] = useState(false);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState(true);

  // ── Sync (Supabase Project URL + Publishable Key) ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [syncRetry, setSyncRetry] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Bumped after every successful connect so the Realtime channel (re)opens.
  const [realtimeGen, setRealtimeGen] = useState(0);

  const revisionRef = useRef<number>(boot.updatedAt ?? 0);
  const applyingRemoteRef = useRef(false);
  const lastSavedStateRef = useRef<PersistedWalkin>(boot);
  // Cloud is usable only after a successful connect/pull this session.
  const syncReadyRef = useRef(false);
  // Local edits that are not confirmed in the cloud yet — they must never be
  // dropped, otherwise a toggle made on the phone can be lost on the laptop.
  // Sequence based (not a boolean) so a change that lands *while* an upload is
  // in flight is still recognised as pending.
  const dirtySeqRef = useRef(0);
  const syncedSeqRef = useRef(0);
  const isDirty = (): boolean => dirtySeqRef.current !== syncedSeqRef.current;
  // One upload at a time (mobile networks hate parallel writes).
  const pushingRef = useRef(false);
  // Consecutive failed uploads / reconnect attempts.
  const pushFailuresRef = useRef(0);
  const syncAttemptsRef = useRef(0);
  // Break the push ⇄ pull cycle without stale closures.
  const flushPushRef = useRef<() => Promise<void>>(async () => {});
  const pullNowRef = useRef<() => Promise<void>>(async () => {});

  // Undo log — persisted + synced so "تراجع" restores the exact queue position
  // even after a reload (or on another device).
  const [undoStack, setUndoStack] = useState<UndoEntry[]>(boot.undoStack || []);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 450);
    return () => clearTimeout(t);
  }, []);

  // Merge newly added built-in people into older saved data.
  useEffect(() => {
    const byId = <T extends { id: string }>(base: T[], extra: T[]) => {
      const map = new Map(base.map((x) => [x.id, x] as const));
      extra.forEach((x) => {
        if (!map.has(x.id)) map.set(x.id, x);
      });
      return [...map.values()];
    };
    setHeads((prev) => byId(DEFAULT_HEADS, prev));
    setManagers((prev) => byId(DEFAULT_MANAGERS, prev));
    setSales((prev) => byId(DEFAULT_SALES, prev));
    setSalesState((prev) => {
      const next = { ...prev };
      DEFAULT_SALES.forEach((s) => {
        if (!next[s.id]) {
          next[s.id] = { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null };
        }
      });
      return next;
    });
  }, []);

  const snapshot = useMemo(
    () => ({
      salesState,
      history,
      counter,
      seq,
      startingHead,
      carryOver,
      lastResetAt,
      customHeads: heads,
      customManagers: managers,
      customSales: sales,
      manualOrder,
      undoStack,
    }),
    [
      salesState,
      history,
      counter,
      seq,
      startingHead,
      carryOver,
      lastResetAt,
      heads,
      managers,
      sales,
      manualOrder,
      undoStack,
    ],
  );

  // Latest render's snapshot, so a debounced upload never sends stale data.
  const latestSnapshotRef = useRef<PersistedWalkin>(snapshot);
  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  const applyRemote = useCallback((remote: Record<string, unknown>) => {
    const state = hydrate(remote as never);
    applyingRemoteRef.current = true;
    saveAutomaticBackup(account, lastSavedStateRef.current);
    revisionRef.current = state.updatedAt ?? Date.now();
    setSalesState(state.salesState);
    setHistory(state.history);
    setCounter(state.counter);
    setSeq(state.seq);
    setStartingHead(state.startingHead);
    setCarryOver(state.carryOver);
    setLastResetAt(state.lastResetAt);
    if (state.customHeads) setHeads(state.customHeads);
    if (state.customManagers) setManagers(state.customManagers);
    if (state.customSales) setSales(state.customSales);
    if (Array.isArray(state.manualOrder)) setManualOrder(state.manualOrder);
    if (Array.isArray(state.undoStack)) setUndoStack(state.undoStack);
    savePersisted(state, account);
    lastSavedStateRef.current = state;
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, [account]);

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
    if (!syncReadyRef.current || pushingRef.current) return;
    pushingRef.current = true;
    const previousRevision = revisionRef.current;
    const sentSeq = dirtySeqRef.current;
    // Server-clock stamp: comparable with stamps written by the other devices.
    const stamp = Math.max(syncNow(), previousRevision + 1);
    const payload: PersistedWalkin = { ...latestSnapshotRef.current, updatedAt: stamp };
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
        // Somebody else wrote a newer revision (on the shared server clock)
        // while we were editing — adopt theirs and say so instead of silently
        // replacing what is on this screen.
        if (sentSeq === dirtySeqRef.current) syncedSeqRef.current = sentSeq;
        revisionRef.current = previousRevision;
        await pullNowRef.current();
        toast('info', 'تم تحديث البيانات من جهاز آخر على نفس الحساب');
      } else {
        // Keep the edit pending: roll the revision back so a later pull is
        // still allowed to bring remote changes in.
        revisionRef.current = previousRevision;
        pushFailuresRef.current += 1;
        setSyncStatus('error');
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
    if (remote.updatedAt > revisionRef.current && !isDirty()) {
      applyRemote(remote.payload);
    } else if (isDirty()) {
      // Our own edit is still pending — send it (with a fresh revision) rather
      // than silently dropping it in favour of the remote state.
      await flushPushRef.current();
    }
  }, [account, applyRemote]);
  useEffect(() => {
    pullNowRef.current = pullNow;
  }, [pullNow]);

  /** One tick drives both directions: upload pending edits, else poll. */
  const syncTick = useCallback((): void => {
    if (!syncReadyRef.current) return;
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
    if (remote.updatedAt > revisionRef.current) {
      applyRemote(remote.payload);
    } else if (remote.updatedAt < revisionRef.current || isDirty()) {
      // This device holds edits made while offline / before connecting —
      // upload them now instead of waiting for the next local change.
      dirtySeqRef.current += 1;
    }
    syncReadyRef.current = true;
    setSyncStatus('synced');
    setLastSyncAt(Date.now());
    setRealtimeGen((n) => n + 1);
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
  useEffect(() => {
    if (applyingRemoteRef.current) return;
    const stamp = Math.max(syncNow(), revisionRef.current + 1);
    revisionRef.current = stamp;
    const nextState: PersistedWalkin = { ...snapshot, updatedAt: stamp };
    const previousComparable = JSON.stringify({ ...lastSavedStateRef.current, updatedAt: undefined });
    const nextComparable = JSON.stringify({ ...nextState, updatedAt: undefined });
    if (previousComparable !== nextComparable) saveAutomaticBackup(account, lastSavedStateRef.current);
    savePersisted(nextState, account);
    lastSavedStateRef.current = nextState;

    // Not connected yet (or a previous upload failed): remember the edit so it
    // is uploaded as soon as the cloud is reachable again.
    if (!syncReadyRef.current) {
      dirtySeqRef.current += 1;
      return;
    }
    dirtySeqRef.current += 1;
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
      syncTick();
    };
    const onOnline = () => {
      syncAttemptsRef.current = 0;
      pushFailuresRef.current = 0;
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

  // Realtime: when Supabase pushes a change made on another device, pull it
  // immediately instead of waiting for the next poll tick. Polling above stays
  // as the fallback in case Realtime is not enabled on the table.
  useEffect(() => {
    if (realtimeGen === 0) return;
    return subscribeRemote(account, (updatedAt) => {
      if (updatedAt > revisionRef.current) syncTick();
    });
  }, [account, realtimeGen, syncTick]);

  const connectWithConfig = (url: string, key: string) => runSync({ url, key });

  const retrySync = () => {
    syncAttemptsRef.current = 0;
    pushFailuresRef.current = 0;
    setSyncStatus('connecting');
    setSyncRetry((n) => n + 1);
  };

  const restoreBackup = (backupState: PersistedWalkin) => {
    const currentState: PersistedWalkin = { ...snapshot, updatedAt: Date.now() };
    saveAutomaticBackup(account, currentState);
    applyRemote({ ...backupState, updatedAt: Date.now() } as unknown as Record<string, unknown>);
    toast('success', 'تمت استعادة النسخة الاحتياطية ومزامنتها');
  };

  // ── Rotation ──
  const rotationOptions = useMemo(
    () => ({ workspace: account, carryOver }),
    [account, carryOver],
  );
  const effectiveStartingHead = useMemo(() => {
    if (!isFixedTeamWorkspace && history.length === 0 && carryOver?.headId) {
      // After yesterday's pinned person (skipped), the queue continues on the
      // OPPOSITE side: Kaled's team ⇄ Wael / Mohamed Samir's teams.
      return carryOver.headId === 'khaled'
        ? (heads.find((h) => h.id !== 'khaled')?.id ?? 'wael')
        : 'khaled';
    }
    return startingHead;
  }, [isFixedTeamWorkspace, history.length, carryOver, heads, startingHead]);

  // ── الدور على التيم (اختيار السيلز يدوي) ──
  // المحرّك يحدد التيم اللي عليه الدور فقط، ومين يقعد مع العميل يتم اختياره
  // يدوياً من نفس التيم — فلا يوجد أي اسم سيلز مقترح تلقائياً.
  const nextTeam: TeamTurn | null = useMemo(
    () => (paused ? null : computeNextTeam(salesState, history, managers, sales, heads, rotationOptions)),
    [paused, salesState, history, managers, sales, heads, rotationOptions],
  );

  /** كل أعضاء التيم اللي عليه الدور (بدون المدير) مع حالتهم، والأولوية للمتاحين. */
  const teamRoster: TeamMemberOption[] = useMemo(() => {
    if (!nextTeam) return [];
    const priority = new Map(
      availableTeamMembers(nextTeam.managerId, salesState, sales).map((s, i) => [s.id, i]),
    );
    const weight = (status: TeamMemberOption['status']) =>
      status === 'available' ? 0 : status === 'busy' ? 1 : 2;
    return sales
      .filter((s) => s.managerId === nextTeam.managerId && !s.isManager)
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
        };
      })
      .sort(
        (a, b) =>
          weight(a.status) - weight(b.status) ||
          (priority.get(a.id) ?? 0) - (priority.get(b.id) ?? 0),
      );
  }, [nextTeam, sales, salesState]);

  /** ترتيب الفرق (بالمديرين) بدءاً من التيم اللي عليه الدور. */
  const naturalTeamOrder = useMemo(
    () => teamOrderFrom(managers, nextTeam?.managerId),
    [managers, nextTeam],
  );

  const teamRound = useMemo(() => {
    if (manualOrder.length === 0) return naturalTeamOrder;
    const rank = new Map(manualOrder.map((id, i) => [id, i]));
    const known = naturalTeamOrder
      .filter((t) => rank.has(t.id))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    const unknown = naturalTeamOrder.filter((t) => !rank.has(t.id));
    return [...known, ...unknown];
  }, [naturalTeamOrder, manualOrder]);

  /** هل يوجد ترتيب يدوي فعّال فعلاً (يتجاهل أي أثر قديم بالاسم القديم للسيلز)? */
  const manualOrderActive = useMemo(
    () => teamRound.some((team, index) => team.id !== naturalTeamOrder[index]?.id),
    [teamRound, naturalTeamOrder],
  );

  const moveInOrder = (fromIndex: number, dir: -1 | 1) => {
    const to = fromIndex + dir;
    if (to < 0 || to >= teamRound.length) return;
    const ids = teamRound.map((t) => t.id);
    const [item] = ids.splice(fromIndex, 1);
    ids.splice(to, 0, item);
    setManualOrder(ids);
    toast('success', dir === -1 ? 'تم تقديم التيم في الترتيب' : 'تم تأخير التيم في الترتيب');
  };

  const resetOrder = () => {
    setManualOrder([]);
    toast('info', 'تمت العودة لترتيب الفرق التلقائي');
  };

  /** الفرق الجاية اللي عليها الدور فعلاً (اللي لها سيلز متاح). */
  const upcomingTeams: UpcomingTeam[] = useMemo(() => {
    const nameOfHead = (headId: string) => heads.find((h) => h.id === headId)?.name ?? headId;
    return naturalTeamOrder
      .slice(1)
      .map((team) => ({
        managerId: team.id,
        managerName: team.name,
        headName: nameOfHead(team.headId),
        available: availableTeamMembers(team.id, salesState, sales).length,
      }))
      .filter((team) => team.available > 0)
      .slice(0, 4);
  }, [naturalTeamOrder, salesState, sales, heads]);

  const availableForTurn = teamRoster.filter((m) => m.status === 'available').length;


  const totalToday = history.length;
  const presentCount = sales.filter((s) => salesState[s.id]?.status !== 'absent').length;
  const busyList = sales.filter((s) => salesState[s.id]?.status === 'busy');
  const availableCount = sales.filter((s) => salesState[s.id]?.status === 'available').length;
  const absentCount = sales.length - presentCount;

  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // ── Org handlers ──
  const addHead = (name: string, ar?: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `head-${Date.now()}`;
    const id = heads.some((h) => h.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setHeads((prev) => [...prev, { id, name, ar: ar || name }]);
  };

  const addManager = (name: string, headId: string, ar?: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `mgr-${Date.now()}`;
    const mgrId = managers.some((m) => m.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setManagers((prev) => [...prev, { id: mgrId, name, ar: ar || name, headId }]);
    const personId = `${mgrId}-self`;
    setSales((prev) => [...prev, { id: personId, name, managerId: mgrId, headId, isManager: true }]);
    setSalesState((prev) => ({
      ...prev,
      [personId]: { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null },
    }));
  };

  const addSales = (name: string, managerId: string, headId: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sales-${Date.now()}`;
    const id = sales.some((s) => s.id === slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;
    setSales((prev) => [...prev, { id, name, managerId, headId, isManager: false }]);
    setSalesState((prev) => ({
      ...prev,
      [id]: { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null },
    }));
  };

  /**
   * Renaming edits the member in place — the id (and therefore the attendance,
   * the counters, the queue position and every already-served turn) is kept.
   */
  const orgState = (): OrgState => ({ heads, managers, sales, history, carryOver });

  const updateHeadName = (headId: string, name: string, ar?: string) => {
    const next = renameHead(orgState(), headId, name, ar);
    setHeads(next.heads);
    setManagers(next.managers);
    setSales(next.sales);
    setHistory(next.history);
    setCarryOver(next.carryOver);
  };

  const updateManagerName = (managerId: string, name: string, ar?: string) => {
    const next = renameManager(orgState(), managerId, name, ar);
    setHeads(next.heads);
    setManagers(next.managers);
    setSales(next.sales);
    setHistory(next.history);
    setCarryOver(next.carryOver);
  };

  const updateSalesName = (salesId: string, name: string) => {
    const next = renameSalesPerson(orgState(), salesId, name);
    setHeads(next.heads);
    setManagers(next.managers);
    setSales(next.sales);
    setHistory(next.history);
    setCarryOver(next.carryOver);
  };

  const deleteHead = (headId: string) => {
    setHeads((prev) => prev.filter((h) => h.id !== headId));
    const mgrIds = managers.filter((m) => m.headId === headId).map((m) => m.id);
    setManagers((prev) => prev.filter((m) => m.headId !== headId));
    setSales((prev) => prev.filter((s) => s.headId !== headId && !mgrIds.includes(s.managerId)));
    if (startingHead === headId) {
      const remaining = heads.filter((h) => h.id !== headId);
      if (remaining[0]) setStartingHead(remaining[0].id);
    }
  };

  const deleteManager = (mgrId: string) => {
    setManagers((prev) => prev.filter((m) => m.id !== mgrId));
    setSales((prev) => prev.filter((s) => s.managerId !== mgrId));
  };

  const deleteSales = (salesId: string) => {
    setSales((prev) => prev.filter((s) => s.id !== salesId));
    setSalesState((prev) => {
      const copy = { ...prev };
      delete copy[salesId];
      return copy;
    });
  };

  // ── Attendance ──
  const toggleAttendance = (id: string) => {
    const st = salesState[id];
    if (!st || st.status === 'busy') return;
    if (st.status === 'absent') {
      const order = counter + 1;
      setCounter(order);
      setSalesState((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'available', checkInOrder: order, checkInTime: new Date().toISOString() },
      }));
    } else {
      setSalesState((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'absent', checkInOrder: null, checkInTime: null },
      }));
    }
  };

  const freeSales = (id: string) => {
    setSalesState((prev) => ({ ...prev, [id]: { ...prev[id], status: 'available' } }));
  };

  // ── Assignment ──
  /**
   * Confirm the client with the sales chosen MANUALLY from the team on turn.
   * There is no substitute concept any more: whoever is picked from the team is
   * the person serving, and the team's turn is what the queue advances on.
   */
  const confirmWith = (salesId: string) => {
    const s = sales.find((x) => x.id === salesId);
    if (!s) return;
    const mgr = managers.find((m) => m.id === s.managerId) || { id: s.managerId, name: s.managerId };
    const head = heads.find((h) => h.id === s.headId) || { id: s.headId, name: s.headId };
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
    };

    // Compact undo record: restores the person's state, the manual team order
    // and yesterday's carried turn.
    const entry: UndoEntry = {
      personId: salesId,
      prevState: salesState[salesId]
        ? typeof structuredClone === 'function'
          ? structuredClone(salesState[salesId])
          : (JSON.parse(JSON.stringify(salesState[salesId])) as SalesState)
        : { status: 'available', checkInOrder: null, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null },
      manualOrder: [...manualOrder],
      skippedIds: [],
      carryOver: carryOver ?? null,
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
    const nextAfter = computeNextTeam(newSalesState, newHistory, managers, sales, heads, {
      workspace: account,
      carryOver: carryAfter,
    });
    setSeq(n);
    setHistory(newHistory);
    setSalesState(newSalesState);
    setCarryOver(carryAfter);
    setClientLabel('');
    setVisitType('walkin');
    setManualOrder((prev) => (prev.length > 0 ? prev.filter((id) => id !== mgr.id) : prev));
    setAssignOpen(false);
    setDoneInfo({ assignment, next: nextAfter });
  };

  const undoLast = () => {
    const entry = undoStack[undoStack.length - 1];
    const last = history[history.length - 1];
    if (!last) return;

    if (entry) {
      // Full restore: the undone person returns to the exact queue position,
      // together with the manual team order and yesterday's carried turn.
      // Counters are reconciled from the restored history.
      const restoredHistory = history.slice(0, -1);
      setUndoStack((prev) => prev.slice(0, -1));
      setHistory(restoredHistory);
      setSalesState((prev) => reconcileCounts({ ...prev, [entry.personId]: entry.prevState }, restoredHistory));
      setManualOrder(entry.manualOrder);
      setCarryOver(entry.carryOver);
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
    setManualOrder((prev) => (prev.includes(last.managerId) ? prev : [last.managerId, ...prev]));
    toast('info', `تم التراجع عن ${last.salesName}`);
  };

  const resetDay = () => {
    if (!window.confirm('بدء يوم جديد؟ سيتم مسح الحضور والسجل وترحيل الدور المتبقي.')) return;
    // ترحيل دور التيم المتبقي: التيم اللي عليه الدور لم يُخدم بعد يبدأ اليوم الجديد،
    // وإلا يبدأ اليوم من التيم التالي لآخر تيم اتخدم في الدورة.
    const pending = paused ? null : nextTeam;
    const servedToday = carryOver?.managerId
      ? history.some((a) => a.managerId === carryOver.managerId)
      : false;
    setCarryOver(carryOverForNewDay(servedToday ? null : carryOver, pending, history, heads, account, undefined, managers));
    // Keep saved custom-team members in both RESTA and SITE's fresh attendance map.
    setSalesState(createNewDaySalesState(account, sales));
    setHistory([]);
    setCounter(0);
    setSeq(0);
    setClientLabel('');
    setManualOrder([]);
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
    <div dir="rtl" className="min-h-screen bg-ink-50 font-body text-ink-900">
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
                    {tab === 'order' && isFixedTeamWorkspace ? 'التناوب بترتيب الفرق الثابت في RESTA وSITE' : TITLES[tab].sub}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
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
                <section className="surface anim-fade-up relative overflow-hidden p-5">
                  <div aria-hidden className="hero-mesh pointer-events-none absolute inset-0" />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -left-10 -top-10 size-36 rounded-full border-[14px] border-brand-600/[0.06]"
                  />
                  <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="badge badge-red mb-2">
                        <Activity className="size-3" />
                        {account}
                      </span>
                      <h2 className="font-display text-[22px] font-black leading-tight text-ink-900 sm:text-[26px]">
                        أهلاً بك في منظّم الـ Walk-In
                      </h2>
                      <p className="mt-1 text-[12.5px] font-semibold text-ink-400">{today}</p>
                    </div>
                    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3 text-center">
                      <p className="text-[11px] font-bold text-ink-400">العميل القادم رقم</p>
                      <p className="tnum font-display text-[30px] font-black leading-none text-brand-600">
                        #{totalToday + 1}
                      </p>
                    </div>
                  </div>
                </section>

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
                      ) : !nextTeam ? (
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
                              {nextTeam.managerName.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-[20px] font-black leading-tight text-ink-900">
                                تيم {nextTeam.managerName}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="badge badge-red">{nextTeam.headName}</span>
                                <span className="badge badge-green">
                                  {availableForTurn} سيلز متاح للاختيار
                                </span>
                                {nextTeam.carriedSalesName && (
                                  <span className="badge badge-amber">دور أمس: {nextTeam.carriedSalesName}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setAssignOpen(true)} className="btn btn-primary mt-3 w-full py-3.5">
                            <UserCheck className="size-5" />
                            اختر السيلز وابدأ المقابلة
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

                  <ClientExcelBuilder account={account} sales={sales} />
                </div>

                {/* stats moved to bottom */}
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
                      icon={<Zap className="size-5" strokeWidth={2.2} />}
                    />
                    <StatCard
                      label="متاح الآن"
                      value={availableCount}
                      hint="جاهز لاستقبال عميل"
                      accent="green"
                      icon={<UserCheck className="size-5" strokeWidth={2.2} />}
                      progress={sales.length ? (availableCount / sales.length) * 100 : 0}
                    />
                    <StatCard
                      label="مشغول"
                      value={busyList.length}
                      hint="في مقابلة حالياً"
                      accent="amber"
                      icon={<PhoneCall className="size-5" strokeWidth={2.2} />}
                      progress={sales.length ? (busyList.length / sales.length) * 100 : 0}
                    />
                    <StatCard
                      label="لم يحضر"
                      value={absentCount}
                      hint={`من أصل ${sales.length} فرد`}
                      accent="gray"
                      icon={<Users className="size-5" strokeWidth={2.2} />}
                      progress={sales.length ? (absentCount / sales.length) * 100 : 0}
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
                        nextTeam ? 'bg-brand-600' : 'bg-ink-300',
                      )}
                    >
                      <Crown className="size-5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-brand-600">الدور الحالي — على التيم</p>
                      <p className="truncate font-display text-[17px] font-black text-ink-900">
                        {nextTeam ? `تيم ${nextTeam.managerName}` : 'لا يوجد تيم متاح'}
                      </p>
                      <p className="truncate text-[11.5px] font-semibold text-ink-400">
                        {!nextTeam
                          ? 'سجّل الحضور ليظهر دور التيم'
                          : `${nextTeam.headName} · اختر السيلز من التيم يدوياً (${availableForTurn} متاح)`}
                      </p>
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
                      {busyList.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-extrabold text-ink-900">{s.name}</p>
                            <p className="text-[11.5px] font-semibold text-amber-700">مشغول مع عميل</p>
                          </div>
                          <button onClick={() => freeSales(s.id)} className="btn btn-neutral shrink-0 px-3 py-2 text-[12px]">
                            إنهاء
                          </button>
                        </div>
                      ))}
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
                    salesState={salesState}
                    onToggle={toggleAttendance}
                    onFree={freeSales}
                    heads={heads}
                    managers={managers}
                    sales={sales}
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
                        {manualOrderActive && (
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
                      <p className="mb-1 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] font-semibold text-ink-500">
                        الترتيب بالمديرين — والسيلز يُختار يدوياً من التيم عند الدور. يمكنك تعديل ترتيب الفرق بالأسهم.
                      </p>
                      {teamRound.map((team, index) => {
                        const members = sales.filter((s) => s.managerId === team.id && !s.isManager);
                        const membersAvailable = members.filter((s) => salesState[s.id]?.status === 'available').length;
                        const headName = heads.find((h) => h.id === team.headId)?.name ?? team.headId;
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
                                  {index === 0 ? ' · الدور الحالي' : ''}
                                  {membersAvailable === 0
                                    ? ' · لا يوجد متاح — يُتخطّى'
                                    : ` · متاح ${membersAvailable}/${members.length}`}
                                </p>
                              </button>
                              <div className="flex shrink-0 flex-col">
                                <button
                                  type="button"
                                  onClick={() => moveInOrder(index, -1)}
                                  disabled={index <= 1}
                                  aria-label="تقديم التيم"
                                  className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                                >
                                  <ChevronUp className="size-4" strokeWidth={2.4} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveInOrder(index, 1)}
                                  disabled={index >= teamRound.length - 1}
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
                  <SectionTitle
                    title={isFixedTeamWorkspace ? 'دورة الفرق التلقائية' : 'بداية تناوب اليوم'}
                    subtitle={isFixedTeamWorkspace ? 'ترتيب ثابت مع تخطي الفرق غير المتاحة' : 'اختر الـ Head الذي يبدأ به الدور'}
                    icon={<Crown className="size-4.5" strokeWidth={2.1} />}
                  />
                  {isFixedTeamWorkspace ? (
                    <div className="space-y-2 rounded-xl bg-ink-50 p-3 text-[12px] font-semibold leading-relaxed text-ink-500">
                      <p dir="ltr">{AUTOMATIC_TEAM_ORDER.map((team) => team.name).join(' → ')} → …</p>
                      <p>يبدأ الدور من التيم المرحّل من أمس، ثم تستمر الدورة بالترتيب. أي تيم دون سيلز متاح يُتخطّى تلقائياً دون تغيير ترتيب باقي الفرق — والسيلز يُختار يدوياً من التيم عند دوره.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {heads.map((h) => (
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
                  )}
                </section>
              </div>
            )}

            {/* ═══════ MANAGE ═══════ */}
            {tab === 'manage' && (
              <div className="space-y-4">
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
                <ManageOrgPanel
                  heads={heads}
                  managers={managers}
                  sales={sales}
                  onAddHead={addHead}
                  onAddManager={addManager}
                  onAddSales={addSales}
                  onRenameHead={updateHeadName}
                  onRenameManager={updateManagerName}
                  onRenameSales={updateSalesName}
                  onDeleteHead={deleteHead}
                  onDeleteManager={deleteManager}
                  onDeleteSales={deleteSales}
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
