import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADS,
  MANAGERS,
  SALES,
  carryOverTurn,
  computeNextTurn,
  defaultSalesState,
  predictFullRound,
  setActiveAccount,
} from './walkin.ts';
import type {
  Assignment,
  CarryOver,
  ComputedTurn,
  HeadGroup,
  ManagerTeam,
  RotationOptions,
  SalesPerson,
  SalesState,
} from './walkin.ts';

const HALA = 'custom-hala-913';
const DINA = 'custom-dina-247';
const CYCLE = ['ahmed', 'shehata', 'rewaida', HALA, DINA];

interface Fixture {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  state: Record<string, SalesState>;
}

// Use saved/custom team IDs, shuffled org order and reverse attendance priority.
// Perry and Tarek remain in the org to ensure RESTA does not change shared data.
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

test('RESTA starts with Ahmed, regardless of attendance and org array order', () => {
  const f = fixture();
  assert.equal(next(f)?.managerId, 'ahmed');
  assert.deepEqual(round(f).map((t) => t.managerId), CYCLE);
});

test('RESTA repeats the five-team cycle across actual assignments', () => {
  const f = fixture(2);
  const history: Assignment[] = [];
  const actual: string[] = [];
  for (let i = 0; i < 15; i++) {
    const turn = next(f, history)!;
    assert.ok(turn);
    actual.push(turn.managerId);
    history.push(assignment(turn, i + 1));
    f.state[turn.salesId].walkCount += 1;
  }
  assert.deepEqual(actual, [...CYCLE, ...CYCLE, ...CYCLE]);
});

test('RESTA full-round prediction follows the same cycle and never repeats a person', () => {
  const f = fixture(2);
  const predicted = round(f, next(f));
  assert.deepEqual(predicted.map((t) => t.managerId), [...CYCLE, ...CYCLE]);
  assert.equal(new Set(predicted.map((t) => t.salesId)).size, 10);
});

test('each of the five teams is followed by its fixed successor, including wraparound', () => {
  const f = fixture();
  CYCLE.forEach((managerId, i) => {
    assert.equal(next(f, [teamHistory(f, managerId)])?.managerId, CYCLE[(i + 1) % CYCLE.length]);
  });
});

test('a present Rewaida carry-over is first, immediately followed by Hala', () => {
  const f = fixture(2);
  const pending = carry(f);
  const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
  const predicted = round(f, pinned, { carryOver: pending });
  assert.equal(predicted[0].salesId, pending.salesId);
  assert.deepEqual(predicted.map((t) => t.managerId), [
    'rewaida', HALA, DINA, 'ahmed', 'shehata',
    'rewaida', HALA, DINA, 'ahmed', 'shehata',
  ]);
  assert.equal(predicted.filter((t) => t.salesId === pending.salesId).length, 1);
});

test('an absent Rewaida carry-over remains pinned before Hala', () => {
  const f = fixture();
  const pending = carry(f);
  f.state[pending.salesId].status = 'absent';
  const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales)!;
  assert.equal(pinned.salesId, pending.salesId);
  assert.deepEqual(round(f, pinned, { carryOver: pending }).map((t) => t.managerId), [
    'rewaida', HALA, DINA, 'ahmed', 'shehata',
  ]);
});

test('a same-team substitute consumes Rewaida’s slot and Hala follows', () => {
  const f = fixture(2);
  const previous = teamHistory(f, 'rewaida');
  previous.salesId = 'rewaida-member-2';
  previous.substituted = true;
  f.state[previous.salesId].status = 'busy';
  assert.equal(next(f, [previous], { carryOver: carry(f) })?.managerId, HALA);
});

test('skipping the carried person with no history continues after Rewaida, not after its Head', () => {
  const f = fixture();
  const pending = carry(f);
  const options = { carryOver: pending, skippedIds: [pending.salesId] };
  assert.equal(next(f, [], options)?.managerId, HALA);
  assert.deepEqual(round(f, next(f, [], options), options).map((t) => t.managerId), [
    HALA, DINA, 'ahmed', 'shehata',
  ]);
});

test('today’s last served team takes priority over the old carry-over cursor', () => {
  const f = fixture();
  assert.equal(next(f, [teamHistory(f, HALA)], { carryOver: carry(f) })?.managerId, DINA);
});

test('Rewaida carry-over skips unavailable Hala but keeps Dina ahead of Ahmed', () => {
  const f = fixture();
  setTeamStatus(f, HALA, 'busy');
  const pending = carry(f);
  const pinned = carryOverTurn(pending, f.state, f.heads, f.managers, f.sales);
  assert.deepEqual(round(f, pinned, { carryOver: pending }).map((t) => t.managerId), [
    'rewaida', DINA, 'ahmed', 'shehata',
  ]);
});

