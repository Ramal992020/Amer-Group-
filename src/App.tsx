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
} from 'lucide-react';
import {
  HEADS as DEFAULT_HEADS,
  MANAGERS as DEFAULT_MANAGERS,
  SALES as DEFAULT_SALES,
  computeNextTurn,
  predictFullRound,
  carryOverTurn,
  reconcileCounts,
  defaultSalesState,
  loadPersisted,
  savePersisted,
  hydrate,
  setActiveAccount,
  formatTime,
} from './lib/walkin';
import type {
  Assignment,
  CarryOver,
  ComputedTurn,
  HeadGroup,
  ManagerTeam,
  SalesPerson,
  SalesState,
  PersistedWalkin,
  UndoEntry,
  VisitType,
} from './lib/walkin';
import { LoginScreen } from './components/LoginScreen';
import { SyncCard } from './components/SyncCard';
import { BackupPanel } from './components/BackupPanel';
import { saveAutomaticBackup } from './lib/backups';
import { pullRemote, pushRemote, testConnection, normalizeUrl, getSyncConfig } from './lib/sync';
import type { SyncConfig, SyncStatus } from './lib/sync';
import { CurrentTurn } from './components/CurrentTurn';
import type { SubstituteOption } from './components/CurrentTurn';
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
  next: ComputedTurn | null;
}

type Tab = 'dashboard' | 'today' | 'log' | 'order' | 'manage';

const AUTH_KEY = 'amer-walkin-auth';

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
  order: { title: 'الترتيب', sub: 'التناوب بنظام Head × Head وأولوية الحضور' },
  log: { title: 'السجل', sub: 'كل عمليات التوزيع التي تمت اليوم' },
  manage: { title: 'الهيكل', sub: 'إدارة الفرق والمزامنة بين الأجهزة' },
};

export default function App() {
  const [account, setAccount] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_KEY);
    } catch {
      return null;
    }
  });

  if (!account) {
    return (
      <LoginScreen
        onLogin={(user) => {
          try {
            localStorage.setItem(AUTH_KEY, user);
          } catch {
            /* ignore */
          }
          setActiveAccount(user);
          setAccount(user);
        }}
      />
    );
  }

  setActiveAccount(account);

  return (
    <ToastProvider>
      <WalkInApp
        key={account}
        account={account}
        onLogout={() => {
          try {
            localStorage.removeItem(AUTH_KEY);
          } catch {
            /* ignore */
          }
          setAccount(null);
        }}
      />
    </ToastProvider>
  );
}

