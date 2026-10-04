import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADS,
  MANAGERS,
  SALES,
  availableTeamMembers,
  computeNextTeam,
  defaultSalesState,
} from './walkin.ts';
import type { Assignment, CarryOver, SalesState } from './walkin.ts';
import {
  isManagerRow,
  managerSelfId,
  renameHead,
  renameManager,
  renameSalesPerson,
} from './org.ts';
import type { OrgState } from './org.ts';

const clone = <T,>(value: T): T => structuredClone(value);

function org(over: Partial<OrgState> = {}): OrgState {
  return {
    heads: clone(HEADS),
    managers: clone(MANAGERS),
    sales: clone(SALES),
    history: [],
    carryOver: null,
    ...over,
  };
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

// ───────────────────────────── Heads ─────────────────────────────

test('renameHead rewrites the name wherever it was copied — IDs never change', () => {
  const before = org({
    history: [
      assignment({ headId: 'khaled', headName: 'Khaled Youssef' }),
      assignment({ id: 'a2', headId: 'wael', headName: 'Wael El Desoky' }),
    ],
    carryOver: carry({ headId: 'khaled' }),
  });

  const after = renameHead(before, 'khaled', 'Khaled Y. Nour', 'خالد يوسف نور');

  assert.deepEqual(
    after.heads.find((h) => h.id === 'khaled'),
    { id: 'khaled', name: 'Khaled Y. Nour', ar: 'خالد يوسف نور' },
  );
  assert.equal(after.heads.length, before.heads.length);
  // Other heads, managers and the whole roster stay untouched.
  assert.deepEqual(after.managers, before.managers);
  assert.deepEqual(after.sales, before.sales);
  assert.deepEqual(after.heads.filter((h) => h.id !== 'khaled'), before.heads.filter((h) => h.id !== 'khaled'));

  // History of that head follows the new name; the other head's stays.
  assert.equal(after.history[0].headName, 'Khaled Y. Nour');
  assert.equal(after.history[0].headId, 'khaled');
  assert.equal(after.history[1].headName, 'Wael El Desoky');

  // Yesterday's carry-over label follows too (IDs were already correct).
  assert.equal(after.carryOver?.headName, 'Khaled Y. Nour');
  assert.equal(after.carryOver?.headId, 'khaled');
});

test('renameHead keeps the Arabic name when omitted, falls back to Latin when cleared', () => {
  const ar = (state: OrgState) => state.heads.find((h) => h.id === 'wael')?.ar;
  // Only the Latin name is edited → the Arabic label survives.
  assert.equal(ar(renameHead(org(), 'wael', 'Wael D.')), 'وائل الدسوقي');
  // The Arabic field was cleared → the Latin name is used (never an empty label).
  assert.equal(ar(renameHead(org(), 'wael', 'Wael D.', '')), 'Wael D.');
  assert.equal(ar(renameHead(org(), 'wael', 'Wael D.', '   ')), 'Wael D.');
});

test('renameHead is a no-op for unknown IDs, blank names and unchanged values', () => {
  const before = org();
  assert.equal(renameHead(before, 'does-not-exist', 'X'), before);
  assert.equal(renameHead(before, 'khaled', '   '), before);
  assert.equal(renameHead(before, 'khaled', 'Khaled Youssef', 'خالد يوسف'), before);
});

// ──────────────────────────── Managers ────────────────────────────

test('renameManager renames the team and his own row — team members keep their names', () => {
  const before = org({
    history: [
      // A member of Ahmed's team served a client.
      assignment({ salesId: 'manar', salesName: 'Manar' }),
      // The manager himself covered (substitute) — his own row.
      assignment({
        id: 'a2',
        salesId: 'ahmed-yossry',
        salesName: 'Ahmed Yossry',
        substituted: true,
        originalSalesName: 'Manar',
      }),
    ],
    carryOver: carry({ managerId: 'ahmed' }),
  });

  const after = renameManager(before, 'ahmed', 'Ahmed Yossry Kamel', 'أحمد يسري كامل');

  assert.deepEqual(after.managers.find((m) => m.id === 'ahmed'), {
    id: 'ahmed',
    name: 'Ahmed Yossry Kamel',
    ar: 'أحمد يسري كامل',
    headId: 'khaled',
  });
  // The manager's own attendance row carries the same name (id untouched).
  assert.equal(after.sales.find((s) => s.id === 'ahmed-yossry')?.name, 'Ahmed Yossry Kamel');
  assert.equal(after.sales.find((s) => s.id === 'ahmed-yossry')?.id, 'ahmed-yossry');
  // Team members are NOT renamed.
  assert.equal(after.sales.find((s) => s.id === 'manar')?.name, 'Manar');
  assert.equal(after.sales.length, before.sales.length);

  // Served turns show the corrected manager name; the member's name is intact.
  assert.equal(after.history[0].managerName, 'Ahmed Yossry Kamel');
  assert.equal(after.history[0].salesName, 'Manar');
  assert.equal(after.history[1].salesName, 'Ahmed Yossry Kamel');
  assert.equal(after.history[1].originalSalesName, 'Manar');
  assert.equal(after.carryOver?.managerName, 'Ahmed Yossry Kamel');
});

test('renameManager works for a manager whose sales row uses the manager id', () => {
  const after = renameManager(org(), 'tarek-osman', 'Tarek Osman Ali', 'طارق عثمان علي');
  assert.equal(after.managers.find((m) => m.id === 'tarek-osman')?.name, 'Tarek Osman Ali');
  assert.equal(after.sales.find((s) => s.id === 'tarek-osman')?.name, 'Tarek Osman Ali');
  assert.equal(after.sales.find((s) => s.id === 'tarek-osman')?.isManager, true);
});

test('renameSalesPerson on a manager row keeps the team name in sync', () => {
  const after = renameSalesPerson(org(), 'rewaida-self', 'Rewaida Hassan');
  assert.equal(after.managers.find((m) => m.id === 'rewaida')?.name, 'Rewaida Hassan');
  assert.equal(after.sales.find((s) => s.id === 'rewaida-self')?.name, 'Rewaida Hassan');
  // Arabic label of the team is preserved when only the Latin name changes.
  assert.equal(after.managers.find((m) => m.id === 'rewaida')?.ar, 'رويدا');
  assert.equal(managerSelfId('rewaida'), 'rewaida-self');
  assert.equal(isManagerRow(org().managers, after.sales.find((s) => s.id === 'rewaida-self')!), true);
});

// ───────────────────────────── Sales ─────────────────────────────

test('renameSalesPerson keeps the id, the counters and the rotation slot', () => {
  const before = org({
    history: [
      assignment({ salesId: 'manar', salesName: 'Manar' }),
      assignment({ id: 'a2', salesId: 'momen', salesName: "Mo'men" }),
    ],
  });
  const state: Record<string, SalesState> = defaultSalesState(SALES);
  state.manar = {
    status: 'available',
    checkInOrder: 1,
    checkInTime: '2026-10-04T07:00:00.000Z',
    walkCount: 4,
    lastServedAt: '2026-10-04T09:00:00.000Z',
  };

  const after = renameSalesPerson(before, 'manar', 'Manar Adel');

  assert.equal(after.sales.find((s) => s.id === 'manar')?.name, 'Manar Adel');
  assert.equal(after.sales.find((s) => s.id === 'manar')?.managerId, 'ahmed');
  assert.equal(after.history[0].salesName, 'Manar Adel');
  assert.equal(after.history[1].salesName, "Mo'men");

  // Every attendance key is still a valid member id — nothing was lost.
  const ids = new Set(after.sales.map((s) => s.id));
  assert.deepEqual(Object.keys(state).sort(), SALES.map((s) => s.id).sort());
  assert.ok(Object.keys(state).every((id) => ids.has(id)));
  assert.equal(state.manar.walkCount, 4);
  // The renamed person is still the first pick of his own team.
  assert.deepEqual(
    availableTeamMembers('ahmed', state, after.sales).map((s) => s.name)[0],
    'Manar Adel',
  );
});

test('renameSalesPerson also fixes a carry-over that pins the same person', () => {
  const before = org({ carryOver: carry({ salesId: 'manar' }) });
  const after = renameSalesPerson(before, 'manar', 'Manar Adel');
  assert.equal(after.carryOver?.salesName, 'Manar Adel');
  assert.equal(after.carryOver?.salesId, 'manar');
  assert.equal(after.carryOver?.managerName, 'Ahmed Yossry');
});

test('renameSalesPerson is a no-op for unknown IDs / blank names', () => {
  const before = org();
  assert.equal(renameSalesPerson(before, 'nobody', 'X'), before);
  assert.equal(renameSalesPerson(before, 'manar', '  '), before);
  assert.equal(renameSalesPerson(before, 'manar', 'Manar'), before);
});

// ───────────────── Integration with the team cycle ─────────────────

test('a renamed team is still the same slot of the fixed SITE/RESTA cycle', () => {
  const renamed = renameManager(org(), 'ahmed', 'Ahmed Yossry Kamel', 'أحمد يسري كامل');
  const state: Record<string, SalesState> = defaultSalesState(renamed.sales);
  Object.values(state).forEach((s) => {
    s.status = 'available';
    if (s.checkInOrder === null) s.checkInOrder = 1;
  });

  const turn = computeNextTeam(state, [], renamed.managers, renamed.sales, renamed.heads, {
    workspace: 'SITE',
  });
  assert.equal(turn?.managerId, 'ahmed');
  assert.equal(turn?.managerName, 'Ahmed Yossry Kamel');
  assert.ok(availableTeamMembers('ahmed', state, renamed.sales).some((s) => s.name === 'Manar'));
});
