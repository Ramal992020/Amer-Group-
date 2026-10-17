import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import { createAttendanceWorkbook, directorFor, managerPhoneFor } from './attendanceExcel.ts';
import type { AttendanceWorkbookRow } from './attendanceExcel.ts';

const sample: AttendanceWorkbookRow[] = [{
  person: { id: 'sam', name: 'Sam Sales', managerId: 'ahmed', headId: 'khaled', phone: '01000000000' },
  manager: { id: 'ahmed', name: 'Ahmed Yossry', ar: '', headId: 'khaled', phone: '01111111111' },
  head: { id: 'khaled', name: 'Khaled Youssef', ar: '' },
  attendance: { status: 'available', checkInOrder: 1, checkInTime: '2026-10-17T08:25:00.000Z', walkCount: 0, lastServedAt: null },
}];

test('attendance workbook uses the requested six headers and data columns', () => {
  const workbook = createAttendanceWorkbook(sample);
  const sheet = workbook.Sheets['Sales Team'];
  const exportedRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  assert.deepEqual(exportedRows.slice(0, 3), [
    ['Sales Team', '', '', '', '', '', ''],
    ['sales', 'Director', 'Manager Number', 'Head', 'Shift time', 'time in', 'Mobile Number'],
    ['Sam Sales', 'Sayed Magdy', '01111111111', 'Khaled Youssef', '10:00', '08:25', '01000000000'],
  ]);
  assert.equal(sheet['!ref'], 'A1:G39');
  assert.equal(sheet['!merges']?.[0].e.c, 6);
  assert.equal(sheet.G1.s.fill.fgColor.rgb, '172943');
  assert.equal(sheet.A1.s.fill.fgColor.rgb, '172943');
  assert.equal(sheet.A2.s.fill.fgColor.rgb, 'C00000');
  // Data rows: white background (the gray template fill is gone) and bold text,
  // while the navy/red header rows above keep their fills.
  assert.equal(sheet.A3.s.fill.fgColor.rgb, 'FFFFFF');
  assert.equal(sheet.A3.s.font.bold, true);
  assert.equal(sheet.A1.s.font.bold, true);
  assert.equal(sheet.A2.s.font.bold, true);
  // The blank rows of the 39-row canvas are styled the same way (white + bold).
  assert.equal(sheet.A12.s.fill.fgColor.rgb, 'FFFFFF');
  assert.equal(sheet.A12.s.font.bold, true);
  // Every data cell of the last column is styled too (7 columns, not 6).
  assert.equal(sheet.G3.s.fill.fgColor.rgb, 'FFFFFF');
  assert.equal(sheet.G3.s.font.bold, true);
});

test('directors resolve by stable team id, known team name, then head fallback', () => {
  assert.equal(directorFor('Any renamed team', 'Head Name', 'ahmed'), 'Sayed Magdy');
  assert.equal(directorFor('Youssef Shehata'), 'Ahmed Elrawy');
  assert.equal(directorFor('Other Team', 'Head Name'), 'Head Name');
});

test('the manager number falls back to the manager\'s own attendance row', () => {
  const [row] = sample;
  assert.equal(managerPhoneFor(row), '01111111111');
  assert.equal(managerPhoneFor({ ...row, manager: { ...row.manager!, phone: '' } }), '');
  assert.equal(
    managerPhoneFor({
      ...row,
      manager: { ...row.manager!, phone: '' },
      person: { ...row.person, name: 'Ahmed Yossry', isManager: true, phone: '01222222222' },
    }),
    '01222222222',
  );
  assert.equal(
    managerPhoneFor({ ...row, manager: { ...row.manager!, phone: '' }, managerPhone: '01099999999' }),
    '01099999999',
  );
});
