import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import { createAttendanceWorkbook, directorFor } from './attendanceExcel.ts';
import type { AttendanceWorkbookRow } from './attendanceExcel.ts';

const sample: AttendanceWorkbookRow[] = [{
  person: { id: 'sam', name: 'Sam Sales', managerId: 'ahmed', headId: 'khaled', phone: '01000000000' },
  manager: { id: 'ahmed', name: 'Ahmed Yossry', ar: '', headId: 'khaled' },
  head: { id: 'khaled', name: 'Khaled Youssef', ar: '' },
  attendance: { status: 'available', checkInOrder: 1, checkInTime: '2026-10-17T08:25:00.000Z', walkCount: 0, lastServedAt: null },
}];

test('attendance workbook uses the requested six headers and data columns', () => {
  const workbook = createAttendanceWorkbook(sample);
  const sheet = workbook.Sheets['Sales Team'];
  const exportedRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  assert.deepEqual(exportedRows.slice(0, 3), [
    ['Sales Team', '', '', '', '', ''],
    ['sales', 'Director', 'Head', 'Shift time', 'time in', 'Mobile Number'],
    ['Sam Sales', 'Sayed Magdy', 'Khaled Youssef', '10:00', '08:25', '01000000000'],
  ]);
  assert.equal(sheet['!ref'], 'A1:F39');
  assert.equal(sheet['!merges']?.[0].e.c, 5);
  assert.equal(sheet.A1.s.fill.fgColor.rgb, '172943');
  assert.equal(sheet.A2.s.fill.fgColor.rgb, 'C00000');
});

test('directors resolve by stable team id, known team name, then head fallback', () => {
  assert.equal(directorFor('Any renamed team', 'Head Name', 'ahmed'), 'Sayed Magdy');
  assert.equal(directorFor('Youssef Shehata'), 'Ahmed Elrawy');
  assert.equal(directorFor('Other Team', 'Head Name'), 'Head Name');
});
