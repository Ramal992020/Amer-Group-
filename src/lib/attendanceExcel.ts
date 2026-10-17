import XLSX from 'xlsx-js-style';
import type { HeadGroup, ManagerTeam, SalesPerson, SalesState } from './walkin';

export interface AttendanceWorkbookRow {
  person: SalesPerson;
  manager?: ManagerTeam;
  head?: HeadGroup;
  attendance?: SalesState;
}

const DIRECTORS: Record<string, string> = {
  ahmed: 'Sayed Magdy',
  perry: 'Sayed Magdy',
  rewaida: 'Karem Azab',
  shehata: 'Ahmed Elrawy',
  'ahmed-sultan': 'Meteab',
};

const DIRECTORS_BY_NAME: Record<string, string> = {
  'ahmed yossry': 'Sayed Magdy',
  perry: 'Sayed Magdy',
  rewaida: 'Karem Azab',
  'youssef shehata': 'Ahmed Elrawy',
  'ahmed sultan': 'Meteab',
};

const normalize = (value: string): string => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export const directorFor = (managerName: string, fallback = '', managerId = ''): string =>
  DIRECTORS[managerId] ?? DIRECTORS_BY_NAME[normalize(managerName)] ?? fallback;

const asTime = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  return value;
};

/**
 * The template the team works with — unchanged: six columns.
 *   sales | Director | Head | Shift time | time in | Mobile Number
 *
 * Every value is bold and the data rows are pure white — only the two header
 * rows keep their brand fills (navy #172943 for «Sales Team», red #C00000 for
 * the column titles).
 */
const HEADERS = ['sales', 'Director', 'Head', 'Shift time', 'time in', 'Mobile Number'];
const COLUMN_COUNT = HEADERS.length;
const NAVY = '172943';
const RED = 'C00000';
const WHITE = 'FFFFFF';
const INK = '111111';
/** Height of the vertical canvas, including the two header rows. */
const CANVAS_ROWS = 39;

/**
 * The number printed in «Mobile Number».
 *
 * A manager's number is edited from «الهيكل» exactly like a sales number, so
 * the row itself is the source. `ManagerTeam.phone` is the same value stored on
 * the team (that is what the «الهيكل» pencil writes), and it is used as a
 * fallback for a manager's own row saved before the team carried the number.
 */
export const mobileFor = (row: AttendanceWorkbookRow): string => {
  const own = (row.person.phone ?? '').trim();
  if (own) return own;
  if (row.person.isManager && row.person.managerId === row.manager?.id) {
    return (row.manager?.phone ?? '').trim();
  }
  return '';
};

/** Builds the attendance workbook in the same layout as the supplied template. */
export const createAttendanceWorkbook = (rows: AttendanceWorkbookRow[]): XLSX.WorkBook => {
  const blank = (): string[] => new Array(COLUMN_COUNT).fill('');
  const grid: unknown[][] = [
    ['Sales Team', ...blank().slice(1)],
    [...HEADERS],
    ...rows.map((row) => {
      const { person, manager, head, attendance } = row;
      return [
        person.name,
        directorFor(manager?.name ?? '', head?.name ?? '', manager?.id ?? ''),
        head?.name ?? '',
        person.shiftTime || '10:00',
        asTime(attendance?.checkInTime),
        mobileFor(row),
      ];
    }),
  ];
  // Match the supplied template's 39-row canvas, while allowing the roster to
  // grow beyond it when a larger team is present.
  while (grid.length < CANVAS_ROWS) grid.push(blank());
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMN_COUNT - 1 } }];
  sheet['!cols'] = [
    { wch: 29 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
  ];
  sheet['!rows'] = [{ hpt: 22 }, { hpt: 19 }, ...grid.slice(2).map(() => ({ hpt: 19 }))];
  sheet['!ref'] = `A1:${XLSX.utils.encode_col(COLUMN_COUNT - 1)}${Math.max(2, grid.length)}`;

  const border = {
    top: { style: 'thin', color: { rgb: INK } },
    bottom: { style: 'thin', color: { rgb: INK } },
    left: { style: 'thin', color: { rgb: INK } },
    right: { style: 'thin', color: { rgb: INK } },
  };
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < COLUMN_COUNT; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      if (!cell) continue;
      cell.s = r === 0
        ? {
            fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
            font: { name: 'Arial', sz: 14, bold: true, color: { rgb: WHITE } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border,
          }
        : r === 1
          ? {
              fill: { patternType: 'solid', fgColor: { rgb: RED } },
              font: { name: 'Arial', sz: 11, bold: true, color: { rgb: WHITE } },
              alignment: { horizontal: 'center', vertical: 'center' },
              border,
            }
          : {
              // Data rows are white (the old gray fill is gone) and every value
              // is bold; only the two header rows keep their brand fills.
              fill: { patternType: 'solid', fgColor: { rgb: WHITE } },
              font: { name: 'Arial', sz: 10, bold: true, color: { rgb: INK } },
              alignment: { horizontal: 'center', vertical: 'center' },
              border,
            };
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sales Team');
  return workbook;
};

export const exportAttendanceWorkbook = (rows: AttendanceWorkbookRow[], date = new Date()): void => {
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  XLSX.writeFile(createAttendanceWorkbook(rows), `Sales-Team-Attendance-${day}.xlsx`);
};
