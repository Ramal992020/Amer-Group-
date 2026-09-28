import * as XLSX from 'xlsx';

// ─────────────────────────────── Types ───────────────────────────────

export interface SheetContribution {
  sheet: string;
  cartons: number;
  pieces: number;
  rows: number;
}

export interface CountryRecap {
  key: string;
  country: string;
  cartons: number;
  pieces: number;
  rows: number;
  contributions: SheetContribution[];
}

export interface SheetSummary {
  name: string;
  rows: number;
  cartons: number;
  pieces: number;
  countries: number;
  skipped: boolean;
  reason?: string;
}

export interface ReportMetadata {
  supplier: string;
  modelNo: string;
  washName: string;
}

export interface RecapResult {
  fileName: string;
  sheetCount: number;
  countries: CountryRecap[];
  sheets: SheetSummary[];
  totals: { cartons: number; pieces: number; rows: number };
  mergedCount: number;
  warnings: string[];
  metadata: ReportMetadata;
}

// ─────────────────────────── Normalization ───────────────────────────

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};

const normalizeKey = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/[\s\-_\/\\.,،]+/g, ' ')
    .trim();

// ────────────────────────── Header detection ──────────────────────────

const CARTON_HINTS = ['ctns', 'ctn', 'carton', 'كرت', 'كارت'];
const PIECE_HINTS = ['units', 'unit', 'قطع', 'piece', 'pcs', 'qty', 'quant', 'كميه'];

const matchHint = (cell: unknown, hints: string[]): boolean => {
  const n = normalizeKey(cell);
  if (!n) return false;
  return hints.some((h) => n.includes(h));
};

interface ColMap {
  cartons: number;
  pieces: number;
}

const findTotalColumns = (rows: unknown[][]): { headerIndex: number; cols: ColMap } | null => {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    let cartons = -1;
    let pieces = -1;
    row.forEach((cell, idx) => {
      if (cartons === -1 && matchHint(cell, CARTON_HINTS)) cartons = idx;
      if (pieces === -1 && matchHint(cell, PIECE_HINTS)) pieces = idx;
    });
    if (cartons !== -1 && pieces !== -1) {
      return { headerIndex: i, cols: { cartons, pieces } };
    }
  }
  return null;
};

const parseNumericCell = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const getCountryFromSheetName = (sheetName: string): string => {
  const withoutCopySuffix = sheetName
    .trim()
    // Excel adds suffixes such as "(2)" when the same country has more than one sheet.
    .replace(/\s*[\[(]\s*(?:(?:copy|نسخة)\s*)?\d+\s*[\])]\s*$/i, '')
    .replace(/\s*(?:-|_)\s*(?:(?:copy|نسخة)\s*)?\d+\s*$/i, '')
    .replace(/\s*[\[(]\s*(?:copy|نسخة)\s*[\])]\s*$/i, '')
    .trim();
  return withoutCopySuffix || sheetName.trim();
};

/** Gets the grand-total pair: the bottom-most numeric CTNS/UNITS row below their headers. */
const extractGrandTotal = (
  rows: unknown[][],
  { headerIndex, cols }: { headerIndex: number; cols: ColMap },
): { cartons: number; pieces: number } | null => {
  let lastPair: { cartons: number; pieces: number } | null = null;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cartons = parseNumericCell(row[cols.cartons]);
    const pieces = parseNumericCell(row[cols.pieces]);
    if (cartons !== null && pieces !== null) {
      lastPair = { cartons, pieces };
    }
  }

  return lastPair;
};

// ─────────────────────────────── Parsing ───────────────────────────────