test('skipping an absent team does not reorder any other RESTA teams', () => {
  const f = fixture(2);
  setTeamStatus(f, 'shehata', 'absent');
  assert.deepEqual(round(f).map((t) => t.managerId), [
    'ahmed', 'rewaida', HALA, DINA,
    'ahmed', 'rewaida', HALA, DINA,
  ]);
});

test('multiple unavailable teams are skipped without breaking wraparound', () => {
  const f = fixture();
  setTeamStatus(f, HALA, 'absent');
  setTeamStatus(f, DINA, 'busy');
  assert.equal(next(f, [teamHistory(f, 'rewaida')])?.managerId, 'ahmed');
});

test('missing custom teams are skipped without adding or replacing org data', () => {
  const f = fixture();
  f.managers = f.managers.filter((m) => m.id !== HALA);
  f.sales = f.sales.filter((s) => s.managerId !== HALA);
  assert.deepEqual(round(f).map((t) => t.managerId), ['ahmed', 'shehata', 'rewaida', DINA]);
});

test('a removed last-served team still anchors the cycle by its historical name', () => {
  const f = fixture();
  const previous = teamHistory(f, HALA);
  f.managers = f.managers.filter((m) => m.id !== HALA);
  f.sales = f.sales.filter((s) => s.managerId !== HALA);
  assert.equal(next(f, [previous])?.managerId, DINA);
});

test('excluded people are skipped in both current-turn and full-round calculations', () => {
  const f = fixture();
  const skippedIds = ['shehata-member-1', `${HALA}-member-1`];
  assert.equal(next(f, [teamHistory(f, 'ahmed')], {}, skippedIds)?.managerId, 'rewaida');
  assert.deepEqual(round(f, undefined, { skippedIds }).map((t) => t.managerId), [
    'ahmed', 'rewaida', DINA,
  ]);
});

test('all 32 availability subsets preserve the fixed order from every cycle position', () => {
  for (let mask = 0; mask < 32; mask++) {
    for (let previous = -1; previous < CYCLE.length; previous++) {
      const f = fixture();
      CYCLE.forEach((id, i) => setTeamStatus(f, id, mask & (1 << i) ? 'available' : 'absent'));
      const history = previous < 0 ? [] : [teamHistory(f, CYCLE[previous])];
      const expected = Array.from({ length: CYCLE.length }, (_, offset) => (previous + 1 + offset) % CYCLE.length)
        .filter((index) => mask & (1 << index))
        .map((index) => CYCLE[index]);
      assert.equal(next(f, history)?.managerId ?? null, expected[0] ?? null, `mask=${mask}, previous=${previous}`);
      const predicted = predictFullRound(f.state, history, 'khaled', undefined, f.heads, f.managers, f.sales, {
        workspace: 'RESTA',
      });
      assert.deepEqual(predicted.map((t) => t.managerId), expected, `mask=${mask}, previous=${previous}`);
    }
  }
});

test('a team becomes eligible in its original slot when a member returns', () => {
  const f = fixture();
  setTeamStatus(f, HALA, 'absent');
  assert.equal(next(f, [teamHistory(f, 'rewaida')])?.managerId, DINA);
  setTeamStatus(f, HALA, 'available');
  assert.equal(next(f, [teamHistory(f, 'rewaida')])?.managerId, HALA);
});

test('within a RESTA team, fewer own turns precede attendance priority', () => {
  const f = fixture(2);
  f.state['ahmed-member-1'].walkCount = 2;
  f.state['ahmed-member-2'].walkCount = 0;
  assert.equal(next(f)?.salesId, 'ahmed-member-2');
  f.state['ahmed-member-1'].walkCount = 0;
  assert.equal(next(f)?.salesId, 'ahmed-member-1');
});

test('walk/cover counts and check-in order of other teams cannot change RESTA team order', () => {
  const f = fixture();
  f.state['ahmed-member-1'].walkCount = 99;
  f.state['ahmed-member-1'].coverCount = 100;
  f.state['ahmed-member-1'].checkInOrder = 1000;
  assert.equal(next(f)?.managerId, 'ahmed');
});

test('managers stay attendance-only and do not make an unavailable team eligible', () => {
  const f = fixture();
  setTeamStatus(f, HALA, 'absent');
  assert.equal(f.state[`${HALA}-self`].status, 'available');
  assert.equal(next(f, [teamHistory(f, 'rewaida')])?.managerId, DINA);
  assert.ok(round(f).every((t) => !f.sales.find((s) => s.id === t.salesId)?.isManager));
});

