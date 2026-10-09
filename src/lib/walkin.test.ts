import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTOMATIC_TEAM_ORDER,
  HEADS,
  MANAGERS,
  SALES,
  availableTeamMembers,
  carryOverForNewDay,
  computeNextTeam,
  computeNextTurn,
  createNewDaySalesState,
  defaultSalesState,
  loadPersisted,
  predictFullRound,
  savePersisted,
  setActiveAccount,
  shiftedSalesFor,
  successorTeam,
  swapInCustomOrder,
  teamOrderFrom,
  teamRoundFrom,
  teamTurnOrder,
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
  TeamTurn,
  TurnIdentity,
} from './walkin.ts';

const HALA = 'custom-hala-913';
const DINA = 'custom-dina-247';
const HANY = 'custom-hany-512';
const GANNAH = 'custom-gannah-388';
// The requested automatic cycle:
//   Ahmed Yossry → Youssef Shehata → Rewaida → Hany Elshenawy → Perry →
//   Hala Elfar's team → Gannah Elmalah's team → back to Ahmed Yossry.
// Dina Abdo stays in the org but is NOT part of the cycle any more.
const CYCLE = ['ahmed', 'shehata', 'rewaida', HANY, 'perry', HALA, GANNAH];
const WORKSPACES = ['RESTA', 'SITE'] as const;

interface Fixture {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  state: Record<string, SalesState>;
}

// Use saved/custom team IDs, shuffled org order and reverse attendance priority.
// Perry, Tarek and Dina remain in the org to ensure the fixed cycle leaves
// shared data alone (Dina is deliberately outside the configured cycle).
function fixture(membersPerTeam = 1): Fixture {
  const heads = structuredClone(HEADS);
  const managers: ManagerTeam[] = [
    ...structuredClone(MANAGERS),
    { id: HALA, name: 'Hala El Far', ar: 'هالة الفار', headId: 'wael' },
    { id: DINA, name: 'Dina Abdo', ar: 'دينا عبده', headId: 'mohamed-samir' },
    { id: HANY, name: 'Hany Elshenawy', ar: 'هاني الشناوي', headId: 'wael' },
    { id: GANNAH, name: 'Gannah Elmalah', ar: 'جنة الملا', headId: 'mohamed-samir' },
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

/** An assignment of a team's turn: the team is what the cycle records. */
function assignment(turn: TurnIdentity, n = 1): Assignment {
  return {
    id: `assignment-${n}`,
    n,
    salesId: '',
    salesName: '',
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
    // The current flow carries the TEAM: the sales is chosen manually on the day.
    salesId: '',
    salesName: '',
    managerId: previous.managerId,
    managerName: previous.managerName,
    headId: previous.headId,
    headName: previous.headName,
    fromDate: previous.time,
  };
}

/** Team-level turn (the production path for both workspaces). */
function next(
  f: Fixture,
  history: Assignment[] = [],
  options: RotationOptions = {},
  excludeIds: string[] = [],
  _startingHead = 'khaled',
): TeamTurn | null {
  return computeNextTeam(f.state, history, f.managers, f.sales, f.heads, {
    workspace: 'RESTA',
    ...options,
    skippedIds: [...(options.skippedIds ?? []), ...excludeIds],
  });
}

function round(f: Fixture, seed?: ComputedTurn | null, options: RotationOptions = {}): ComputedTurn[] {
  return predictFullRound(f.state, [], 'khaled', seed, f.heads, f.managers, f.sales, {
    workspace: 'RESTA',
    ...options,
  });
}

/** Sets EVERY member of a team (including the manager's own row) to a status. */
function setTeamStatus(f: Fixture, managerId: string, status: SalesState['status']): void {
  f.sales.filter((s) => s.managerId === managerId).forEach((s) => {
    f.state[s.id].status = status;
  });
}

test('one shared team-order source defines the requested order', () => {
  assert.deepEqual(AUTOMATIC_TEAM_ORDER, [
    { id: 'ahmed', name: 'Ahmed Yossry' },
    { id: 'shehata', name: 'Youssef Shehata' },
    { id: 'rewaida', name: 'Rewaida' },
    { id: 'hany-elshenawy', name: 'Hany Elshenawy' },
    { id: 'perry', name: 'Perry' },
    { id: 'hala-elfar', name: 'Hala Elfar' },
    { id: 'gannah-elmalah', name: 'Gannah Elmalah' },
  ]);
});

test('RESTA and SITE start with Ahmed and use the same fixed order despite check-in/org order', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    assert.equal(next(f, [], { workspace }, [], 'mohamed-samir')?.managerId, 'ahmed');
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), CYCLE);
  }
});

test('the engine never proposes a sales name in SITE/RESTA — the turn is the team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(3);
    const turn = next(f, [], { workspace });
    assert.equal(turn?.managerId, 'ahmed');
    // No sales is suggested anywhere: the choice is manual, per client.
    assert.ok(!('salesId' in (turn as unknown as Record<string, unknown>)));
    assert.ok(round(f, undefined, { workspace }).every((t) => t.salesId === '' && t.salesName === ''));
    assert.equal(computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales, { workspace })?.salesId, '');
  }
});

