import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTOMATIC_TEAM_ORDER,
  HEADS,
  MANAGERS,
  SALES,
  carryOverForNewDay,
  carryOverTurn,
  computeNextTurn,
  createNewDaySalesState,
  defaultSalesState,
  loadPersisted,
  predictFullRound,
  savePersisted,
  setActiveAccount,
} from './walkin.ts';
import type {
  Assignment,
  CarryOver,
  ComputedTurn,
  HeadGroup,
  ManagerTeam,
  PersistedWalkin,
  RotationOptions,
  SalesPerson,
  SalesState,
} from './walkin.ts';

const HALA = 'custom-hala-913';
const DINA = 'custom-dina-247';
const CYCLE = ['ahmed', 'rewaida', 'shehata', 'perry', HALA, DINA];
const WORKSPACES = ['RESTA', 'SITE'] as const;

interface Fixture {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  state: Record<string, SalesState>;
}

// Use saved/custom team IDs, shuffled org order and reverse attendance priority.
// Perry and Tarek remain in the org to ensure the fixed cycle leaves shared data alone.
function fixture(membersPerTeam = 1): Fixture {
  const heads = structuredClone(HEADS);
  const managers: ManagerTeam[] = [
    ...structuredClone(MANAGERS),
    { id: HALA, name: 'Hala El Far', ar: 'هالة الفار', headId: 'wael' },
    { id: DINA, name: 'Dina Abdo', ar: 'دينا عبده', headId: 'mohamed-samir' },
  ].reverse();
  const sales: SalesPerson[] = managers.flatMap((m) => [
    { id: `${m.id}-self`, name: m.name, managerId: m.id, headId: m.headId, isManager: true },
    ...Array.from({ length: membersPerTeam }, (_, i) => ({
      id: `${m.id}-member-${i + 1}`,
      name: `${m.name} member ${i + 1}`,
      managerId: m.id,
      headId: m.headId,
    })),
  ]);
  const state = Object.fromEntries(sales.map((s, i) => [s.id, {
    status: 'available' as const,
    checkInOrder: i + 1,
    checkInTime: '2026-09-30T08:00:00.000Z',
    walkCount: 0,
    coverCount: 0,
    lastServedAt: null,
  }]));
  return { heads, managers, sales, state };
}

function assignment(turn: ComputedTurn, n = 1): Assignment {
  return {
    id: `assignment-${n}`,
    n,
    salesId: turn.salesId,
    salesName: turn.salesName,
    managerId: turn.managerId,
    managerName: turn.managerName,
    headId: turn.headId,
    headName: turn.headName,
    time: '2026-09-30T09:00:00.000Z',
    clientLabel: '',
    substituted: false,
  };
}

function teamHistory(f: Fixture, managerId: string): Assignment {
  const person = f.sales.find((s) => s.managerId === managerId && !s.isManager)!;
  const manager = f.managers.find((m) => m.id === managerId)!;
  return {
    id: 'previous-turn',
    n: 1,
    salesId: person.id,
    salesName: person.name,
    managerId,
    managerName: manager.name,
    headId: person.headId,
    headName: f.heads.find((h) => h.id === person.headId)!.name,
    time: '2026-09-29T16:00:00.000Z',
    clientLabel: '',
    substituted: false,
  };
}

function carry(f: Fixture, managerId = 'rewaida'): CarryOver {
  const previous = teamHistory(f, managerId);
  return {
    salesId: previous.salesId,
    salesName: previous.salesName,
    managerId: previous.managerId,
    managerName: previous.managerName,
    headId: previous.headId,
    headName: previous.headName,
    fromDate: previous.time,
  };
}

function next(
  f: Fixture,
  history: Assignment[] = [],
  options: RotationOptions = {},
  excludeIds: string[] = [],
  startingHead = 'khaled',
): ComputedTurn | null {
  return computeNextTurn(f.state, history, startingHead, excludeIds, f.heads, f.managers, f.sales, {
    workspace: 'RESTA',
    ...options,
  });
}

function round(f: Fixture, seed?: ComputedTurn | null, options: RotationOptions = {}): ComputedTurn[] {
  return predictFullRound(f.state, [], 'khaled', seed, f.heads, f.managers, f.sales, {
    workspace: 'RESTA',
    ...options,
  });
}

function setTeamStatus(f: Fixture, managerId: string, status: SalesState['status']): void {
  f.sales.filter((s) => s.managerId === managerId && !s.isManager).forEach((s) => {
    f.state[s.id].status = status;
  });
}