export const parseWorkbook = (wb: XLSX.WorkBook, fileName: string): RecapResult => {
  const warnings: string[] = [];
  const sheets: SheetSummary[] = [];
  const byCountry = new Map<string, CountryRecap>();

  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    });

    const found = findTotalColumns(rows);
    if (!found) {
      warnings.push(`تم تخطي شيت «${name}» — لم يتم العثور على رأسي CTNS و UNITS`);
      sheets.push({ name, rows: 0, cartons: 0, pieces: 0, countries: 0, skipped: true, reason: 'CTNS / UNITS غير موجودين' });
      return;
    }

    const extracted = extractGrandTotal(rows, found);
    if (!extracted) {
      warnings.push(`تم تخطي شيت «${name}» — لم يتم العثور على إجمالي رقمي أسفل CTNS و UNITS`);
      sheets.push({ name, rows: 0, cartons: 0, pieces: 0, countries: 0, skipped: true, reason: 'إجمالي CTNS / UNITS غير موجود' });
      return;
    }

    const countryName = getCountryFromSheetName(name);
    const norm = normalizeKey(countryName);
    const { cartons, pieces } = extracted;
    const existing = byCountry.get(norm);
    if (existing) {
      existing.cartons += cartons;
      existing.pieces += pieces;
      existing.rows += 1;
      existing.contributions.push({ sheet: name, cartons, pieces, rows: 1 });
    } else {
      byCountry.set(norm, {
        key: norm,
        country: countryName,
        cartons,
        pieces,
        rows: 1,
        contributions: [{ sheet: name, cartons, pieces, rows: 1 }],
      });
    }

    sheets.push({
      name,
      rows: 1,
      cartons,
      pieces,
      countries: 1,
      skipped: false,
    });
  });

  // Keep the workbook's sheet order for the print recap; the analytics panel sorts independently.
  const countries = [...byCountry.values()];
  countries.forEach((c) => c.contributions.sort((a, b) => b.pieces - a.pieces));

  const totals = countries.reduce(
    (acc, c) => ({ cartons: acc.cartons + c.cartons, pieces: acc.pieces + c.pieces, rows: acc.rows + c.rows }),
    { cartons: 0, pieces: 0, rows: 0 },
  );

  const cleanVal = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    let s = String(val).trim();
    if (s.startsWith(':')) {
      s = s.substring(1).trim();
    }
    return s;
  };

  const findMetadataValue = (patterns: RegExp[]): string => {
    for (const sName of wb.SheetNames) {
      const ws = wb.Sheets[sName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false, raw: true });
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const cellVal = String(row[c] ?? '').trim();
          for (const pattern of patterns) {
            if (pattern.test(cellVal)) {
              const inlineValue = cleanVal(cellVal.replace(pattern, '').replace(/^\s*:?\s*/, ''));
              if (inlineValue && inlineValue !== cellVal) return inlineValue;

              // The value is usually on the same row, sometimes after a ":" cell
              // and can be far to the right (for example around column 11).
              for (let next = c + 1; next < row.length; next++) {
                const candidate = cleanVal(row[next]);
                if (!candidate || candidate === ':') continue;
                if (patterns.some((p) => p.test(candidate))) continue;
                return candidate;
              }
            }
          }
        }
      }
    }
    return '';
  };

  // Only three header fields are printed: a fixed supplier plus the two values read from the workbook.
  const extModel = findMetadataValue([/model\s*no/i]);
  const extWash = findMetadataValue([/wash\s*name/i]);

  if (!extModel) warnings.push('لم يتم العثور على «MODEL NO» داخل الملف — يمكنك كتابته يدوياً في التقرير');
  if (!extWash) warnings.push('لم يتم العثور على «WASH NAME» داخل الملف — يمكنك كتابته يدوياً في التقرير');

  const metadata: ReportMetadata = {
    supplier: 'EROGLU',
    modelNo: extModel,
    washName: extWash,
  };

  if (countries.length === 0) {
    warnings.push('لم يتم العثور على أي بيانات صالحة في الملف بالكامل');
  }

  return {
    fileName,
    sheetCount: wb.SheetNames.length,
    countries,
    sheets,
    totals,
    mergedCount: countries.filter((c) => c.contributions.length > 1).length,
    warnings,
    metadata,
  };
};

export const parseFile = async (file: File): Promise<RecapResult> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return parseWorkbook(wb, file.name);
};

const mergeResultInto = (
  target: Omit<RecapResult, 'fileName' | 'sheetCount' | 'metadata'> & { metadata: Partial<ReportMetadata> },
  source: RecapResult,
  sourceIndex: number,
): void => {
  source.countries.forEach((c) => {
    const existing = target.countries.find((ec) => ec.key === c.key);
    if (existing) {
      existing.cartons += c.cartons;
      existing.pieces += c.pieces;
      existing.rows += c.rows;
      existing.contributions.push(...c.contributions.map((cb) => ({ ...cb, sheet: `${source.fileName} ▸ ${cb.sheet}` })));
    } else {
      target.countries.push({
        ...c,
        contributions: c.contributions.map((cb) => ({ ...cb, sheet: `${source.fileName} ▸ ${cb.sheet}` })),
      });
    }
  });

  source.sheets.forEach((s) => {
    target.sheets.push({ ...s, name: s.skipped ? s.name : `${source.fileName} ▸ ${s.name}` });
  });

  target.totals.cartons += source.totals.cartons;
  target.totals.pieces += source.totals.pieces;
  target.totals.rows += source.totals.rows;
  target.mergedCount += source.mergedCount;

  source.warnings.forEach((w) => target.warnings.push(`[${source.fileName}] ${w}`));

  if (sourceIndex === 0) {
    target.metadata = { ...source.metadata };
  } else {
    if (!target.metadata.modelNo && source.metadata.modelNo) target.metadata.modelNo = source.metadata.modelNo;
    if (!target.metadata.washName && source.metadata.washName) target.metadata.washName = source.metadata.washName;
  }
};