test('a team turn exposes the roster to pick from, not one chosen person — the manager included', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(3);
    const roster = availableTeamMembers('ahmed', f.state, f.sales);
    // The manager's own row sits in the roster like any teammate (earliest
    // check-in here), so he can be picked when a teammate is unavailable.
    assert.deepEqual(roster.map((s) => s.id), [
      'ahmed-self', 'ahmed-member-1', 'ahmed-member-2', 'ahmed-member-3',
    ]);
    assert.ok(roster.some((s) => s.isManager));
    assert.equal(next(f, [], { workspace })?.managerId, 'ahmed');
  }
});

test('RESTA and SITE repeat the seven-team cycle across actual assignments', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const history: Assignment[] = [];
    const actual: string[] = [];
    for (let i = 0; i < CYCLE.length * 3; i++) {
      const turn = next(f, history, { workspace });
      assert.ok(turn);
      actual.push(turn.managerId);
      history.push(assignment(turn, i + 1));
    }
    assert.deepEqual(actual, [...CYCLE, ...CYCLE, ...CYCLE]);
  }
});

test('the round is the team cycle: every available team once, in turn order', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    // No seed turn any more: the pending team comes from the carry-over/options.
    const predicted = round(f, undefined, { workspace });
    assert.deepEqual(predicted.map((t) => t.managerId), CYCLE);
    assert.equal(new Set(predicted.map((t) => t.managerId)).size, CYCLE.length);
    assert.equal(predicted.filter((t) => t.salesId === '').length, CYCLE.length);
  }
});

test('each team is followed by its fixed successor, including Gannah back to Ahmed', () => {
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

test('the order list rotates the cycle so the current team is first, and keeps empty teams visible', () => {
  const f = fixture();
  setTeamStatus(f, HALA, 'absent');
  assert.deepEqual(teamOrderFrom(f.managers, 'shehata', undefined, f.sales).map((t) => t.id), [
    'shehata', 'rewaida', HANY, 'perry', HALA, GANNAH, 'ahmed',
  ]);
  // Every cycle team appears exactly once, so the tab can show who is missing.
  assert.equal(teamOrderFrom(f.managers).length, CYCLE.length);
  assert.equal(teamOrderFrom(f.managers).filter((t) => t.id === HALA).length, 1);
});

test('successorTeam continues the cycle and falls back to its start for unknown teams', () => {
  const f = fixture();
  assert.equal(successorTeam(f.managers, 'ahmed', undefined, f.sales)?.id, 'shehata');
  assert.equal(successorTeam(f.managers, GANNAH, undefined, f.sales)?.id, 'ahmed');
  // Dina is in the org but outside the cycle, so the cycle simply starts.
  assert.equal(successorTeam(f.managers, DINA, undefined, f.sales)?.id, 'ahmed');
  assert.equal(successorTeam(f.managers, 'tarek-osman', undefined, f.sales)?.id, 'ahmed');
  assert.equal(successorTeam(f.managers, null, undefined, f.sales)?.id, 'ahmed');
});

test('within a team the picker order is fewer own turns first, then earliest check-in', () => {
  const f = fixture(3);
  f.state['ahmed-member-1'].walkCount = 2;
  f.state['ahmed-member-2'].walkCount = 1;
  f.state['ahmed-member-3'].walkCount = 1;
  f.state['ahmed-member-3'].checkInOrder = 99;
  // ahmed-self has 0 own turns and the earliest check-in of the team, so the
  // manager leads the picker order exactly like a fresh, fair teammate would.
  assert.deepEqual(
    availableTeamMembers('ahmed', f.state, f.sales).map((s) => s.id),
    ['ahmed-self', 'ahmed-member-2', 'ahmed-member-3', 'ahmed-member-1'],
  );
});

test('a team with nobody available is skipped and the roster drives eligibility', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    setTeamStatus(f, 'ahmed', 'absent');
    assert.equal(next(f, [], { workspace })?.managerId, 'shehata');
    assert.deepEqual(availableTeamMembers('ahmed', f.state, f.sales), []);
    // A single skipped member does not disable the team while a teammate is free.
    assert.equal(next(f, [], { workspace, skippedIds: ['shehata-member-1'] })?.managerId, 'shehata');
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

test('a present manager keeps his team eligible when every teammate is absent', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    // Everybody on Hala's team is absent EXCEPT Hala herself — she can still
    // sit with the client, so her team's turn is not skipped.
    f.sales.filter((s) => s.managerId === HALA && !s.isManager).forEach((s) => {
      f.state[s.id].status = 'absent';
    });
    assert.equal(f.state[`${HALA}-self`].status, 'available');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, HALA);
    assert.deepEqual(
      availableTeamMembers(HALA, f.state, f.sales).map((s) => s.id),
      [`${HALA}-self`],
    );
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), CYCLE);
  }
});

