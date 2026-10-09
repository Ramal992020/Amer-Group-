// ─── Amer Group · Walk-In rotation engine (team turns + manual sales choice) ───
//
// SITE and RESTA rotate by TEAM (manager): the cycle decides whose team is next
// and the sales who sits with the client is picked manually from that team.
// The Head × Head person-level engine below is kept only for unspecified
// workspaces (no such workspace ships today) and for its unit tests.

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

/** Why a skipped sales is written as «Shiffted ❌» in the statement. */
export type ShiftedReason = 'busy' | 'absent';

/**
 * A team member who was on turn but got skipped — busy with another client or
 * not present. Written AUTOMATICALLY (one `Sales : … Shiffted ❌` line each in
 * the receipt, `DoneReceipt`) from the busy/available mark on the assign screen;
 * see `shiftedSalesFor()`.
 */
export interface ShiftedSalesInfo {
  id: string;
  name: string;
  status: ShiftedReason;
}

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
  /** Skipped on-turn members (busy/absent) — printed as «Shiffted ❌» lines. */
  shiftedSales?: ShiftedSalesInfo[];
}

export interface ComputedTurn {
  /**
   * Empty string in SITE/RESTA: the turn belongs to a TEAM there, and the sales
   * who sits with the client is chosen manually from that team (`TeamTurn`).
   */
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
  /** Yesterday's carried person — only when their team is on turn and present. */
  carriedSalesId?: string | null;
  carriedSalesName?: string | null;
}

/** The minimum identity of any pending turn (person-level or team-level). */
export interface TurnIdentity {
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
}

/**
 * A turn that belongs to a TEAM (manager) — SITE & RESTA.
 *
 * The rotation decides WHICH manager's team is next; the sales who sits with
 * the client is picked manually from that team, so no sales name is ever
 * proposed by the engine (only the roster to choose from).
 */
