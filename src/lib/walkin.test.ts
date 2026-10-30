import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTOMATIC_TEAM_ORDER,
  HEADS,
  MANAGERS,
  SALES,
  availableTeamMembers,
  canAdoptRemoteOrg,
  changeSalesAttendance,
  carryOverForNewDay,
  computeNextTeam,
  computeNextTurn,
  computeTurnPlan,
  createNewDaySalesState,
  defaultSalesState,
  hydrate,
  loadPersisted,
  mirrorOrgChart,
  predictFullRound,
  receiptText,
  savePersisted,
  setActiveAccount,
  successorTeam,
  swapInCustomOrder,
  teamOrderFrom,
  teamRoundFrom,
  turnPinFor,
  turnDisplayName,
  visitHeadline,
} from './walkin.ts';
import type {
  Assignment,
  CarryOver,
  ComputedTurn,
  HeadGroup,
  ManagerTeam,
  OrgChart,
  PersistedWalkin,
  PinnedTurn,
  RotationOptions,
  SalesPerson,
  SalesState,
  ShiftedTeam,
  TeamTurn,
  TurnIdentity,
} from './walkin.ts';

const HALA = 'custom-hala-913';
const DINA = 'custom-dina-247';
const HANY = 'custom-hany-512';
const GANNAH = 'custom-gannah-388';
const SULTAN = 'custom-sultan-641';
// The requested automatic cycle:
//   Ahmed Yossry → Youssef Shehata → Rewaida → Hany Elshenawy → Perry →
//   Ahmed Sultan's team → back to Ahmed Yossry.
// Hala Elfar's team, Gannah Elmalah's team and Dina Abdo stay in the org but are
// NOT part of the cycle any more.
const CYCLE = ['ahmed', 'shehata', 'rewaida', HANY, 'perry', SULTAN];
const WORKSPACES = ['RESTA', 'SITE'] as const;

interface Fixture {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  state: Record<string, SalesState>;
}

// Use saved/custom team IDs, shuffled org order and reverse attendance priority.
// Perry, Tarek, Hala, Gannah and Dina remain in the org to ensure the fixed
// cycle leaves shared data alone (Hala, Gannah and Dina are deliberately
// outside the configured cycle).
function fixture(membersPerTeam = 1): Fixture {
  const heads = structuredClone(HEADS);
  const managers: ManagerTeam[] = [
    ...structuredClone(MANAGERS),
    { id: HALA, name: 'Hala El Far', ar: 'هالة الفار', headId: 'wael' },
    { id: DINA, name: 'Dina Abdo', ar: 'دينا عبده', headId: 'mohamed-samir' },
    { id: HANY, name: 'Hany Elshenawy', ar: 'هاني الشناوي', headId: 'wael' },
    { id: GANNAH, name: 'Gannah Elmalah', ar: 'جنة الملا', headId: 'mohamed-samir' },
    { id: SULTAN, name: 'Ahmed Sultan', ar: 'أحمد سلطان', headId: 'mohamed-samir' },
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
    { id: 'ahmed-sultan', name: 'Ahmed Sultan', aliases: ['Hala Elfar'] },
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

test('each team is followed by its fixed successor, including Ahmed Sultan back to Ahmed', () => {
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
  setTeamStatus(f, SULTAN, 'absent');
  assert.deepEqual(teamOrderFrom(f.managers, 'shehata', undefined, f.sales).map((t) => t.id), [
    'shehata', 'rewaida', HANY, 'perry', SULTAN, 'ahmed',
  ]);
  // Every cycle team appears exactly once, so the tab can show who is missing.
  assert.equal(teamOrderFrom(f.managers).length, CYCLE.length);
  assert.equal(teamOrderFrom(f.managers).filter((t) => t.id === SULTAN).length, 1);
});

test('successorTeam continues the cycle and falls back to its start for unknown teams', () => {
  const f = fixture();
  assert.equal(successorTeam(f.managers, 'ahmed', undefined, f.sales)?.id, 'shehata');
  assert.equal(successorTeam(f.managers, SULTAN, undefined, f.sales)?.id, 'ahmed');
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
    // Everybody on Sultan's team is absent EXCEPT Sultan himself — he can still
    // sit with the client, so his team's turn is not skipped.
    f.sales.filter((s) => s.managerId === SULTAN && !s.isManager).forEach((s) => {
      f.state[s.id].status = 'absent';
    });
    assert.equal(f.state[`${SULTAN}-self`].status, 'available');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, SULTAN);
    assert.deepEqual(
      availableTeamMembers(SULTAN, f.state, f.sales).map((s) => s.id),
      [`${SULTAN}-self`],
    );
    assert.deepEqual(round(f, undefined, { workspace }).map((t) => t.managerId), CYCLE);
  }
});