test('one shared team-order source defines the requested order', () => {
  assert.deepEqual(AUTOMATIC_TEAM_ORDER, [
    { id: 'ahmed', name: 'Ahmed Yossry' },
    { id: 'rewaida', name: 'Rewaida' },
    { id: 'shehata', name: 'Youssef Shehata' },
    { id: 'perry', name: 'Perry' },
    { id: 'hala-elfar', name: 'Hala Elfar' },
    { id: 'dina-abdo', name: 'Dina Abdo' },
  ]);
});

test('RESTA and SITE start with Ahmed and use the same fixed order despite check-in/org order', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    assert.equal(next(f, [], { workspace }, [], 'mohamed-samir')?.managerId, 'ahmed');
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), CYCLE);
  }
});

test('RESTA and SITE repeat the six-team cycle across actual assignments', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const history: Assignment[] = [];
    const actual: string[] = [];
    for (let i = 0; i < CYCLE.length * 3; i++) {
      const turn = next(f, history, { workspace });
      assert.ok(turn);
      actual.push(turn.managerId);
      history.push(assignment(turn, i + 1));
      f.state[turn.salesId].walkCount += 1;
    }
    assert.deepEqual(actual, [...CYCLE, ...CYCLE, ...CYCLE]);
  }
});

test('full-round prediction uses the same cycle and never repeats a sales person', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const predicted = round(f, next(f, [], { workspace }), { workspace });
    assert.deepEqual(predicted.map((t) => t.managerId), [...CYCLE, ...CYCLE]);
    assert.equal(new Set(predicted.map((t) => t.salesId)).size, CYCLE.length * 2);
  }
});

test('each team is followed by its fixed successor, including Dina back to Ahmed', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((managerId, i) => {
      assert.equal(
        next(f, [teamHistory(f, managerId)], { workspace })?.managerId,
        CYCLE[(i + 1) % CYCLE.length],
      );
    });
  }
});

test('a Rewaida carry-over continues through Shehata, Perry, Hala and Dina to Ahmed; a Dina one wraps to Ahmed first', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const rew = carry(f, 'rewaida');
    const rewPinned = carryOverTurn(rew, f.state, f.heads, f.managers, f.sales)!;
    assert.deepEqual(
      round(f, rewPinned, { workspace, carryOver: rew }).map((t) => t.managerId),
      ['rewaida', 'shehata', 'perry', HALA, DINA, 'ahmed'],
    );
    const dina = carry(f, DINA);
    const dinaPinned = carryOverTurn(dina, f.state, f.heads, f.managers, f.sales)!;
    assert.deepEqual(
      round(f, dinaPinned, { workspace, carryOver: dina }).map((t) => t.managerId),
      [DINA, 'ahmed', 'rewaida', 'shehata', 'perry', HALA],
    );
  }
});

test('each of the six carried teams starts the next day before its successor in both workspaces', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((managerId, i) => {
      const pending = carry(f, managerId);
      const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
      const predicted = round(f, pinned, { workspace, carryOver: pending });
      const expected = Array.from({ length: CYCLE.length }, (_, offset) =>
        CYCLE[(i + offset) % CYCLE.length]);
      assert.deepEqual(predicted.map((t) => t.managerId), expected, `${workspace}: ${managerId}`);
      assert.equal(predicted[0].salesId, pending.salesId);
      assert.equal(predicted.filter((t) => t.salesId === pending.salesId).length, 1);
    });
  }
});

test('an Ahmed carry-over is followed by Rewaida, and a Rewaida carry-over by Youssef', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    for (const [owner, successor] of [['ahmed', 'rewaida'], ['rewaida', 'shehata']] as const) {
      const pending = carry(f, owner);
      const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
      const predicted = round(f, pinned, { workspace, carryOver: pending });
      assert.equal(predicted[0].managerId, owner);
      assert.equal(predicted[1].managerId, successor);
    }
  }
});

test('a carried person is pinned once and is never repeated in the predicted queue', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const pending = carry(f, 'rewaida');
    const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
    const predicted = round(f, pinned, { workspace, carryOver: pending });
    assert.equal(predicted[0].salesId, pending.salesId);
    assert.equal(predicted.filter((t) => t.salesId === pending.salesId).length, 1);
    assert.equal(new Set(predicted.map((t) => t.salesId)).size, predicted.length);
    assert.equal(predicted.length, CYCLE.length * 2);
  }
});

test('an absent carried person remains first and then the cycle continues from that team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    f.state[pending.salesId].status = 'absent';
    const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
    const predicted = round(f, pinned, { workspace, carryOver: pending });
    assert.equal(predicted[0].salesId, pending.salesId);
    assert.deepEqual(predicted.map((t) => t.managerId), ['rewaida', 'shehata', 'perry', HALA, DINA, 'ahmed']);
  }
});