test('only the five configured teams participate in RESTA’s automatic cycle', () => {
  const f = fixture();
  CYCLE.forEach((id) => setTeamStatus(f, id, 'absent'));
  assert.equal(next(f), null);
  assert.deepEqual(round(f), []);
});

test('a sole eligible RESTA team can take successive turns without an infinite loop', () => {
  const f = fixture(2);
  CYCLE.filter((id) => id !== 'rewaida').forEach((id) => setTeamStatus(f, id, 'absent'));
  assert.equal(next(f, [teamHistory(f, 'rewaida')])?.managerId, 'rewaida');
  assert.deepEqual(round(f).map((t) => t.managerId), ['rewaida', 'rewaida']);
});

test('empty/all-unavailable data produces no automatic turn', () => {
  const f = fixture();
  Object.values(f.state).forEach((s) => { s.status = 'busy'; });
  assert.equal(next(f), null);
  assert.deepEqual(round(f), []);
  assert.equal(next({ heads: [], managers: [], sales: [], state: {} }), null);
});

test('RESTA name matching supports custom IDs, case and spacing without depending on Heads', () => {
  const f = fixture();
  f.managers.forEach((m) => {
    if (m.id === HALA) m.name = '  hALA  ELfar  ';
    if (m.id === DINA) m.name = ' DINA   ABDO ';
    m.headId = 'khaled';
  });
  f.sales.forEach((s) => { s.headId = 'khaled'; });
  assert.deepEqual(round(f).map((t) => t.managerId), CYCLE);
  assert.equal(next(f, [], { workspace: 'resta' }, [], 'mohamed-samir')?.managerId, 'ahmed');
});

test('assignments from an unrelated historical team do not move the RESTA cycle cursor', () => {
  const f = fixture();
  assert.equal(next(f, [teamHistory(f, 'rewaida'), teamHistory(f, 'perry')])?.managerId, HALA);
});

test('a team-only carry cursor preserves the RESTA cycle when a day ends with no available person', () => {
  const f = fixture();
  const pending = { ...carry(f), salesId: '', salesName: '' };
  assert.equal(next(f, [], { carryOver: pending })?.managerId, HALA);
  assert.equal(carryOverTurn(pending, f.state, f.heads, f.managers, f.sales), null);
});

test('new-day state includes custom RESTA members without changing the default shared org', () => {
  const f = fixture();
  const sharedOrg = structuredClone({ HEADS, MANAGERS, SALES });
  const fresh = defaultSalesState(f.sales);
  assert.deepEqual(Object.keys(fresh).sort(), f.sales.map((s) => s.id).sort());
  assert.equal(fresh[`${HALA}-member-1`].status, 'absent');
  assert.equal(fresh[`${DINA}-member-1`].walkCount, 0);
  assert.deepEqual({ HEADS, MANAGERS, SALES }, sharedOrg);
  assert.deepEqual(Object.keys(defaultSalesState()).sort(), SALES.map((s) => s.id).sort());
});

test('rotation and predictions do not mutate attendance, history, carry-over or org arrays', () => {
  const f = fixture(2);
  const history = [teamHistory(f, 'rewaida')];
  const pending = carry(f);
  const before = structuredClone({ f, history, pending });
  next(f, history, { carryOver: pending });
  round(f, carryOverTurn(pending, f.state, f.heads, f.managers, f.sales), { carryOver: pending });
  assert.deepEqual({ f, history, pending }, before);
});

test('SITE and unspecified/other workspaces retain their pre-change Head × Head ordering', () => {
  const f = fixture();
  const expected = ['perry', HALA, 'rewaida', DINA, 'ahmed', 'shehata', 'tarek-osman'];
  for (const workspace of [undefined, 'SITE', 'site', 'OTHER']) {
    const options = { workspace, carryOver: carry(f), skippedIds: ['perry-member-1'] };
    const current = computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales, options);
    assert.equal(current?.managerId, 'perry');
    const predicted = predictFullRound(f.state, [], 'khaled', undefined, f.heads, f.managers, f.sales, options);
    assert.deepEqual(predicted.map((t) => t.managerId), expected);
  }
});

test('changing the active storage account cannot leak RESTA rotation into SITE/default calls', () => {
  const f = fixture();
  setActiveAccount('RESTA');
  try {
    assert.equal(computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales)?.managerId, 'perry');
    assert.equal(next(f)?.managerId, 'ahmed');
    assert.equal(next(f, [], { workspace: 'SITE' })?.managerId, 'perry');
  } finally {
    setActiveAccount('');
  }
});