test('a team with the manager AND every teammate absent is skipped like any other empty team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, HALA, 'absent');
    assert.equal(f.state[`${HALA}-self`].status, 'absent');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, GANNAH);
    assert.deepEqual(
      round(f, undefined, { workspace }).map((t) => t.managerId),
      CYCLE.filter((id) => id !== HALA),
    );
  }
});

test('a carried team keeps the first turn until it is served today', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const pending = carry(f, 'rewaida');
    // Even after another team was served, yesterday's unserved team is first.
    assert.equal(next(f, [teamHistory(f, HALA)], { workspace, carryOver: pending })?.managerId, 'rewaida');
    // Once it is served today the cycle moves on from it.
    assert.equal(
      next(f, [teamHistory(f, HALA), teamHistory(f, 'rewaida')], { workspace, carryOver: pending })?.managerId,
      HANY,
    );
  }
});

test('the carried team exposes yesterday\'s person only when they are present', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const pending: CarryOver = { ...carry(f, 'rewaida'), salesId: 'rewaida-member-1', salesName: 'Rewaida member 1' };
    const first = next(f, [], { workspace, carryOver: pending })!;
    assert.equal(first.managerId, 'rewaida');
    assert.equal(first.carriedSalesId, 'rewaida-member-1');
    assert.equal(first.carriedSalesName, 'Rewaida member 1');

    f.state['rewaida-member-1'].status = 'absent';
    const absent = next(f, [], { workspace, carryOver: pending })!;
    assert.equal(absent.managerId, 'rewaida');
    assert.equal(absent.carriedSalesId, null);
  }
});

test('a Rewaida carry-over continues through Hany, Perry, Hala and Gannah to Ahmed; a Gannah one wraps to Ahmed first', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const rew = carry(f, 'rewaida');
    assert.deepEqual(
      round(f, undefined, { workspace, carryOver: rew }).map((t) => t.managerId),
      ['rewaida', HANY, 'perry', HALA, GANNAH, 'ahmed', 'shehata'],
    );
    const gannah = carry(f, GANNAH);
    assert.deepEqual(
      round(f, undefined, { workspace, carryOver: gannah }).map((t) => t.managerId),
      [GANNAH, 'ahmed', 'shehata', 'rewaida', HANY, 'perry', HALA],
    );
  }
});

test('each of the seven carried teams starts the next day before its successor in both workspaces', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((managerId, i) => {
      const pending = carry(f, managerId);
      const predicted = round(f, undefined, { workspace, carryOver: pending });
      const expected = Array.from({ length: CYCLE.length }, (_, offset) =>
        CYCLE[(i + offset) % CYCLE.length]);
      assert.deepEqual(predicted.map((t) => t.managerId), expected, `${workspace}: ${managerId}`);
      assert.equal(predicted[0].managerId, managerId);
      assert.equal(predicted.filter((t) => t.managerId === managerId).length, 1);
    });
  }
});

test('an absent carried team stays first while a teammate is available, and the roster is manual', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const pending: CarryOver = { ...carry(f, 'rewaida'), salesId: 'rewaida-member-1', salesName: 'Rewaida member 1' };
    f.state['rewaida-member-1'].status = 'absent';
    // The team keeps the slot; the person does not force the choice.
    assert.deepEqual(
      round(f, undefined, { workspace, carryOver: pending }).map((t) => t.managerId),
      ['rewaida', HANY, 'perry', HALA, GANNAH, 'ahmed', 'shehata'],
    );
    // The manager is present too, and sits ahead by earliest check-in.
    assert.deepEqual(
      availableTeamMembers('rewaida', f.state, f.sales).map((s) => s.id),
      ['rewaida-self', 'rewaida-member-2'],
    );
  }
});

test('skipping the only teammate of the carried team keeps the team on turn because the manager can step in', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    const options = { workspace, carryOver: pending, skippedIds: ['rewaida-member-1'] };
    // rewaida-member-1 is skipped, but rewaida-self (the manager) is still
    // available, so the team is not skipped — the manager picks up the slot.
    assert.equal(next(f, [], options)?.managerId, 'rewaida');
    assert.deepEqual(
      availableTeamMembers('rewaida', f.state, f.sales, options.skippedIds).map((s) => s.id),
      ['rewaida-self'],
    );
    assert.deepEqual(round(f, undefined, options).map((t) => t.managerId), [
      'rewaida', HANY, 'perry', HALA, GANNAH, 'ahmed', 'shehata',
    ]);
  }
});

test('skipping BOTH the only teammate and the manager truly moves the cycle on', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    const options = { workspace, carryOver: pending, skippedIds: ['rewaida-member-1', 'rewaida-self'] };
    assert.equal(next(f, [], options)?.managerId, HANY);
    assert.deepEqual(round(f, undefined, options).map((t) => t.managerId), [
      HANY, 'perry', HALA, GANNAH, 'ahmed', 'shehata',
    ]);
  }
});