test('a same-team substitute consumes the carried slot and the next team follows', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const previous = teamHistory(f, 'rewaida');
    previous.salesId = 'rewaida-member-2';
    previous.substituted = true;
    f.state[previous.salesId].status = 'busy';
    assert.equal(next(f, [previous], { workspace, carryOver: carry(f) })?.managerId, 'shehata');
  }
});

test('skipping an absent carried person continues after their team without using Head order', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    const options = { workspace, carryOver: pending, skippedIds: [pending.salesId] };
    assert.equal(next(f, [], options)?.managerId, 'shehata');
    assert.deepEqual(round(f, next(f, [], options), options).map((t) => t.managerId), [
      'shehata', 'perry', HALA, DINA, 'ahmed',
    ]);
  }
});

test('an unrelated assignment does not consume an unserved carry-over at day rollover', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    const unrelated = teamHistory(f, 'perry');
    const laterTurn = next(f, [unrelated], { workspace, carryOver: pending });
    assert.equal(laterTurn?.managerId, HALA);
    const rolled = carryOverForNewDay(pending, laterTurn, [unrelated], f.heads, workspace, 'new-day');
    assert.equal(rolled?.salesId, pending.salesId);
    const fresh = createNewDaySalesState(workspace, f.sales);
    const stillPinned = carryOverTurn(rolled, fresh, f.heads, f.managers, f.sales);
    assert.equal(stillPinned?.salesId, pending.salesId);
  }
});

test('a newly pending turn, not the last person served, is carried into the next day', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((previousTeam, index) => {
      const history = [teamHistory(f, previousTeam)];
      const pending = next(f, history, { workspace });
      assert.equal(pending?.managerId, CYCLE[(index + 1) % CYCLE.length]);
      const rolled = carryOverForNewDay(null, pending, history, f.heads, workspace, 'new-day');
      assert.equal(rolled?.managerId, CYCLE[(index + 1) % CYCLE.length]);
      assert.notEqual(rolled?.salesId, history[0].salesId);
    });
  }
});

test('team-only carry cursors resume after the previous team when nobody is available', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const previous = teamHistory(f, 'rewaida');
    const cursor = carryOverForNewDay(null, null, [previous], f.heads, workspace, 'new-day')!;
    assert.equal(cursor.salesId, '');
    assert.equal(next(f, [], { workspace, carryOver: cursor })?.managerId, 'shehata');
    assert.equal(carryOverTurn(cursor, f.state, f.heads, f.managers, f.sales), null);
  }
});

test('a team-only cursor survives an empty day without creating a phantom turn', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const cursor = { ...carry(f, 'rewaida'), salesId: '', salesName: '' };
    const rolled = carryOverForNewDay(cursor, null, [], f.heads, workspace, 'new-day');
    assert.deepEqual(rolled, cursor);
    assert.equal(carryOverTurn(rolled, f.state, f.heads, f.managers, f.sales), null);
  }
});

test('a team served today supersedes an older team-only carry cursor', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pendingCursor = { ...carry(f, 'ahmed'), salesId: '', salesName: '' };
    assert.equal(next(f, [teamHistory(f, HALA)], { workspace, carryOver: pendingCursor })?.managerId, DINA);
  }
});

test('unavailable teams are skipped without changing the order of the remaining cycle', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    setTeamStatus(f, 'shehata', 'absent');
    const withoutShehata = CYCLE.filter((id) => id !== 'shehata');
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), [
      ...withoutShehata,
      ...withoutShehata,
    ]);
  }
});

test('multiple unavailable teams are skipped while preserving Dina-to-Ahmed wraparound', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, HALA, 'absent');
    setTeamStatus(f, DINA, 'busy');
    assert.equal(next(f, [teamHistory(f, 'shehata')], { workspace })?.managerId, 'perry');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, 'ahmed');
    assert.equal(next(f, [teamHistory(f, DINA)], { workspace })?.managerId, 'ahmed');
  }
});

test('a returning team member becomes eligible in the original team slot', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, HALA, 'busy');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, DINA);
    setTeamStatus(f, HALA, 'available');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, HALA);
  }
});

test('explicitly excluded people are skipped in current-turn and full-round calculations', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const skippedIds = ['shehata-member-1', `${HALA}-member-1`];
    assert.equal(next(f, [teamHistory(f, 'rewaida')], { workspace }, skippedIds)?.managerId, 'perry');
    assert.deepEqual(round(f, undefined, { workspace, skippedIds }).map((t) => t.managerId), [
      'ahmed', 'rewaida', 'perry', DINA,
    ]);
  }
});