function WalkInApp({ account, onLogout }: { account: string; onLogout: () => void }) {
  const toast = useToast();
  const [boot] = useState(() => loadPersisted());
  const [heads, setHeads] = useState<HeadGroup[]>(boot.customHeads || DEFAULT_HEADS);
  const [managers, setManagers] = useState<ManagerTeam[]>(boot.customManagers || DEFAULT_MANAGERS);
  const [sales, setSales] = useState<SalesPerson[]>(boot.customSales || DEFAULT_SALES);
  const [manualOrder, setManualOrder] = useState<string[]>(boot.manualOrder || []);

  const [salesState, setSalesState] = useState<Record<string, SalesState>>(boot.salesState);
  const [history, setHistory] = useState<Assignment[]>(boot.history);
  const [counter, setCounter] = useState(boot.counter);
  const [seq, setSeq] = useState(boot.seq);
  const [startingHead, setStartingHead] = useState(boot.startingHead);
  const [carryOver, setCarryOver] = useState<CarryOver | null>(boot.carryOver);
  const [lastResetAt, setLastResetAt] = useState<string | null>(boot.lastResetAt);
  const [clientLabel, setClientLabel] = useState('');
  const [visitType, setVisitType] = useState<VisitType>('walkin');
  const [skippedIds, setSkippedIds] = useState<string[]>(boot.skippedIds || []);
  const [paused, setPaused] = useState(false);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState(true);

  // ── Sync (Supabase Project URL + Publishable Key) ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [syncRetry, setSyncRetry] = useState(0);

  const revisionRef = useRef<number>(boot.updatedAt ?? 0);
  const applyingRemoteRef = useRef(false);
  const lastSavedStateRef = useRef<PersistedWalkin>(boot);
  // Cloud is usable only after a successful connect/pull this session.
  const syncReadyRef = useRef(false);

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
      skippedIds,
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
      skippedIds,
      undoStack,
    ],
  );

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
    if (Array.isArray(state.skippedIds)) setSkippedIds(state.skippedIds);
    if (Array.isArray(state.undoStack)) setUndoStack(state.undoStack);
    savePersisted(state);
    lastSavedStateRef.current = state;
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, [account]);

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
      toast('info', 'لا يوجد اتصال بالإنترنت — يعمل التطبيق محلياً');
      return;
    }
    if (test === 'no-table') {
      setSyncStatus('error');
      toast('error', 'شغّل ملف SQL في Supabase أولاً (التعليمات في كارت المزامنة)');
      return;
    }

    const seed = { ...snapshot, updatedAt: revisionRef.current };
    const remote = await pullRemote(account, seed);
    if (!remote) {
      setSyncStatus('error');
      toast('error', 'تعذّر قراءة بيانات المزامنة من المشروع');
      return;
    }
    if (remote.updatedAt > revisionRef.current) applyRemote(remote.payload);
    syncReadyRef.current = true;
    setSyncStatus('synced');
    if (input) toast('success', 'تم الاتصال بكل الأجهزة بنجاح');
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
    const stamp = Date.now();
    revisionRef.current = stamp;
    const nextState: PersistedWalkin = { ...snapshot, updatedAt: stamp };
    const previousComparable = JSON.stringify({ ...lastSavedStateRef.current, updatedAt: undefined });
    const nextComparable = JSON.stringify({ ...nextState, updatedAt: undefined });
    if (previousComparable !== nextComparable) saveAutomaticBackup(account, lastSavedStateRef.current);
    savePersisted(nextState);
    lastSavedStateRef.current = nextState;

    if (!syncReadyRef.current) return;
    const t = setTimeout(async () => {
      const ok = await pushRemote(account, { ...snapshot, updatedAt: stamp });
      setSyncStatus(ok ? 'synced' : 'error');
      if (ok) syncReadyRef.current = true;
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, account]);

  // Poll for changes from other devices (every 5 seconds).
  useEffect(() => {
    const id = setInterval(async () => {
      if (!syncReadyRef.current || document.hidden) return;
      const remote = await pullRemote(account);
      if (!remote) {
        setSyncStatus('error');
        return;
      }
      setSyncStatus('synced');
      if (remote.updatedAt > revisionRef.current) applyRemote(remote.payload);
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyRemote, account]);

  const connectWithConfig = (url: string, key: string) => runSync({ url, key });

  const retrySync = () => {
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
  const effectiveStartingHead = useMemo(() => {
    if (history.length === 0 && carryOver?.headId) {
      // After yesterday's pinned person (skipped), the queue continues on the
      // OPPOSITE side: Kaled's team ⇄ Wael / Mohamed Samir's teams.
      return carryOver.headId === 'khaled'
        ? (heads.find((h) => h.id !== 'khaled')?.id ?? 'wael')
        : 'khaled';
    }
    return startingHead;
  }, [history.length, carryOver, heads, startingHead]);

  // Yesterday's pending person is ALWAYS pinned first in the new day — even if
  // still absent. A substitute is picked manually (بديل من نفس التيم) when needed.
  const pinned: ComputedTurn | null = useMemo(() => {
    if (paused || history.length > 0 || !carryOver) return null;
    if (carryOver.salesId && skippedIds.includes(carryOver.salesId)) return null;
    return carryOverTurn(carryOver, salesState, heads, managers, sales);
  }, [paused, history.length, carryOver, skippedIds, salesState, heads, managers, sales]);

  const next: ComputedTurn | null = useMemo(() => {
    if (paused) return null;
    if (pinned) return pinned;
    return computeNextTurn(salesState, history, effectiveStartingHead, skippedIds, heads, managers, sales);
  }, [paused, pinned, salesState, history, effectiveStartingHead, skippedIds, heads, managers, sales]);

  const nextIsPresent = !!next && salesState[next.salesId]?.status === 'available';

  const computedRound = useMemo(
    () => (paused ? [] : predictFullRound(salesState, history, effectiveStartingHead, next, heads, managers, sales)),
    [salesState, history, effectiveStartingHead, next, paused, heads, managers, sales],
  );

  const fullRound = useMemo(() => {
    if (manualOrder.length === 0) return computedRound;
    const rank = new Map(manualOrder.map((id, i) => [id, i]));
    const known = computedRound
      .filter((t) => rank.has(t.salesId))
      .sort((a, b) => (rank.get(a.salesId) ?? 0) - (rank.get(b.salesId) ?? 0));
    const unknown = computedRound.filter((t) => !rank.has(t.salesId));
    return [...known, ...unknown];
  }, [computedRound, manualOrder]);

  const moveInOrder = (fromIndex: number, dir: -1 | 1) => {
    const to = fromIndex + dir;
    if (to < 0 || to >= fullRound.length) return;
    const ids = fullRound.map((t) => t.salesId);
    const [item] = ids.splice(fromIndex, 1);
    ids.splice(to, 0, item);
    setManualOrder(ids);
    toast('success', dir === -1 ? 'تم تقديم الشخص في الترتيب' : 'تم تأخير الشخص في الترتيب');
  };

  const resetOrder = () => {
    setManualOrder([]);
    toast('info', 'تمت العودة للترتيب التلقائي');
  };

  const upcoming = useMemo(() => fullRound.slice(1, 5), [fullRound]);

  const substituteOptions: SubstituteOption[] = useMemo(() => {
    if (!next) return [];
    return sales
      .filter((s) => s.managerId === next.managerId && s.id !== next.salesId && salesState[s.id]?.status === 'available')
      .map((s) => ({
        id: s.id,
        name: s.name,
        walkCount: salesState[s.id]?.walkCount ?? 0,
        coverCount: salesState[s.id]?.coverCount ?? 0,
        checkInOrder: salesState[s.id]?.checkInOrder ?? null,
        isManager: s.isManager,
      }))
      .sort(
        (a, b) =>
          Number(Boolean(b.isManager)) - Number(Boolean(a.isManager)) ||
          a.walkCount - b.walkCount ||
          (a.checkInOrder ?? 9999) - (b.checkInOrder ?? 9999),
      );
  }, [next, sales, salesState]);

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
      setSkippedIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const freeSales = (id: string) => {
    setSalesState((prev) => ({ ...prev, [id]: { ...prev[id], status: 'available' } }));
  };

  // ── Assignment ──
  const confirmWith = (salesId: string, substituted: boolean, originalName?: string) => {
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
      substituted,
      originalSalesName: originalName,
      visitType,
    };

    // Compact undo record: restores the person's exact queue position, the
    // manual order, the skipped list and yesterday's carry-over.
    const entry: UndoEntry = {
      personId: salesId,
      prevState: salesState[salesId]
        ? typeof structuredClone === 'function'
          ? structuredClone(salesState[salesId])
          : (JSON.parse(JSON.stringify(salesState[salesId])) as SalesState)
        : { status: 'available', checkInOrder: null, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null },
      manualOrder: [...manualOrder],
      skippedIds: [...skippedIds],
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
        // A substitute keeps their own turn: covering a teammate counts as a
        // cover (stats only) and NEVER touches walkCount (queue fairness).
        walkCount: (salesState[salesId]?.walkCount ?? 0) + (substituted ? 0 : 1),
        coverCount: (salesState[salesId]?.coverCount ?? 0) + (substituted ? 1 : 0),
        lastServedAt: new Date().toISOString(),
      },
    };
    const nextAfter = computeNextTurn(newSalesState, newHistory, effectiveStartingHead, [], heads, managers, sales);
    setSeq(n);
    setHistory(newHistory);
    setSalesState(newSalesState);
    setSkippedIds([]);
    setClientLabel('');
    setVisitType('walkin');
    setManualOrder((prev) =>
      prev.length > 0
        ? prev.filter((id) => id !== (substituted ? next?.salesId : salesId))
        : prev,
    );
    if (history.length === 0) setCarryOver(null);
    setAssignOpen(false);
    setDoneInfo({ assignment, next: nextAfter });
  };

  const undoLast = () => {
    const entry = undoStack[undoStack.length - 1];
    const last = history[history.length - 1];
    if (!last) return;

    if (entry) {
      // Full restore: the undone person returns to the exact queue position,
      // together with the manual order, skipped names and yesterday's pin.
      // Counters are then reconciled from the restored history so a cover
      // never leaks into the person's own-turn count.
      const restoredHistory = history.slice(0, -1);
      setUndoStack((prev) => prev.slice(0, -1));
      setHistory(restoredHistory);
      setSalesState((prev) => reconcileCounts({ ...prev, [entry.personId]: entry.prevState }, restoredHistory));
      setManualOrder(entry.manualOrder);
      setSkippedIds(entry.skippedIds);
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
    setManualOrder((prev) => (prev.includes(last.salesId) ? prev : [last.salesId, ...prev]));
    setSkippedIds((prev) => prev.filter((x) => x !== last.salesId));
    toast('info', `تم التراجع عن ${last.salesName}`);
  };

  const resetDay = () => {
    if (!window.confirm('بدء يوم جديد؟ سيتم مسح الحضور والسجل وترحيل الدور المتبقي.')) return;
    const pending = paused
      ? null
      : computeNextTurn(salesState, history, effectiveStartingHead, skippedIds, heads, managers, sales);
    if (pending) {
      setCarryOver({
        salesId: pending.salesId,
        salesName: pending.salesName,
        managerId: pending.managerId,
        managerName: pending.managerName,
        headId: pending.headId,
        headName: pending.headName,
        fromDate: new Date().toISOString(),
      });
    } else if (history.length > 0) {
      const lastHead = history[history.length - 1].headId;
      const nextIdx = (heads.findIndex((h) => h.id === lastHead) + 1) % heads.length;
      const nextHeadObj = heads[nextIdx] || heads[0];
      setCarryOver({
        salesId: '',
        salesName: '',
        managerId: '',
        managerName: '',
        headId: nextHeadObj?.id || 'khaled',
        headName: nextHeadObj?.name || 'Khaled Youssef',
        fromDate: new Date().toISOString(),
      });
    }
    setSalesState(defaultSalesState());
    setHistory([]);
    setCounter(0);
    setSeq(0);
    setSkippedIds([]);
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
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-[11px] font-black text-white">
                  {account.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-extrabold text-ink-900">{account}</p>
                  <p className="truncate text-[10px] font-semibold text-ink-400">حساب الفرع</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-brand-600"
              >
                <LogOut className="size-4" />
              </button>
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
                  <p className="hidden truncate text-[12px] font-medium text-ink-400 sm:block">{TITLES[tab].sub}</p>
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
                        subtitle="المقترح للجلوس مع العميل القادم"
                        icon={<Crown className="size-4.5" strokeWidth={2.1} />}
                      />
                      {paused ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                          <Pause className="mx-auto size-6 text-amber-600" />
                          <p className="mt-2 text-[14px] font-extrabold text-ink-900">الترتيب متوقف مؤقتاً</p>
                        </div>
                      ) : !next ? (
                        <EmptyState
                          icon={<UserCheck className="size-6" />}
                          title="لا يوجد سيلز متاح"
                          description="سجّل الحضور من شاشة الحضور ليظهر الدور."
                          action={
                            <button onClick={() => go('today')} className="btn btn-secondary">
                              الذهاب للحضور
                            </button>
                          }
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
                            <span
                              className={cn(
                                'grid size-12 shrink-0 place-items-center rounded-2xl text-[16px] font-black text-white',
                                nextIsPresent ? 'bg-emerald-500 pulse-ring' : 'bg-ink-300',
                              )}
                            >
                              {next.salesName.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-[20px] font-black leading-tight text-ink-900">
                                {next.salesName}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="badge badge-gray">تيم {next.managerName}</span>
                                <span className="badge badge-red">{next.headName}</span>
                                <span className={cn('badge', nextIsPresent ? 'badge-green' : 'badge-amber')}>
                                  {nextIsPresent ? 'حاضر' : 'لم يحضر'}
                                </span>
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setAssignOpen(true)} className="btn btn-primary mt-3 w-full py-3.5">
                            <UserCheck className="size-5" />
                            إسناد العميل الآن
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
                        nextIsPresent ? 'bg-emerald-500' : 'bg-ink-300',
                      )}
                    >
                      <Crown className="size-5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-brand-600">الدور الحالي</p>
                      <p className="truncate font-display text-[17px] font-black text-ink-900">
                        {next?.salesName ?? 'لا يوجد متاح'}
                      </p>
                      <p className="truncate text-[11.5px] font-semibold text-ink-400">
                        {!next
                          ? 'سجّل الحضور ليظهر الدور'
                          : `تيم ${next.managerName} · ${nextIsPresent ? 'حاضر' : 'لم يحضر بعد'}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'me-4 shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-black',
                      nextIsPresent ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400',
                    )}
                  >
                    إسناد
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
                    title="قائمة الترتيب"
                    subtitle={paused ? 'الترتيب متوقف مؤقتاً' : `${fullRound.length} في الطابور`}
                    icon={<ListOrdered className="size-4.5" strokeWidth={2.1} />}
                    action={
                      <div className="flex items-center gap-1.5">
                        {manualOrder.length > 0 && (
                          <button
                            onClick={resetOrder}
                            title="العودة للترتيب التلقائي"
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
                  ) : !next ? (
                    <EmptyState
                      icon={<ListOrdered className="size-6" />}
                      title="لا يوجد ترتيب حالياً"
                      description="سجّل حضور السيلز من شاشة الحضور ليظهر الدور."
                      action={
                        <button onClick={() => go('today')} className="btn btn-secondary">
                          الذهاب للحضور
                        </button>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      <p className="mb-1 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] font-semibold text-ink-500">
                        يمكنك تعديل الترتيب يدوياً بالأسهم. الشخص الأول لا يُؤخَّر إلا يدوياً.
                      </p>
                      {busyList
                        .filter((s) => {
                          const lastFor = [...history].reverse().find((a) => a.salesId === s.id);
                          return lastFor?.substituted === true;
                        })
                        .map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5"
                          >
                            <span className="relative flex size-2.5 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
                            </span>
                            <p className="text-[12px] font-bold text-amber-800">
                              {s.name} مشغول بتغطية زميل — دوره الأصلي محفوظ حسب حضوره
                            </p>
                          </div>
                        ))}
                      {fullRound.map((person, index) => {
                        const isPresent = salesState[person.salesId]?.status !== 'absent';
                        return (
                          <div
                            key={`${person.salesId}-${index}`}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-right transition',
                              index === 0
                                ? 'border-brand-200 bg-brand-50/60 shadow-[0_4px_12px_-6px_rgba(227,6,19,0.3)]'
                                : 'border-ink-100 bg-white hover:border-ink-200',
                            )}
                          >
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
                                    isPresent ? 'bg-emerald-500' : 'bg-ink-200',
                                  )}
                                />
                                <span className="truncate">{person.salesName}</span>
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-400">
                                تيم {person.managerName} · {person.headName}
                                {index === 0 ? ' · الدور الحالي' : ''}
                                {!isPresent ? ' · لم يحضر' : ''}
                              </p>
                            </button>

                            <div className="flex shrink-0 flex-col">
                              <button
                                type="button"
                                onClick={() => moveInOrder(index, -1)}
                                disabled={index <= 1}
                                aria-label="تقديم"
                                className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                              >
                                <ChevronUp className="size-4" strokeWidth={2.4} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveInOrder(index, 1)}
                                disabled={index >= fullRound.length - 1}
                                aria-label="تأخير"
                                className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                              >
                                <ChevronDown className="size-4" strokeWidth={2.4} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="surface anim-fade-up p-4" style={{ animationDelay: '0.08s' }}>
                  <SectionTitle
                    title="بداية تناوب اليوم"
                    subtitle="اختر الـ Head الذي يبدأ به الدور"
                    icon={<Crown className="size-4.5" strokeWidth={2.1} />}
                  />
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
              <button onClick={onLogout} className="btn btn-danger w-full">
                <LogOut className="size-4" />
                تسجيل الخروج ({account})
              </button>
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
            next={next}
            upcoming={upcoming}
            clientLabel={clientLabel}
            setClientLabel={setClientLabel}
            visitType={visitType}
            setVisitType={setVisitType}
            onConfirm={() => next && nextIsPresent && confirmWith(next.salesId, false)}
            nextIsPresent={nextIsPresent}
            onSubstitute={(id) => next && confirmWith(id, true, next.salesName)}
            onSkip={() => next && setSkippedIds((prev) => [...prev, next.salesId])}
            onResetSkips={() => setSkippedIds([])}
            skippedCount={skippedIds.length}
            substituteOptions={substituteOptions}
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
