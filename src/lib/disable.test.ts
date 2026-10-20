import assert from 'node:assert/strict';
import { test } from 'node:test';
import XLSX from 'xlsx-js-style';
import {
  HEADS,
  MANAGERS,
  SALES,
  activeOrg,
  availableTeamMembers,
  clearSalesAttendance,
  computeNextTeam,
  computeNextTurn,
  computeTurnPlan,
  defaultSalesState,
  hydrate,
  hydrateOrgChart,
  isHeadDisabled,
  isPersonDisabled,
  isTeamDisabled,
  loadPersisted,
  mergeOrgCharts,
  mirrorOrgChart,
  orgChartKey,
  predictFullRound,
  savePersisted,
  setActiveAccount,
  teamOrderFrom,
} from './walkin.ts';
import type { OrgState } from './org.ts';
import {
  applyOrgChart,
  setHeadDisabled,
  setManagerDisabled,
  setSalesPersonDisabled,
} from './org.ts';
import {
  isDefaultHiddenFromAttendance,
  isHiddenFromAttendance,
  normalizeAttendanceName,
  visibleAttendanceSales,
} from './attendanceVisibility.ts';
import {
  attendanceRowsFor,
  createAttendanceWorkbook,
  mergeAttendanceRows,
} from './attendanceExcel.ts';

const clone = <T,>(value: T): T => structuredClone(value);

function baseOrgState(): OrgState {
  return {
    heads: clone(HEADS),
    managers: clone(MANAGERS),
    sales: clone(SALES),
    history: [],
    carryOver: null,
    removedIds: [],
  };
}

function withMemoryLocalStorage<T>(fn: () => T): T {
  const store = new Map<string, string>();
  const prev = (globalThis as { localStorage?: Storage }).localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, String(val));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev });
    }
  }
}

test('disabling an individual sales person hides them everywhere without deleting their record, and re-enabling restores full permissions', () => {
  const initial = baseOrgState();
  const target = initial.sales.find((s) => !s.isManager && !isDefaultHiddenFromAttendance(s.name));
  assert.ok(target, 'expected a regular sales member in built-in roster');

  const withDetails: OrgState = {
    ...initial,
    sales: initial.sales.map((s) =>
      s.id === target.id ? { ...s, phone: '01099887766', shiftTime: '11:30' } : s,
    ),
  };

  // Check them in and mark busy with served history counts before disabling
  const stateBefore = defaultSalesState(withDetails.sales);
  stateBefore[target.id] = {
    status: 'busy',
    checkInOrder: 1,
    checkInTime: '2026-10-20T09:15:00.000Z',
    walkCount: 3,
    coverCount: 1,
    lastServedAt: '2026-10-20T11:00:00.000Z',
  };

  // Disable person from «الهيكل»
  const disabledOrg = setSalesPersonDisabled(withDetails, target.id, true);
  const kept = disabledOrg.sales.find((s) => s.id === target.id);
  assert.ok(kept, 'disabled person stays in the org structure so they can be re-enabled');
  assert.equal(kept.phone, '01099887766');
  assert.equal(kept.shiftTime, '11:30');
  assert.equal(isPersonDisabled(kept, disabledOrg.managers, disabledOrg.heads), true);

  // Active roster excludes them completely
  const active = activeOrg(disabledOrg.heads, disabledOrg.managers, disabledOrg.sales);
  assert.equal(active.sales.some((s) => s.id === target.id), false);

  // Attendance board & visibility exclude them
  assert.equal(isHiddenFromAttendance(kept), true);
  assert.equal(visibleAttendanceSales(disabledOrg.sales).some((s) => s.id === target.id), false);

  // Attendance cleanup clears even a `busy` check-in while preserving counters
  const cleaned = clearSalesAttendance(stateBefore, [target.id]);
  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.salesState[target.id].status, 'absent');
  assert.equal(cleaned.salesState[target.id].checkInOrder, null);
  assert.equal(cleaned.salesState[target.id].checkInTime, null);
  assert.equal(cleaned.salesState[target.id].walkCount, 3);
  assert.equal(cleaned.salesState[target.id].coverCount, 1);

  // Attendance Excel has NEITHER a green present row NOR a red «لم يحضر» row for the disabled person
  const siteRows = attendanceRowsFor(disabledOrg, stateBefore);
  const restaRows = attendanceRowsFor(disabledOrg, defaultSalesState(disabledOrg.sales));
  const merged = mergeAttendanceRows(siteRows, restaRows);
  assert.equal(merged.some((r) => r.person.id === target.id), false);
  const wb = createAttendanceWorkbook(merged);
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets['Sales Team'], { header: 1, raw: true }) as unknown[][];
  assert.equal(sheetRows.some((row) => row[0] === target.name), false);

  // Rotation excludes them from team candidates and Head×Head turns
  assert.equal(
    availableTeamMembers(target.managerId, stateBefore, disabledOrg.sales).some((s) => s.id === target.id),
    false,
  );
  const genericTurn = computeNextTurn(
    stateBefore,
    [],
    target.headId,
    [],
    disabledOrg.heads,
    disabledOrg.managers,
    disabledOrg.sales,
  );
  assert.notEqual(genericTurn?.salesId, target.id);

  // Re-enable person from «الهيكل» -> immediately appears in Attendance & regains full permissions
  const reenabledOrg = setSalesPersonDisabled(disabledOrg, target.id, false);
  const restored = reenabledOrg.sales.find((s) => s.id === target.id)!;
  assert.equal(restored.disabled, false);
  assert.equal(isPersonDisabled(restored, reenabledOrg.managers, reenabledOrg.heads), false);
  assert.equal(isHiddenFromAttendance(restored), false);
  assert.equal(visibleAttendanceSales(reenabledOrg.sales).some((s) => s.id === target.id), true);

  // Re-appears in Attendance Excel right away (absent until checked in, then present when checked in)
  const absentExcelRows = attendanceRowsFor(reenabledOrg, cleaned.salesState);
  assert.equal(absentExcelRows.some((r) => r.person.id === target.id), true);

  const checkedInAgain = {
    ...cleaned.salesState,
    [target.id]: {
      ...cleaned.salesState[target.id],
      status: 'available' as const,
      checkInOrder: 2,
      checkInTime: '2026-10-20T12:05:00.000Z',
    },
  };
  assert.equal(
    availableTeamMembers(target.managerId, checkedInAgain, reenabledOrg.sales).some((s) => s.id === target.id),
    true,
  );
});

