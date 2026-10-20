import XLSX from 'xlsx-js-style';
import type { HeadGroup, ManagerTeam, SalesPerson, SalesState } from './walkin';

export interface AttendanceWorkbookRow {
  person: SalesPerson;
  manager?: ManagerTeam;
  head?: HeadGroup;
  attendance?: SalesState;
}

const isAbsent = (row: AttendanceWorkbookRow): boolean =>
  !row.attendance || row.attendance.status === 'absent';

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
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
  }
  return value;
};

/**
 * The template the team works with — unchanged: six columns.
 *   sales | Director | Head | Shift time | time in | Mobile Number
 *
 * Every value is bold; absent names are red and other data cells white. The two header
 * rows keep their brand fills (navy #172943 for «Sales Team», red #C00000 for
 * the column titles). The whole sheet is Arial 20, and both the rows and the
 * columns are AutoFitted to that text (see the AutoFit block below), so a cell
 * is never taller or narrower than the value it carries.
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
 * ONE font for the whole sheet: Arial 20 — the same size in the title row, the
 * red header row and every data row, so the file reads from a phone at arm's
 * length. Excel sizes fonts in points (20 pt ≈ 27 px on screen); change this
 * single number and the AutoFit below re-measures everything to match.
 */
const FONT_NAME = 'Arial';
const FONT_SIZE = 20;

/* ─────────────── AutoFit — rows and columns sized to their text ───────────────
 *
 * Excel's own «AutoFit» is not a flag in the file: it is a width/height the
 * writer must calculate from the font's glyph advances. That is what the few
 * helpers below do, with the same math Excel uses:
 *
 *   column: px = wch × MDW + 5   →   wch = (px − 5) / MDW
 *   row:    one line of Arial fits in ≈ 1.3 × the font size, in points
 */

/**
 * MDW — the pixel width of the widest digit of the workbook's default font
 * (SheetJS writes Calibri 11, so 7 px).
 */
const MDW = 7;
/** The air Excel leaves around a cell's text (≈ 2 px per side + the border). */
const CELL_PADDING_PX = 10;
/** A column is never skinnier than Excel's default, and never absurdly wide. */
const MIN_COLUMN_WCH = 9;
const MAX_COLUMN_WCH = 70;

/**
 * Arial glyph advances in 1/1000 of the font size (the AFM table Excel
 * measures with). Anything unlisted — Arabic letters above all — falls back to
 * a generous average, so a long name is never clipped by a too-narrow column.
 */
const GLYPH_WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  '{': 334, '|': 260, '}': 334, '~': 584,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
/** Arabic letters in Arial average about 0.6 em each. */
const ARABIC_GLYPH = 600;
/** Unknown script / symbols — measured wide on purpose. */
const DEFAULT_GLYPH = 650;
/** Bold Arial is drawn a touch wider than the regular cut. */
const BOLD_FACTOR = 1.04;

/** Rendered width of a string in pixels, the way Excel measures a cell. */
export const textWidthPx = (text: string, fontSize = FONT_SIZE, bold = true): number => {
  const fontPx = (fontSize * 96) / 72; // points → screen pixels
  let units = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    units +=
      GLYPH_WIDTHS[char] ?? (code >= 0x0600 && code <= 0x06ff ? ARABIC_GLYPH : DEFAULT_GLYPH);
  }
  return Math.ceil((units / 1000) * fontPx * (bold ? BOLD_FACTOR : 1));
};

/** The row height (points) Excel's AutoFit gives one line of `fontSize`. */
export const autoRowHeight = (fontSize = FONT_SIZE): number => Math.round(fontSize * 1.3);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * AutoFit the columns: every column becomes exactly as wide as its widest cell
 * needs at the sheet's font size — headers included. The merged «Sales Team»
 * title is skipped because its text rides all six columns at once and would
 * otherwise stretch column A on its own.
 */
export const autoFitColumns = (grid: unknown[][], fontSize = FONT_SIZE): XLSX.ColInfo[] => {
  const widestPx: number[] = new Array(COLUMN_COUNT).fill(0);
  grid.forEach((rowValues, r) => {
    if (r === 0 || !Array.isArray(rowValues)) return;
    rowValues.forEach((value, c) => {
      if (c >= COLUMN_COUNT) return;
      const text = value === null || value === undefined ? '' : String(value);
      if (!text) return;
      widestPx[c] = Math.max(widestPx[c], textWidthPx(text, fontSize) + CELL_PADDING_PX);
    });
  });
  return widestPx.map((px) => ({
    wch: Math.round(clamp((px - 5) / MDW, MIN_COLUMN_WCH, MAX_COLUMN_WCH) * 100) / 100,
  }));
};

