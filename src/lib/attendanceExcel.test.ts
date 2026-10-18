import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import {
  attendanceRowsFor,
  autoFitColumns,
  autoFitRows,
  autoRowHeight,
  createAttendanceWorkbook,
  directorFor,
  mergeAttendanceRows,
  mobileFor,
  textWidthPx,
} from './attendanceExcel.ts';
import type { AttendanceRoster, AttendanceWorkbookRow } from './attendanceExcel.ts';
import type { SalesPerson, SalesState } from './walkin.ts';

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
    ['Sales Team', '', '', '', '', ''],
    ['sales', 'Director', 'Head', 'Shift time', 'time in', 'Mobile Number'],
    ['Sam Sales', 'Sayed Magdy', 'Khaled Youssef', '10:00', '08:25 AM', '01000000000'],
  ]);
  assert.equal(sheet['!ref'], 'A1:F39');
  assert.equal(sheet['!merges']?.[0].e.c, 5);
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
});

// ─── Arial 20 + AutoFit ───

const HEADERS = ['sales', 'Director', 'Head', 'Shift time', 'time in', 'Mobile Number'];

test('the whole sheet is Arial 20 — title, red header row and data rows alike', () => {
  const sheet = createAttendanceWorkbook(sample).Sheets['Sales Team'];
  for (const address of ['A1', 'A2', 'F2', 'A3', 'F3', 'C12']) {
    assert.equal(sheet[address].s.font.sz, 20, `${address} keeps the sheet font size`);
    assert.equal(sheet[address].s.font.name, 'Arial', `${address} keeps the sheet font`);
  }
});

test('rows and columns are AutoFitted to that text', () => {
  const sheet = createAttendanceWorkbook(sample).Sheets['Sales Team'];
  const cols = sheet['!cols'] ?? [];
  const rows = sheet['!rows'] ?? [];

  // Rows: one fitted height (≈ 1.3 × the font size) for every row of the canvas.
  assert.equal(rows.length, 39);
  assert.deepEqual([...new Set(rows.map((row) => row.hpt))], [autoRowHeight(20)]);
  assert.equal(autoRowHeight(20), 26);

  // Columns: six fitted widths, no leftover of the old hard-coded template sizes.
  assert.equal(cols.length, 6);
  assert.ok(cols.every((col) => typeof col.wch === 'number' && col.wch > 0));

  // Every column is wide enough for its own text: Excel renders a `wch` column
  // as `wch × 7 + 5` pixels, which must cover the measured text plus padding.
  HEADERS.forEach((header, c) => {
    const px = (cols[c].wch ?? 0) * 7 + 5;
    assert.ok(px >= textWidthPx(header), `${header} fits its column`);
  });
  const dataRow = ['Sam Sales', 'Sayed Magdy', 'Khaled Youssef', '10:00', '08:25 AM', '01000000000'];
  dataRow.forEach((value, c) => {
    const px = (cols[c].wch ?? 0) * 7 + 5;
    assert.ok(px >= textWidthPx(value), `${value} fits its column`);
  });
});

test('the fit follows the text: a longer name widens the column, the merged title does not', () => {
  const short = createAttendanceWorkbook(sample).Sheets['Sales Team']['!cols'] ?? [];
  const longName = 'Abdelrahman Elshenawy';
  const long = createAttendanceWorkbook([
    { ...sample[0], person: { ...sample[0].person, name: longName } },
  ]).Sheets['Sales Team']['!cols'] ?? [];
  assert.ok((long[0].wch ?? 0) > (short[0].wch ?? 0), 'column A grows with the name');
  assert.ok((long[0].wch ?? 0) * 7 + 5 >= textWidthPx(longName), 'and it fully covers it');
  // The other columns do not move — only the one carrying the longer text does.
  assert.equal(long[5].wch, short[5].wch);

  // The merged «Sales Team» title rides all six columns, so it never stretches A.
  const fitted = autoFitColumns([['Sales Team'], HEADERS]);
  const longTitle = autoFitColumns([['Sales Team Of The Whole Company'], HEADERS]);
  assert.equal(fitted[0].wch, longTitle[0].wch);
  assert.ok((fitted[0].wch ?? 0) < 15, 'column A is fitted by «sales», not by the title');
});

test('AutoFit keeps a floor for empty columns and measures digits like Excel does', () => {
  const withBlanks = autoFitColumns([['Sales Team'], ['sales', '', '', '', '', '']]);
  assert.equal(withBlanks.length, 6);
  assert.ok(withBlanks[1].wch! < withBlanks[0].wch!, 'an empty column stays at the minimum');
  assert.ok(withBlanks[1].wch! >= 9, 'and never collapses below Excel’s default width');

  // A phone number of tabular digits is exactly 11 × the width of one digit,
  // at the sheet's 20-point size (points → pixels is ×96/72, bold is ×1.04).
  assert.equal(
    textWidthPx('01000000000'),
    Math.ceil(((556 * 11) / 1000) * ((20 * 96) / 72) * 1.04),
  );
  assert.equal(textWidthPx('0'), Math.ceil((556 / 1000) * ((20 * 96) / 72) * 1.04));
  assert.ok(textWidthPx('01000000000') > textWidthPx('10:00'));
  // Arabic text is measured too (a fallback advance per letter, never zero).
  assert.ok(textWidthPx('خالد يوسف') > 0);
  assert.deepEqual(autoFitRows(3), [{ hpt: 26 }, { hpt: 26 }, { hpt: 26 }]);
});