test('default-hidden managers stay hidden by default, disappear completely when disabled, and appear in Attendance with full permissions when explicitly enabled', () => {
  const base = baseOrgState();
  // Seed all four production cloud managers (`HIDDEN_FROM_ATTENDANCE`) if not already in built-ins
  const cloudHiddenManagers = [
    { id: 'dina-abdo', name: 'Dina Abdo', headId: base.heads[0].id },
    { id: 'ahmed-sultan', name: 'Ahmed Sultan', headId: base.heads[0].id },
    { id: 'hany-elshenawy', name: 'Hany Elshenawy', headId: base.heads[1].id },
    { id: 'moataz-mandoh', name: 'Moataz Mandoh', headId: base.heads[1].id },
  ];
  const initial: OrgState = {
    ...base,
    managers: [
      ...base.managers,
      ...cloudHiddenManagers
        .filter(
          (m) =>
            !base.managers.some(
              (x) => normalizeAttendanceName(x.name) === normalizeAttendanceName(m.name),
            ),
        )
        .map((m) => ({ id: m.id, name: m.name, ar: m.name, headId: m.headId })),
    ],
    sales: [
      ...base.sales,
      ...cloudHiddenManagers
        .filter(
          (m) =>
            !base.sales.some(
              (s) => normalizeAttendanceName(s.name) === normalizeAttendanceName(m.name),
            ),
        )
        .map((m) => ({
          id: `${m.id}-self`,
          name: m.name,
          managerId: m.id,
          headId: m.headId,
          isManager: true,
        })),
    ],
  };
  const hiddenManagers = initial.sales.filter((s) => isDefaultHiddenFromAttendance(s));
  assert.ok(hiddenManagers.length >= 4, 'expected the four built-in hidden managers');

  for (const mgrPerson of hiddenManagers) {
    // 1) Untouched default (`disabled === undefined`): hidden from Attendance sheet/board, still active in org
    assert.equal(mgrPerson.disabled, undefined);
    assert.equal(isHiddenFromAttendance(mgrPerson), true);
    assert.equal(isPersonDisabled(mgrPerson, initial.managers, initial.heads), false);

    // 2) Explicitly disabled (`disabled === true`): hidden from Attendance AND disabled everywhere in the app
    const disabledOrg = setSalesPersonDisabled(initial, mgrPerson.id, true);
    const disabledPerson = disabledOrg.sales.find((s) => s.id === mgrPerson.id)!;
    assert.equal(isPersonDisabled(disabledPerson, disabledOrg.managers, disabledOrg.heads), true);
    assert.equal(isHiddenFromAttendance(disabledPerson), true);
    assert.equal(
      activeOrg(disabledOrg.heads, disabledOrg.managers, disabledOrg.sales).sales.some(
        (s) => s.id === mgrPerson.id,
      ),
      false,
    );

    // 3) Explicitly enabled (`disabled === false`): NOW visible in Attendance + Excel AND has full permissions!
    const enabledOrg = setSalesPersonDisabled(disabledOrg, mgrPerson.id, false);
    const enabledPerson = enabledOrg.sales.find((s) => s.id === mgrPerson.id)!;
    assert.equal(enabledPerson.disabled, false);
    assert.equal(isPersonDisabled(enabledPerson, enabledOrg.managers, enabledOrg.heads), false);
    assert.equal(isHiddenFromAttendance(enabledPerson), false);
    assert.equal(visibleAttendanceSales(enabledOrg.sales).some((s) => s.id === mgrPerson.id), true);

    const state = defaultSalesState(enabledOrg.sales);
    state[enabledPerson.id] = {
      ...state[enabledPerson.id],
      status: 'available',
      checkInOrder: 1,
      checkInTime: '2026-10-20T09:30:00.000Z',
    };
    const rows = attendanceRowsFor(enabledOrg, state);
    assert.equal(rows.some((r) => r.person.id === mgrPerson.id), true);
    assert.equal(
      availableTeamMembers(enabledPerson.managerId, state, enabledOrg.sales).some(
        (s) => s.id === mgrPerson.id,
      ),
      true,
    );
  }
});

