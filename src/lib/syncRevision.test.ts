// ─── Two devices, one cloud row ───
//
// These tests replay the report that started this fix:
//
//   «فتحت نفس الحساب من جهاز تاني لقيت بيانات تانية في سجل الحضور والدور
//    متغير، وبعد reload من الجهاز التاني لقيت جهازي هو اللي اتغير… ومفروض
//    العكس، لأني أنا اللي حضّرت الناس من جهازي.»
//
//  plus «بدء يوم جديد» على جهاز مش بيوصل للأجهزة التانية.
//
//  A fake cloud row and two simulated devices run the real decision function
//  (`decideSync`), so a regression in the ordering rules shows up here instead
//  of on the manager's phone.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideSync, nextLocalRevision, pendingStampOf } from './syncRevision.ts';

interface Row {
  payload: { board: string[] };
  updatedAt: number;
}

/** One device: a board, the revision it is known by, and unsent edits. */
class Device {
  board: string[];
  localRevision: number;
  pending = false;
  writes = 0;

  constructor(initial: string[], localRevision: number) {
    this.board = [...initial];
    this.localRevision = localRevision;
  }

  /** A human action on the screen (adds a name). */
  edit(name: string, now: number): void {
    this.board = [...this.board, name];
    this.localRevision = nextLocalRevision(this.localRevision, now);
    this.pending = true;
  }

  /** «بدء يوم جديد» — a normal edit that resets the day. */
  newDay(now: number): void {
    this.board = [];
    this.localRevision = nextLocalRevision(this.localRevision, now);
    this.pending = true;
  }

  /** A read of the shared row (boot/connect or the 4s poll). */
  read(cloud: { row: Row | null }, mode: 'connect' | 'poll', seed?: string[]): void {
    if (!cloud.row) {
      if (mode === 'connect') {
        const stamp = nextLocalRevision(this.localRevision, 1_000);
        cloud.row = { payload: { board: [...(seed ?? this.board)] }, updatedAt: stamp };
        this.localRevision = stamp;
      }
      return;
    }
    const action = decideSync({
      remoteRevision: cloud.row.updatedAt,
      localRevision: this.localRevision,
      hasPendingEdits: this.pending,
      mode,
    });
    if (action === 'adopt-remote') {
      this.board = [...cloud.row.payload.board];
      this.localRevision = cloud.row.updatedAt;
      this.pending = false;
    } else if (action === 'push-local') {
      this.push(cloud);
    }
  }

  /** An upload attempt with this device's current stamp. */
  push(cloud: { row: Row | null }): void {
    const stamp = this.localRevision;
    if (cloud.row && cloud.row.updatedAt >= stamp) {
      // Server refuses: another device wrote at least as recently.
      this.board = [...cloud.row.payload.board];
      this.localRevision = cloud.row.updatedAt;
      this.pending = false;
      return;
    }
    cloud.row = { payload: { board: [...this.board] }, updatedAt: stamp };
    this.writes += 1;
    this.pending = false;
  }
}

test('a device that only opens the app adopts the cloud row — it never pushes its old board', () => {
  const cloud: { row: Row | null } = { row: null };
  const phone = new Device([], 0);
  phone.edit('Manar', 1_000);
  phone.edit('Rewaida', 1_200);
  phone.push(cloud);
  assert.deepEqual(cloud.row?.payload.board, ['Manar', 'Rewaida']);

  // The laptop built its local bucket LONG ago (stamp far in the future, the
  // corrupted revision the old code wrote on open) and has no real edit.
  const laptop = new Device(['stale'], 9_999_999);
  laptop.read(cloud, 'connect');

  assert.deepEqual(laptop.board, ['Manar', 'Rewaida'], 'the laptop must show the phone’s attendance');
  assert.equal(laptop.writes, 0, 'opening the app must never upload anything');
  assert.deepEqual(cloud.row?.payload.board, ['Manar', 'Rewaida'], 'the cloud row must not be overwritten');
});

test('«بدء يوم جديد» on one device reaches the other on its next poll', () => {
  const cloud: { row: Row | null } = { row: null };
  const phone = new Device([], 0);
  phone.edit('Ahmed', 1_000);
  phone.push(cloud);

  const laptop = new Device(['seed'], 0);
  laptop.read(cloud, 'connect');
  assert.deepEqual(laptop.board, ['Ahmed']);

  phone.newDay(5_000);
  phone.push(cloud);
  assert.deepEqual(cloud.row?.payload.board, []);

  laptop.read(cloud, 'poll');
  assert.deepEqual(laptop.board, [], 'the new day must clear the laptop too');
});

test('a real edit on the other device still propagates while this one is idle', () => {
  const cloud: { row: Row | null } = { row: { payload: { board: [] }, updatedAt: 1_000 } };
  const laptop = new Device([], 1_000);
  laptop.read(cloud, 'poll');
  cloud.row = { payload: { board: ['Hany'] }, updatedAt: 2_000 };
  laptop.read(cloud, 'poll');
  assert.deepEqual(laptop.board, ['Hany']);
});

test('unsent edits that are newer than the cloud are pushed, older ones are dropped', () => {
  const newer = decideSync({ remoteRevision: 1_000, localRevision: 2_000, hasPendingEdits: true, mode: 'poll' });
  assert.equal(newer, 'push-local');

  const older = decideSync({ remoteRevision: 3_000, localRevision: 2_000, hasPendingEdits: true, mode: 'poll' });
  assert.equal(older, 'adopt-remote');
});

test('an offline edit made after the last cloud write survives a reconnect', () => {
  const cloud: { row: Row | null } = { row: { payload: { board: ['old'] }, updatedAt: 1_000 } };
  const phone = new Device(['old'], 1_000);
  phone.edit('Offline check-in', 4_000); // made while there was no network
  phone.read(cloud, 'connect'); // reconnects later
  assert.deepEqual(cloud.row?.payload.board, ['old', 'Offline check-in']);
  assert.equal(phone.pending, false);
});

test('a poll with nothing pending and the same revision is a no-op (no upload churn)', () => {
  assert.equal(
    decideSync({ remoteRevision: 5, localRevision: 5, hasPendingEdits: false, mode: 'poll' }),
    'noop',
  );
});

test('the first device seeds the row instead of overwriting it later', () => {
  assert.equal(decideSync({ remoteRevision: null, localRevision: 0, hasPendingEdits: false, mode: 'connect' }), 'seed');
  assert.equal(decideSync({ remoteRevision: null, localRevision: 3, hasPendingEdits: true, mode: 'connect' }), 'push-local');
});

test('a row that went backwards is republished, never silently accepted as the newest day', () => {
  assert.equal(
    decideSync({ remoteRevision: 10, localRevision: 20, hasPendingEdits: false, mode: 'poll' }),
    'push-local',
  );
});

test('edit stamps are strictly increasing on the server clock', () => {
  assert.equal(nextLocalRevision(0, 1_000), 1_000);
  assert.equal(nextLocalRevision(1_000, 1_000), 1_001);
  assert.equal(nextLocalRevision(1_000, 900), 1_001, 'a slow device clock cannot move the revision backwards');
});

test('only an unsent edit is saved with a pending stamp (it is what a reload can resume)', () => {
  assert.equal(pendingStampOf(1_500, true), 1_500);
  assert.equal(pendingStampOf(1_500, false), undefined);
});