export const parseFiles = async (files: File[]): Promise<RecapResult> => {
  if (files.length === 1) return parseFile(files[0]);

  const results: RecapResult[] = [];
  for (const f of files) {
    try {
      results.push(await parseFile(f));
    } catch (err) {
      console.error(`Failed to parse ${f.name}`, err);
    }
  }
  if (results.length === 0) {
    throw new Error('تعذر قراءة أي من الملفات المختارة');
  }

  const aggregate: Omit<RecapResult, 'fileName' | 'sheetCount' | 'metadata'> & { metadata: Partial<ReportMetadata> } = {
    countries: [],
    sheets: [],
    totals: { cartons: 0, pieces: 0, rows: 0 },
    mergedCount: 0,
    warnings: [],
    metadata: { supplier: 'EROGLU', modelNo: '', washName: '' },
  };

  results.forEach((r, idx) => mergeResultInto(aggregate, r, idx));

  aggregate.countries.forEach((c) => c.contributions.sort((a, b) => b.pieces - a.pieces));
  const totalSheetCount = results.reduce((acc, r) => acc + r.sheetCount, 0);

  return {
    fileName: files.map((f) => f.name).join(' + '),
    sheetCount: totalSheetCount,
    countries: aggregate.countries,
    sheets: aggregate.sheets,
    totals: aggregate.totals,
    mergedCount: aggregate.countries.filter((c) => c.contributions.length > 1).length,
    warnings: aggregate.warnings,
    metadata: {
      supplier: 'EROGLU',
      modelNo: aggregate.metadata.modelNo || '',
      washName: aggregate.metadata.washName || '',
    },
  };
};

// ─────────────────────────────── Export ───────────────────────────────

export const exportRecap = (result: RecapResult): void => {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — recap by country
  const header = ['#', 'الدولة', 'عدد الكراتين', 'عدد القطع', 'عدد الشيتات', 'مدمجة من'];
  const body = result.countries.map((c, i) => [
    i + 1,
    c.country,
    c.cartons,
    c.pieces,
    c.contributions.length,
    c.contributions.map((s) => s.sheet).join(' + '),
  ]);
  const totalRow = ['', 'الإجمالي', result.totals.cartons, result.totals.pieces, '', ''];
  const ws = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, 'الملخص');

  // Sheet 2 — per-sheet summary
  const sHeader = ['الشيت / البلد', 'سجل الإجمالي', 'عدد الدول', 'عدد الكراتين', 'عدد القطع'];
  const sBody = result.sheets
    .filter((s) => !s.skipped)
    .map((s) => [s.name, s.rows, s.countries, s.cartons, s.pieces]);
  const ws2 = XLSX.utils.aoa_to_sheet([sHeader, ...sBody]);
  ws2['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'ملخص الشيتات');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ملخص-الشحنات-${stamp}.xlsx`);
};

// ─────────────────────────────── Demo data ───────────────────────────────

export const buildDemoWorkbook = (): XLSX.WorkBook => {
  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, cartons: number, pieces: number, withMetadata = false) => {
    const ws = withMetadata
      ? XLSX.utils.aoa_to_sheet([
          ['MODEL NO', 'CL1082872'],
          ['WASH NAME', ':', 'SHADO WASH'],
          [null, null],
          ['TOTAL', 'TOTAL'],
          [null, null],
          ['CTNS', 'UNITS'],
          [Math.round(cartons * 0.65), Math.round(pieces * 0.65)],
          [null, null],
          [cartons, pieces],
        ])
      : XLSX.utils.aoa_to_sheet([
          ['TOTAL', 'TOTAL'],
          [null, null],
          ['CTNS', 'UNITS'],
          [Math.round(cartons * 0.65), Math.round(pieces * 0.65)],
          [null, null],
          [cartons, pieces],
        ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet('السعودية', 120, 1440, true);
  addSheet('السعودية (2)', 90, 1080);
  addSheet('ليبيا', 65, 780);
  addSheet('ليبيا (2)', 55, 660);
  addSheet('الإمارات', 85, 1020);
  addSheet('العراق', 70, 840);

  addSheet('السعودية', 120, 1440);
  addSheet('السعودية (2)', 90, 1080);
  addSheet('ليبيا', 65, 780);
  addSheet('ليبيا (2)', 55, 660);
  addSheet('الإمارات', 85, 1020);
  addSheet('العراق', 70, 840);

  return wb;
};

export const buildDemoResult = (): RecapResult => parseWorkbook(buildDemoWorkbook(), 'بيانات-تجريبية.xlsx');