test('disabling a whole team or Head removes its teams from automatic & custom turn cycles and Shifted ❌ lists', () => {
  const initial = baseOrgState();
  const state = defaultSalesState(initial.sales);
  initial.sales.forEach((s, idx) => {
    state[s.id] = {
      status: 'available',
      checkInOrder: idx + 1,
      checkInTime: '2026-10-20T09:00:00.000Z',
      walkCount: 0,
      lastServedAt: null,
    };
  });

  const firstPlan = computeTurnPlan(state, [], initial.managers, initial.sales, initial.heads, {
    workspace: 'SITE',
  });
  assert.ok(firstPlan?.onTurn, 'expected an initial on-turn team');
  const firstTeamId = firstPlan.onTurn.id;

  // Disable the entire first team in the cycle
  const withoutFirstTeam = setManagerDisabled(initial, firstTeamId, true);
  assert.equal(
    isTeamDisabled(
      withoutFirstTeam.managers.find((m) => m.id === firstTeamId)!,
      withoutFirstTeam.sales,
      withoutFirstTeam.heads,
    ),
    true,
  );

  // Neither auto cycle nor custom cycle treats the disabled team as onTurn, serving, or Shifted ❌
  const nextAutoPlan = computeTurnPlan(
    state,
    [],
    withoutFirstTeam.managers,
    withoutFirstTeam.sales,
    withoutFirstTeam.heads,
    { workspace: 'SITE' },
  );
  assert.notEqual(nextAutoPlan?.onTurn?.id, firstTeamId);
  assert.notEqual(nextAutoPlan?.serving?.managerId, firstTeamId);
  assert.equal(nextAutoPlan?.shiftedTeams.some((t) => t.managerId === firstTeamId), false);

  const customCycle = { mode: 'custom' as const, order: initial.managers.map((m) => m.id) };
  assert.equal(
    teamOrderFrom(withoutFirstTeam.managers, undefined, customCycle, withoutFirstTeam.sales).some(
      (m) => m.id === firstTeamId,
    ),
    false,
  );
  assert.equal(
    predictFullRound(
      state,
      [],
      initial.heads[0].id,
      null,
      withoutFirstTeam.heads,
      withoutFirstTeam.managers,
      withoutFirstTeam.sales,
      { workspace: 'SITE', cycle: customCycle },
    ).some((t) => t.managerId === firstTeamId),
    false,
  );

  // Re-enabling a single person inside a disabled Head/Team wakes ONLY that person while keeping siblings disabled
  const disabledHeadId = initial.heads[0].id;
  const headOff = setHeadDisabled(initial, disabledHeadId, true);
  assert.equal(isHeadDisabled(headOff.heads.find((h) => h.id === disabledHeadId)), true);
  assert.equal(
    computeNextTeam(state, [], headOff.managers, headOff.sales, headOff.heads, {
      workspace: 'RESTA',
    })?.headId === disabledHeadId,
    false,
  );

  const headMembers = headOff.sales.filter((s) => s.headId === disabledHeadId);
  const chosen = headMembers[0];
  const sibling = headMembers[1];
  const singleRevived = setSalesPersonDisabled(headOff, chosen.id, false);
  assert.equal(
    isPersonDisabled(
      singleRevived.sales.find((s) => s.id === chosen.id)!,
      singleRevived.managers,
      singleRevived.heads,
    ),
    false,
  );
  assert.equal(
    isPersonDisabled(
      singleRevived.sales.find((s) => s.id === sibling.id)!,
      singleRevived.managers,
      singleRevived.heads,
    ),
    true,
  );
});