test('an unrelated assignment does not consume an unserved carry-over at day rollover', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const pending = carry(f, 'rewaida');
    const unrelated = teamHistory(f, 'perry');
    const laterTurn = next(f, [unrelated], { workspace, carryOver: pending });
    assert.equal(laterTurn?.managerId, 'rewaida');
    const rolled = carryOverForNewDay(pending, laterTurn, [unrelated], f.heads, workspace, 'new-day');
    assert.equal(rolled?.managerId, 'rewaida');
    const fresh = createNewDaySalesState(workspace, f.sales);
    f.sales
      .filter((s) => s.managerId === 'rewaida' && !s.isManager)
      .forEach((s) => { fresh[s.id] = { ...fresh[s.id], status: 'available' }; });
    assert.equal(computeNextTeam(fresh, [], f.managers, f.sales, f.heads, { carryOver: rolled })?.managerId, 'rewaida');
  }
});

test('a newly pending turn, not the last team served, is carried into the next day', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((previousTeam, index) => {
      const history = [teamHistory(f, previousTeam)];
      const pending = next(f, history, { workspace });
      assert.equal(pending?.managerId, CYCLE[(index + 1) % CYCLE.length]);
      const rolled = carryOverForNewDay(null, pending, history, f.heads, workspace, 'new-day');
      assert.equal(rolled?.managerId, CYCLE[(index + 1) % CYCLE.length]);
      assert.equal(rolled?.salesId, '');
    });
  }
});

test('a team carry with no pending turn resumes after the last served team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const previous = teamHistory(f, 'rewaida');
    const rolled = carryOverForNewDay(null, null, [previous], f.heads, workspace, 'new-day', f.managers, undefined, f.sales)!;
    // Carrying the team that just served would repeat it; the successor starts.
    assert.equal(rolled.managerId, HANY);
    assert.equal(rolled.salesId, '');
    assert.equal(next(f, [], { workspace, carryOver: rolled })?.managerId, HANY);
  }
});

test('a team carry survives an empty day and starts the next day with that team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const cursor = carry(f, 'rewaida');
    const rolled = carryOverForNewDay(cursor, null, [], f.heads, workspace, 'new-day');
    assert.deepEqual(rolled, cursor);
    assert.equal(next(f, [], { workspace, carryOver: rolled })?.managerId, 'rewaida');
  }
});

test('unavailable teams are skipped without changing the order of the remaining cycle', () => {
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

test('only the seven configured teams participate; a missing custom team is safely skipped', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((id) => setTeamStatus(f, id, 'absent'));
    assert.equal(next(f, [], { workspace }), null);
    assert.deepEqual(round(f, undefined, { workspace }), []);

    const withMissing = fixture();
    withMissing.managers = withMissing.managers.filter((m) => m.id !== HALA);
    withMissing.sales = withMissing.sales.filter((s) => s.managerId !== HALA);
    assert.deepEqual(round(withMissing, undefined, { workspace }).map((t) => t.managerId), [
      'ahmed', 'shehata', 'rewaida', HANY, 'perry', GANNAH,
    ]);
  }
});

test('a removed last-served custom team still anchors the cycle by its saved name', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const previous = teamHistory(f, HALA);
    f.managers = f.managers.filter((m) => m.id !== HALA);
    f.sales = f.sales.filter((s) => s.managerId !== HALA);
    assert.equal(next(f, [previous], { workspace })?.managerId, GANNAH);
  }
});

test('one available team can take successive turns without an infinite loop', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    CYCLE.filter((id) => id !== 'rewaida').forEach((id) => setTeamStatus(f, id, 'absent'));
    assert.equal(next(f, [teamHistory(f, 'rewaida')], { workspace })?.managerId, 'rewaida');
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), ['rewaida']);
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
      if (m.id === HANY) m.name = ' HANY-elshenawy ';
      if (m.id === GANNAH) m.name = '  gannah Elmalah ';
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
      HANY,
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
    next(f, history, { workspace, carryOver: pending });
    predictFullRound(f.state, history, 'khaled', undefined, f.heads, f.managers, f.sales, {
      workspace,
      carryOver: pending,
    });
    assert.deepEqual({ f, history, pending }, before);
  }
});

