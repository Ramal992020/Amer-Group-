import XLSX from 'xlsx-js-style';
import { isPersonDisabled, type HeadGroup, type ManagerTeam, type SalesPerson } from './walkin.ts';
import { isDefaultHiddenFromAttendance, normalizeAttendanceName } from './attendanceVisibility.ts';

/** Match the active filter in the organization panel. Export people, not empty team records. */
export function activeRosterRows(heads: HeadGroup[], managers: ManagerTeam[], sales: SalesPerson[]) {
  return sales.filter(person => {
    if (isPersonDisabled(person, managers, heads)) return false;
    if (person.disabled === undefined && isDefaultHiddenFromAttendance(person)) return false;
    // Perry was explicitly excluded from this report, not from the roster or rotation.
    if (person.isManager && normalizeAttendanceName(person.name) === 'perry') return false;
    return true;
  }).map(person => ({
    name: person.name,
    role: person.isManager ? 'مدير' : 'سيلز',
    team: managers.find(m => m.id === person.managerId)?.name ?? '',
  }));
}

export function createActiveRosterWorkbook(heads: HeadGroup[], managers: ManagerTeam[], sales: SalesPerson[]): XLSX.WorkBook {
  const rows = activeRosterRows(heads, managers, sales);
  const ws = XLSX.utils.aoa_to_sheet([
    ['الاسم', 'الوظيفة', 'الفريق'],
    ...rows.map(row => [row.name, row.role, row.team]),
  ]);
  for (let r = 0; r <= rows.length; r++) for (let c = 0; c < 3; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    cell.s = {
      font: { name: 'Arial', sz: 11, bold: r === 0, color: { rgb: r === 0 ? 'FFFFFFFF' : 'FF000000' } },
      fill: { patternType: 'solid', fgColor: { rgb: r === 0 ? 'FFC00000' : r % 2 ? 'FFF5F7FA' : 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
  ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 26 }];
  ws['!autofilter'] = { ref: `A1:C${rows.length + 1}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, 'المفعلون');
  return workbook;
}
