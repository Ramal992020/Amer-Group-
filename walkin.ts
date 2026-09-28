// ─── Amer Group · Walk-In rotation engine (Head & Head + attendance priority) ───

export interface HeadGroup {
  id: string;
  name: string;
  ar: string;
}

export interface ManagerTeam {
  id: string;
  name: string;
  ar: string;
  headId: string;
}

export interface SalesPerson {
  id: string;
  name: string;
  managerId: string;
  headId: string;
  isManager?: boolean;
}

export type SalesStatus = 'absent' | 'available' | 'busy';

export interface SalesState {
  status: SalesStatus;
  checkInOrder: number | null;
  checkInTime: string | null;
  /** Own turns served — the ONLY counter that affects queue order. */
  walkCount: number;
  /** Times this person covered an absent teammate — stats only, never affects order. */
  coverCount?: number;
  lastServedAt: string | null;
}

export type VisitType = 'walkin' | 'site' | 'resta';

export const VISIT_LABELS: Record<VisitType, string> = {
  walkin: 'Walk in',
  site: 'Walk in Site',
  resta: 'Walk in Resta',
};

export interface Assignment {
  id: string;
  n: number;
  salesId: string;
  salesName: string;
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
  time: string;
  clientLabel: string;
  substituted: boolean;
  originalSalesName?: string;
  visitType?: VisitType;
}

export interface ComputedTurn {
  salesId: string;
  salesName: string;
  managerId: string;
  managerName: string;
  managerAr: string;
  headId: string;
  headName: string;
  headAr: string;
  reason: string;
  isFallback: boolean;
}

// ───────────────────────── Static org chart ─────────────────────────

export const HEADS: HeadGroup[] = [
  { id: 'khaled', name: 'Khaled Youssef', ar: 'خالد يوسف' },
  { id: 'wael', name: 'Wael El Desoky', ar: 'وائل الدسوقي' },
  { id: 'mohamed-samir', name: 'Mohamed Samir', ar: 'محمد سمير' },
];

export const MANAGERS: ManagerTeam[] = [
  { id: 'ahmed', name: 'Ahmed Yossry', ar: 'أحمد يسري', headId: 'khaled' },
  { id: 'rewaida', name: 'Rewaida', ar: 'رويدا', headId: 'khaled' },
  { id: 'perry', name: 'Perry', ar: 'بيري', headId: 'khaled' },
  { id: 'shehata', name: 'Youssef Shehata', ar: 'يوسف شحاتة', headId: 'wael' },
  { id: 'tarek-osman', name: 'Tarek Osman', ar: 'طارق عثمان', headId: 'mohamed-samir' },
];

export const SALES: SalesPerson[] = [
  { id: 'ahmed-yossry', name: 'Ahmed Yossry', managerId: 'ahmed', headId: 'khaled', isManager: true },
  { id: 'manar', name: 'Manar', managerId: 'ahmed', headId: 'khaled' },
  { id: 'momen', name: "Mo'men", managerId: 'ahmed', headId: 'khaled' },
  { id: 'sara', name: 'Sara', managerId: 'ahmed', headId: 'khaled' },
  { id: 'mariam', name: 'Mariam', managerId: 'ahmed', headId: 'khaled' },
  { id: 'rewaida-self', name: 'Rewaida', managerId: 'rewaida', headId: 'khaled', isManager: true },
  { id: 'zezo', name: 'Zezo', managerId: 'rewaida', headId: 'khaled' },
  { id: 'fouad', name: 'Fouad', managerId: 'rewaida', headId: 'khaled' },
  { id: 'nourhan', name: 'Nourhan', managerId: 'rewaida', headId: 'khaled' },
  { id: 'nada', name: 'Nada Katarya', managerId: 'rewaida', headId: 'khaled' },
  { id: 'reem', name: 'Reem Magdy', managerId: 'perry', headId: 'khaled' },
  { id: 'nourseen', name: 'Nourseen', managerId: 'shehata', headId: 'wael' },
  { id: 'ebrahim', name: 'Ebrahim', managerId: 'shehata', headId: 'wael' },
  { id: 'abdelrahman', name: 'Abdelrahman', managerId: 'shehata', headId: 'wael' },
  { id: 'omar', name: 'Omar', managerId: 'shehata', headId: 'wael' },
  { id: 'eslam', name: 'Eslam', managerId: 'shehata', headId: 'wael' },
  { id: 'youssef-shehata', name: 'Youssef Shehata', managerId: 'shehata', headId: 'wael', isManager: true },
  { id: 'tarek-osman', name: 'Tarek Osman', managerId: 'tarek-osman', headId: 'mohamed-samir', isManager: true },
  { id: 'amira', name: 'Amira', managerId: 'tarek-osman', headId: 'mohamed-samir' },
];