test('all availability subsets preserve the fixed order from every cycle position in both workspaces', () => {
  for (const workspace of WORKSPACES) {
    for (let mask = 0; mask < 1 << CYCLE.length; mask++) {
      for (let previous = -1; previous < CYCLE.length; previous++) {
        const f = fixture();
        CYCLE.forEach((id, i) => setTeamStatus(f, id, mask & (1 << i) ? 'available' : 'absent'));
        const history = previous < 0 ? [] : [teamHistory(f, CYCLE[previous])];
        const expected = Array.from({ length: CYCLE.length }, (_, offset) =>
          (previous + 1 + offset) % CYCLE.length)
          .filter((index) => mask & (1 << index))
          .map((index) => CYCLE[index]);
        assert.equal(
          next(f, history, { workspace })?.managerId ?? null,
          expected[0] ?? null,
          `${workspace}: mask=${mask}, previous=${previous}`,
        );
        const predicted = predictFullRound(f.state, history, 'khaled', undefined, f.heads, f.managers, f.sales, {
          workspace,
        });
        assert.deepEqual(
          predicted.map((t) => t.managerId),
          expected,
          `${workspace}: mask=${mask}, previous=${previous}`,
        );
      }
    }
  }
});

test('within a team, fewer own turns precede attendance priority', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    f.state['ahmed-member-1'].walkCount = 2;
    f.state['ahmed-member-2'].walkCount = 0;
    assert.equal(next(f, [], { workspace })?.salesId, 'ahmed-member-2');
    f.state['ahmed-member-1'].walkCount = 0;
    assert.equal(next(f, [], { workspace })?.salesId, 'ahmed-member-1');
  }
});

test('attendance counts and other teams check-in order cannot change fixed team order', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    f.state['ahmed-member-1'].walkCount = 99;
    f.state['ahmed-member-1'].coverCount = 100;
    f.state['ahmed-member-1'].checkInOrder = 1000;
    assert.equal(next(f, [], { workspace })?.managerId, 'ahmed');
  }
});

test('managers remain attendance-only and do not make an unavailable team eligible', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, HALA, 'absent');
    assert.equal(f.state[`${HALA}-self`].status, 'available');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, DINA);
    assert.ok(round(f, undefined, { workspace }).every((t) => !f.sales.find((s) => s.id === t.salesId)?.isManager));
  }
});

test('only the six configured teams participate; a missing custom team is safely skipped', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((id) => setTeamStatus(f, id, 'absent'));
    assert.equal(next(f, [], { workspace }), null);
    assert.deepEqual(round(f, undefined, { workspace }), []);

    const withMissing = fixture();
    withMissing.managers = withMissing.managers.filter((m) => m.id !== HALA);
    withMissing.sales = withMissing.sales.filter((s) => s.managerId !== HALA);
    assert.deepEqual(round(withMissing, undefined, { workspace }).map((t) => t.managerId), [
      'ahmed', 'rewaida', 'shehata', 'perry', DINA,
    ]);
  }
});

test('a removed last-served custom team still anchors the cycle by its saved name', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const previous = teamHistory(f, HALA);
    f.managers = f.managers.filter((m) => m.id !== HALA);
    f.sales = f.sales.filter((s) => s.managerId !== HALA);
    assert.equal(next(f, [previous], { workspace })?.managerId, DINA);
  }
});

test('one available team can take successive turns without an infinite loop', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    CYCLE.filter((id) => id !== 'rewaida').forEach((id) => setTeamStatus(f, id, 'absent'));
    assert.equal(next(f, [teamHistory(f, 'rewaida')], { workspace })?.managerId, 'rewaida');
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), ['rewaida', 'rewaida']);
  }
});

test('empty or all-busy data produces no automatic turn', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    Object.values(f.state).forEach((s) => { s.status = 'busy'; });
    assert.equal(next(f, [], { workspace }), null);
    assert.deepEqual(round(f, undefined, { workspace }), []);
  }
  assert.equal(computeNextTurn({}, [], 'khaled', [], [], [], [], { workspace: 'SITE' }), null);
});

test('custom team IDs and name variants resolve without relying on Heads', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    f.managers.forEach((m) => {
      if (m.id === HALA) m.name = '  hALA  ELfar  ';
      if (m.id === DINA) m.name = ' DINA   ABDO ';
      m.headId = 'khaled';
    });
    f.sales.forEach((s) => { s.headId = 'khaled'; });
    f.heads = [];
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), CYCLE);
    assert.equal(next(f, [], { workspace }, [], 'mohamed-samir')?.managerId, 'ahmed');
  }
});

