// ─── Amer Group · Renaming members without losing their data ───
//
// Every member is identified by `id` everywhere:
//   • `salesState`  — attendance, check-in order, walk counts, last served at
//   • `history`     — every served turn, and therefore the leaderboard/recap
//   • the fixed team cycle and the manual «الترتيب» order (manager IDs)
//
// So deleting a member and adding them again under the new name throws away
// their attendance, their counters, their queue position and their slot in the
// automatic team cycle — and it cannot rewrite the turns already served.
//
// The helpers below rename a member **in place**: the id never changes, nothing
// about attendance/rotation is touched, and every place that stored a copy of
// the old name (the member record, the team record for a manager, the history
// entries, yesterday's carried-over team) is updated to the new name.

import type { Assignment, CarryOver, HeadGroup, ManagerTeam, OrgChart, SalesPerson, TeamCycleSettings } from './walkin';

export interface OrgState {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  history: Assignment[];
  /** Yesterday's carried team — it stores its own copies of the names. */
  carryOver: CarryOver | null;
  /** Ids the user deleted — optional so callers that only rename can omit it. */
  removedIds?: string[];
  /** Team rotation settings («الترتيب» tab) — carried when adopting a shared chart. */
  cycle?: TeamCycleSettings;
}

/** A manager's own attendance row is stored as `${managerId}-self`. */
export const managerSelfId = (managerId: string): string => `${managerId}-self`;

const cleanName = (value: string | null | undefined, fallback: string): string =>
  (value ?? '').trim() || fallback;

/**
 * Arabic label rules:
 *   • `undefined`  → the caller did not touch it, keep the current Arabic name;
 *   • `''` / blank → the name was cleared, fall back to the Latin name (the
 *     rotation reasons and receipts always need something to print).
 */
const cleanAr = (value: string | undefined, current: string, latin: string): string =>
  value === undefined ? current.trim() || latin : (value ?? '').trim() || latin;

/** Sales rows that represent the manager him/herself. */
const managerSelfRows = (sales: SalesPerson[], managerId: string): SalesPerson[] =>
  sales.filter((s) => s.isManager && s.managerId === managerId);

/** True when this sales row is a manager (so the team name must follow it). */
export const isManagerRow = (managers: ManagerTeam[], person: SalesPerson): boolean =>
  Boolean(person.isManager) && managers.some((m) => m.id === person.managerId);

/** Keep yesterday's carry-over labels in sync (display only — decisions use IDs). */
function renameCarryOver(
  carryOver: CarryOver | null,
  patch: { managerId?: string; managerName?: string; headId?: string; headName?: string; salesIds?: Set<string>; salesName?: string },
): CarryOver | null {
  if (!carryOver) return null;
  let changed = false;
  const next: CarryOver = { ...carryOver };

  if (patch.managerId && patch.managerName && carryOver.managerId === patch.managerId) {
    next.managerName = patch.managerName;
    changed = true;
  }
  if (patch.headId && patch.headName && carryOver.headId === patch.headId) {
    next.headName = patch.headName;
    changed = true;
  }
  if (patch.salesIds && patch.salesName && patch.salesIds.has(carryOver.salesId)) {
    next.salesName = patch.salesName;
    changed = true;
  }
  return changed ? next : carryOver;
}

/** Rename a Head (English + Arabic) — managers and sales keep their own names. */
export function renameHead(org: OrgState, headId: string, name: string, ar?: string): OrgState {
  const head = org.heads.find((h) => h.id === headId);
  if (!head) return org;

  const nextName = cleanName(name, head.name);
  const nextAr = cleanAr(ar, head.ar, nextName);
  if (nextName === head.name && nextAr === head.ar) return org;

  return {
    ...org,
    heads: org.heads.map((h) => (h.id === headId ? { ...h, name: nextName, ar: nextAr } : h)),
    history: org.history.map((a) => (a.headId === headId ? { ...a, headName: nextName } : a)),
    carryOver: renameCarryOver(org.carryOver, { headId, headName: nextName }),
  };
}