export const getSales = (id: string): SalesPerson => SALES.find((s) => s.id === id)!;
export const getManager = (id: string): ManagerTeam => MANAGERS.find((m) => m.id === id)!;
export const getHead = (id: string): HeadGroup => HEADS.find((h) => h.id === id)!;

export const teamMembers = (managerId: string): SalesPerson[] =>
  SALES.filter((s) => s.managerId === managerId);

/** Sales who enter the automatic Head × Head queue. Managers stay attendance-only. */
export const rotationMembers = (managerId: string): SalesPerson[] =>
  teamMembers(managerId).filter((s) => !s.isManager);

export const headMembers = (headId: string): SalesPerson[] =>
  SALES.filter((s) => s.headId === headId);

// ───────────────────────── State helpers ─────────────────────────

export const defaultSalesState = (): Record<string, SalesState> => {
  const map: Record<string, SalesState> = {};
  SALES.forEach((s) => {
    map[s.id] = { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null };
  });
  return map;
};

/**
 * Rebuild queue counters from history (the source of truth):
 * - walkCount  = own turns served (substituted === false) → drives queue fairness
 * - coverCount = times covering an absent teammate → stats only, never affects order
 * This also repairs data written before the split, where a cover wrongly
 * incremented walkCount and pushed the substitute back in the queue.
 */
export function reconcileCounts(
  salesState: Record<string, SalesState>,
  history: Assignment[],
): Record<string, SalesState> {
  const own = new Map<string, number>();
  const covers = new Map<string, number>();
  history.forEach((a) => {
    const map = a.substituted ? covers : own;
    map.set(a.salesId, (map.get(a.salesId) ?? 0) + 1);
  });
  const out: Record<string, SalesState> = {};
  Object.entries(salesState).forEach(([id, st]) => {
    out[id] = { ...st, walkCount: own.get(id) ?? 0, coverCount: covers.get(id) ?? 0 };
  });
  return out;
}

export interface CarryOver {
  salesId: string;
  salesName: string;
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
  fromDate: string;
}

/** Compact action record so undo restores the exact queue position, even after reloads. */
export interface UndoEntry {
  personId: string;
  prevState: SalesState;
  manualOrder: string[];
  skippedIds: string[];
  carryOver: CarryOver | null;
  seq: number;
  counter: number;
}

export interface PersistedWalkin {
  salesState: Record<string, SalesState>;
  history: Assignment[];
  counter: number;
  seq: number;
  startingHead: string;
  carryOver: CarryOver | null;
  lastResetAt: string | null;
  customHeads?: HeadGroup[];
  customManagers?: ManagerTeam[];
  customSales?: SalesPerson[];
  /** Manual order override (list of sales IDs). */
  manualOrder?: string[];
  /** Skipped sales IDs for the current day. */
  skippedIds?: string[];
  /** Undo log (last actions first). */
  undoStack?: UndoEntry[];
  /** Last modification time — used to resolve conflicts between devices. */
  updatedAt?: number;
}

const STORAGE_KEY = 'amer-walkin-v3';

/** Each account (SITE / RESTA) keeps its own local copy of the shared state. */
let activeAccount = '';
export const setActiveAccount = (account: string): void => {
  activeAccount = account.toLowerCase();
};
const storageKey = () => (activeAccount ? `${STORAGE_KEY}-${activeAccount}` : STORAGE_KEY);

/** Merge defaults with any saved custom org so new built-in people always appear. */
function mergeById<T extends { id: string }>(defaults: T[], custom?: T[] | null): T[] {
  const map = new Map<string, T>();
  defaults.forEach((item) => map.set(item.id, item));
  (custom ?? []).forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()];
}