test('a team with the manager AND every teammate absent is skipped like any other empty team', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, SULTAN, 'absent');
    assert.equal(f.state[`${SULTAN}-self`].status, 'absent');
    assert.equal(next(f, [teamHistory(f, 'perry')], { workspace })?.managerId, 'ahmed');
    assert.deepEqual(
      round(f, undefined, { workspace }).map((t) => t.managerId),
      CYCLE.filter((id) => id !== SULTAN),
    );
  }
});

test('a carried team keeps the first turn until it is served today', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture(2);
    const pending = carry(f, 'rewaida');
    // Even after another team was served, yesterday's unserved team is first.
    assert.equal(next(f, [teamHistory(f, SULTAN)], { workspace, carryOver: pending })?.managerId, 'rewaida');
    // Once it is served today the cycle moves on from it.
    assert.equal(
      next(f, [teamHistory(f, SULTAN), teamHistory(f, 'rewaida')], { workspace, carryOver: pending })?.managerId,
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

test('a Rewaida carry-over continues through Hany, Perry and Sultan to Ahmed; a Sultan one wraps to Ahmed first', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const rew = carry(f, 'rewaida');
    assert.deepEqual(
      round(f, undefined, { workspace, carryOver: rew }).map((t) => t.managerId),
      ['rewaida', HANY, 'perry', SULTAN, 'ahmed', 'shehata'],
    );
    const sultan = carry(f, SULTAN);
    assert.deepEqual(
      round(f, undefined, { workspace, carryOver: sultan }).map((t) => t.managerId),
      [SULTAN, 'ahmed', 'shehata', 'rewaida', HANY, 'perry'],
    );
  }
});

