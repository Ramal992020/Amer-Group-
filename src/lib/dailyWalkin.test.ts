import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createDailyWalkinWorkbook, dailyWalkinFilename, localDay } from './dailyWalkin.ts';

test('daily sheet has the requested name and columns, including for empty days', () => {
  assert.equal(dailyWalkinFilename('2026-11-05'), 'walk-in sheet 5-11-2026.xlsx');
  const sheet = createDailyWalkinWorkbook('2026-11-05', []).Sheets['Walk in'];
  assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1'].map(a => sheet[a].v),
    ['Client name', 'Client number', 'Date', 'Time', 'Rotation Turn']);
  assert.equal(sheet.A2.v, '');
});

test('only the selected local day is exported and mobile remains text', () => {
  const date = new Date(2026, 10, 5, 10, 30);
  const sheet = createDailyWalkinWorkbook(localDay(date), [
    { id: '1', name: 'Client', mobile: '01001234567', createdAt: date.toISOString(), director: 'Director' },
    { id: '2', name: 'Other', mobile: '2', createdAt: new Date(2026, 10, 6).toISOString(), director: '' },
  ]).Sheets['Walk in'];
  assert.equal(sheet.A2.v, 'Client');
  assert.equal(sheet.B2.v, '01001234567');
  assert.equal(sheet.B2.t, 's');
  assert.equal(sheet.E2.v, 'Director');
  assert.equal(sheet.A3.v, '');
});