/** AutoFit the rows: one line of the sheet's font, for every row of the canvas. */
export const autoFitRows = (rowCount: number, fontSize = FONT_SIZE): XLSX.RowInfo[] => {
  const hpt = autoRowHeight(fontSize);
  return new Array(Math.max(0, rowCount)).fill(null).map(() => ({ hpt }));
};

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
  const present = rows.filter((row) => !isAbsent(row));
  const absent = rows.filter(isAbsent);
  const ordered: (AttendanceWorkbookRow | null)[] = [
    ...present,
    ...(absent.length ? [null, ...absent] : []),
  ];
  const absentStart = 2 + present.length + 1;
  const grid: unknown[][] = [
    ['Sales Team', ...blank().slice(1)],
    [...HEADERS],
    ...ordered.map((row) => {
      if (!row) return blank();
      const { person, manager, head, attendance } = row;
      return [
        person.name,
        directorFor(manager?.name ?? '', head?.name ?? '', manager?.id ?? ''),
        head?.name ?? '',
        person.shiftTime || '10:00',
        isAbsent(row) ? 'لم يحضر' : asTime(attendance?.checkInTime),
        mobileFor(row),
      ];
    }),
  ];
  // Match the supplied template's 39-row canvas, while allowing the roster to
  // grow beyond it when a larger team is present.
  while (grid.length < CANVAS_ROWS) grid.push(blank());
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMN_COUNT - 1 } }];
  // AutoFit: the columns are measured from the text they actually carry and the
  // rows from the 20-point line, so nothing is clipped and nothing is empty air.
  sheet['!cols'] = autoFitColumns(grid, FONT_SIZE);
  sheet['!rows'] = autoFitRows(grid.length, FONT_SIZE);
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
            font: { name: FONT_NAME, sz: FONT_SIZE, bold: true, color: { rgb: WHITE } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border,
          }
        : r === 1
          ? {
              fill: { patternType: 'solid', fgColor: { rgb: RED } },
              font: { name: FONT_NAME, sz: FONT_SIZE, bold: true, color: { rgb: WHITE } },
              alignment: { horizontal: 'center', vertical: 'center' },
              border,
            }
          : {
              // Only the absent person's name is red; all other cells stay white.
              fill: { patternType: 'solid', fgColor: { rgb:
                c === 0 && r >= absentStart && r < absentStart + absent.length ? 'FF0000' : WHITE,
              } },
              font: { name: FONT_NAME, sz: FONT_SIZE, bold: true, color: { rgb: INK } },
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

export interface AttendanceRoster {
  sales: SalesPerson[];
  managers: ManagerTeam[];
  heads: HeadGroup[];
}

/**
 * The rows of ONE branch: the full roster, including absent people,
 * in that branch's check-in order. The roster is the shared one (SITE ⇄ RESTA
 * have the same people), so the same builder works for either branch's map.
 */
export const attendanceRowsFor = (
  roster: AttendanceRoster,
  salesState: Record<string, SalesState>,
): AttendanceWorkbookRow[] =>
  roster.sales
    .slice()
    .sort(
      (a, b) =>
        (salesState[a.id]?.checkInOrder ?? Number.MAX_SAFE_INTEGER) -
        (salesState[b.id]?.checkInOrder ?? Number.MAX_SAFE_INTEGER),
    )
    .map((person) => ({
      person,
      manager: roster.managers.find((item) => item.id === person.managerId),
      head: roster.heads.find((item) => item.id === person.headId),
      attendance: salesState[person.id],
    }));

/** The instant a row's person checked in (ms), or null when unknown. */
const checkInMs = (row: AttendanceWorkbookRow): number | null => {
  const raw = row.attendance?.checkInTime;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Merge the attendance rows of SITE + RESTA into ONE list for the combined
 * file. The current attendance flow keeps each person in one selected branch
 * only. The first-check-in rule remains as a safe migration fallback for old
 * data that may still contain the same person in both branch rows.
 */
export const mergeAttendanceRows = (...groups: AttendanceWorkbookRow[][]): AttendanceWorkbookRow[] => {
  const byPerson = new Map<string, AttendanceWorkbookRow>();
  for (const group of groups) {
    for (const row of group) {
      const current = byPerson.get(row.person.id);
      if (!current) {
        byPerson.set(row.person.id, row);
        continue;
      }
      // Attendance in either branch beats absence, even without a timestamp.
      if (isAbsent(current) !== isAbsent(row)) {
        if (!isAbsent(row)) byPerson.set(row.person.id, row);
        continue;
      }
      // A timed check-in beats an untimed one; between two times the earlier
      // (first arrival of the day) wins. Ties keep the row already held.
      const currentMs = checkInMs(current);
      const rowMs = checkInMs(row);
      if (currentMs === null && rowMs !== null) byPerson.set(row.person.id, row);
      else if (currentMs !== null && rowMs !== null && rowMs < currentMs) byPerson.set(row.person.id, row);
    }
  }
  return [...byPerson.values()].sort((a, b) => {
    if (isAbsent(a) !== isAbsent(b)) return isAbsent(a) ? 1 : -1;
    // Never subtract the timestamps: `Infinity - Infinity` is NaN and breaks
    // the sort for the two rows that carry no time at all.
    const aMs = checkInMs(a) ?? Number.POSITIVE_INFINITY;
    const bMs = checkInMs(b) ?? Number.POSITIVE_INFINITY;
    return aMs < bMs ? -1 : aMs > bMs ? 1 : 0;
  });
};
