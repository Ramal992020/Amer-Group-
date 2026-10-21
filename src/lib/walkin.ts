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
  /** When `true`, disabled from «الهيكل» — hidden across the whole app until re-enabled. */
  disabled?: boolean;
}

export interface ManagerTeam {
  id: string;
  name: string;
  ar: string;
  headId: string;
  /** The manager's own mobile number — printed in the attendance Excel. */
  phone?: string;
  /** When `true`, disabled from «الهيكل» — hidden across the whole app until re-enabled. */
  disabled?: boolean;
}

export interface SalesPerson {
  id: string;
  name: string;
  managerId: string;
  headId: string;
  isManager?: boolean;
  /** Contact details are part of the shared org chart and are kept across days. */
  phone?: string;
  /** Personal shift start; defaults to 10:00 for existing and new members. */
  shiftTime?: string;
  /**
   * Active/disabled flag managed from «الهيكل»:
   *  • `true`      → disabled (behaves as if the person does not exist anywhere on the app);
   *  • `false`     → explicitly active (appears in attendance & holds full permissions);
   *  • `undefined` → default active member.
   */
  disabled?: boolean;
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
  /** Teams that were on turn before this one but had nobody free («Shifted ❌»). */
  shiftedTeams?: ShiftedTeam[];
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

// ───────────────── Active vs disabled members («الهيكل» toggle) ─────────────────

/** True when a Head was disabled from «الهيكل». */
export const isHeadDisabled = (head?: HeadGroup | null): boolean => Boolean(head?.disabled);

/**
 * True when a manager team is effectively disabled:
 *  • the team itself was disabled (`team.disabled`),
 *  • its Head was disabled (`head.disabled`), or
 *  • every member of the team in `sales` was disabled (leaving no active member at all).
 */
export const isTeamDisabled = (
  team: ManagerTeam,
  sales?: readonly SalesPerson[],
  heads?: readonly HeadGroup[],
): boolean => {
  if (team.disabled) return true;
  if (heads && heads.find((h) => h.id === team.headId)?.disabled) return true;
  if (sales) {
    const members = sales.filter((s) => s.managerId === team.id);
    if (members.length > 0 && members.every((s) => Boolean(s.disabled))) return true;
  }
  return false;
};

/**
 * True when a person is disabled (directly, or through their disabled team / Head).
 * A disabled person behaves as if they do not exist anywhere on the app.
 */
export const isPersonDisabled = (
  person: SalesPerson,
  managers?: readonly ManagerTeam[],
  heads?: readonly HeadGroup[],
): boolean => {
  if (person.disabled) return true;
  const team = managers?.find((m) => m.id === person.managerId);
  if (team?.disabled) return true;
  const headId = team?.headId ?? person.headId;
  if (heads?.find((h) => h.id === headId)?.disabled) return true;
  return false;
};

/** Filter an org roster down to active (non-disabled) Heads, teams and people. */
export function activeOrg(
  heads: readonly HeadGroup[],
  managers: readonly ManagerTeam[],
  sales: readonly SalesPerson[],
): { heads: HeadGroup[]; managers: ManagerTeam[]; sales: SalesPerson[] } {
  return {
    heads: heads.filter((h) => !isHeadDisabled(h)),
    managers: managers.filter((m) => !isTeamDisabled(m, sales, heads)),
    sales: sales.filter((s) => !isPersonDisabled(s, managers, heads)),
  };
}

/**
 * Force-clear any active/busy check-in for the given person IDs while preserving
 * historical turn counters (`walkCount`, `coverCount`, `lastServedAt`).
 */
export function clearSalesAttendance(
  salesState: Record<string, SalesState>,
  ids: Iterable<string>,
): { salesState: Record<string, SalesState>; changed: boolean } {
  let changed = false;
  const next: Record<string, SalesState> = { ...salesState };
  for (const id of ids) {
    const cur = next[id];
    if (!cur) continue;
    if (cur.status !== 'absent' || cur.checkInOrder !== null || cur.checkInTime !== null) {
      next[id] = { ...cur, status: 'absent', checkInOrder: null, checkInTime: null };
      changed = true;
    }
  }
  return { salesState: changed ? next : salesState, changed };
}

// ───────────────────────── State helpers ─────────────────────────

export const defaultSalesState = (salesList: SalesPerson[] = SALES): Record<string, SalesState> => {
  const map: Record<string, SalesState> = {};
  salesList.forEach((s) => {
    map[s.id] = { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null };
  });
  return map;
};

/** A small, explicit attendance mutation used by the branch-registration flow. */
export type AttendanceAction = 'check-in' | 'check-out' | 'free';

export interface AttendanceChange {
  salesState: Record<string, SalesState>;
  counter: number;
  changed: boolean;
  /** `busy` means the person must finish their current client before moving branch. */
  reason?: 'busy' | 'missing';
}

/**
 * Apply one attendance action without mutating the current branch state.
 *
 * `check-in` is deliberately idempotent: selecting a branch twice must never
 * turn a person back to absent or give them a new check-in order. This matters
 * when a manager registers somebody in the other branch and taps again while
 * waiting for the simple confirmation toast.
 */
export function changeSalesAttendance(
  salesState: Record<string, SalesState>,
  counter: number,
  salesId: string,
  action: AttendanceAction,
  at = new Date().toISOString(),
): AttendanceChange {
  const current = salesState[salesId];
  // A missing row means there is nothing to clear in an older branch snapshot,
  // but a person cannot be checked in there until the shared roster arrives.
  if (!current) {
    return {
      salesState,
      counter,
      changed: false,
      ...(action === 'check-in' ? { reason: 'missing' as const } : {}),
    };
  }

  if (action === 'check-in') {
    if (current.status === 'busy') return { salesState, counter, changed: false, reason: 'busy' };
    if (current.status === 'available') return { salesState, counter, changed: false };
    const lastOrder = Object.values(salesState).reduce(
      (max, state) => Math.max(max, state.checkInOrder ?? 0),
      counter,
    );
    const nextCounter = lastOrder + 1;
    return {
      salesState: {
        ...salesState,
        [salesId]: {
          ...current,
          status: 'available',
          checkInOrder: nextCounter,
          checkInTime: at,
        },
      },
      counter: nextCounter,
      changed: true,
    };
  }

  if (action === 'check-out') {
    if (current.status === 'busy') return { salesState, counter, changed: false, reason: 'busy' };
    if (current.status === 'absent') return { salesState, counter, changed: false };
    return {
      salesState: {
        ...salesState,
        [salesId]: { ...current, status: 'absent', checkInOrder: null, checkInTime: null },
      },
      counter,
      changed: true,
    };
  }

  // «free» only ends an active client meeting; it never changes check-in data.
  if (current.status !== 'busy') return { salesState, counter, changed: false };
  return {
    salesState: { ...salesState, [salesId]: { ...current, status: 'available' } },
    counter,
    changed: true,
  };
}

/**
 * Update only the check-in time of an already present person.
 * Used when the manager wants to correct the attendance time after check-in.
 */
export function setSalesAttendanceTime(
  salesState: Record<string, SalesState>,
  salesId: string,
  timeISO: string,
): { salesState: Record<string, SalesState>; changed: boolean } {
  const current = salesState[salesId];
  if (!current) return { salesState, changed: false };
  if (current.status === 'absent') return { salesState, changed: false };
  if (current.checkInTime === timeISO) return { salesState, changed: false };
  return {
    salesState: {
      ...salesState,
      [salesId]: { ...current, checkInTime: timeISO },
    },
    changed: true,
  };
}

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

/**
 * The team the manager put ON TURN by hand («الدور من هنا» ▶ on
 * «ترتيب المديرين»).
 *
 * It pins WHOSE turn it is — it never touches the cycle. The order stays
 * exactly as it was (auto or custom), so once the pinned team has served the
 * rotation simply continues with the next team of that order — e.g. pressing ▶
 * on Hany Elshenawy makes his team serve now and Perry, then Ahmed Sultan, …
 * follow, with no re-ordering anywhere.
 *
 * Cleared when the pinned team serves, on «بدء يوم جديد», and when the turn is
 * reset. It is per branch (like attendance and the carried turn).
 */
export interface PinnedTurn {
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
  /** When it was pinned (ISO) — display only. */
  at: string;
}

/** Accept any saved/remote value and return a safe pin (or null). */
export function normalizePinnedTurn(value?: PinnedTurn | null): PinnedTurn | null {
  if (!value || typeof value !== 'object') return null;
  const managerId = typeof value.managerId === 'string' ? value.managerId.trim() : '';
  if (!managerId) return null;
  return {
    managerId,
    managerName: typeof value.managerName === 'string' ? value.managerName : managerId,
    headId: typeof value.headId === 'string' ? value.headId : '',
    headName: typeof value.headName === 'string' ? value.headName : '',
    at: typeof value.at === 'string' ? value.at : '',
  };
}

/** Build a pin for a team. */
export function turnPinFor(team: ManagerTeam, headsList: HeadGroup[] = HEADS): PinnedTurn {
  return {
    managerId: team.id,
    managerName: team.name,
    headId: team.headId,
    headName: headsList.find((h) => h.id === team.headId)?.name ?? team.headId,
    at: new Date().toISOString(),
  };
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
  /**
   * A team pinned on turn by hand («الدور من هنا»). It only moves the TURN, not
   * the order: the cycle continues normally after the pinned team has served.
   */
  pinnedTurn?: PinnedTurn | null;
}

/** Compact action record so undo restores the exact queue position, even after reloads. */
export interface UndoEntry {
  personId: string;
  prevState: SalesState;
  skippedIds: string[];
  carryOver: CarryOver | null;
  /** The hand-pinned turn («الدور من هنا») before this action, if any. */
  pinnedTurn?: PinnedTurn | null;
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
  /** Hand-pinned turn («الدور من هنا») — survives reloads and syncs with the day. */
  pinnedTurn?: PinnedTurn | null;
  lastResetAt: string | null;
  customHeads?: HeadGroup[];
  customManagers?: ManagerTeam[];
  customSales?: SalesPerson[];
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
    const raw = parsed.salesState?.[s.id];
    mergedState[s.id] = raw
      ? isPersonDisabled(s, managers, heads)
        ? { ...raw, status: 'absent', checkInOrder: null, checkInTime: null }
        : raw
      : {
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
    pinnedTurn: normalizePinnedTurn(parsed.pinnedTurn),
    lastResetAt: parsed.lastResetAt ?? null,
    customHeads: heads,
    customManagers: managers,
    customSales: salesList,
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
  const disabledIds = chart.sales
    .filter((s) => isPersonDisabled(s, chart.managers, chart.heads))
    .map((s) => s.id);
  const nextSalesState =
    disabledIds.length > 0
      ? clearSalesAttendance(state.salesState, disabledIds).salesState
      : state.salesState;
  savePersisted(
    {
      ...state,
      salesState: nextSalesState,
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

/**
 * Should a branch row adopt the SHARED roster it carries?
 *
 * Adopt when the row is strictly newer than this device's copy, or when both are
 * the same revision AND this device has no unpublished edit of its own. Anything
 * else keeps the local roster (and the row is republished instead) — otherwise
 * an unpublished local edit (e.g. a «turn order» choice) would be wiped by the
 * same-revision copy and the custom order would silently fall back to «تلقائي».
 */
export function canAdoptRemoteOrg(incoming: number, local: number, localDirty: boolean): boolean {
  if (incoming > local) return true;
  return incoming === local && !localDirty;
}

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
        !s.disabled &&
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
 *   1) Ahmed Yossry        4) Hany Elshenawy
 *   2) Youssef Shehata     5) Perry
 *   3) Rewaida             6) Ahmed Sultan  → back to Ahmed Yossry …
 *
 * Every slot is a PERSON, not a hard-coded team: the team that takes the slot is
 * read from the LIVE roster, so the cycle keeps working when a team is renamed,
 * when the person moves to another team, and when the person is a member of a
 * team that carries somebody else's name («التيم اللي فيه فلان»).
 *
 * The pending person carried from yesterday stays pinned at #1, then the cycle
 * continues from their own team in this order (Ahmed Yossry → Youssef Shehata →
 * Rewaida → Hany Elshenawy → Perry → Ahmed Sultan's team → Ahmed Yossry …).
 * A team with nobody available is skipped without re-ordering the others, and a
 * team that already holds an earlier slot is never repeated.
 *
 * A team that no longer takes part (Gannah Elmalah's team) simply stays outside
 * the cycle; it is not deleted from the org chart.
 *
 * The last slot is ONE team known under two names: «تيم أحمد سلطان» is the same
 * team that Hala Elfar is in, so the slot lists her as an alias and resolves to
 * that team whichever of the two names «الهيكل» saved it under.
 */
export interface AutomaticTeamSlot {
  readonly id: string;
  readonly name: string;
  /** Other names of the SAME team (a person in it, an old spelling, …). */
  readonly aliases?: readonly string[];
}

export const AUTOMATIC_TEAM_ORDER: readonly AutomaticTeamSlot[] = [
  { id: 'ahmed', name: 'Ahmed Yossry' },
  { id: 'shehata', name: 'Youssef Shehata' },
  { id: 'rewaida', name: 'Rewaida' },
  { id: 'hany-elshenawy', name: 'Hany Elshenawy' },
  { id: 'perry', name: 'Perry' },
  { id: 'ahmed-sultan', name: 'Ahmed Sultan', aliases: ['Hala Elfar'] },
];

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

/** Every name a slot can be saved under — its own name plus its aliases. */
const slotNames = (slot: AutomaticTeamSlot): string[] => [slot.name, ...(slot.aliases ?? [])];

function automaticTeamIndex(managerId: string, managerName: string): number {
  const id = normalizeTeamName(managerId);
  const name = normalizeTeamName(managerName);
  return AUTOMATIC_TEAM_ORDER.findIndex((team) => {
    const names = slotNames(team).map(normalizeTeamName);
    return id === normalizeTeamName(team.id) || names.includes(id) || names.includes(name);
  });
}

// ───────────── Team (manager) turns — SITE ⇄ RESTA ─────────────
//
// In both workspaces the turn belongs to a TEAM: one fixed cycle decides whose
// team is next, and the sales who sits with the client is picked MANUALLY from
// that team's roster. The engine therefore never proposes a sales name — it
// only decides the team, so nothing here can be mistaken for an assignment.

/**
 * The team one automatic slot points at, read from the LIVE roster.
 *
 * A slot names a PERSON, so the roster can spell their team in four ways and
 * every one of them must find the SAME team:
 *  1. the team id is the slot id (or an alias spelled as an id) — renames never
 *     break it;
 *  2. the named person is a MEMBER of the team («التيم اللي فيه فلان») — this is
 *     the strongest and most common case, e.g. «تيم Ahmed Sultan» whose sales is
 *     Hala Elfar (every automatic slot also holds the manager's own row);
 *  3. the team itself is NAMED after the slot (a team renamed to «Ahmed Sultan»
 *     whose id no longer says so).
 *
 * Candidate teams are therefore collected and scored instead of taking the
 * first name match: a team that merely carries the name (an older, empty team
 * left behind) must never win over the team the person is actually in.
 *
 * The last slot names a person AND an alias (`Ahmed Sultan` / `Hala Elfar`):
 * they are one team, whichever of the two names it was saved under and whoever
 * of the two is the manager.
 */
/**
 * How strongly a team matches a slot. The slot's OWN name/id always beats an
 * alias, so a leftover team named after the alias can never take the slot from
 * the team the slot's person is really in.
 */
const SLOT_SCORE = {
  ownId: 6,
  ownMember: 5,
  ownName: 4,
  aliasId: 3,
  aliasMember: 2,
  aliasName: 1,
} as const;

function teamForAutomaticSlot(
  slot: AutomaticTeamSlot,
  index: number,
  managersList: ManagerTeam[],
  salesList: SalesPerson[],
): ManagerTeam | null {
  const own = normalizeTeamName(slot.name);
  const ownId = normalizeTeamName(slot.id);
  const aliases = (slot.aliases ?? []).map(normalizeTeamName);
  const hasMemberNamed = (team: ManagerTeam, wanted: string[]): boolean =>
    salesList.some(
      (person) =>
        !person.disabled &&
        person.managerId === team.id &&
        (wanted.includes(normalizeTeamName(person.name)) || wanted.includes(normalizeTeamName(person.id))),
    );
  const scoreOf = (team: ManagerTeam): number => {
    if (normalizeTeamName(team.id) === ownId) return SLOT_SCORE.ownId;
    if (hasMemberNamed(team, [own])) return SLOT_SCORE.ownMember;
    if (normalizeTeamName(team.name) === own) return SLOT_SCORE.ownName;
    if (aliases.includes(normalizeTeamName(team.id))) return SLOT_SCORE.aliasId;
    if (hasMemberNamed(team, aliases)) return SLOT_SCORE.aliasMember;
    if (aliases.includes(normalizeTeamName(team.name))) return SLOT_SCORE.aliasName;
    if (automaticTeamIndex(team.id, team.name) === index) return SLOT_SCORE.aliasName;
    return 0;
  };

  let best: ManagerTeam | null = null;
  let bestScore = 0;
  managersList.forEach((team) => {
    if (isTeamDisabled(team, salesList)) return;
    const score = scoreOf(team);
    if (score > bestScore) {
      best = team;
      bestScore = score;
    }
  });
  return best;
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
  const activeManagers = managersList.filter((m) => !isTeamDisabled(m, salesList));
  const settings = normalizeTeamCycle(cycle);
  // Custom mode is authoritative even when the list ends up empty: the editor
  // blocks removing the last team, so an empty cycle here is an explicit choice.
  if (settings.mode === 'custom') {
    const byId = new Map(activeManagers.map((m) => [m.id, m] as const));
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
    const team = teamForAutomaticSlot(slot, index, activeManagers, salesList);
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
        !s.disabled &&
        s.managerId === managerId &&
        salesState[s.id]?.status === 'available' &&
        !excludeIds.includes(s.id),
    )
    .sort((a, b) => sortByAttendance(a, b, salesState));
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

/** Why a team in the cycle was passed over for the turn. */
export type ShiftReason = 'absent' | 'busy' | 'allAbsent';

/** A team that was on turn (or came before the serving team) but has nobody free. */
export interface ShiftedTeam {
  managerId: string;
  managerName: string;
  headId: string;
  headName: string;
  /**
   * `absent` — nobody in the team checked in; `busy` — some are with a client
   * and nobody is free; `allAbsent` — nobody in the whole cycle is available.
   */
  reason: ShiftReason;
}

/**
 * The turn plan for the day:
 *  • `onTurn`       — the team the cycle points at, attendance ignored (carry-over included);
 *  • `serving`      — the first team from `onTurn` (inclusive) with an available member, or null;
 *  • `shiftedTeams` — the teams between `onTurn` and `serving` that have nobody free.
 */
export interface TurnPlan {
  onTurn: ManagerTeam | null;
  serving: TeamTurn | null;
  shiftedTeams: ShiftedTeam[];
  /** True when `onTurn` comes from the hand-pinned turn («الدور من هنا»). */
  onTurnPinned: boolean;
}

/**
 * Whose team is on turn now, and who actually serves it:
 *  1. a team carried from yesterday (not served yet today) is on turn;
 *  2. otherwise the fixed cycle continues after the most recently served team;
 *  3. a team with nobody available is passed over — `shiftedTeams` lists it —
 *     and the cycle order itself never moves.
 */
export function computeTurnPlan(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
  headsList: HeadGroup[] = HEADS,
  options: RotationOptions = {},
): TurnPlan {
  const empty: TurnPlan = { onTurn: null, serving: null, shiftedTeams: [], onTurnPinned: false };
  const active = activeOrg(headsList, managersList, salesList);
  const cycleSettings = normalizeTeamCycle(options.cycle);
  const isCustom = cycleSettings.mode === 'custom';
  const cycle = resolveCycle(active.managers, cycleSettings, active.sales);
  if (cycle.every((team) => !team)) return empty;
  const indexInCycle = (managerId: string, managerName: string): number =>
    cycleIndexOf(cycle, managerId, managerName, isCustom);
  const excluded = options.skippedIds ?? [];
  const hasMembers = (team: ManagerTeam) =>
    availableTeamMembers(team.id, salesState, active.sales, excluded).length > 0;

  const carried = options.carryOver;
  const carriedIndex =
    carried && (carried.managerId || carried.managerName)
      ? indexInCycle(carried.managerId, carried.managerName)
      : -1;
  const carriedTeam = carriedIndex >= 0 ? cycle[carriedIndex] : null;
  const servedToday = (managerId: string) => history.some((a) => a.managerId === managerId);

  // The hand-pinned turn («الدور من هنا»): the team the manager picked holds the
  // turn now, whatever the cycle says — the ORDER is untouched, so the rotation
  // carries on normally after that team has served.
  const pinned = options.pinnedTurn;
  const pinnedIndex =
    pinned && (pinned.managerId || pinned.managerName)
      ? indexInCycle(pinned.managerId, pinned.managerName)
      : -1;
  const pinnedTeam = pinnedIndex >= 0 ? cycle[pinnedIndex] : null;

  let previousIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const index = indexInCycle(history[i].managerId, history[i].managerName);
    if (index >= 0) {
      previousIndex = index;
      break;
    }
  }

  // The carried team holds the turn while nothing has been served yet today, or
  // while it can actually be served. An absent carried team that the cycle has
  // already moved past (someone was served after it) yields to the cycle.
  const carryPending = Boolean(carriedTeam) && !servedToday(carriedTeam!.id);
  const carryOnTurn = carryPending && (previousIndex < 0 || hasMembers(carriedTeam!));
  const start =
    previousIndex >= 0 ? (previousIndex + 1) % cycle.length : carriedIndex >= 0 ? carriedIndex : 0;
  const onTurnIndex = pinnedTeam ? pinnedIndex : carryOnTurn ? carriedIndex : start;
  const onTurn = cycle[onTurnIndex] ?? null;
  const onTurnPinned = Boolean(pinnedTeam) && onTurn?.id === pinnedTeam?.id;

  const shiftedTeams: ShiftedTeam[] = [];
  let serving: TeamTurn | null = null;
  for (let offset = 0; offset < cycle.length; offset++) {
    const team = cycle[(onTurnIndex + offset) % cycle.length];
    if (!team) continue;
    if (!hasMembers(team)) {
      const head = active.heads.find((h) => h.id === team.headId);
      const members = active.sales.filter((s) => s.managerId === team.id);
      const busy = members.some((s) => salesState[s.id]?.status === 'busy');
      shiftedTeams.push({
        managerId: team.id,
        managerName: team.name,
        headId: team.headId,
        headName: head?.name ?? team.headId,
        reason: busy ? 'busy' : 'absent',
      });
      continue;
    }
    if (onTurnPinned && team.id === pinnedTeam?.id) {
      serving = teamTurn(team, `الدور المثبَّت • تيم ${team.name}`, false, null, active.heads);
    } else if (!pinnedTeam && carryOnTurn && team.id === carriedTeam?.id) {
      const person = carried?.salesId ? active.sales.find((s) => s.id === carried.salesId) ?? null : null;
      const present =
        person && person.managerId === team.id && salesState[person.id]?.status === 'available'
          ? person
          : null;
      serving = teamTurn(team, `دور أمس المرحّل • تيم ${team.name}`, false, present, active.heads);
    } else {
      const reason =
        offset === 0 ? `دور تيم ${team.name}` : `تخطي الفرق غير المتاحة — دور تيم ${team.name}`;
      serving = teamTurn(team, reason, offset > 0, null, active.heads);
    }
    break;
  }

  // Nobody free anywhere: every team of the cycle is passed over.
  if (!serving) shiftedTeams.forEach((team) => (team.reason = 'allAbsent'));
  return { onTurn, serving, shiftedTeams, onTurnPinned };
}

/**
 * The team that serves the turn (`TurnPlan.serving`). Kept for callers that only
 * need the serving team; the team on turn and the passed-over teams come from
 * `computeTurnPlan`.
 */
export function computeNextTeam(
  salesState: Record<string, SalesState>,
  history: Assignment[],
  managersList: ManagerTeam[] = MANAGERS,
  salesList: SalesPerson[] = SALES,
  headsList: HeadGroup[] = HEADS,
  options: RotationOptions = {},
): TeamTurn | null {
  return computeTurnPlan(salesState, history, managersList, salesList, headsList, options).serving;
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
 * on turn comes first.
 *
 * This is the SAME order the rotation engine reads (`resolveCycle`), only
 * rotated to the current turn. Nothing else may re-sort it: the arrows on that
 * tab save their move INTO that cycle (see `swapInCustomOrder`), so the list on
 * screen and the team the «الرئيسية» screen announces can never disagree.
 */
export function teamRoundFrom(
  managersList: ManagerTeam[] = MANAGERS,
  startManagerId?: string | null,
  cycle?: TeamCycleSettings | null,
  salesList: SalesPerson[] = SALES,
): ManagerTeam[] {
  return teamOrderFrom(managersList, startManagerId ?? undefined, cycle, salesList);
}

/**
 * Swap two teams inside an order, keeping the rest of it untouched — what the
 * arrows on «ترتيب المديرين» save (the visible list becomes the custom cycle),
 * so the screen and the rotation engine can never disagree.
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

  const active = activeOrg(headsList, managersList, salesList);

  const anyAvailable = active.sales.some(
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

  const mgrNameOf = (id: string) => active.managers.find((m) => m.id === id)?.name ?? id;

  if (expectedSide === 'khaled') {
    const pick = pickForKaled(salesState, history, excludeIds, active.sales, active.managers);
    if (pick) {
      const reason =
        history.length === 0
          ? `بداية اليوم من تيم ${mgrNameOf(pick.managerId)} • أولوية الحضور`
          : `تناوب Head × Head • دور تيم ${mgrNameOf(pick.managerId)} (خالد يوسف)`;
      return toTurn(pick, reason, false, active.heads, active.managers);
    }
  } else {
    const pick = pickForOtherHead(salesState, history, excludeIds, active.sales, active.heads);
    if (pick) {
      const reason =
        history.length === 0
          ? `بداية اليوم من تيم ${pick.head.ar} • أولوية الحضور`
          : `تناوب Head × Head • دور تيم ${pick.head.ar}`;
      return toTurn(pick.sales, reason, false, active.heads, active.managers);
    }
  }

  // Expected side is empty → serve the other side instead.
  if (expectedSide === 'khaled') {
    const fallback = pickForOtherHead(salesState, history, excludeIds, active.sales, active.heads);
    if (fallback) {
      return toTurn(
        fallback.sales,
        `لا يوجد متاح في تيم خالد يوسف — تم التحويل إلى تيم ${fallback.head.ar}`,
        true,
        active.heads,
        active.managers,
      );
    }
  } else {
    const fallback = pickForKaled(salesState, history, excludeIds, active.sales, active.managers);
    if (fallback) {
      return toTurn(
        fallback,
        `لا يوجد متاح في تيم ${active.heads.find((h) => h.id !== 'khaled')?.ar ?? 'الهيد الآخر'} — تم التحويل إلى تيم خالد يوسف`,
        true,
        active.heads,
        active.managers,
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
  const active = activeOrg(headsList, managersList, salesList);

  if (usesFixedTeamRotation(options.workspace)) {
    // The seed is redundant here: a pending carry-over is expressed by
    // `options.carryOver`, so the round is derived from state alone.
    const current = computeNextTeam(salesState, history, active.managers, active.sales, active.heads, options);
    return teamOrderFrom(active.managers, current?.managerId, options.cycle, active.sales)
      .filter((team) => availableTeamMembers(team.id, salesState, active.sales, excluded).length > 0)
      .map((team, index) =>
        index === 0 && current
          ? toTeamComputedTurn(current)
          : toTeamComputedTurn(teamTurn(team, `دور تيم ${team.name}`, false, null, active.heads)),
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

  const total = active.sales.filter((s) => !s.isManager && salesState[s.id]?.status === 'available').length;
  for (let i = 0; i < total + 1 && out.length < total + (seedTurn ? 1 : 0); i++) {
    const t = computeNextTurn(salesState, simHistory, startingHead, [...served], active.heads, active.managers, active.sales, options);
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

/** «Walk in (Site)» / «Walk in (Resta)» — the branch the visit happened at. */
export function visitHeadline(visit: VisitType | undefined): string {
  if (visit === 'site') return 'Walk in (Site)';
  if (visit === 'resta') return 'Walk in (Resta)';
  return 'Walk in';
}

/**
 * The copyable receipt («نسخ البيان»).
 *
 * Normal visit:
 *   Walk in (Site) Done ✅ / Sales : X Done✅ / Manager : … / Head : … / Next : …
 *
 * Visit with teams passed over (`shiftedTeams`), exactly:
 *   Walk in (Site) / <team> Shifted ❌ (one line per team) / <sales> ✅ /
 *   Manager : … / Head : … / Next : …
 *
 * `Next` is always the successor team in the cycle (`successorTeam`), whether or
 * not that team has anybody present today.
 */
export function receiptText(assignment: Assignment, next: ManagerTeam | null): string {
  const headline = visitHeadline(assignment.visitType);
  const nextName = next ? next.name : '—';
  const shifted = assignment.shiftedTeams ?? [];
  if (shifted.length > 0) {
    return (
      `${headline}\n` +
      shifted.map((t) => `${t.managerName} Shifted ❌`).join('\n') +
      `\n${assignment.salesName} ✅\n` +
      `Manager : ${assignment.managerName}\n` +
      `Head : ${assignment.headName}\n` +
      `Next : ${nextName}`
    );
  }
  return (
    `${headline} Done ✅\n` +
    `Sales : ${assignment.salesName} Done✅\n` +
    `Manager : ${assignment.managerName}\n` +
    `Head : ${assignment.headName}\n` +
    `Next : ${nextName}`
  );
}

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