/** Normalize any raw object (local or remote) into a valid state. */
export function hydrate(parsed: Partial<PersistedWalkin>): PersistedWalkin {
  const heads = mergeById(HEADS, parsed.customHeads);
  const managers = mergeById(MANAGERS, parsed.customManagers);
  const salesList = mergeById(SALES, parsed.customSales);

  const history = Array.isArray(parsed.history) ? parsed.history : [];

  const mergedState: Record<string, SalesState> = {};
  salesList.forEach((s) => {
    mergedState[s.id] = parsed.salesState?.[s.id] ?? {
      status: 'absent',
      checkInOrder: null,
      checkInTime: null,
      walkCount: 0,
      coverCount: 0,
      lastServedAt: null,
    };
  });

  return {
    salesState: reconcileCounts(mergedState, history),
    history,
    counter: typeof parsed.counter === 'number' ? parsed.counter : 0,
    seq: typeof parsed.seq === 'number' ? parsed.seq : 0,
    startingHead: parsed.startingHead || heads[0]?.id || 'khaled',
    carryOver: parsed.carryOver ?? null,
    lastResetAt: parsed.lastResetAt ?? null,
    customHeads: heads,
    customManagers: managers,
    customSales: salesList,
    manualOrder: Array.isArray(parsed.manualOrder) ? parsed.manualOrder.filter((id): id is string => typeof id === 'string') : undefined,
    skippedIds: Array.isArray(parsed.skippedIds) ? parsed.skippedIds.filter((id): id is string => typeof id === 'string') : [],
    undoStack: Array.isArray(parsed.undoStack) ? (parsed.undoStack as UndoEntry[]) : [],
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
  };
}

export function loadPersisted(): PersistedWalkin {
  const fallback: PersistedWalkin = {
    salesState: defaultSalesState(),
    history: [],
    counter: 0,
    seq: 0,
    startingHead: 'khaled',
    carryOver: null,
    lastResetAt: null,
    customHeads: HEADS,
    customManagers: MANAGERS,
    customSales: SALES,
  };
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return fallback;
    return hydrate(JSON.parse(raw) as Partial<PersistedWalkin>);
  } catch {
    return fallback;
  }
}

export function savePersisted(p: PersistedWalkin): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(p));
  } catch {
    /* storage full — ignore */
  }
}

// ───────────────────────── Rotation engine ─────────────────────────
//
// Rules (per operation):
//  1. Alternation among Heads (2 or more heads in cycle).
//  2. Inside Khaled: managers rotate Manager × Manager (Ahmed ⇄ Rewaida ⇄ Perry).
//     Inside other heads: attendance priority only.
//  3. Someone who already served today goes to the back of their Head's line.
//  4. Yesterday's pending person is pinned first (handled by the caller). If they
//     are still absent, a present teammate may temporarily take their place.

/** Khaled's side ⇄ the other Heads' side (Wael + Mohamed Samir). */
const sideOf = (headId: string): 'khaled' | 'other' => (headId === 'khaled' ? 'khaled' : 'other');

function sortByAttendance(a: SalesPerson, b: SalesPerson, salesState: Record<string, SalesState>): number {
  const sa = salesState[a.id];
  const sb = salesState[b.id];
  if ((sa?.walkCount ?? 0) !== (sb?.walkCount ?? 0)) return (sa?.walkCount ?? 0) - (sb?.walkCount ?? 0);
  return (sa?.checkInOrder ?? Number.MAX_SAFE_INTEGER) - (sb?.checkInOrder ?? Number.MAX_SAFE_INTEGER);
}

export { sortByAttendance };

interface Candidate {
  sales: SalesPerson;
  walkCount: number;
  checkIn: number;
}

/** Available rotation members sorted by fairness (fewer walks) then attendance. */
function candidatesOf(
  members: SalesPerson[],
  salesState: Record<string, SalesState>,
  excludeIds: string[],
): Candidate[] {
  return members
    .filter(
      (s) =>
        !s.isManager &&
        salesState[s.id]?.status === 'available' &&
        !excludeIds.includes(s.id),
    )
    .map((s) => ({
      sales: s,
      walkCount: salesState[s.id]?.walkCount ?? 0,
      checkIn: salesState[s.id]?.checkInOrder ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.walkCount - b.walkCount || a.checkIn - b.checkIn);
}

function lastKaledManager(history: Assignment[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].headId === 'khaled') return history[i].managerId;
  }
  return null;
}

/** When (index) each Kaled manager team last served — used for Manager × Manager rotation. */
function kaledServeIndex(history: Assignment[]): Map<string, number> {
  const map = new Map<string, number>();
  history.forEach((a, idx) => {
    if (a.headId === 'khaled') map.set(a.managerId, idx);
  });
  return map;
}