test('disabled and explicitly-enabled flags survive hydration, chart fingerprints, merges, and SITE ⇄ RESTA mirroring', () => {
  withMemoryLocalStorage(() => {
    setActiveAccount('SITE');
    const base = baseOrgState();
    const regular = base.sales.find((s) => !s.isManager)!;
    const defaultHiddenMgr = {
      id: 'dina-abdo-self',
      name: 'Dina Abdo',
      managerId: base.managers[0].id,
      headId: base.heads[0].id,
      isManager: true,
    };
    const seededBase: OrgState = {
      ...base,
      sales: [...base.sales, defaultHiddenMgr],
    };

    let edited = setSalesPersonDisabled(seededBase, regular.id, true);
    edited = setSalesPersonDisabled(edited, defaultHiddenMgr.id, false);

    // RESTA had `regular` checked in with 2 real served assignments in `history` before they were disabled in SITE
    const restaSalesState = defaultSalesState(seededBase.sales);
    restaSalesState[regular.id] = {
      status: 'available',
      checkInOrder: 1,
      checkInTime: '2026-10-20T08:45:00.000Z',
      walkCount: 2,
      lastServedAt: '2026-10-20T09:10:00.000Z',
    };
    const restaHistory = [1, 2].map((n) => ({
      id: `turn-${n}`,
      n,
      salesId: regular.id,
      salesName: regular.name,
      managerId: regular.managerId,
      managerName: 'Team',
      headId: regular.headId,
      headName: 'Head',
      time: `2026-10-20T09:0${n}:00.000Z`,
      clientLabel: `Client ${n}`,
      substituted: false,
      visitType: 'walkin' as const,
    }));
    savePersisted(
      {
        ...hydrate({
          customHeads: clone(seededBase.heads),
          customManagers: clone(seededBase.managers),
          customSales: clone(seededBase.sales),
        }),
        salesState: restaSalesState,
        history: restaHistory,
        orgRevision: 1,
      },
      'RESTA',
    );

    const chart = hydrateOrgChart({
      heads: edited.heads,
      managers: edited.managers,
      sales: edited.sales,
      removedIds: edited.removedIds,
    });

    // Fingerprint distinguishes active vs disabled vs explicitly-enabled charts
    const baseChart = hydrateOrgChart({
      heads: seededBase.heads,
      managers: seededBase.managers,
      sales: seededBase.sales,
      removedIds: [],
    });
    assert.notEqual(orgChartKey(chart), orgChartKey(baseChart));

    // Mirroring into RESTA carries both flags AND clears `regular`'s stale check-in while keeping `walkCount`
    mirrorOrgChart('SITE', chart, 2);
    const restaHydrated = loadPersisted('RESTA');
    const restaRegular = restaHydrated.customSales?.find((s) => s.id === regular.id);
    const restaMgr = restaHydrated.customSales?.find((s) => s.id === defaultHiddenMgr.id);
    assert.equal(restaRegular?.disabled, true);
    assert.equal(restaMgr?.disabled, false);
    assert.equal(restaHydrated.salesState[regular.id].status, 'absent');
    assert.equal(restaHydrated.salesState[regular.id].walkCount, 2);

    // Adopting & merging shared charts preserve exact `disabled` flags
    const adopted = applyOrgChart(seededBase, chart);
    assert.equal(adopted.sales.find((s) => s.id === regular.id)?.disabled, true);
    assert.equal(adopted.sales.find((s) => s.id === defaultHiddenMgr.id)?.disabled, false);

    const merged = mergeOrgCharts(chart, baseChart);
    assert.equal(merged.sales.find((s) => s.id === regular.id)?.disabled, true);
    assert.equal(merged.sales.find((s) => s.id === defaultHiddenMgr.id)?.disabled, false);
  });
});