test('unspecified and unrelated workspaces retain their original Head × Head behavior', () => {
  const f = fixture();
  // The legacy person-level order (Khaled's side ⇄ the other Heads), which the
  // team cycle does not touch: Hany (Wael) and Gannah (Mohamed Samir) simply
  // join the "other Heads" side here.
  const expected = [
    'perry', HANY, 'rewaida', GANNAH, 'ahmed', HALA, DINA, 'shehata', 'tarek-osman',
  ];
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

// ───────────────── Turn-order settings («طريقة ترتيب الأدوار») ─────────────────

import { DEFAULT_TEAM_CYCLE, normalizeTeamCycle } from './walkin.ts';
import type { TeamCycleSettings } from './walkin.ts';

test('a custom cycle chosen in the app re-orders the rotation and can include any team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const custom: TeamCycleSettings = { mode: 'custom', order: ['tarek-osman', DINA, 'ahmed'] };
    // The custom order IS the whole cycle — a team that never rotated before
    // (Tarek Osman) participates, and the built-in six-team order is replaced.
    assert.equal(next(f, [], { workspace, cycle: custom })?.managerId, 'tarek-osman');
    assert.deepEqual(
      teamOrderFrom(f.managers, undefined, custom).map((t) => t.id),
      ['tarek-osman', DINA, 'ahmed'],
    );
    // The cycle continues in the chosen order and wraps back to its start.
    assert.equal(next(f, [teamHistory(f, 'tarek-osman')], { workspace, cycle: custom })?.managerId, DINA);
    assert.equal(next(f, [teamHistory(f, DINA)], { workspace, cycle: custom })?.managerId, 'ahmed');
    assert.equal(next(f, [teamHistory(f, 'ahmed')], { workspace, cycle: custom })?.managerId, 'tarek-osman');
    // Rounds follow the custom order too.
    assert.deepEqual(round(f, undefined, { workspace, cycle: custom }).map((t) => t.managerId), [
      'tarek-osman', DINA, 'ahmed',
    ]);
    assert.equal(computeNextTurn(f.state, [], 'khaled', [], f.heads, f.managers, f.sales, {
      workspace, cycle: custom,
    })?.managerId, 'tarek-osman');
  }
});

test('an empty or unknown custom order safely produces no turn', () => {
  const f = fixture();
  assert.equal(next(f, [], { cycle: { mode: 'custom', order: [] } }), null);
  assert.equal(next(f, [], { cycle: { mode: 'custom', order: ['ghost', 'removed-mgr'] } }), null);
  assert.deepEqual(teamOrderFrom(f.managers, undefined, { mode: 'custom', order: ['ghost'] }), []);
});

test('a custom cycle drops deleted teams and duplicates, and never uses legacy name anchors', () => {
  const f = fixture();
  const custom: TeamCycleSettings = { mode: 'custom', order: ['rewaida', 'ghost', DINA, 'rewaida'] };
  assert.deepEqual(teamOrderFrom(f.managers, undefined, custom).map((t) => t.id), ['rewaida', DINA]);

  // A team deleted AFTER serving (old history) must not mis-anchor the cycle:
  // custom orders are matched by id alone, never by the built-in slot names.
  const withoutDina = fixture();
  withoutDina.managers = withoutDina.managers.filter((m) => m.id !== DINA);
  withoutDina.sales = withoutDina.sales.filter((s) => s.managerId !== DINA);
  const withDina: TeamCycleSettings = { mode: 'custom', order: ['rewaida', DINA, 'ahmed'] };
  assert.equal(
    next(withoutDina, [teamHistory(f, DINA)], { cycle: withDina })?.managerId,
    'rewaida',
  );
});

test('without settings the rotation stays on the built-in fixed cycle', () => {
  const f = fixture();
  for (const cycle of [undefined, null, DEFAULT_TEAM_CYCLE, { mode: 'auto' as const, order: ['perry'] }]) {
    assert.equal(next(f, [], { cycle })?.managerId, 'ahmed');
    assert.deepEqual(teamOrderFrom(f.managers, undefined, cycle).map((t) => t.id), CYCLE);
  }
});

test('carry-over and successor follow the custom cycle into a new day', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const custom: TeamCycleSettings = { mode: 'custom', order: ['ahmed', 'tarek-osman', 'perry'] };
    const history = [teamHistory(f, 'ahmed')];
    const pending = next(f, history, { workspace, cycle: custom });
    assert.equal(pending?.managerId, 'tarek-osman');
    const rolled = carryOverForNewDay(null, pending, history, f.heads, workspace, 'new-day', f.managers, custom);
    assert.equal(rolled?.managerId, 'tarek-osman');
    assert.equal(successorTeam(f.managers, 'tarek-osman', custom)?.id, 'perry');
    // An unserved carried team keeps the first turn tomorrow, in custom order too.
    assert.equal(next(f, [], { workspace, carryOver: rolled, cycle: custom })?.managerId, 'tarek-osman');
  }
});

test('turn-order settings survive storage, hydration, and junk payloads', () => {
  withMemoryLocalStorage(() => {
    const custom: TeamCycleSettings = { mode: 'custom', order: ['perry', 'ahmed'] };
    savePersisted(
      {
        salesState: defaultSalesState(),
        history: [],
        counter: 0,
        seq: 0,
        startingHead: 'khaled',
        carryOver: null,
        lastResetAt: null,
        teamCycle: custom,
      },
      'SITE',
    );
    assert.deepEqual(loadPersisted('SITE').teamCycle, custom);

    // Junk shapes fall back to the safe default instead of crashing the boot.
    assert.deepEqual(normalizeTeamCycle(undefined), DEFAULT_TEAM_CYCLE);
    assert.deepEqual(normalizeTeamCycle(null), DEFAULT_TEAM_CYCLE);
    assert.deepEqual(
      normalizeTeamCycle({ mode: 'weird' as never, order: 'nope' as never }),
      DEFAULT_TEAM_CYCLE,
    );
    assert.deepEqual(
      normalizeTeamCycle({ mode: 'custom', order: ['ahmed', 42 as never, null as never] }),
      { mode: 'custom', order: ['ahmed'] },
    );
    setActiveAccount('');
  });
});

