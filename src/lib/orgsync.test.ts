// ─── Shared roster (SITE ⇄ RESTA) ───
//
// The org chart — Heads, manager teams and the sales roster — is ONE list used
// by both branches: a member added or renamed in SITE must appear in RESTA (and
// the other way round), while attendance, history and the queue stay per
// branch. These tests cover the helpers that make that safe:
//
//   • `hydrate`/`hydrateOrgChart` (a saved rename must survive, a deleted
//     built-in must stay deleted, a new built-in must still show up),
//   • `applyOrgChart` (adopting the shared chart in the other branch without
//     touching ids, attendance or served turns),
//   • `orgChartKey` (fingerprint used to skip no-op updates),
//   • `mirrorOrgChart` (instant roster after switching branch on one device).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADS,
  MANAGERS,
  SALES,
  defaultSalesState,
  hydrate,
  hydrateOrgChart,
  loadPersisted,
  mergeOrgCharts,
  mirrorOrgChart,
  orgChartKey,
  otherWorkspace,
  savePersisted,
  setActiveAccount,
} from './walkin.ts';
import type { Assignment, CarryOver, SalesState } from './walkin.ts';
import { applyOrgChart } from './org.ts';

const clone = <T,>(value: T): T => structuredClone(value);

/** A chart identical to the built-ins, with extra people added in SITE. */
function chartWithExtraPeople() {
  return hydrateOrgChart({
    customHeads: clone(HEADS).map((h) => (h.id === 'khaled' ? { ...h, name: 'Khaled Nour', ar: 'خالد نور' } : h)),
    customManagers: [...clone(MANAGERS), { id: 'hossam', name: 'Hossam', ar: 'حسام', headId: 'khaled' }],
    customSales: [
      ...clone(SALES),
      { id: 'hossam-self', name: 'Hossam', managerId: 'hossam', headId: 'khaled', isManager: true },
      { id: 'rana', name: 'Rana', managerId: 'hossam', headId: 'khaled' },
    ],
    removedIds: [],
  });
}

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'a1',
  n: 1,
  salesId: 'manar',
  salesName: 'Manar',
  managerId: 'ahmed',
  managerName: 'Ahmed Yossry',
  headId: 'khaled',
  headName: 'Khaled Youssef',
  time: '2026-10-04T08:00:00.000Z',
  clientLabel: 'Client',
  substituted: false,
  ...over,
});

const carry = (over: Partial<CarryOver> = {}): CarryOver => ({
  salesId: 'manar',
  salesName: 'Manar',
  managerId: 'ahmed',
  managerName: 'Ahmed Yossry',
  headId: 'khaled',
  headName: 'Khaled Youssef',
  fromDate: '2026-10-03',
  ...over,
});