test('each of the six carried teams starts the next day before its successor in both workspaces', () => {
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
      ['rewaida', HANY, 'perry', SULTAN, 'ahmed', 'shehata'],
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
      'rewaida', HANY, 'perry', SULTAN, 'ahmed', 'shehata',
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
      HANY, 'perry', SULTAN, 'ahmed', 'shehata',
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

test('only the six configured teams participate; a missing custom team is safely skipped', () => {
  // The last slot names two people of ONE team, so when Sultan's own card is
  // gone the team is still found under Hala Elfar's name.
  for (const workspace of WORKSPACES) {
    const f = fixture();
    CYCLE.forEach((id) => setTeamStatus(f, id, 'absent'));
    assert.equal(next(f, [], { workspace }), null);
    assert.deepEqual(round(f, undefined, { workspace }), []);

    const withMissing = fixture();
    withMissing.managers = withMissing.managers.filter((m) => m.id !== SULTAN);
    withMissing.sales = withMissing.sales.filter((s) => s.managerId !== SULTAN);
    assert.deepEqual(round(withMissing, undefined, { workspace }).map((t) => t.managerId), [
      'ahmed', 'shehata', 'rewaida', HANY, 'perry', HALA,
    ]);
  }
});

test('the live «تيم Ahmed Sultan» card — manager Ahmed Sultan, sales Hala Elfar — takes the last slot', () => {
  const managers: ManagerTeam[] = [
    ...structuredClone(MANAGERS),
    { id: 'custom-sultan-641', name: 'Ahmed Sultan', ar: 'أحمد سلطان', headId: 'khaled' },
    { id: HANY, name: 'Hany Elshenawy', ar: 'هاني الشناوي', headId: 'wael' },
    // A leftover team that only CARRIES Hala's name: it must never take the slot.
    { id: 'custom-hala-913', name: 'Hala Elfar', ar: 'هالة الفار', headId: 'wael' },
  ];
  const sales: SalesPerson[] = managers.flatMap((m) => [
    { id: `${m.id}-self`, name: m.name, managerId: m.id, headId: m.headId, isManager: true },
  ]);
  // Hala is a SALES person inside Ahmed Sultan's team (the card in the app).
  sales.push({ id: 'custom-hala-member', name: 'Hala Elfar', managerId: 'custom-sultan-641', headId: 'khaled' });

  const order = teamOrderFrom(managers, undefined, undefined, sales);
  assert.deepEqual(order.map((t) => t.id), [
    'ahmed', 'shehata', 'rewaida', HANY, 'perry', 'custom-sultan-641',
  ]);
  // …and the empty namesake team is not in the rotation at all.
  assert.ok(!order.some((t) => t.id === 'custom-hala-913'));
  assert.equal(successorTeam(managers, 'perry', undefined, sales)?.id, 'custom-sultan-641');
  assert.equal(successorTeam(managers, 'custom-sultan-641', undefined, sales)?.id, 'ahmed');
});

test('the last slot is ONE team under two names: Ahmed Sultan\'s team is Hala Elfar\'s team', () => {
  // Saved under Hala's name (Sultan is only a member): the slot still resolves.
  const f = fixture();
  f.managers = f.managers.filter((m) => m.id !== SULTAN);
  f.sales = f.sales.filter((s) => s.managerId !== SULTAN);
  const order = teamOrderFrom(f.managers, undefined, undefined, f.sales);
  assert.equal(order.length, 6);
  assert.equal(order.at(-1)?.id, HALA);
  assert.equal(successorTeam(f.managers, 'perry', undefined, f.sales)?.id, HALA);
  assert.equal(successorTeam(f.managers, HALA, undefined, f.sales)?.id, 'ahmed');

  // Saved under Sultan's name (Hala is only a member): the same slot resolves.
  const g = fixture();
  g.managers = g.managers.filter((m) => m.id !== HALA);
  g.sales = g.sales.filter((s) => s.managerId !== HALA);
  assert.equal(teamOrderFrom(g.managers, undefined, undefined, g.sales).at(-1)?.id, SULTAN);
  assert.equal(successorTeam(g.managers, 'perry', undefined, g.sales)?.id, SULTAN);
});

test('a removed last-served custom team no longer anchors the cycle', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    const previous = teamHistory(f, SULTAN);
    f.managers = f.managers.filter((m) => m.id !== SULTAN);
    f.sales = f.sales.filter((s) => s.managerId !== SULTAN);
    assert.equal(next(f, [previous], { workspace })?.managerId, 'ahmed');
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
      if (m.id === SULTAN) m.name = '  ahmed   SULTAN ';
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
  // team cycle does not touch: Hany (Wael) and Sultan (Mohamed Samir) simply
  // join the "other Heads" side here.
  const expected = [
    'perry', HANY, 'rewaida', SULTAN, 'ahmed', HALA, GANNAH, 'shehata', DINA, 'tarek-osman',
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
      skippedIds: [],
      undoStack: [],
    };
    const resta: PersistedWalkin = {
      ...site,
      history: [teamHistory(f, HALA)],
      counter: 7,
      seq: 7,
      carryOver: restaPending,
    };
    savePersisted(site, 'SITE');
    savePersisted(resta, 'RESTA');

    const loadedSite = loadPersisted('SITE');
    const loadedResta = loadPersisted('RESTA');
    assert.equal(loadedSite.history[0].managerId, 'ahmed');
    assert.equal(loadedResta.history[0].managerId, HALA);
    assert.equal(loadedSite.carryOver?.managerId, 'rewaida');
    assert.equal(loadedResta.carryOver?.managerId, DINA);

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
  const sultanTeam = sharedTeam ? 'custom-team-77' : 'custom-team-19';
  const sales: SalesPerson[] = [
    { id: 'ahmed-self', name: 'Ahmed Yossry', managerId: 'ahmed', headId: 'khaled', isManager: true },
    // A manager row alone never makes a team eligible — Ahmed needs a member.
    { id: 'ahmed-member-1', name: 'Ahmed member 1', managerId: 'ahmed', headId: 'khaled' },
    { id: 'seven-lead', name: 'Seven Lead', managerId: 'custom-team-77', headId: 'wael', isManager: true },
    // «التيم اللي فيه هاني الشناوي» — Hany is a member, not a team of his own.
    { id: 'hany-elshenawy', name: 'Hany Elshenawy', managerId: 'custom-team-77', headId: 'wael' },
    { id: 'nineteen-lead', name: 'Nineteen Lead', managerId: sultanTeam, headId: 'mohamed-samir', isManager: true },
    // «التيم اللي فيه أحمد سلطان» — Sultan is a member too.
    { id: 'ahmed-sultan', name: 'Ahmed Sultan', managerId: sultanTeam, headId: 'mohamed-samir' },
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
    s.id === 'hany-elshenawy' ? { ...s, managerId: 'custom-team-19' } : s,
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

test('the order tab shows exactly the cycle the engine rotates with', () => {
  const f = fixture();
  const custom: TeamCycleSettings = { mode: 'custom', order: ['perry', DINA, 'ahmed'] };

  // The custom cycle is the ONLY order shown, and the ONLY order the engine
  // reads — there is no second, per-device list that could contradict it (that
  // is what used to show a team at #1 while «الرئيسية» announced another one).
  assert.deepEqual(
    teamRoundFrom(f.managers, undefined, custom, f.sales).map((t) => t.id),
    ['perry', DINA, 'ahmed'],
  );
  // …and it is still rotated so the team on turn comes first.
  assert.deepEqual(
    teamRoundFrom(f.managers, DINA, custom, f.sales).map((t) => t.id),
    [DINA, 'ahmed', 'perry'],
  );
  // Automatic cycle: the list is the built-in cycle (rotated at the turn).
  const auto = teamRoundFrom(f.managers, undefined, undefined, f.sales).map((t) => t.id);
  assert.deepEqual(
    teamRoundFrom(f.managers, auto[0], undefined, f.sales).map((t) => t.id),
    auto,
  );
  assert.deepEqual(
    teamRoundFrom(f.managers, auto[2], undefined, f.sales).map((t) => t.id),
    [...auto.slice(2), ...auto.slice(0, 2)],
  );
});

test('moving a team on the order tab really moves the turn (engine and tab agree)', () => {
  const f = fixture();
  // The list the manager sees: Ahmed Yossry on turn, Shehata next, …
  const shown = teamRoundFrom(f.managers, 'ahmed', undefined, f.sales).map((t) => t.id);
  // Every arrow press on the tab stores the visible order as the cycle.
  const moved = swapInCustomOrder(shown, shown[1], shown[2]);
  const saved: TeamCycleSettings = { mode: 'custom', order: moved };

  // The engine now continues in that order: the teams after the one on turn
  // come in the sequence the manager arranged, so the tab cannot disagree.
  assert.deepEqual(teamRoundFrom(f.managers, shown[0], saved, f.sales).map((t) => t.id), moved);

  // Serving the team on turn hands the turn to the NEXT team of that order.
  const plan = computeTurnPlan(f.state, [teamHistory(f, shown[0])], f.managers, f.sales, f.heads, {
    workspace: 'RESTA',
    cycle: saved,
  });
  assert.equal(plan.serving?.managerId, moved[1]);
});

test('«الدور من هنا» only moves the TURN — the order keeps running as it is', () => {
  const f = fixture();
  const served = teamHistory(f, 'ahmed');
  const history = [served];

  // Without it: the cycle continues after Ahmed Yossry → Shehata serves.
  assert.equal(plan(f, history).serving?.managerId, 'shehata');

  // The manager taps ▶ on Hany Elshenawy's team.
  const pin: PinnedTurn = turnPinFor(f.managers.find((m) => m.id === HANY)!, f.heads);
  assert.equal(plan(f, history, { pinnedTurn: pin }).serving?.managerId, HANY);
  assert.equal(plan(f, history, { pinnedTurn: pin }).onTurn?.id, HANY);
  assert.equal(plan(f, history, { pinnedTurn: pin }).onTurnPinned, true);

  // The ORDER is untouched: once Hany's team has served, the rotation simply
  // continues with the next team of the built-in cycle (Perry → Sultan → …),
  // NOT with whatever followed the last served team before the press.
  const afterHany = [served, teamHistory(f, HANY)];
  assert.deepEqual(
    [...Array(4)].reduce<{ ids: string[]; history: Assignment[] }>(
      (acc) => {
        const next = plan(f, acc.history).serving?.managerId;
        return next
          ? { ids: [...acc.ids, next], history: [...acc.history, teamHistory(f, next)] }
          : acc;
      },
      { ids: [], history: afterHany },
    ).ids,
    ['perry', SULTAN, 'ahmed', 'shehata'],
  );

  // A pinned team holds the turn even if it already served today…
  assert.equal(plan(f, [teamHistory(f, HANY)], { pinnedTurn: pin }).serving?.managerId, HANY);
  // …and it works the same on a custom order, without touching its list.
  const custom: TeamCycleSettings = { mode: 'custom', order: ['ahmed', 'perry', SULTAN, HANY] };
  assert.deepEqual(
    teamOrderFrom(f.managers, undefined, custom, f.sales).map((t) => t.id),
    ['ahmed', 'perry', SULTAN, HANY],
  );
  assert.equal(plan(f, history, { pinnedTurn: pin, cycle: custom }).serving?.managerId, HANY);
});

test('a pinned turn with nobody present is shown and shifted to the next team', () => {
  const f = fixture();
  const pin = turnPinFor(f.managers.find((m) => m.id === HANY)!, f.heads);
  f.sales.filter((s) => s.managerId === HANY).forEach((s) => (f.state[s.id].status = 'absent'));

  const turn = plan(f, [], { pinnedTurn: pin });
  assert.equal(turn.onTurn?.id, HANY);
  assert.equal(turn.onTurnPinned, true);
  assert.equal(turn.serving?.managerId, 'perry');
  assert.deepEqual(turn.shiftedTeams.map((t) => t.managerId), [HANY]);
});

test('a pinned turn is per-branch state that survives a save/load', () => {
  const f = fixture();
  const pin = turnPinFor(f.managers.find((m) => m.id === HANY)!, f.heads);
  const state: PersistedWalkin = {
    salesState: f.state,
    history: [],
    counter: 0,
    seq: 0,
    startingHead: 'khaled',
    carryOver: null,
    pinnedTurn: pin,
    lastResetAt: null,
    customHeads: f.heads,
    customManagers: f.managers,
    customSales: f.sales,
    skippedIds: [],
    undoStack: [],
  };
  withMemoryLocalStorage(() => {
    savePersisted(state, 'RESTA');
    assert.equal(loadPersisted('RESTA').pinnedTurn?.managerId, HANY);
    // A malformed / empty pin is dropped instead of breaking the rotation.
    const cleaned = hydrate({ ...state, pinnedTurn: { managerId: '  ' } as PinnedTurn });
    assert.equal(cleaned.pinnedTurn, null);
  });
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

// ───────────── «الدور الحالي» يظهر حتى لو محدش حضر + التخطي ─────────────

/** Everybody in the roster is absent (nobody checked in). */
function everyoneAbsent(f: Fixture): void {
  f.sales.forEach((s) => {
    f.state[s.id].status = 'absent';
  });
}

const plan = (
  f: Fixture,
  history: Assignment[] = [],
  options: RotationOptions = {},
) => computeTurnPlan(f.state, history, f.managers, f.sales, f.heads, { workspace: 'RESTA', ...options });

test('the team on turn is shown even when nobody has checked in', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    everyoneAbsent(f);
    const turn = plan(f, [], { workspace });
    assert.equal(turn.onTurn?.id, 'ahmed');
    assert.equal(turn.serving, null);
    // Every team of the cycle is passed over, flagged as «nobody attended».
    assert.deepEqual(turn.shiftedTeams.map((t) => t.managerId), CYCLE);
    assert.ok(turn.shiftedTeams.every((t) => t.reason === 'allAbsent'));
    // The legacy single-team API keeps returning only the serving team.
    assert.equal(next(f, [], { workspace }), null);
  }
});

test('an absent team on turn is shifted, and the next present team serves', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, 'ahmed', 'absent');
    const turn = plan(f, [], { workspace });
    assert.equal(turn.onTurn?.id, 'ahmed', 'onTurn ignores attendance');
    assert.equal(turn.serving?.managerId, 'shehata');
    assert.equal(turn.serving?.isFallback, true, 'serving a later team is a fallback turn');
    assert.deepEqual(turn.shiftedTeams, [
      { managerId: 'ahmed', managerName: 'Ahmed Yossry', headId: 'khaled', headName: 'Khaled Youssef', reason: 'absent' },
    ]);
    // computeNextTeam keeps returning the serving team, as before.
    assert.equal(next(f, [], { workspace })?.managerId, 'shehata');
  }
});

test('a team on turn whose members are all with clients is shifted as busy', () => {
  const f = fixture();
  setTeamStatus(f, 'ahmed', 'busy');
  const turn = plan(f);
  assert.equal(turn.onTurn?.id, 'ahmed');
  assert.equal(turn.serving?.managerId, 'shehata');
  assert.deepEqual(turn.shiftedTeams.map((t) => [t.managerId, t.reason]), [['ahmed', 'busy']]);
});

test('several passed-over teams are listed in cycle order, mixing absent and busy', () => {
  const f = fixture();
  setTeamStatus(f, 'ahmed', 'absent');
  setTeamStatus(f, 'shehata', 'busy');
  setTeamStatus(f, 'rewaida', 'absent');
  const turn = plan(f);
  assert.equal(turn.serving?.managerId, HANY);
  assert.deepEqual(
    turn.shiftedTeams.map((t) => [t.managerId, t.reason]),
    [['ahmed', 'absent'], ['shehata', 'busy'], ['rewaida', 'absent']],
  );
});

test('a present on-turn team is not shifted at all', () => {
  const f = fixture();
  const turn = plan(f);
  assert.equal(turn.onTurn?.id, 'ahmed');
  assert.equal(turn.serving?.managerId, 'ahmed');
  assert.equal(turn.serving?.isFallback, false);
  assert.deepEqual(turn.shiftedTeams, []);
});

test('a carried-over team that is absent stays on turn and is shifted', () => {
  for (const workspace of WORKSPACES) {
    const f = fixture();
    setTeamStatus(f, 'rewaida', 'absent');
    const turn = plan(f, [], { workspace, carryOver: carry(f, 'rewaida') });
    assert.equal(turn.onTurn?.id, 'rewaida', 'the carried team is on turn regardless of attendance');
    assert.equal(turn.serving?.managerId, HANY);
    assert.deepEqual(turn.shiftedTeams.map((t) => [t.managerId, t.reason]), [['rewaida', 'absent']]);
  }
});

test('a present carried-over team is on turn without any shift', () => {
  const f = fixture();
  const turn = plan(f, [], { carryOver: carry(f, 'rewaida') });
  assert.equal(turn.onTurn?.id, 'rewaida');
  assert.equal(turn.serving?.managerId, 'rewaida');
  assert.equal(turn.serving?.carriedSalesId, null);
  assert.deepEqual(turn.shiftedTeams, []);
});

test('an absent carried team yields once the cycle has already moved past it today', () => {
  const f = fixture();
  setTeamStatus(f, 'rewaida', 'absent');
  // Someone else was served today, so the carried team is no longer on turn.
  const turn = plan(f, [teamHistory(f, 'ahmed')], { carryOver: carry(f, 'rewaida') });
  assert.equal(turn.onTurn?.id, 'shehata');
  assert.equal(turn.serving?.managerId, 'shehata');
  assert.deepEqual(turn.shiftedTeams, []);
});

test('the custom cycle drives onTurn and the shift the same way', () => {
  const f = fixture();
  const cycle: TeamCycleSettings = { mode: 'custom', order: ['perry', 'ahmed'] };
  setTeamStatus(f, 'perry', 'absent');
  const turn = plan(f, [], { cycle });
  assert.equal(turn.onTurn?.id, 'perry');
  assert.equal(turn.serving?.managerId, 'ahmed');
  assert.deepEqual(turn.shiftedTeams.map((t) => t.managerId), ['perry']);
});

test('the successor («Next») is the literal next team, whether or not it has anybody present', () => {
  const f = fixture();
  setTeamStatus(f, 'shehata', 'absent');
  setTeamStatus(f, 'rewaida', 'absent');
  // successorTeam ignores attendance: the cycle order is what decides «Next».
  assert.equal(successorTeam(f.managers, 'ahmed', undefined, f.sales)?.id, 'shehata');
  assert.equal(successorTeam(f.managers, 'shehata', undefined, f.sales)?.id, 'rewaida');
  assert.equal(successorTeam(f.managers, SULTAN, undefined, f.sales)?.id, 'ahmed');
});

// ───────────── Receipt copy («نسخ البيان») ─────────────

const NEXT_TEAM: ManagerTeam = { id: HANY, name: 'Hany Elshenawy', ar: 'هاني الشناوي', headId: 'wael' };

test('a normal receipt keeps the standard Done lines', () => {
  const a: Assignment = {
    ...assignment({ managerId: 'rewaida', managerName: 'Rewaida', headId: 'khaled', headName: 'Khaled Youssef' }, 2),
    salesName: 'Manar',
    visitType: 'resta',
  };
  assert.equal(
    receiptText(a, NEXT_TEAM),
    'Walk in (Resta) Done ✅\nSales : Manar Done✅\nManager : Rewaida\nHead : Khaled Youssef\nNext : Zeina Hosny',
  );
});

test('a receipt with passed-over teams uses the exact Shifted ❌ format', () => {
  const shifted: ShiftedTeam[] = [
    { managerId: 'ahmed', managerName: 'Ahmed Yossry', headId: 'khaled', headName: 'Khaled Youssef', reason: 'absent' },
    { managerId: 'shehata', managerName: 'Youssef Shehata', headId: 'wael', headName: 'Wael El Desoky', reason: 'busy' },
  ];
  const a: Assignment = {
    ...assignment({ managerId: 'rewaida', managerName: 'Rewaida', headId: 'khaled', headName: 'Khaled Youssef' }, 3),
    salesName: 'Manar',
    visitType: 'site',
    shiftedTeams: shifted,
  };
  assert.equal(
    receiptText(a, NEXT_TEAM),
    [
      'Walk in (Site)',
      'Ahmed Yossry Shifted ❌',
      'Youssef Shehata Shifted ❌',
      'Manar ✅',
      'Manager : Rewaida',
      'Head : Khaled Youssef',
      'Next : Zeina Hosny',
    ].join('\n'),
  );
  // The spelling is fixed on purpose.
  assert.ok(receiptText(a, NEXT_TEAM).includes('Shifted ❌'));
  assert.ok(!receiptText(a, NEXT_TEAM).includes('Shiffted'));
  assert.ok(!receiptText(a, NEXT_TEAM).includes('Shiftted'));
});

test('turn display names apply to the three teams only, without changing the underlying team', () => {
  const cases = [
    [' HANY-elshenawy ', 'هاني الشناوي', 'Zeina Hosny'],
    ['Ahmed Sultan', 'أحمد سلطان', 'Hala Elfar'],
    ['Dina Abdo', 'دينا عبده', 'Ganna Elmalah'],
  ];
  const a: Assignment = { ...assignment({ managerId: 'ahmed', managerName: 'Ahmed Yossry', headId: 'khaled', headName: 'Khaled Youssef' }), salesName: 'Manar', visitType: 'site' };
  for (const [name, ar, expected] of cases) {
    const team: ManagerTeam = { id: 'custom-id', name, ar, headId: 'wael' };
    assert.deepEqual(turnDisplayName(team), { name: expected, isPerson: true });
    assert.ok(receiptText(a, team).endsWith(`Next : ${expected}`));
    const shifted: ShiftedTeam = { managerId: 'other', managerName: 'Other', headId: 'wael', headName: 'Wael', reason: 'absent' };
    assert.ok(receiptText({ ...a, shiftedTeams: [shifted] }, team).endsWith(`Next : ${expected}`));
    assert.equal(team.name, name);
  }
  const other: ManagerTeam = { id: 'other', name: 'Perry', ar: '', headId: 'wael' };
  assert.deepEqual(turnDisplayName(other), { name: 'Perry', isPerson: false });
  assert.ok(receiptText(a, other).endsWith('Next : Perry'));
  assert.deepEqual(turnDisplayName({ name: 'غير معروف', ar: 'هاني الشناوي' }), { name: 'Zeina Hosny', isPerson: true });
});

test('the visit headline names the branch and has no Walk in default for Site/Resta', () => {
  assert.equal(visitHeadline('site'), 'Walk in (Site)');
  assert.equal(visitHeadline('resta'), 'Walk in (Resta)');
});

test('the receipt Next is null-safe when there is no successor', () => {
  const a: Assignment = { ...assignment({ managerId: 'ahmed', managerName: 'Ahmed Yossry', headId: 'khaled', headName: 'Khaled Youssef' }), salesName: 'Manar', visitType: 'site' };
  assert.match(receiptText(a, null), /Next : —$/);
});

// ───────────── Turn order survives storage, reset and the shared chart ─────────────

// Custom order where Perry follows Ahmed (the built-in cycle would give Youssef Shehata).
const CUSTOM_ORDER: TeamCycleSettings = { mode: 'custom', order: ['ahmed', 'perry', 'shehata'] };

test('a custom turn order survives save/load and a new-day reset', () => {
  withMemoryLocalStorage(() => {
    const f = fixture();
    savePersisted(
      {
        salesState: f.state,
        history: [teamHistory(f, 'ahmed')],
        counter: 1,
        seq: 1,
        startingHead: 'khaled',
        carryOver: null,
        lastResetAt: null,
        customHeads: f.heads,
        customManagers: f.managers,
        customSales: f.sales,
        teamCycle: CUSTOM_ORDER,
      },
      'SITE',
    );
    assert.deepEqual(loadPersisted('SITE').teamCycle, normalizeTeamCycle(CUSTOM_ORDER));

    // «بدء يوم جديد» — attendance and history are cleared, the order is kept.
    const before = loadPersisted('SITE');
    const pending = computeTurnPlan(before.salesState, before.history, f.managers, f.sales, f.heads, {
      workspace: 'SITE',
      cycle: before.teamCycle,
    }).serving;
    savePersisted(
      {
        ...before,
        salesState: createNewDaySalesState('SITE', f.sales),
        history: [],
        counter: 0,
        seq: 0,
        carryOver: carryOverForNewDay(null, pending, [], f.heads, 'SITE', undefined, f.managers, before.teamCycle, f.sales),
        lastResetAt: '2026-10-10T06:00:00.000Z',
      },
      'SITE',
    );
    const afterReset = loadPersisted('SITE');
    assert.deepEqual(afterReset.teamCycle, normalizeTeamCycle(CUSTOM_ORDER));
    // Attendance starts empty again, and the team still on turn is carried over
    // (Perry: the custom order's successor of Ahmed, where the built-in cycle says Shehata).
    assert.equal(afterReset.carryOver?.managerId, 'perry');
    const everyonePresent = Object.fromEntries(
      Object.entries(afterReset.salesState).map(([id, st]) => [id, { ...st, status: 'available' as const }]),
    );
    assert.equal(
      computeNextTeam(everyonePresent, [], f.managers, f.sales, f.heads, {
        workspace: 'SITE',
        cycle: afterReset.teamCycle,
        carryOver: afterReset.carryOver,
      })?.managerId,
      'perry',
    );
  });
});

test('mirrorOrgChart carries the custom turn order to the other branch and never downgrades it', () => {
  withMemoryLocalStorage(() => {
    const f = fixture();
    savePersisted(
      {
        salesState: f.state,
        history: [],
        counter: 0,
        seq: 0,
        startingHead: 'khaled',
        carryOver: null,
        lastResetAt: null,
        customHeads: f.heads,
        customManagers: f.managers,
        customSales: f.sales,
        orgRevision: 1,
      },
      'RESTA',
    );
    const chart: OrgChart = {
      heads: f.heads,
      managers: f.managers,
      sales: f.sales,
      removedIds: [],
      cycle: CUSTOM_ORDER,
    };
    mirrorOrgChart('SITE', chart, 5);
    const mirrored = loadPersisted('RESTA');
    assert.deepEqual(mirrored.teamCycle, normalizeTeamCycle(CUSTOM_ORDER));
    assert.equal(mirrored.orgRevision, 5);

    // An older chart must not overwrite a fresher bucket.
    mirrorOrgChart('SITE', { ...chart, cycle: { mode: 'auto', order: [] } }, 3);
    assert.deepEqual(loadPersisted('RESTA').teamCycle, normalizeTeamCycle(CUSTOM_ORDER));
  });
});

// ───────────── Roster guard: a local unpublished order is not wiped ─────────────

test('a same-revision remote roster is ignored while this device has an unpublished edit', () => {
  // Strictly newer always wins.
  assert.equal(canAdoptRemoteOrg(7, 6, true), true);
  assert.equal(canAdoptRemoteOrg(7, 6, false), true);
  // Same revision and nothing pending locally → adopt (normal sync).
  assert.equal(canAdoptRemoteOrg(6, 6, false), true);
  // Same revision but a local edit is not published yet → keep local (republish).
  assert.equal(canAdoptRemoteOrg(6, 6, true), false);
  // An older remote row never wins.
  assert.equal(canAdoptRemoteOrg(5, 6, false), false);
});

// ───────────── Branch-only attendance registration ─────────────

test('a branch transfer leaves the person present only in the chosen branch', () => {
  const absent = (order: number | null = null): SalesState => ({
    status: 'absent',
    checkInOrder: order,
    checkInTime: null,
    walkCount: 0,
    coverCount: 0,
    lastServedAt: null,
  });
  const site: Record<string, SalesState> = {
    manar: {
      ...absent(3),
      status: 'available',
      checkInTime: '2026-10-18T08:30:00.000Z',
    },
    sara: {
      ...absent(7),
      status: 'available',
      checkInTime: '2026-10-18T08:45:00.000Z',
    },
  };
  const resta: Record<string, SalesState> = { manar: absent(), sara: absent() };

  // The production flow writes the destination first, then clears the source.
  const inResta = changeSalesAttendance(resta, 0, 'manar', 'check-in', '2026-10-18T09:00:00.000Z');
  const outOfSite = changeSalesAttendance(site, 7, 'manar', 'check-out');

  assert.equal(inResta.changed, true);
  assert.equal(inResta.salesState.manar.status, 'available');
  assert.equal(inResta.salesState.manar.checkInOrder, 1);
  assert.equal(outOfSite.changed, true);
  assert.equal(outOfSite.salesState.manar.status, 'absent');
  assert.equal(outOfSite.salesState.manar.checkInOrder, null);
  assert.equal(outOfSite.salesState.manar.checkInTime, null);
  // Other people's check-in order and attendance are untouched.
  assert.equal(outOfSite.salesState.sara.status, 'available');
  assert.equal(outOfSite.salesState.sara.checkInOrder, 7);
});

test('branch check-in is idempotent and a busy person cannot be moved', () => {
  const state: Record<string, SalesState> = {
    dina: {
      status: 'available',
      checkInOrder: 4,
      checkInTime: '2026-10-18T08:05:00.000Z',
      walkCount: 0,
      coverCount: 0,
      lastServedAt: null,
    },
    hany: {
      status: 'busy',
      checkInOrder: 5,
      checkInTime: '2026-10-18T08:10:00.000Z',
      walkCount: 1,
      coverCount: 0,
      lastServedAt: null,
    },
  };

  const again = changeSalesAttendance(state, 5, 'dina', 'check-in', '2026-10-18T09:00:00.000Z');
  assert.equal(again.changed, false);
  assert.equal(again.counter, 5);
  assert.equal(again.salesState.dina.checkInTime, '2026-10-18T08:05:00.000Z');

  const busyMove = changeSalesAttendance(state, 5, 'hany', 'check-out');
  assert.equal(busyMove.changed, false);
  assert.equal(busyMove.reason, 'busy');
  assert.equal(busyMove.salesState.hany.status, 'busy');
});