// ───────── The automatic cycle is resolved from PEOPLE, not team ids ─────────

/** A tiny roster where the two last slots are only MEMBERS of other teams. */
function memberAnchoredFixture(sharedTeam = false): Fixture {
  const heads = structuredClone(HEADS);
  const managers: ManagerTeam[] = [
    { id: 'custom-team-77', name: 'Team Seven', ar: 'تيم سبعة', headId: 'wael' },
    { id: 'ahmed', name: 'Ahmed Yossry', ar: 'أحمد يسري', headId: 'khaled' },
    // A second team only exists when the two people sit in DIFFERENT teams.
    ...(sharedTeam
      ? []
      : [{ id: 'custom-team-19', name: 'Team Nineteen', ar: 'تيم تسعتاشر', headId: 'mohamed-samir' }]),
  ];
  const gannahTeam = sharedTeam ? 'custom-team-77' : 'custom-team-19';
  const sales: SalesPerson[] = [
    { id: 'ahmed-self', name: 'Ahmed Yossry', managerId: 'ahmed', headId: 'khaled', isManager: true },
    // A manager row alone never makes a team eligible — Ahmed needs a member.
    { id: 'ahmed-member-1', name: 'Ahmed member 1', managerId: 'ahmed', headId: 'khaled' },
    { id: 'seven-lead', name: 'Seven Lead', managerId: 'custom-team-77', headId: 'wael', isManager: true },
    // «التيم اللي فيه هالة الفار» — Hala is a member, not a team of her own.
    { id: 'hala-elfar', name: 'Hala Elfar', managerId: 'custom-team-77', headId: 'wael' },
    { id: 'nineteen-lead', name: 'Nineteen Lead', managerId: gannahTeam, headId: 'mohamed-samir', isManager: true },
    { id: 'gannah-elmalah', name: 'Gannah Elmalah', managerId: gannahTeam, headId: 'mohamed-samir' },
  ];
  const state = Object.fromEntries(sales.map((s, i) => [s.id, {
    status: 'available' as const,
    checkInOrder: i + 1,
    checkInTime: null,
    walkCount: 0,
    coverCount: 0,
    lastServedAt: null,
  }]));
  return { heads, managers, sales, state };
}

test('a slot naming a person picks the team that person belongs to', () => {
  const f = memberAnchoredFixture();
  assert.deepEqual(
    teamOrderFrom(f.managers, undefined, undefined, f.sales).map((t) => t.id),
    ['ahmed', 'custom-team-77', 'custom-team-19'],
  );
  // The engine rotates through the same teams, in the same order.
  assert.equal(
    computeNextTeam(f.state, [], f.managers, f.sales, f.heads, { workspace: 'SITE' })?.managerId,
    'ahmed',
  );
  const history = [assignment({
    managerId: 'ahmed', managerName: 'Ahmed Yossry', headId: 'khaled', headName: 'Khaled Youssef',
  })];
  assert.equal(
    computeNextTeam(f.state, history, f.managers, f.sales, f.heads, { workspace: 'SITE' })?.managerId,
    'custom-team-77',
  );
  // Moving the person moves the slot with them — nothing is bound to a team id.
  f.sales = f.sales.map((s) =>
    s.id === 'hala-elfar' ? { ...s, managerId: 'custom-team-19' } : s,
  );
  assert.deepEqual(
    teamOrderFrom(f.managers, undefined, undefined, f.sales).map((t) => t.id),
    ['ahmed', 'custom-team-19'],
  );
});

test('a team claimed by two automatic slots rotates only once a round', () => {
  const f = memberAnchoredFixture(true);
  assert.deepEqual(
    teamOrderFrom(f.managers, undefined, undefined, f.sales).map((t) => t.id),
    ['ahmed', 'custom-team-77'],
  );
  assert.deepEqual(
    predictFullRound(f.state, [], 'khaled', undefined, f.heads, f.managers, f.sales, {
      workspace: 'RESTA',
    }).map((t) => t.managerId),
    ['ahmed', 'custom-team-77'],
  );
});

// ───────── The order tab and the engine read ONE order ─────────