function lastOtherHead(history: Assignment[], otherHeads: HeadGroup[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (otherHeads.some((h) => h.id === history[i].headId)) return history[i].headId;
  }
  return null;
}

/**
 * Khaled's slot: Manager × Manager (Ahmed ⇄ Rewaida ⇄ Perry).
 * The team that just served is skipped when another team has people, and the
 * winning team is chosen by attendance priority (fewer walks first, then the
 * earliest check-in — so a Perry arrival before Rewaida/Yossry goes first).
 */
function pickForKaled(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  excludeIds: string[],
  salesList: SalesPerson[],
  managersList: ManagerTeam[],
): SalesPerson | null {
  const teams = managersList.filter((m) => m.headId === 'khaled');
  const ranked = teams
    .map((m) => {
      const cands = candidatesOf(
        salesList.filter((s) => s.managerId === m.id),
        salesState,
        excludeIds,
      );
      return cands.length ? { mgrId: m.id, best: cands[0] } : null;
    })
    .filter((x): x is { mgrId: string; best: Candidate } => x !== null);
  if (ranked.length === 0) return null;

  // Manager × Manager: the team served LONGEST AGO goes next (so each team gets
  // one turn per cycle: Rewaida → Ahmed → Perry → Rewaida …). Teams at the same
  // recency level are decided purely by attendance (earlier check-in first).
  const serveIdx = kaledServeIndex(history);
  const lastMgr = lastKaledManager(history);
  const pool = lastMgr ? ranked.filter((r) => r.mgrId !== lastMgr) : ranked;
  const use = pool.length ? pool : ranked;
  use.sort((a, b) => {
    const la = serveIdx.get(a.mgrId) ?? -1;
    const lb = serveIdx.get(b.mgrId) ?? -1;
    return la - lb || a.best.walkCount - b.best.walkCount || a.best.checkIn - b.best.checkIn;
  });
  return use[0].best.sales;
}

/**
 * The other side's slot: Wael ⇄ Mohamed Samir (whichever served least recently
 * goes first — so the 3rd Head comes after Wael, and if nobody from him is in,
 * the turn falls back to Wael's team).
 */
function pickForOtherHead(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  excludeIds: string[],
  salesList: SalesPerson[],
  headsList: HeadGroup[],
): { sales: SalesPerson; head: HeadGroup } | null {
  const otherHeads = headsList.filter((h) => h.id !== 'khaled');
  if (otherHeads.length === 0) return null;

  const lastOther = lastOtherHead(history, otherHeads);
  let ordered = otherHeads;
  if (lastOther) {
    const idx = otherHeads.findIndex((h) => h.id === lastOther);
    if (idx >= 0) ordered = [...otherHeads.slice(idx + 1), ...otherHeads.slice(0, idx + 1)];
  }

  for (const head of ordered) {
    const cands = candidatesOf(
      salesList.filter((s) => s.headId === head.id),
      salesState,
      excludeIds,
    );
    if (cands.length) return { sales: cands[0].sales, head };
  }
  return null;
}

function toTurn(
  sales: SalesPerson,
  reason: string,
  isFallback: boolean,
  headsList: HeadGroup[],
  managersList: ManagerTeam[],
): ComputedTurn {
  const manager = managersList.find((m) => m.id === sales.managerId) || { id: sales.managerId, name: sales.managerId, ar: sales.managerId, headId: sales.headId };
  const head = headsList.find((h) => h.id === sales.headId) || { id: sales.headId, name: sales.headId, ar: sales.headId };
  return {
    salesId: sales.id,
    salesName: sales.name,
    managerId: manager.id,
    managerName: manager.name,
    managerAr: manager.ar,
    headId: head.id,
    headName: head.name,
    headAr: head.ar,
    reason,
    isFallback,
  };
}