export interface TeamTurn extends TurnIdentity {
  managerAr: string;
  headAr: string;
  reason: string;
  isFallback: boolean;
  /** Yesterday's carried person, when their team is on turn and they are present. */
  carriedSalesId: string | null;
  carriedSalesName: string | null;
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

export const defaultSalesState = (salesList: SalesPerson[] = SALES): Record<string, SalesState> => {
  const map: Record<string, SalesState> = {};
  salesList.forEach((s) => {
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

/**
 * Yesterday's unserved turn.
 *
 * `managerId` is the team whose turn is still pending — it keeps the first slot
 * in the new day until that team is served. `salesId` is kept for legacy
 * person-level carries; the current flow carries the TEAM only (the sales is
 * chosen manually when the turn comes).
 */
export interface CarryOver {
  salesId: string;
  salesName: string;
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
  fromDate: string;
}

// ───────────────────────── Turn-order settings («الترتيب» tab) ─────────────────────────

/**
 * How the team rotation is ordered — chosen INSIDE the app instead of being
 * hard-coded, so new managers/sales/heads join without touching the source.
 *
 *  • `auto`   — the built-in fixed cycle (`AUTOMATIC_TEAM_ORDER`), exactly the
 *    behavior the app always had; teams added later do NOT rotate until they
 *    are included.
 *  • `custom` — the order picked in the «الترتيب» tab: `order` lists the
 *    manager IDs that participate, in turn order. Unknown/deleted ids are
 *    dropped safely, and any team not listed simply stays out of the cycle.
 *
 * The settings belong to the SHARED org chart (`OrgChart.cycle`), so SITE and
 * RESTA always rotate with the same order on every device.
 */
export interface TeamCycleSettings {
  mode: 'auto' | 'custom';
  /** Manager IDs in turn order (custom mode). */
  order: string[];
}

export const DEFAULT_TEAM_CYCLE: TeamCycleSettings = { mode: 'auto', order: [] };

/** Accept any saved/remote payload and return a safe settings object. */
export function normalizeTeamCycle(value?: TeamCycleSettings | null): TeamCycleSettings {
  if (!value || typeof value !== 'object') return DEFAULT_TEAM_CYCLE;
  return {
    mode: value.mode === 'custom' ? 'custom' : 'auto',
    order: Array.isArray(value.order)
      ? value.order.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/** Explicit workspace context: never infer rotation rules from the storage account. */
export interface RotationOptions {
  workspace?: string;
  carryOver?: CarryOver | null;
  /** Explicitly skipped sales IDs for either fixed-team workspace. */
  skippedIds?: string[];
  /**
   * How the TEAM cycle is ordered (the «الترتيب» tab settings). Absent/null
   * means the built-in fixed cycle — exactly the pre-settings behavior.
   */
  cycle?: TeamCycleSettings | null;
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
  /**
   * Team rotation settings («الترتيب» tab). Part of the branch snapshot so the
   * choice survives reloads and rides the normal cloud sync; the SHARED org
   * row (`cycle`) is what keeps both branches on the same order.
   */
  teamCycle?: TeamCycleSettings;
  /** Skipped sales IDs for the current day. */
  skippedIds?: string[];
  /** Undo log (last actions first). */
  undoStack?: UndoEntry[];
  /**
   * Ids deleted by the user. Without this list the built-in defaults would
   * bring a deleted built-in Head/Manager/Sales back on the next hydrate.
   */
  removedIds?: string[];
  /**
   * Revision of the SHARED org chart (the roster, same in SITE & RESTA) that
   * this device last saw or published. `0` means "never synced the roster".
   */
  orgRevision?: number;
  /** Last modification time — used to resolve conflicts between devices. */
  updatedAt?: number;
}

/**
 * The org chart: who works here (Heads + manager teams + sales roster).
 *
 * SITE and RESTA share ONE roster — a member added or renamed in either branch
 * appears in the other one — while attendance, history and the queue stay per
 * branch. See `src/lib/org.ts` (`applyOrgChart`) for how a shared chart is
 * merged into a branch without losing anything.
 */
export interface OrgChart {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  /** Deleted member ids — they must not come back from the built-in defaults. */
  removedIds: string[];
  /**
   * Team rotation settings («الترتيب» tab) — shared with the roster so SITE and
   * RESTA always turn in the same order. Absent in rows written before the
   * setting existed (read as the automatic cycle).
   */
  cycle?: TeamCycleSettings;
}

const STORAGE_KEY = 'amer-walkin-v3';

/** Each account (SITE / RESTA) keeps its own local copy of the shared state. */
let activeAccount = '';
export const setActiveAccount = (account: string): void => {
  activeAccount = account.toLowerCase();
};
/**
 * Local storage is namespaced per account (SITE / RESTA).
 *
 * `accountOverride` lets a caller read/write the right bucket BEFORE the
 * module-level `activeAccount` has been set — on a cold start the app
 * renders (and boots its state) before the parent effect that calls
 * `setActiveAccount()` runs, which used to make a freshly opened phone load
 * an empty/stale board and then trust it over the shared cloud row.
 */
const storageKey = (accountOverride?: string): string => {
  const account = (accountOverride ?? activeAccount).toLowerCase();
  return account ? `${STORAGE_KEY}-${account}` : STORAGE_KEY;
};

/**
 * Merge the built-in org with the saved copy.
 *
 * **Saved entries win** for the same id. Renaming a built-in Head/Manager/Sales
 * keeps the id and writes the new name into the saved copy, so letting the
 * built-in default win would silently revert every rename the next time the
 * state is hydrated (from localStorage, from the cloud row or from a backup).
 *
 * `removedIds` keeps a member the user deleted from coming back, while ids that
 * only exist in the built-ins (people added to the code later) are still
 * appended, so a new built-in always shows up.
 */
function mergeById<T extends { id: string }>(
  defaults: T[],
  custom?: T[] | null,
  removedIds: string[] = [],
): T[] {
  const removed = new Set(removedIds);
  const map = new Map<string, T>();
  defaults.forEach((item) => {
    if (!removed.has(item.id)) map.set(item.id, item);
  });
  (custom ?? []).forEach((item) => {
    if (!removed.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()];
}

/**
 * Anything that carries a roster: a branch state (`customHeads`…), a chart
 * (`heads`…) or the shared cloud row / a backup. Both spellings are accepted —
 * the shared row stores the chart shape while every branch/backup payload uses
 * the `custom*` names, and mixing them up would silently fall back to the
 * built-in list.
 */
export interface OrgChartSource {
  heads?: HeadGroup[];
  managers?: ManagerTeam[];
  sales?: SalesPerson[];
  customHeads?: HeadGroup[];
  customManagers?: ManagerTeam[];
  customSales?: SalesPerson[];
  removedIds?: string[];
  /** Team rotation settings (the «الترتيب» tab) riding the shared chart. */
  cycle?: TeamCycleSettings;
}

/** Normalize any raw org chart (branch state, shared row, backup) into the three lists. */
export function hydrateOrgChart(parsed?: OrgChartSource | null): OrgChart {
  const removedIds = Array.isArray(parsed?.removedIds)
    ? parsed.removedIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    heads: mergeById(HEADS, parsed?.customHeads ?? parsed?.heads, removedIds),
    managers: mergeById(MANAGERS, parsed?.customManagers ?? parsed?.managers, removedIds),
    sales: mergeById(SALES, parsed?.customSales ?? parsed?.sales, removedIds),
    removedIds,
    cycle: normalizeTeamCycle(parsed?.cycle),
  };
}

/** Canonical fingerprint of a chart — used to skip no-op updates. */
export function orgChartKey(chart: OrgChart): string {
  const sortById = <T extends { id: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({
    heads: sortById(chart.heads),
    managers: sortById(chart.managers),
    sales: sortById(chart.sales),
    removedIds: [...chart.removedIds].sort(),
    // A cycle-only edit must count as a real edit (it re-orders both branches).
    cycle: chart.cycle ? normalizeTeamCycle(chart.cycle) : undefined,
  });
}

/** Normalize any raw object (local or remote) into a valid state. */
export function hydrate(parsed: Partial<PersistedWalkin>): PersistedWalkin {
  const { heads, managers, sales: salesList, removedIds } = hydrateOrgChart(parsed);

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
    removedIds,
    orgRevision: typeof parsed.orgRevision === 'number' ? parsed.orgRevision : 0,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    // Accept both spellings: branch snapshots store `teamCycle`, the mirrored
    // shared chart stores `cycle`.
    teamCycle: normalizeTeamCycle(
      parsed.teamCycle ?? (parsed as Partial<PersistedWalkin> & { cycle?: TeamCycleSettings }).cycle,
    ),
  };
}

export function loadPersisted(accountOverride?: string): PersistedWalkin {
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
    const raw = localStorage.getItem(storageKey(accountOverride));
    if (!raw) return fallback;
    return hydrate(JSON.parse(raw) as Partial<PersistedWalkin>);
  } catch {
    return fallback;
  }
}

export function savePersisted(p: PersistedWalkin, accountOverride?: string): void {
  try {
    localStorage.setItem(storageKey(accountOverride), JSON.stringify(p));
  } catch {
    /* storage full — ignore */
  }
}

/** SITE ⇄ RESTA — the two branches that share one roster. */
const OTHER_BRANCH: Record<string, string> = { site: 'RESTA', resta: 'SITE' };

/** The branch that shares the roster with `account` (null for other accounts). */
export const otherWorkspace = (account: string): string | null =>
  OTHER_BRANCH[account.trim().toLowerCase()] ?? null;

/**
 * One-time migration: build the first shared chart out of both branches.
 *
 * The shared row is created from whichever device connects first. If the two
 * branches had drifted apart before the roster was shared (each one having
 * added its own people), seeding it with a single branch's list would silently
 * drop the other branch's members. So the two rosters are combined instead:
 * `primary` (this device) wins on names, `secondary` only contributes people
 * the primary does not know at all. After that the shared chart is the single
 * source of truth and deletions propagate normally.
 */
export function mergeOrgCharts(primary: OrgChart, secondary: OrgChart): OrgChart {
  const union = <T extends { id: string }>(mine: T[], theirs: T[], removed: Set<string>): T[] => {
    const map = new Map(mine.map((x) => [x.id, x] as const));
    theirs.forEach((x) => {
      if (!map.has(x.id) && !removed.has(x.id)) map.set(x.id, x);
    });
    return [...map.values()];
  };

  const removed = new Set(primary.removedIds);
  const heads = union(primary.heads, secondary.heads, removed);
  const managers = union(primary.managers, secondary.managers, removed);
  const sales = union(primary.sales, secondary.sales, removed);

  // Keep every deletion that is still meaningful (the person is not back in the
  // merged roster) so the built-in defaults cannot resurrect them.
  const keptIds = new Set([...heads, ...managers, ...sales].map((x) => x.id));
  const removedIds = [...new Set([...primary.removedIds, ...secondary.removedIds])].filter(
    (id) => !keptIds.has(id),
  );

  return { heads, managers, sales, removedIds, cycle: primary.cycle ?? secondary.cycle };
}

/**
 * Copy the shared chart into the OTHER branch's local bucket on this device.
 *
 * The cloud row is what reaches the other devices; this only makes switching
 * branch instant on this device (otherwise RESTA would show the old names for
 * the second it takes to pull). Attendance/history of that bucket are kept —
 * only the roster fields are replaced.
 */
export function mirrorOrgChart(account: string, chart: OrgChart, revision: number): void {
  const other = OTHER_BRANCH[account.trim().toLowerCase()];
  if (!other) return;
  const state = loadPersisted(other);
  // Never downgrade the other branch: its bucket may already hold a roster
  // that was pulled from the cloud (or edited) after this one was saved.
  if ((state.orgRevision ?? 0) > revision) return;
  savePersisted(
    {
      ...state,
      customHeads: chart.heads,
      customManagers: chart.managers,
      customSales: chart.sales,
      removedIds: chart.removedIds,
      // The turn-order settings belong to the chart — switch branch on this
      // device and the same rotation order is already on screen. (hydrate()
      // reads it back from the branch snapshot's `teamCycle` field.)
      teamCycle: chart.cycle,
      orgRevision: revision,
    },
    other,
  );
}

// ───────────────────────── Rotation engine ─────────────────────────
//
// RESTA and SITE use one fixed TEAM cycle (see `computeNextTeam`): the manager
// whose team is on turn is decided here, and the sales is chosen manually from
// that team — no sales name is ever proposed for those workspaces.
//
// Other (unspecified) workspaces retain the original Head × Head rules:
//  1. Alternate Khaled's side with the other Heads; use attendance within a side.
//  2. A served team/person falls behind in its existing fairness ordering.
//  3. Yesterday's pending person is pinned first (handled by the caller); if absent,
//     a same-team replacement or an explicit skip follows the existing behavior.

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

/**
 * One fixed automatic team cycle shared by RESTA and SITE:
 *
 *   1) Ahmed Yossry        5) Perry
 *   2) Youssef Shehata     6) the team Hala Elfar is in
 *   3) Rewaida             7) the team Gannah Elmalah is in
 *   4) Hany Elshenawy      → back to Ahmed Yossry …
 *
 * Every slot is a PERSON, not a hard-coded team: the team that takes the slot is
 * read from the LIVE roster, so the cycle keeps working when a team is renamed,
 * when the person moves to another team, and when the person is a member of a
 * team that carries somebody else's name («التيم اللي فيه فلان»).
 *
 * The pending person carried from yesterday stays pinned at #1, then the cycle
 * continues from their own team in this order (Ahmed Yossry → Youssef Shehata →
 * Rewaida → Hany Elshenawy → Perry → Hala Elfar's team → Gannah Elmalah's team →
 * Ahmed Yossry …). A team with nobody available is skipped without re-ordering
 * the others, and a team that already holds an earlier slot is never repeated.
 */
export const AUTOMATIC_TEAM_ORDER = [
  { id: 'ahmed', name: 'Ahmed Yossry' },
  { id: 'shehata', name: 'Youssef Shehata' },
  { id: 'rewaida', name: 'Rewaida' },
  { id: 'hany-elshenawy', name: 'Hany Elshenawy' },
  { id: 'perry', name: 'Perry' },
  { id: 'hala-elfar', name: 'Hala Elfar' },
  { id: 'gannah-elmalah', name: 'Gannah Elmalah' },
] as const;

export function usesFixedTeamRotation(workspace?: string): boolean {
  const normalized = workspace?.trim().toUpperCase();
  return normalized === 'RESTA' || normalized === 'SITE';
}

/** Reset daily attendance without dropping saved custom-team members in SITE/RESTA. */
export function createNewDaySalesState(
  workspace?: string,
  salesList: SalesPerson[] = SALES,
): Record<string, SalesState> {
  return defaultSalesState(usesFixedTeamRotation(workspace) ? salesList : SALES);
}

const normalizeTeamName = (name: string): string => name.trim().toLowerCase().replace(/[\s_-]+/g, '');

function automaticTeamIndex(managerId: string, managerName: string): number {
  const id = normalizeTeamName(managerId);
  const name = normalizeTeamName(managerName);
  return AUTOMATIC_TEAM_ORDER.findIndex((team) =>
    id === normalizeTeamName(team.id) ||
    id === normalizeTeamName(team.name) ||
    name === normalizeTeamName(team.name),
  );
}

// ───────────── Team (manager) turns — SITE ⇄ RESTA ─────────────
//
// In both workspaces the turn belongs to a TEAM: one fixed cycle decides whose
// team is next, and the sales who sits with the client is picked MANUALLY from
// that team's roster. The engine therefore never proposes a sales name — it
// only decides the team, so nothing here can be mistaken for an assignment.

/**
 * The team one automatic slot points at, read from the LIVE roster:
 *  1. the team whose id is the slot id (renames never break it);
 *  2. the team whose (or whose manager's) name is the slot name — including the
 *     legacy built-in slots and any custom id that spells the same name;
 *  3. otherwise the team the PERSON belongs to — so a slot can name somebody
 *     who is only a member of a team («التيم اللي فيه فلان»).
 */
function teamForAutomaticSlot(
  slot: { id: string; name: string },
  index: number,
  managersList: ManagerTeam[],
  salesList: SalesPerson[],
): ManagerTeam | null {
  const byId = managersList.find((m) => m.id === slot.id);
  if (byId) return byId;
  const byName = managersList.find((m) => automaticTeamIndex(m.id, m.name) === index);
  if (byName) return byName;
  const wanted = normalizeTeamName(slot.name);
  const member = salesList.find(
    (s) => normalizeTeamName(s.name) === wanted || normalizeTeamName(s.id) === normalizeTeamName(slot.id),
  );
  return member ? managersList.find((m) => m.id === member.managerId) ?? null : null;
}

/**
 * The active cycle slots.
 *
 *  • auto   — the fixed built-in slots resolved against the live roster
 *    (custom IDs, saved names, or the team a named person belongs to). Slots
 *    are `null` when nobody in the roster fills them, or when the team already
 *    holds an earlier slot; callers skip them exactly like before.
 *  • custom — the order chosen in the «الترتيب» tab, resolved by manager id:
 *    unknown/deleted ids are dropped, duplicates ignored, and any team NOT
 *    listed simply does not rotate.
 */
function resolveCycle(
  managersList: ManagerTeam[],
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
): (ManagerTeam | null)[] {
  const settings = normalizeTeamCycle(cycle);
  // Custom mode is authoritative even when the list ends up empty: the editor
  // blocks removing the last team, so an empty cycle here is an explicit choice.
  if (settings.mode === 'custom') {
    const byId = new Map(managersList.map((m) => [m.id, m] as const));
    const seen = new Set<string>();
    const ordered: ManagerTeam[] = [];
    settings.order.forEach((id) => {
      const team = byId.get(id);
      if (team && !seen.has(id)) {
        ordered.push(team);
        seen.add(id);
      }
    });
    return ordered;
  }
  const used = new Set<string>();
  return AUTOMATIC_TEAM_ORDER.map((slot, index) => {
    const team = teamForAutomaticSlot(slot, index, managersList, salesList);
    // Two slots resolving to the same team would make it rotate twice a round.
    if (!team || used.has(team.id)) return null;
    used.add(team.id);
    return team;
  });
}

/** Slot of a manager inside the cycle — resolved by id first, then by saved name. */
function cycleIndexOf(
  cycle: (ManagerTeam | null)[],
  managerId: string,
  managerName: string,
  isCustom = false,
): number {
  const byId = cycle.findIndex((team) => team?.id === managerId);
  if (byId >= 0) return byId;
  // The legacy name anchor only exists for the built-in six-slot cycle; a
  // custom order is matched by id alone so an old name can never misplace it.
  return isCustom ? -1 : automaticTeamIndex(managerId, managerName);
}

/**
 * Members of one team who are present and free — most deserving first
 * (fewest own turns, then earliest check-in). This is only the ORDER of the
 * manual picker; it never picks a person by itself.
 *
 * The manager's own attendance row is included like any other member: if a
 * teammate is absent/busy, the manager can sit with the client himself — he
 * just needs to be checked in (present) like everyone else, and his turn
 * counts toward his own fairness count like a normal sales turn.
 */
export function availableTeamMembers(
  managerId: string,
  salesState: Record<string, SalesState>,
  salesList: SalesPerson[] = SALES,
  excludeIds: string[] = [],
): SalesPerson[] {
  return salesList
    .filter(
      (s) =>
        s.managerId === managerId &&
        salesState[s.id]?.status === 'available' &&
        !excludeIds.includes(s.id),
    )
    .sort((a, b) => sortByAttendance(a, b, salesState));
}

/**
 * The team's FULL turn order — including members who are busy or absent —
 * the order the receipt reads the skipped «Shiffted ❌» names from.
 *
 * Yesterday's carried person is pinned first, then the same fairness order the
 * manual picker uses (fewest own turns, then earliest check-in). It is exactly
 * `availableTeamMembers()` without dropping the non-available members, so the
 * statement and the screen can never disagree about who was on turn before whom.
 */
export function teamTurnOrder(
  managerId: string,
  salesState: Record<string, SalesState>,
  salesList: SalesPerson[] = SALES,
  carriedSalesId?: string | null,
): SalesPerson[] {
  const members = salesList.filter((s) => s.managerId === managerId);
  const ordered = [...members].sort((a, b) => sortByAttendance(a, b, salesState));
  if (!carriedSalesId) return ordered;
  const carried = ordered.find((s) => s.id === carriedSalesId);
  if (!carried) return ordered;
  return [carried, ...ordered.filter((s) => s.id !== carriedSalesId)];
}

/**
 * The «Shiffted ❌» lines of the statement — decided AUTOMATICALLY by the
 * busy/available mark shown on the assign screen.
 *
 * Every member of the team on turn whose status is `busy` (مشغول) or `absent`
 * (لم يحضر) is written as one `Sales : … Shiffted ❌` line, in `teamTurnOrder()`
 * order, so the statement and the picker read the same chain. The available
 * members — including the one serving the client — can never appear here.
 *
 * `excludeIds` is the only manual input left: a member the manager tapped on the
 * assign screen to keep OUT of the statement.
 */
export function shiftedSalesFor(
  managerId: string,
  salesState: Record<string, SalesState>,
  salesList: SalesPerson[] = SALES,
  carriedSalesId?: string | null,
  excludeIds: string[] = [],
): ShiftedSalesInfo[] {
  return teamTurnOrder(managerId, salesState, salesList, carriedSalesId)
    .filter((s) => {
      const status = salesState[s.id]?.status ?? 'absent';
      return status !== 'available' && !excludeIds.includes(s.id);
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: salesState[s.id]?.status === 'busy' ? ('busy' as const) : ('absent' as const),
    }));
}

/**
 * Only the members who were on turn BEFORE the sales who actually served are
 * «Shiffted ❌». Example: Hala is on turn but absent / busy with another client
 * → «Sales : Hala Shiffted ❌», then the next sales in the order serves. Members
 * who come AFTER the serving sales in the turn order are not written at all.
 * If the serving sales is outside the chain (e.g. not found), nothing is cut.
 */
export function shiftedBeforeServer(
  managerId: string,
  servingSalesId: string,
  shifted: ShiftedSalesInfo[],
  salesState: Record<string, SalesState>,
  salesList: SalesPerson[] = SALES,
  carriedSalesId?: string | null,
): ShiftedSalesInfo[] {
  const order = teamTurnOrder(managerId, salesState, salesList, carriedSalesId).map((s) => s.id);
  const idx = order.indexOf(servingSalesId);
  if (idx < 0) return shifted;
  const before = new Set(order.slice(0, idx));
  return shifted.filter((s) => before.has(s.id));
}

function teamTurn(
  team: ManagerTeam,
  reason: string,
  isFallback: boolean,
  carriedPerson: SalesPerson | null,
  headsList: HeadGroup[] = HEADS,
): TeamTurn {
  const head =
    headsList.find((h) => h.id === team.headId) ||
    { id: team.headId, name: team.headId, ar: team.headId };
  return {
    managerId: team.id,
    managerName: team.name,
    managerAr: team.ar,
    headId: head.id,
    headName: head.name,
    headAr: head.ar,
    reason,
    isFallback,
    carriedSalesId: carriedPerson?.id ?? null,
    carriedSalesName: carriedPerson?.name ?? null,
  };
}

/**
 * Whose team is on turn now:
 *  1. a team carried from yesterday (not served yet today) keeps the turn;
 *  2. otherwise the fixed cycle continues after the most recently served team;
 *  3. a team with nobody available is skipped — the cycle order never moves.
 */
export function computeNextTeam(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
  headsList: HeadGroup[] = HEADS,
  options: RotationOptions = {},
): TeamTurn | null {
  const cycleSettings = normalizeTeamCycle(options.cycle);
  const isCustom = cycleSettings.mode === 'custom';
  const cycle = resolveCycle(managersList, cycleSettings, salesList);
  if (cycle.every((team) => !team)) return null;
  const indexInCycle = (managerId: string, managerName: string): number =>
    cycleIndexOf(cycle, managerId, managerName, isCustom);
  const excluded = options.skippedIds ?? [];
  const hasMembers = (team: ManagerTeam) =>
    availableTeamMembers(team.id, salesState, salesList, excluded).length > 0;

  const carried = options.carryOver;
  const carriedIndex =
    carried && (carried.managerId || carried.managerName)
      ? indexInCycle(carried.managerId, carried.managerName)
      : -1;
  const carriedTeam = carriedIndex >= 0 ? cycle[carriedIndex] : null;
  const servedToday = (managerId: string) => history.some((a) => a.managerId === managerId);

  if (carriedTeam && !servedToday(carriedTeam.id) && hasMembers(carriedTeam)) {
    const person = carried?.salesId
      ? salesList.find((s) => s.id === carried.salesId) ?? null
      : null;
    const present =
      person && person.managerId === carriedTeam.id && salesState[person.id]?.status === 'available'
        ? person
        : null;
    return teamTurn(carriedTeam, `دور أمس المرحّل • تيم ${carriedTeam.name}`, false, present, headsList);
  }

  let previousIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const index = indexInCycle(history[i].managerId, history[i].managerName);
    if (index >= 0) {
      previousIndex = index;
      break;
    }
  }
  const start = previousIndex >= 0 ? (previousIndex + 1) % cycle.length : carriedIndex >= 0 ? carriedIndex : 0;

  for (let offset = 0; offset < cycle.length; offset++) {
    const team = cycle[(start + offset) % cycle.length];
    if (!team) continue;
    if (!hasMembers(team)) continue;
    const reason =
      offset === 0 ? `دور تيم ${team.name}` : `تخطي الفرق غير المتاحة — دور تيم ${team.name}`;
    return teamTurn(team, reason, offset > 0, null, headsList);
  }
  return null;
}

/**
 * The team cycle in turn order, rotated so `startManagerId` comes first — the
 * list the «الترتيب» tab renders. Managers only: the sales names never appear
 * as queue entries any more. `cycle` picks the custom order from the settings
 * (or the built-in fixed cycle when absent).
 */
export function teamOrderFrom(
  managersList: ManagerTeam[] = MANAGERS,
  startManagerId?: string,
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
): ManagerTeam[] {
  const teams = resolveCycle(managersList, cycle, salesList).filter(
    (team): team is ManagerTeam => Boolean(team),
  );
  const startIndex = startManagerId ? teams.findIndex((team) => team.id === startManagerId) : -1;
  if (startIndex <= 0) return teams;
  return [...teams.slice(startIndex), ...teams.slice(0, startIndex)];
}

/**
 * The list the «ترتيب المديرين» tab shows — the active cycle rotated so the team
 * on turn comes first, with the day's manual order (the arrows on that tab) on
 * top.
 *
 * The manual order only ever applies to the AUTOMATIC cycle. Once a custom
 * order is chosen in «طريقة ترتيب الأدوار» it is the single source of truth for
 * both branches, so a manual order left over from an earlier day can never
 * display (or rotate) a different order than the one the manager picked — this
 * is what used to make a customized order look like it had no effect at all.
 */
export function teamRoundFrom(
  managersList: ManagerTeam[] = MANAGERS,
  startManagerId?: string | null,
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
  manualOrder: string[] = [],
): ManagerTeam[] {
  const natural = teamOrderFrom(managersList, startManagerId ?? undefined, cycle, salesList);
  if (manualOrder.length === 0 || normalizeTeamCycle(cycle).mode === 'custom') return natural;
  const rank = new Map(manualOrder.map((id, i) => [id, i] as const));
  const known = natural
    .filter((t) => rank.has(t.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...known, ...natural.filter((t) => !rank.has(t.id))];
}

/**
 * Swap two teams inside a CUSTOM order, keeping the rest of the saved order
 * untouched — what the arrows on «ترتيب المديرين» do while a custom cycle is
 * active, so the screen and the rotation engine can never disagree.
 */
export function swapInCustomOrder(
  order: string[],
  firstId: string,
  secondId: string,
): string[] {
  const next = [...order];
  const from = next.indexOf(firstId);
  const to = next.indexOf(secondId);
  if (from < 0 || to < 0 || from === to) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** The team that follows `managerId` in the active cycle (cycle start when unknown). */
export function successorTeam(
  managersList: ManagerTeam[] = MANAGERS,
  managerId?: string | null,
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
): ManagerTeam | null {
  const order = teamOrderFrom(managersList, managerId ?? undefined, cycle, salesList);
  if (order.length === 0) return null;
  // No (or unknown) manager → the cycle simply starts at its first team.
  if (!managerId || order[0].id !== managerId) return order[0];
  return order[1] ?? order[0] ?? null;
}

/** Team turn → ComputedTurn (sales-less): keeps the fixed-cycle cursor in one place. */
function toTeamComputedTurn(turn: TeamTurn): ComputedTurn {
  return {
    salesId: '',
    salesName: '',
    managerId: turn.managerId,
    managerName: turn.managerName,
    managerAr: turn.managerAr,
    headId: turn.headId,
    headName: turn.headName,
    headAr: turn.headAr,
    reason: turn.reason,
    isFallback: turn.isFallback,
    carriedSalesId: turn.carriedSalesId,
    carriedSalesName: turn.carriedSalesName,
  };
}

/** Fixed-team path of `computeNextTurn`: the turn is the team, never a person. */
function computeFixedTeamTurn(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  excludeIds: string[],
  headsList: HeadGroup[],
  managersList: ManagerTeam[],
  salesList: SalesPerson[],
  carry: CarryOver | null | undefined,
  cycle?: TeamCycleSettings | null,
): ComputedTurn | null {
  const turn = computeNextTeam(salesState, history, managersList, salesList, headsList, {
    carryOver: carry,
    skippedIds: excludeIds,
    cycle,
  });
  return turn ? toTeamComputedTurn(turn) : null;
}

export function computeNextTurn(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  startingHead = 'khaled',
  excludeIds: string[] = [],
  headsList: HeadGroup[] = HEADS,
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
  options: RotationOptions = {},
): ComputedTurn | null {
  if (usesFixedTeamRotation(options.workspace)) {
    return computeFixedTeamTurn(
      salesState,
      history,
      [...excludeIds, ...(options.skippedIds ?? [])],
      headsList,
      managersList,
      salesList,
      options.carryOver,
      options.cycle,
    );
  }

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
 * Full round for today.
 *
 * SITE/RESTA: the round is the TEAM cycle (each team with available members
 * once, starting from the team whose turn it is now, carry-over included).
 * Other workspaces keep the legacy person-level Head × Head round, where the
 * seed turn (yesterday's carry-over) is pinned first and never repeated.
 */
export function predictFullRound(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  startingHead: string,
  seedTurn?: ComputedTurn | null,
  headsList: HeadGroup[] = HEADS,
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
  options: RotationOptions = {},
): ComputedTurn[] {
  const excluded = options.skippedIds ?? [];

  if (usesFixedTeamRotation(options.workspace)) {
    // The seed is redundant here: a pending carry-over is expressed by
    // `options.carryOver`, so the round is derived from state alone.
    const current = computeNextTeam(salesState, history, managersList, salesList, headsList, options);
    return teamOrderFrom(managersList, current?.managerId, options.cycle, salesList)
      .filter((team) => availableTeamMembers(team.id, salesState, salesList, excluded).length > 0)
      .map((team, index) =>
        index === 0 && current
          ? toTeamComputedTurn(current)
          : toTeamComputedTurn(teamTurn(team, `دور تيم ${team.name}`, false, null, headsList)),
      );
  }

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
    const t = computeNextTurn(salesState, simHistory, startingHead, [...served], headsList, managersList, salesList, options);
    if (!t) break;
    push(t, `round-${i}`);
  }
  return out;
}

/**
 * Choose the team to carry into a new day.
 *
 * The carry is always "this team's turn is still pending": an unserved team
 * keeps the first turn tomorrow, and when nothing is pending the successor of
 * the last served team starts the new day (so the cycle resumes, never repeats).
 * A legacy person-level carry is preserved as-is.
 */
export function carryOverForNewDay(
  currentCarry: CarryOver | null,
  pendingTurn: TurnIdentity | null,
  history: Assignment[],
  headsList: HeadGroup[],
  workspace?: string,
  fromDate = new Date().toISOString(),
  managersList: ManagerTeam[] = MANAGERS,
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
): CarryOver | null {
  if (currentCarry?.salesId || currentCarry?.managerId) return currentCarry;

  const teamCarry = (turn: TurnIdentity): CarryOver => ({
    // The team carries the turn — the sales is chosen manually tomorrow.
    salesId: '',
    salesName: '',
    managerId: turn.managerId,
    managerName: turn.managerName,
    headId: turn.headId,
    headName: turn.headName,
    fromDate,
  });

  if (pendingTurn) return teamCarry(pendingTurn);

  const lastAssignment = history[history.length - 1];
  if (!lastAssignment) return currentCarry;

  if (usesFixedTeamRotation(workspace)) {
    // Carry the TEAM whose turn comes next — never the team that just served,
    // otherwise the new day would repeat it.
    const team = successorTeam(managersList, lastAssignment.managerId, cycle, salesList);
    if (!team) return currentCarry;
    return {
      salesId: '',
      salesName: '',
      managerId: team.id,
      managerName: team.name,
      headId: team.headId,
      headName: headsList.find((head) => head.id === team.headId)?.name ?? team.headId,
      fromDate,
    };
  }

  const lastHeadIndex = headsList.findIndex((head) => head.id === lastAssignment.headId);
  const nextHead = headsList.length > 0
    ? headsList[(lastHeadIndex + 1 + headsList.length) % headsList.length]
    : undefined;
  return {
    salesId: '',
    salesName: '',
    managerId: '',
    managerName: '',
    headId: nextHead?.id ?? 'khaled',
    headName: nextHead?.name ?? 'Khaled Youssef',
    fromDate,
  };
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