test('the order tab shows the custom cycle, and a stale manual order cannot win', () => {
  const f = fixture();
  const custom: TeamCycleSettings = { mode: 'custom', order: ['perry', DINA, 'ahmed'] };
  // An old manual order left over from an earlier day (the arrows on the tab).
  const stale = ['ahmed', 'rewaida', 'shehata', 'perry', HALA, GANNAH, HANY];

  // Automatic cycle: the manual order still re-orders it, as before.
  assert.deepEqual(
    teamRoundFrom(f.managers, undefined, undefined, f.sales, stale).map((t) => t.id),
    stale,
  );
  // Custom cycle: the order the manager picked is the ONLY order shown —
  // this is the bug that made a customized order look like it had no effect.
  assert.deepEqual(
    teamRoundFrom(f.managers, undefined, custom, f.sales, stale).map((t) => t.id),
    ['perry', DINA, 'ahmed'],
  );
  // …and it is still rotated so the team on turn comes first.
  assert.deepEqual(
    teamRoundFrom(f.managers, DINA, custom, f.sales, stale).map((t) => t.id),
    [DINA, 'ahmed', 'perry'],
  );
  assert.deepEqual(
    teamRoundFrom(f.managers, undefined, custom, f.sales).map((t) => t.id),
    ['perry', DINA, 'ahmed'],
  );
});

test('moving a team on the order tab edits the saved custom order', () => {
  const order = ['perry', DINA, 'ahmed'];
  assert.deepEqual(swapInCustomOrder(order, 'perry', DINA), [DINA, 'perry', 'ahmed']);
  assert.deepEqual(swapInCustomOrder(order, DINA, 'ahmed'), ['perry', 'ahmed', DINA]);
  // Unknown or same team → the saved order is returned untouched.
  assert.deepEqual(swapInCustomOrder(order, 'perry', 'ghost'), order);
  assert.deepEqual(swapInCustomOrder(order, 'perry', 'perry'), order);
});

test('a newly added manager joins the custom cycle where the manager put it', () => {
  const f = fixture();
  const added: ManagerTeam = { id: 'hany-elshenawy', name: 'Hany Elshenawy', ar: 'هاني الشناوي', headId: 'wael' };
  f.managers = [...f.managers.filter((m) => m.id !== HANY), added];
  f.sales = [
    ...f.sales.filter((s) => s.managerId !== HANY),
    { id: 'hany-elshenawy-self', name: 'Hany Elshenawy', managerId: added.id, headId: 'wael', isManager: true },
    { id: 'hany-member-1', name: 'Hany member 1', managerId: added.id, headId: 'wael' },
  ];
  f.state['hany-elshenawy-self'] = { status: 'available', checkInOrder: 90, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null };
  f.state['hany-member-1'] = { status: 'available', checkInOrder: 91, checkInTime: null, walkCount: 0, coverCount: 0, lastServedAt: null };

  const custom: TeamCycleSettings = {
    mode: 'custom',
    order: ['shehata', added.id, 'perry', 'ahmed'],
  };
  assert.deepEqual(
    teamOrderFrom(f.managers, undefined, custom, f.sales).map((t) => t.id),
    ['shehata', added.id, 'perry', 'ahmed'],
  );
  assert.equal(
    computeNextTeam(f.state, [], f.managers, f.sales, f.heads, { workspace: 'SITE', cycle: custom })?.managerId,
    'shehata',
  );
  assert.equal(
    computeNextTeam(f.state, [teamHistory(f, 'shehata')], f.managers, f.sales, f.heads, {
      workspace: 'SITE',
      cycle: custom,
    })?.managerId,
    added.id,
  );
});

// ───────────── بيان «تأكيد وبدء المقابلة» — Next الحرفي + سطور Shiffted ❌ ─────────────

test('the receipt Next is the LITERAL next team in the cycle even when nobody attended', () => {
  const f = fixture();
  // The team right after «ahmed» in the cycle is «shehata»: make EVERY member
  // of it absent. The engine still skips it (nothing to serve), but the written
  // statement must name it — «اللي عليه الدور في الدورة عامة حتى ولو لم يحضر».
  setTeamStatus(f, 'shehata', 'absent');

  assert.equal(
    computeNextTeam(f.state, [teamHistory(f, 'ahmed')], f.managers, f.sales, f.heads, {
      workspace: 'RESTA',
    })?.managerId,
    'rewaida',
    'engine rotation skips the empty team',
  );
  assert.equal(
    successorTeam(f.managers, 'ahmed', undefined, f.sales)?.id,
    'shehata',
    'receipt Next names the pure-cycle successor regardless of attendance',
  );
});

test('teamTurnOrder lists the full chain — busy and absent members included', () => {
  const f = fixture(3);
  const members = f.sales.filter((s) => s.managerId === 'ahmed' && !s.isManager);
  const [first, second, third] = members;
  // first: available with 2 walks; second: BUSY with 0 walks; third: ABSENT.
  f.state[first.id] = { ...f.state[first.id], status: 'available', walkCount: 2 };
  f.state[second.id] = { ...f.state[second.id], status: 'busy', walkCount: 0 };
  f.state[third.id] = { ...f.state[third.id], status: 'absent', walkCount: 0, checkInOrder: null };

  const order = teamTurnOrder('ahmed', f.state, f.sales).filter((s) => !s.isManager);
  // Fairness first (fewest walks → earliest check-in): the busy member is ON
  // TURN before the available one, and the absent member keeps his slot too.
  assert.deepEqual(
    order.map((s) => s.id),
    [second.id, third.id, first.id],
  );
});

