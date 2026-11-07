import XLSX from 'xlsx-js-style';

export interface DailyWalkinRow {
  id: string;
  name: string;
  mobile: string;
  createdAt: string;
  director: string;
}

/** Calendar dates are local to the device, not UTC. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dailyWalkinFilename(day: string): string {
  const [year, month, date] = day.split('-');
  return `walk-in sheet ${Number(date)}-${Number(month)}-${year}.xlsx`;
}

export function createDailyWalkinWorkbook(day: string, rows: DailyWalkinRow[]): XLSX.WorkBook {
  const headers = ['Client name', 'Client number', 'Date', 'Time', 'Rotation Turn'];
  const body = rows.filter(row => {
    const date = new Date(row.createdAt);
    return !Number.isNaN(date.getTime()) && localDay(date) === day;
  }).map(row => {
    const date = new Date(row.createdAt);
    return [row.name, row.mobile, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`,
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }), row.director];
  });
  // Keep a blank bordered canvas even on days without clients.
  const count = Math.max(20, body.length);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...Array.from({ length: count }, (_, i) => body[i] ?? ['', '', '', '', ''])]);
  const thin = { style: 'thin' as const, color: { rgb: 'FF000000' } };
  for (let r = 0; r <= count; r++) for (let c = 0; c < 5; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr] ?? (ws[addr] = { t: 's', v: '' });
    cell.s = { border: { top: thin, bottom: thin, left: thin, right: thin },
      font: { name: 'Arial', sz: 11, bold: r === 0 },
      alignment: { horizontal: 'center', vertical: 'center' },
      ...(r === 0 ? { fill: { patternType: 'solid', fgColor: { rgb: 'FF92D050' } } } : {}) };
  }
  ws['!cols'] = Array.from({ length: 5 }, () => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Walk in');
  return wb;
}