function withMemoryLocalStorage<T>(run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

// ───────────────────────── Stored roster (hydrate) ─────────────────────────

test('a renamed built-in keeps its new name after a reload', () => {
  const heads = clone(HEADS).map((h) => (h.id === 'khaled' ? { ...h, name: 'Khaled Nour', ar: 'خالد نور' } : h));
  const managers = clone(MANAGERS).map((m) => (m.id === 'ahmed' ? { ...m, name: 'Ahmed Y. Kamel', ar: 'أحمد يسري كامل' } : m));
  const sales = clone(SALES).map((s) => (s.id === 'manar' ? { ...s, name: 'Manar Adel' } : s));

  const reloaded = hydrate({ customHeads: heads, customManagers: managers, customSales: sales });

  // Before the fix the built-in defaults won for the same id, so every rename
  // of a built-in member silently reverted on reload / cloud round-trip.
  const headsAfter = reloaded.customHeads ?? [];
  const managersAfter = reloaded.customManagers ?? [];
  const salesAfter = reloaded.customSales ?? [];
  assert.equal(headsAfter.find((h) => h.id === 'khaled')?.name, 'Khaled Nour');
  assert.equal(headsAfter.find((h) => h.id === 'khaled')?.ar, 'خالد نور');
  assert.equal(managersAfter.find((m) => m.id === 'ahmed')?.name, 'Ahmed Y. Kamel');
  assert.equal(salesAfter.find((s) => s.id === 'manar')?.name, 'Manar Adel');
  // Untouched members keep their built-in names.
  assert.equal(headsAfter.find((h) => h.id === 'wael')?.name, 'Wael El Desoky');
});

test('a member deleted by the user does not come back, a new built-in still appears', () => {
  const hydrated = hydrate({
    customHeads: clone(HEADS).filter((h) => h.id !== 'wael'),
    removedIds: ['wael'],
  });
  assert.equal((hydrated.customHeads ?? []).some((h) => h.id === 'wael'), false);
  assert.deepEqual(hydrated.removedIds, ['wael']);

  // People added to the built-in lists later must still be merged in.
  const added = hydrate({ customHeads: [{ id: 'extra', name: 'Extra Head', ar: 'هيد إضافي' }] });
  const addedHeads = added.customHeads ?? [];
  assert.ok(addedHeads.some((h) => h.id === 'khaled'));
  assert.ok(addedHeads.some((h) => h.id === 'extra'));
});

test('a roster added in one branch is a valid chart for the other', () => {
  const chart = chartWithExtraPeople();
  assert.ok(chart.managers.some((m) => m.id === 'hossam'));
  assert.ok(chart.sales.some((s) => s.id === 'rana'));
  assert.equal(chart.heads.find((h) => h.id === 'khaled')?.name, 'Khaled Nour');
});

// ───────────────────────── Adopting the shared chart ─────────────────────────

test('adopting the shared chart brings the new team and names into the other branch', () => {
  const shared = chartWithExtraPeople();
  const resta = {
    heads: clone(HEADS),
    managers: clone(MANAGERS),
    sales: clone(SALES),
    history: [assignment(), assignment({ id: 'a2', salesId: 'momen', salesName: "Mo'men" })],
    carryOver: carry(),
  };

  const after = applyOrgChart(resta, shared);

  // The new team and its people are here, with the manager's own row.
  assert.ok(after.managers.some((m) => m.id === 'hossam'));
  assert.deepEqual(
    after.sales.filter((s) => s.managerId === 'hossam').map((s) => [s.id, s.isManager ?? false]),
    [
      ['hossam-self', true],
      ['rana', false],
    ],
  );
  // Renamed members carry the new name here too, wherever it was copied.
  assert.equal(after.heads.find((h) => h.id === 'khaled')?.name, 'Khaled Nour');
  assert.equal(after.history[0].headName, 'Khaled Nour');
  assert.equal(after.carryOver?.headName, 'Khaled Nour');
  // RESTA's own history and queue stayed intact (same length, its own people).
  assert.equal(after.history.length, 2);
  assert.equal(after.history[1].salesName, "Mo'men");
});

test('adopting the shared chart never changes ids — attendance stays valid', () => {
  const shared = chartWithExtraPeople();
  const resta = {
    heads: clone(HEADS),
    managers: clone(MANAGERS),
    sales: clone(SALES),
    history: [],
    carryOver: null,
  };
  const attendance: Record<string, SalesState> = defaultSalesState(resta.sales);
  attendance.manar = {
    ...attendance.manar,
    status: 'available',
    checkInOrder: 1,
    walkCount: 3,
    lastServedAt: '2026-10-04T09:00:00.000Z',
  };

  const after = applyOrgChart(resta, shared);

  // Every id that existed is still there — only names/membership can change.
  const ids = new Set(after.sales.map((s) => s.id));
  clone(SALES).forEach((s) => assert.ok(ids.has(s.id), `${s.id} disappeared`));
  assert.deepEqual(Object.keys(attendance).filter((id) => !ids.has(id)), []);
  assert.equal(attendance.manar.walkCount, 3);
  // The people added in the other branch have no attendance here yet.
  assert.equal(attendance.rana, undefined);
});

test('adopting a chart that deleted someone also removes them here', () => {
  const shared = hydrateOrgChart({
    customManagers: clone(MANAGERS).filter((m) => m.id !== 'perry'),
    customSales: clone(SALES).filter((s) => s.managerId !== 'perry'),
    removedIds: ['perry', 'reem'],
  });
  const after = applyOrgChart(
    { heads: clone(HEADS), managers: clone(MANAGERS), sales: clone(SALES), history: [], carryOver: null },
    shared,
  );
  assert.equal(after.managers.some((m) => m.id === 'perry'), false);
  assert.equal(after.sales.some((s) => s.id === 'reem'), false);
  assert.ok((after.removedIds ?? []).includes('perry'));
});

test('the chart fingerprint ignores ordering noise but catches real edits', () => {
  const chart = chartWithExtraPeople();
  const shuffled = {
    ...chart,
    heads: [...chart.heads].reverse(),
    removedIds: [...chart.removedIds].reverse(),
  };
  assert.equal(orgChartKey(chart), orgChartKey(shuffled));

  const renamed = {
    ...chart,
    managers: chart.managers.map((m) => (m.id === 'hossam' ? { ...m, name: 'Hossam Adel' } : m)),
  };
  assert.notEqual(orgChartKey(chart), orgChartKey(renamed));
});

// ───────────────────────── First shared chart (migration) ─────────────────────────

test('the first shared chart keeps the members of both branches', () => {
  // SITE renamed a team; RESTA added Hala, who SITE has never heard of.
  const site = hydrateOrgChart({
    customHeads: clone(HEADS),
    customManagers: clone(MANAGERS).map((m) => (m.id === 'ahmed' ? { ...m, name: 'Ahmed Y. Kamel', ar: 'أحمد يسري كامل' } : m)),
    customSales: clone(SALES),
  });
  const resta = hydrateOrgChart({
    customHeads: clone(HEADS),
    customManagers: [...clone(MANAGERS), { id: 'hala-elfar', name: 'Hala Elfar', ar: 'هالة الفار', headId: 'wael' }],
    customSales: [
      ...clone(SALES),
      { id: 'hala-elfar-self', name: 'Hala Elfar', managerId: 'hala-elfar', headId: 'wael', isManager: true },
      { id: 'menna', name: 'Menna', managerId: 'hala-elfar', headId: 'wael' },
    ],
  });

  const seeded = mergeOrgCharts(site, resta);

  // SITE wins on names, RESTA's extra team is not dropped.
  assert.equal(seeded.managers.find((m) => m.id === 'ahmed')?.name, 'Ahmed Y. Kamel');
  assert.ok(seeded.managers.some((m) => m.id === 'hala-elfar'));
  assert.ok(seeded.sales.some((s) => s.id === 'menna'));
  assert.equal(seeded.sales.filter((s) => s.id === 'hala-elfar-self').length, 1);
  // …and the merged chart survives the normalizer (one entry per id).
  assert.equal(orgChartKey(hydrateOrgChart(seeded)), orgChartKey(seeded));
});

test('a member deleted in one branch is not resurrected by the other', () => {
  const site = hydrateOrgChart({
    customManagers: clone(MANAGERS).filter((m) => m.id !== 'perry'),
    customSales: clone(SALES).filter((s) => s.managerId !== 'perry'),
    removedIds: ['perry'],
  });
  const resta = hydrateOrgChart({ customHeads: clone(HEADS), customManagers: clone(MANAGERS), customSales: clone(SALES) });

  const seeded = mergeOrgCharts(site, resta);
  assert.equal(seeded.managers.some((m) => m.id === 'perry'), false);
  assert.ok(seeded.removedIds.includes('perry'));
  // The deletion still holds after a hydrate (defaults must not bring it back).
  assert.equal(hydrateOrgChart(seeded).managers.some((m) => m.id === 'perry'), false);
});

test('otherWorkspace maps the two branches and nothing else', () => {
  assert.equal(otherWorkspace('SITE'), 'RESTA');
  assert.equal(otherWorkspace('resta'), 'SITE');
  assert.equal(otherWorkspace('OTHER'), null);
});

// ───────────────────────── Same device, other branch ─────────────────────────

test('mirrorOrgChart copies the roster into the other branch without its data', () => {
  withMemoryLocalStorage(() => {
    setActiveAccount('SITE');
    // RESTA already has its own day: attendance + history.
    const attendance = defaultSalesState(SALES);
    attendance.manar = { ...attendance.manar, status: 'available', checkInOrder: 1, walkCount: 2 };
    savePersisted(
      {
        ...hydrate({ customHeads: clone(HEADS), customManagers: clone(MANAGERS), customSales: clone(SALES) }),
        salesState: attendance,
        history: [assignment()],
      },
      'RESTA',
    );

    const chart = chartWithExtraPeople();
    mirrorOrgChart('SITE', chart, 4242);

    const resta = loadPersisted('RESTA');
    assert.equal(resta.orgRevision, 4242);
    assert.ok((resta.customManagers ?? []).some((m) => m.id === 'hossam'));
    assert.equal((resta.customHeads ?? []).find((h) => h.id === 'khaled')?.name, 'Khaled Nour');
    // RESTA's own attendance and history are untouched (walkCount is always
    // rebuilt from the history, so the check-in state is what proves it).
    assert.equal(resta.history.length, 1);
    assert.equal(resta.salesState.manar?.status, 'available');
    assert.equal(resta.salesState.manar?.checkInOrder, 1);
  });
});

test('a chart round-trips through save/load (as the cloud row does)', () => {
  withMemoryLocalStorage(() => {
    const chart = chartWithExtraPeople();
    const stored = { ...hydrate({}), customHeads: chart.heads, customManagers: chart.managers, customSales: chart.sales, removedIds: chart.removedIds };
    savePersisted(stored, 'SITE');

    const loaded = loadPersisted('SITE');
    assert.equal(
      orgChartKey(hydrateOrgChart({ customHeads: loaded.customHeads, customManagers: loaded.customManagers, customSales: loaded.customSales, removedIds: loaded.removedIds })),
      orgChartKey(chart),
    );
  });
});

// ───────────────── Turn-order settings riding the shared chart ─────────────────

import { DEFAULT_TEAM_CYCLE, normalizeTeamCycle } from './walkin.ts';
import type { TeamCycleSettings } from './walkin.ts';

test('the chosen turn order travels with the shared chart, its fingerprint, and mirrors', () => {
  const cycle: TeamCycleSettings = { mode: 'custom', order: ['hossam', 'ahmed'] };
  const chart = { ...chartWithExtraPeople(), cycle };
  const key = orgChartKey(chart);

  // Normalizing (as the cloud row does) keeps the exact settings.
  const normalized = hydrateOrgChart(chart);
  assert.deepEqual(normalized.cycle, cycle);
  assert.equal(orgChartKey(normalized), key);
  // A cycle-only edit is a real edit — the other branch must adopt it.
  assert.notEqual(orgChartKey({ ...chart, cycle: DEFAULT_TEAM_CYCLE }), key);
  // A chart written before the setting existed reads as the automatic cycle.
  assert.deepEqual(hydrateOrgChart({ ...chartWithExtraPeople(), cycle: undefined }).cycle, DEFAULT_TEAM_CYCLE);

  withMemoryLocalStorage(() => {
    setActiveAccount('SITE');
    mirrorOrgChart('SITE', normalized, 4242);
    // Switching branch on the same device shows the same rotation order.
    assert.deepEqual(loadPersisted('RESTA').teamCycle, cycle);
    setActiveAccount('');
  });
});

test('adopting and merging shared charts carries the turn-order settings', () => {
  const cycle: TeamCycleSettings = { mode: 'custom', order: ['hossam'] };
  const shared = { ...chartWithExtraPeople(), cycle };
  const resta = {
    heads: clone(HEADS),
    managers: clone(MANAGERS),
    sales: clone(SALES),
    history: [],
    carryOver: null,
  };

  const after = applyOrgChart(resta, shared);
  assert.deepEqual(after.cycle, cycle);
  // The shared chart is the source of truth: a row without a custom choice
  // (normalized to the automatic cycle) resets the branch to it as well.
  const auto = applyOrgChart({ ...resta, cycle }, chartWithExtraPeople());
  assert.deepEqual(auto.cycle, DEFAULT_TEAM_CYCLE);

  // The first shared chart is seeded from both branches — this device wins.
  const site = hydrateOrgChart({ customHeads: clone(HEADS), customManagers: clone(MANAGERS), customSales: clone(SALES) });
  const seeded = mergeOrgCharts({ ...site, cycle }, site);
  assert.deepEqual(seeded.cycle, cycle);
  assert.deepEqual(normalizeTeamCycle(undefined), DEFAULT_TEAM_CYCLE);
});