test('unrelated historical teams do not move the fixed-cycle cursor', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    assert.equal(
      next(f, [teamHistory(f, 'rewaida'), teamHistory(f, 'tarek-osman')], { workspace })?.managerId,
      'shehata',
    );
  }
});

test('RESTA/SITE new-day attendance resets retain custom members without changing the org', () => {
  const f = fixture();
  const sharedOrg = structuredClone({ HEADS, MANAGERS, SALES });
  for (const workspace of WORKSPACES) {
    const fresh = createNewDaySalesState(workspace, f.sales);
    assert.deepEqual(Object.keys(fresh).sort(), f.sales.map((s) => s.id).sort());
    assert.equal(fresh[`${HALA}-member-1`].status, 'absent');
    assert.equal(fresh[`${DINA}-member-1`].walkCount, 0);
    assert.equal(fresh[`${HALA}-member-1`].checkInOrder, null);
  }
  assert.deepEqual({ HEADS, MANAGERS, SALES }, sharedOrg);
  assert.deepEqual(Object.keys(defaultSalesState()).sort(), SALES.map((s) => s.id).sort());
});

test('rotation and predictions never mutate attendance, history, carry-over, or org arrays', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const history = [teamHistory(f, 'rewaida')];
    const pending = carry(f);
    const before = structuredClone({ f, history, pending });
    const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales);
    next(f, history, { workspace, carryOver: pending });
    round(f, pinned, { workspace, carryOver: pending });
    assert.deepEqual({ f, history, pending }, before);
  }
});

test('unspecified and unrelated workspaces retain their original Head × Head behavior', () => {
  const f = fixture();
  const expected = ['perry', HALA, 'rewaida', DINA, 'ahmed', 'shehata', 'tarek-osman'];
  for (const workspace of [undefined, 'OTHER']) {
    const options = { workspace, carryOver: carry(f), skippedIds: ['perry-member-1'] };
    const current = computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales, options);
    assert.equal(current?.managerId, 'perry');
    const predicted = predictFullRound(f.state, [], 'khaled', undefined, f.heads, f.managers, f.sales, options);
    assert.deepEqual(predicted.map((t) => t.managerId), expected);
  }
});

function withMemoryLocalStorage<T>(run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('SITE and RESTA keep histories, carried turns, manual orders, and storage independent', () => {
  withMemoryLocalStorage(() => {
    const f = fixture();
    const sitePending = carry(f, 'rewaida');
    const restaPending = carry(f, DINA);
    const site: PersistedWalkin = {
      salesState: f.state,
      history: [teamHistory(f, 'ahmed')],
      counter: 1,
      seq: 1,
      startingHead: 'khaled',
      carryOver: sitePending,
      lastResetAt: null,
      customHeads: f.heads,
      customManagers: f.managers,
      customSales: f.sales,
      manualOrder: ['site-manual-order'],
      skippedIds: [],
      undoStack: [],
    };
    const resta: PersistedWalkin = {
      ...site,
      history: [teamHistory(f, HALA)],
      counter: 7,
      seq: 7,
      carryOver: restaPending,
      manualOrder: ['resta-manual-order'],
    };
    savePersisted(site, 'SITE');
    savePersisted(resta, 'RESTA');

    const loadedSite = loadPersisted('SITE');
    const loadedResta = loadPersisted('RESTA');
    assert.equal(loadedSite.history[0].managerId, 'ahmed');
    assert.equal(loadedResta.history[0].managerId, HALA);
    assert.equal(loadedSite.carryOver?.managerId, 'rewaida');
    assert.equal(loadedResta.carryOver?.managerId, DINA);
    assert.deepEqual(loadedSite.manualOrder, ['site-manual-order']);
    assert.deepEqual(loadedResta.manualOrder, ['resta-manual-order']);

    setActiveAccount('SITE');
    assert.equal(loadPersisted().carryOver?.managerId, 'rewaida');
    setActiveAccount('RESTA');
    assert.equal(loadPersisted().carryOver?.managerId, DINA);
    setActiveAccount('');
  });
});

test('active storage account never selects rotation policy; workspace context is explicit', () => {
  const f = fixture();
  setActiveAccount('RESTA');
  try {
    assert.equal(computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales)?.managerId, 'perry');
    assert.equal(next(f)?.managerId, 'ahmed');
    assert.equal(next(f, [], { workspace: 'SITE' })?.managerId, 'ahmed');
  } finally {
    setActiveAccount('');
  }
});