test('directors resolve by stable team id, known team name, then head fallback', () => {
  assert.equal(directorFor('Any renamed team', 'Head Name', 'ahmed'), 'Sayed Magdy');
  assert.equal(directorFor('Youssef Shehata'), 'Ahmed Elrawy');
  assert.equal(directorFor('Other Team', 'Head Name'), 'Head Name');
});

test("a manager's own row prints the number edited for him in «الهيكل»", () => {
  const [row] = sample;
  // A regular sales row prints their own number.
  assert.equal(mobileFor(row), '01000000000');

  // The manager's own attendance row falls back to the number stored on his
  // team (the field the «الهيكل» pencil writes).
  const managerRow: AttendanceWorkbookRow = {
    ...row,
    person: { ...row.person, id: 'ahmed-yossry', name: 'Ahmed Yossry', isManager: true, phone: '' },
  };
  assert.equal(mobileFor(managerRow), '01111111111');

  // Once the number is saved on the row itself, that one wins.
  assert.equal(mobileFor({ ...managerRow, person: { ...managerRow.person, phone: '01222222222' } }), '01222222222');

  // A sales person never borrows his manager's number.
  assert.equal(mobileFor({ ...row, person: { ...row.person, phone: '' } }), '');
});

// ─── Combined SITE + RESTA export ───

const stateAt = (order: number, time: string | null): SalesState => ({
  status: 'available',
  checkInOrder: order,
  checkInTime: time,
  walkCount: 0,
  coverCount: 0,
  lastServedAt: null,
});

const roster: AttendanceRoster = {
  sales: sample.map((r) => r.person),
  managers: sample.flatMap((r) => (r.manager ? [r.manager] : [])),
  heads: sample.flatMap((r) => (r.head ? [r.head] : [])),
};

test('attendanceRowsFor lists only attendees, in check-in order, with manager/head attached', () => {
  const other: SalesPerson = { id: 'nour', name: 'Nour Sales', managerId: 'ahmed', headId: 'khaled', phone: '' };
  const ghost: SalesPerson = { id: 'ghost', name: 'Ghost Sales', managerId: 'ahmed', headId: 'khaled' };
  const bigRoster: AttendanceRoster = { ...roster, sales: [...roster.sales, other, ghost] };
  const state: Record<string, SalesState> = {
    sam: stateAt(2, '2026-10-18T07:00:00.000Z'),
    // Checked in first — the builder keeps the branch's own check-in order,
    // exactly like the old per-branch export.
    nour: stateAt(1, '2026-10-18T08:00:00.000Z'),
    ghost: { status: 'absent', checkInOrder: null, checkInTime: null, walkCount: 0, lastServedAt: null },
  };
  const rows = attendanceRowsFor(bigRoster, state);
  assert.deepEqual(rows.map((r) => r.person.id), ['nour', 'sam']);
  assert.equal(rows[0].manager?.id, 'ahmed');
  assert.equal(rows[0].head?.id, 'khaled');
  assert.equal(rows[0].attendance?.checkInOrder, 1);
});

test('the merged file keeps one row per person at their FIRST check-in of the day', () => {
  const [sam] = sample;
  const siteRow: AttendanceWorkbookRow = { ...sam, attendance: stateAt(1, '2026-10-18T06:25:00.000Z') };
  const restaRow: AttendanceWorkbookRow = { ...sam, attendance: stateAt(3, '2026-10-18T11:40:00.000Z') };
  const other: AttendanceWorkbookRow = {
    person: { id: 'nour', name: 'Nour Sales', managerId: 'ahmed', headId: 'khaled', phone: '01099999999' },
    manager: sam.manager,
    head: sam.head,
    attendance: stateAt(1, '2026-10-18T07:15:00.000Z'),
  };

  const merged = mergeAttendanceRows([siteRow, other], [restaRow]);
  // Two people in the file — the person who attended at both branches is one
  // row, carrying the earlier (SITE) check-in.
  assert.deepEqual(merged.map((r) => r.person.id), ['sam', 'nour']);
  assert.equal(merged[0].attendance?.checkInTime, '2026-10-18T06:25:00.000Z');

  // The merge is symmetric: the same first-arrival row wins from any branch.
  const flipped = mergeAttendanceRows([restaRow], [siteRow, other]);
  assert.equal(flipped.find((r) => r.person.id === 'sam')?.attendance?.checkInTime, '2026-10-18T06:25:00.000Z');
});

test('a timed check-in beats an untimed one, ties keep the first row, and rows sort by first arrival', () => {
  const mk = (id: string, time: string | null, order: number): AttendanceWorkbookRow => ({
    person: { id, name: id, managerId: 'ahmed', headId: 'khaled' },
    attendance: stateAt(order, time),
  });
  const timed = mk('a', '2026-10-18T08:00:00.000Z', 1);
  const untimed = mk('a', null, 2);
  const tieFirst = mk('b', '2026-10-18T09:00:00.000Z', 3);
  const tieSecond = mk('b', '2026-10-18T09:00:00.000Z', 4);
  const late = mk('c', '2026-10-18T10:30:00.000Z', 5);
  const noTime = mk('d', null, 6);

  const merged = mergeAttendanceRows([untimed, tieSecond, late, noTime], [timed, tieFirst]);
  assert.deepEqual(merged.map((r) => r.person.id), ['a', 'b', 'c', 'd']);
  // Timed row wins over the untimed one.
  assert.equal(merged[0].attendance?.checkInTime, '2026-10-18T08:00:00.000Z');
  // Exact-time tie keeps the row already held (the second group does not steal it).
  assert.equal(merged[1].attendance?.checkInOrder, 4);
  // Rows without any time sink to the bottom instead of breaking the sort.
  assert.equal(merged[3].attendance?.checkInTime, null);
});