test('teamTurnOrder pins yesterday’s carried person first', () => {
  const f = fixture(3);
  const members = f.sales.filter((s) => s.managerId === 'ahmed' && !s.isManager);
  const carried = members[members.length - 1];
  // Give the carried member the WORST fairness position (most walks).
  f.state[carried.id] = { ...f.state[carried.id], status: 'busy', walkCount: 9 };

  const order = teamTurnOrder('ahmed', f.state, f.sales, carried.id);
  assert.equal(order[0].id, carried.id, 'carried person leads the chain even when busy');
});

test('teamTurnOrder matches availableTeamMembers for the available prefix', () => {
  const f = fixture(3);
  const members = f.sales.filter((s) => s.managerId === 'rewaida');
  // One available member sits in the middle of the fairness order.
  f.state[members[1].id] = { ...f.state[members[1].id], status: 'absent' };
  f.state[members[2].id] = { ...f.state[members[2].id], status: 'busy' };

  const full = teamTurnOrder('rewaida', f.state, f.sales).filter(
    (s) => f.state[s.id]?.status === 'available',
  );
  const picker = availableTeamMembers('rewaida', f.state, f.sales);
  assert.deepEqual(
    full.map((s) => s.id),
    picker.map((s) => s.id),
    'the statement chain and the picker order never disagree',
  );
});

// ───── سطور «Shiffted ❌» التلقائية — من علامة «مشغول / متاح» على شاشة الاختيار ─────

test('busy and absent on-turn members are written «Shiffted ❌» automatically', () => {
  const f = fixture(3);
  const [a, b, c] = f.sales.filter((s) => s.managerId === 'ahmed' && !s.isManager);
  // a: AVAILABLE — he takes the client; b: BUSY with another client; c: ABSENT.
  f.state[a.id] = { ...f.state[a.id], status: 'available', walkCount: 2 };
  f.state[b.id] = { ...f.state[b.id], status: 'busy', walkCount: 0 };
  f.state[c.id] = { ...f.state[c.id], status: 'absent', walkCount: 0, checkInOrder: null };

  const shifted = shiftedSalesFor('ahmed', f.state, f.sales);
  assert.deepEqual(
    shifted,
    [
      { id: b.id, name: b.name, status: 'busy' },
      { id: c.id, name: c.name, status: 'absent' },
    ],
    'both are in the statement with NO manual marking — the status mark decides',
  );
  assert.equal(
    shifted.some((s) => s.id === a.id),
    false,
    'the available sales who serves the client is never written as shifted',
  );
});

test('a member tapped out on the assign screen drops out of the automatic lines', () => {
  const f = fixture(2);
  const [a, b] = f.sales.filter((s) => s.managerId === 'rewaida' && !s.isManager);
  f.state[a.id] = { ...f.state[a.id], status: 'busy' };
  f.state[b.id] = { ...f.state[b.id], status: 'absent', checkInOrder: null };

  assert.deepEqual(
    shiftedSalesFor('rewaida', f.state, f.sales).map((s) => s.id),
    [a.id, b.id],
  );
  assert.deepEqual(
    shiftedSalesFor('rewaida', f.state, f.sales, null, [a.id]).map((s) => s.id),
    [b.id],
    'the excluded member is the only manual exception',
  );
  assert.deepEqual(
    shiftedSalesFor('rewaida', f.state, f.sales, null, []).map((s) => s.id),
    [a.id, b.id],
    'tapping him again puts him back in the statement',
  );
});

test('the automatic lines keep the carried person first, exactly like the picker', () => {
  const f = fixture(3);
  const members = f.sales.filter((s) => s.managerId === 'ahmed' && !s.isManager);
  const carried = members[members.length - 1];
  // Yesterday's carried person is BUSY and holds the worst fairness position.
  f.state[carried.id] = { ...f.state[carried.id], status: 'busy', walkCount: 9 };
  f.state[members[0].id] = { ...f.state[members[0].id], status: 'available' };
  f.state[members[1].id] = { ...f.state[members[1].id], status: 'absent', checkInOrder: null };

  const shifted = shiftedSalesFor('ahmed', f.state, f.sales, carried.id);
  assert.equal(shifted[0].id, carried.id, 'the carried member leads the statement lines');
  assert.deepEqual(
    shifted.map((s) => s.id),
    teamTurnOrder('ahmed', f.state, f.sales, carried.id)
      .filter((s) => f.state[s.id]?.status !== 'available')
      .map((s) => s.id),
    'the statement chain and the picker chain never disagree',
  );
});

test('a member with no attendance record at all counts as «لم يحضر»', () => {
  const f = fixture(2);
  const [a, b] = f.sales.filter((s) => s.managerId === 'shehata' && !s.isManager);
  f.state[a.id] = { ...f.state[a.id], status: 'busy' };
  delete f.state[b.id]; // never checked in on any device

  assert.deepEqual(
    shiftedSalesFor('shehata', f.state, f.sales).map((s) => [s.id, s.status]),
    [
      [a.id, 'busy'],
      [b.id, 'absent'],
    ],
  );
});