/** Rename a manager / team (English + Arabic), including his own attendance row. */
export function renameManager(org: OrgState, managerId: string, name: string, ar?: string): OrgState {
  const team = org.managers.find((m) => m.id === managerId);
  if (!team) return org;

  const nextName = cleanName(name, team.name);
  const nextAr = cleanAr(ar, team.ar, nextName);
  if (nextName === team.name && nextAr === team.ar) return org;

  const selfIds = new Set(managerSelfRows(org.sales, managerId).map((s) => s.id));
  selfIds.add(managerSelfId(managerId));

  return {
    ...org,
    managers: org.managers.map((m) => (m.id === managerId ? { ...m, name: nextName, ar: nextAr } : m)),
    sales: org.sales.map((s) => (selfIds.has(s.id) ? { ...s, name: nextName } : s)),
    history: org.history.map((a) => {
      const managerName = a.managerId === managerId ? nextName : a.managerName;
      const salesName = selfIds.has(a.salesId) ? nextName : a.salesName;
      const originalSalesName = a.originalSalesName === team.name ? nextName : a.originalSalesName;
      if (
        managerName === a.managerName &&
        salesName === a.salesName &&
        originalSalesName === a.originalSalesName
      ) {
        return a;
      }
      return { ...a, managerName, salesName, originalSalesName };
    }),
    carryOver: renameCarryOver(org.carryOver, {
      managerId,
      managerName: nextName,
      salesIds: selfIds,
      salesName: nextName,
    }),
  };
}

/**
 * Adopt a SHARED org chart (the same roster in SITE and RESTA) into one branch.
 *
 * The chart is authoritative for the roster, but applying it must not damage
 * the branch's own data:
 *   • every name that differs is applied through the rename helpers first, so
 *     this branch's history, its carry-over and every already-served turn show
 *     the new name (they store copies of names, they are not joined by id);
 *   • attendance (`salesState`) and history are only touched by those renames —
 *     a member added in the other branch keeps sitting as «absent» here;
 *   • ids are stable, so the fixed team cycle keeps the same slots and nothing
 *     about the queue changes.
 */
export function applyOrgChart(org: OrgState, chart: OrgChart): OrgState {
  let next: OrgState = org;

  chart.heads.forEach((head) => {
    const current = next.heads.find((h) => h.id === head.id);
    if (current && (current.name !== head.name || current.ar !== head.ar)) {
      next = renameHead(next, head.id, head.name, head.ar);
    }
  });

  chart.managers.forEach((team) => {
    const current = next.managers.find((m) => m.id === team.id);
    if (current && (current.name !== team.name || current.ar !== team.ar)) {
      next = renameManager(next, team.id, team.name, team.ar);
    }
  });

  chart.sales.forEach((person) => {
    // A manager's own attendance row follows `renameManager` above.
    if (person.isManager) return;
    const current = next.sales.find((s) => s.id === person.id);
    if (current && current.name !== person.name) {
      next = renameSalesPerson(next, person.id, person.name);
    }
  });

  return {
    ...next,
    heads: chart.heads,
    managers: chart.managers,
    sales: chart.sales,
    removedIds: chart.removedIds,
    // The turn-order settings travel with the chart: the branch that adopts it
    // rotates with the same order the other branch published.
    cycle: chart.cycle ?? next.cycle,
  };
}

/**
 * Rename a sales person. Renaming a manager's own row (the «مدير» chip in the
 * attendance board) goes through `renameManager` so the team name stays in sync.
 */
export function renameSalesPerson(org: OrgState, salesId: string, name: string): OrgState {
  const person = org.sales.find((s) => s.id === salesId);
  if (!person) return org;

  if (isManagerRow(org.managers, person)) return renameManager(org, person.managerId, name);

  const nextName = cleanName(name, person.name);
  if (nextName === person.name) return org;

  return {
    ...org,
    sales: org.sales.map((s) => (s.id === salesId ? { ...s, name: nextName } : s)),
    history: org.history.map((a) => {
      const salesName = a.salesId === salesId ? nextName : a.salesName;
      const originalSalesName = a.originalSalesName === person.name ? nextName : a.originalSalesName;
      if (salesName === a.salesName && originalSalesName === a.originalSalesName) return a;
      return { ...a, salesName, originalSalesName };
    }),
    carryOver: renameCarryOver(org.carryOver, {
      salesIds: new Set([salesId]),
      salesName: nextName,
    }),
  };
}
