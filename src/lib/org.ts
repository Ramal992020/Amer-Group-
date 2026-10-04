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

import type { Assignment, CarryOver, HeadGroup, ManagerTeam, SalesPerson } from './walkin';

export interface OrgState {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  history: Assignment[];
  /** Yesterday's carried team — it stores its own copies of the names. */
  carryOver: CarryOver | null;
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
