import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { attendanceStatement } from './attendanceStatement.ts';

test('manager attendance statement uses the Portsaid heading for each branch', () => {
  assert.equal(attendanceStatement('Ahmed', 'SITE', '10:15 AM', true), 'Portsaid (Site)\nName: Ahmed\nTime : 10:15 AM');
  assert.equal(attendanceStatement('Ahmed', 'RESTA', '10:15 AM', true), 'Portsaid (Resta)\nName: Ahmed\nTime : 10:15 AM');
});

test('sales attendance statement remains unchanged', () => {
  assert.equal(attendanceStatement('Sara', 'SITE', '10:15 AM', false), 'NAME : Sara\nBRANCH : SITE\nTIME : 10:15 AM');
  assert.equal(attendanceStatement('Sara', 'RESTA', '10:15 AM'), 'NAME : Sara\nBRANCH : RESTA\nTIME : 10:15 AM');
});
