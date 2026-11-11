import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { activeRosterRows, createActiveRosterWorkbook } from './activeRosterExcel.ts';
import type { HeadGroup, ManagerTeam, SalesPerson } from './walkin.ts';

const heads: HeadGroup[] = [{ id: 'h', name: 'Head', ar: '' }, { id: 'off', name: 'Off', ar: '', disabled: true }];
const managers: ManagerTeam[] = [
  { id: 'm', name: 'Manager', ar: '', headId: 'h' },
  { id: 'p', name: 'Perry', ar: '', headId: 'h' },
  { id: 'off', name: 'Off', ar: '', headId: 'off' },
  { id: 'team-off', name: 'Disabled team', ar: '', headId: 'h', disabled: true },
];
const sales: SalesPerson[] = [
  { id: '1', name: 'Manager', managerId: 'm', headId: 'h', isManager: true },
  { id: '2', name: 'Sales', managerId: 'm', headId: 'h' },
  { id: '3', name: 'Disabled', managerId: 'm', headId: 'h', disabled: true },
  { id: '4', name: 'Perry', managerId: 'p', headId: 'h', isManager: true },
  { id: '5', name: 'Team member', managerId: 'p', headId: 'h' },
  { id: '6', name: 'Head disabled', managerId: 'off', headId: 'off' },
  { id: '7', name: 'Team disabled', managerId: 'team-off', headId: 'h' },
  { id: '8', name: 'Ahmed Sultan', managerId: 'm', headId: 'h', isManager: true },
  { id: '9', name: 'Dina Abdo', managerId: 'm', headId: 'h', isManager: true, disabled: false },
];

test('exports active people only, not Perry or empty team records', () => {
  const rows = activeRosterRows(heads, managers, sales);
  assert.deepEqual(rows.map(r => r.name), ['Manager', 'Sales', 'Team member', 'Dina Abdo']);
  assert.deepEqual(rows.map(r => r.role), ['مدير', 'سيلز', 'سيلز', 'مدير']);
  assert.equal(rows[2].team, 'Perry');
});
test('workbook contains the requested columns and active entries', () => {
  const sheet = createActiveRosterWorkbook(heads, managers, sales).Sheets['المفعلون'];
  assert.deepEqual([sheet.A1.v, sheet.B1.v, sheet.C1.v], ['الاسم', 'الوظيفة', 'الفريق']);
  assert.equal(sheet.A2.v, 'Manager');
  assert.equal(sheet.A5.v, 'Dina Abdo');
});