export function computeNextTurn(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  startingHead = 'khaled',
  excludeIds: string[] = [],
  headsList: HeadGroup[] = HEADS,
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
): ComputedTurn | null {
  const anyAvailable = salesList.some(
    (s) => !s.isManager && salesState[s.id]?.status === 'available' && !excludeIds.includes(s.id),
  );
  if (!anyAvailable) return null;

  const lastHead = history.length > 0 ? history[history.length - 1].headId : null;
  // Strict alternation between Khaled's side and the other Heads' side.
  const expectedSide: 'khaled' | 'other' = lastHead
    ? sideOf(lastHead) === 'khaled'
      ? 'other'
      : 'khaled'
    : sideOf(startingHead);

  const mgrNameOf = (id: string) => managersList.find((m) => m.id === id)?.name ?? id;

  if (expectedSide === 'khaled') {
    const pick = pickForKaled(salesState, history, excludeIds, salesList, managersList);
    if (pick) {
      const reason =
        history.length === 0
          ? `بداية اليوم من تيم ${mgrNameOf(pick.managerId)} • أولوية الحضور`
          : `تناوب Head × Head • دور تيم ${mgrNameOf(pick.managerId)} (خالد يوسف)`;
      return toTurn(pick, reason, false, headsList, managersList);
    }
  } else {
    const pick = pickForOtherHead(salesState, history, excludeIds, salesList, headsList);
    if (pick) {
      const reason =
        history.length === 0
          ? `بداية اليوم من تيم ${pick.head.ar} • أولوية الحضور`
          : `تناوب Head × Head • دور تيم ${pick.head.ar}`;
      return toTurn(pick.sales, reason, false, headsList, managersList);
    }
  }

  // Expected side is empty → serve the other side instead.
  if (expectedSide === 'khaled') {
    const fallback = pickForOtherHead(salesState, history, excludeIds, salesList, headsList);
    if (fallback) {
      return toTurn(
        fallback.sales,
        `لا يوجد متاح في تيم خالد يوسف — تم التحويل إلى تيم ${fallback.head.ar}`,
        true,
        headsList,
        managersList,
      );
    }
  } else {
    const fallback = pickForKaled(salesState, history, excludeIds, salesList, managersList);
    if (fallback) {
      return toTurn(
        fallback,
        `لا يوجد متاح في تيم ${headsList.find((h) => h.id !== 'khaled')?.ar ?? 'الهيد الآخر'} — تم التحويل إلى تيم خالد يوسف`,
        true,
        headsList,
        managersList,
      );
    }
  }
  return null;
}

/**
 * Full round for today: every available rotation member appears once,
 * in strict Head × Head order by attendance priority. The seed turn
 * (e.g. yesterday's carry-over, even if still absent) is pinned first and
 * never repeated later in the list.
 */
export function predictFullRound(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  startingHead: string,
  seedTurn?: ComputedTurn | null,
  headsList: HeadGroup[] = HEADS,
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
): ComputedTurn[] {
  const out: ComputedTurn[] = [];
  const simHistory: Assignment[] = [...history];
  const served = new Set<string>();

  const push = (t: ComputedTurn, id: string) => {
    out.push(t);
    served.add(t.salesId);
    simHistory.push({
      id,
      n: simHistory.length + 1,
      salesId: t.salesId,
      salesName: t.salesName,
      managerId: t.managerId,
      managerName: t.managerName,
      headId: t.headId,
      headName: t.headName,
      time: new Date().toISOString(),
      clientLabel: '',
      substituted: false,
    });
  };

  if (seedTurn) push(seedTurn, 'round-seed');

  const total = salesList.filter((s) => !s.isManager && salesState[s.id]?.status === 'available').length;
  for (let i = 0; i < total + 1 && out.length < total + (seedTurn ? 1 : 0); i++) {
    const t = computeNextTurn(salesState, simHistory, startingHead, [...served], headsList, managersList, salesList);
    if (!t) break;
    push(t, `round-${i}`);
  }
  return out;
}

/** Build a pinned turn for yesterday's carry-over.
 *  The person keeps slot #1 in the new day EVEN IF still absent.
 *  A same-team substitute is only chosen manually at assignment time.
 */
export function carryOverTurn(
  carry: CarryOver | null,
  salesState: Record<string, SalesState>,
  headsList: HeadGroup[] = HEADS,
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
): ComputedTurn | null {
  if (!carry || !carry.salesId) return null;
  const original = salesList.find((s) => s.id === carry.salesId);
  if (!original) return null;

  const present = salesState[original.id]?.status === 'available';
  return toTurn(
    original,
    present
      ? `استكمال دور أمس — ${original.name} كان عليه الدور ولم يُخدم`
      : `دور أمس المرحّل — ${original.name} يظل الدور له أولاً حتى لو لم يحضر (اختر بديلاً من نفس التيم عند الحاجة)`,
    false,
    headsList,
    managersList,
  );
}

// ───────────────────────── Formatting ─────────────────────────

export const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

export const todayLabel = (): string => {
  try {
    return new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};
