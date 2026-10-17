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

/** Builds the 6-column attendance workbook in the same layout as the supplied template. */
export const createAttendanceWorkbook = (rows: AttendanceWorkbookRow[]): XLSX.WorkBook => {
  const grid: unknown[][] = [
    ['Sales Team', '', '', '', '', ''],
    ['sales', 'Director', 'Head', 'Shift time', 'time in', 'Mobile Number'],
    ...rows.map(({ person, manager, head, attendance }) => [
      person.name,
      directorFor(manager?.name ?? '', head?.name ?? '', manager?.id ?? ''),
      head?.name ?? '',
      person.shiftTime || '10:00',
      asTime(attendance?.checkInTime),
      person.phone ?? '',
    ]),
  ];
  // Match the supplied template's 39-row canvas, while allowing the roster to
  // grow beyond it when a larger team is present.
  while (grid.length < 39) grid.push(['', '', '', '', '', '']);
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  sheet['!cols'] = [
    { wch: 29 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
  ];
  sheet['!rows'] = [{ hpt: 22 }, { hpt: 19 }, ...rows.map(() => ({ hpt: 19 }))];
  sheet['!ref'] = `A1:F${Math.max(2, grid.length)}`;

  const border = {
    top: { style: 'thin', color: { rgb: '111111' } },
    bottom: { style: 'thin', color: { rgb: '111111' } },
    left: { style: 'thin', color: { rgb: '111111' } },
    right: { style: 'thin', color: { rgb: '111111' } },
  };
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      if (!cell) continue;
      cell.s = r === 0
        ? {
            fill: { patternType: 'solid', fgColor: { rgb: '172943' } },
            font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border,
          }
        : r === 1
          ? {
              fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
              font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'center', vertical: 'center' },
              border,
            }
          : {
              fill: { patternType: 'solid', fgColor: { rgb: 'BFBFBF' } },
              font: { name: 'Arial', sz: 10, color: { rgb: '111111' } },
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
