import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2, UserRoundPlus } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import type { SalesPerson } from '../lib/walkin';
import {
  WALKIN_PREFILL_EVENT,
  clearWalkInPrefill,
  readWalkInPrefill,
  walkinPrefillKey,
  type WalkInPrefill,
} from './ClientRegistration';
import { SectionTitle, useToast } from './ui';

interface ClientRow {
  id: string;
  clientName: string;
  mobile: string;
  consultant: string;
  arrivalTime: string;
  leavingTime: string;
  sap: string;
  clientNumber: '1' | '2';
  frontDeskAdmin: string;
  branch: 'SITE' | 'RESTA';
}

interface Draft {
  clientName: string;
  mobile: string;
  consultant: string;
  arrivalTime: string;
  leavingTime: string;
  sap: string;
  clientNumber: '1' | '2';
  frontDeskAdmin: string;
  branch: 'SITE' | 'RESTA';
}

const ADMINS = ['Amira', 'Aya', 'Khaled', 'Kassem', 'Ramal'];
const STORAGE_VERSION = 'amer-client-excel-v1';
const headers = [
  'Client Name',
  'Mobile',
  'Project Name',
  'Source',
  'Property consultant',
  'Email Address',
  'Arrival time',
  'Leaving time',
  'SAP',
  'client number',
  'front desk admin',
  'REASON',
  'Branch',
];

const initialDraft = (): Draft => ({
  clientName: '',
  mobile: '',
  consultant: '',
  arrivalTime: '',
  leavingTime: '',
  sap: '',
  clientNumber: '1',
  frontDeskAdmin: 'Amera',
  branch: 'SITE',
});

function toExcelTime(value: string): number | '' {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  return (hours * 60 + minutes) / 1440;
}

function styleSheet(worksheet: XLSX.WorkSheet, dataCount: number) {
  type CellStyle = {
    font?: { name?: string; sz?: number; bold?: boolean; color?: { rgb: string }; underline?: boolean };
    fill?: { patternType: 'solid'; fgColor: { rgb: string } };
    alignment?: { horizontal?: 'center'; vertical?: 'center'; wrapText?: boolean };
    border?: Record<string, { style: 'thin' | 'medium'; color: { rgb: string } }>;
    numFmt?: string;
  };
  const border = {
    top: { style: 'thin' as const, color: { rgb: 'FF111111' } },
    bottom: { style: 'thin' as const, color: { rgb: 'FF111111' } },
    left: { style: 'thin' as const, color: { rgb: 'FF111111' } },
    right: { style: 'thin' as const, color: { rgb: 'FF111111' } },
  };
  const headerStyle: CellStyle = {
    font: { name: 'Arial', sz: 10, bold: true, underline: true, color: { rgb: 'FFFFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFC00000' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'medium', color: { rgb: 'FF111111' } },
      bottom: { style: 'medium', color: { rgb: 'FF111111' } },
      left: { style: 'thin', color: { rgb: 'FF111111' } },
      right: { style: 'thin', color: { rgb: 'FF111111' } },
    },
  };
  const bodyStyle: CellStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FF111111' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border,
  };

  // Keep a formatted blank area in the exported sheet, matching the supplied form.
  const lastRow = Math.max(dataCount + 1, 21);
  for (let row = 0; row < lastRow; row++) {
    for (let col = 0; col < headers.length; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address] as (XLSX.CellObject & { s?: CellStyle }) | undefined;
      const styledCell = cell ?? { t: 's' as const, v: '' };
      styledCell.s = row === 0 ? headerStyle : bodyStyle;
      // Arrival / Leaving times render in 12-hour format with AM/PM.
      if (row > 0 && (col === 6 || col === 7) && styledCell.v !== '') styledCell.z = 'h:mm AM/PM';
      worksheet[address] = styledCell;
    }
  }

  worksheet['!ref'] = `A1:${XLSX.utils.encode_cell({ r: lastRow - 1, c: headers.length - 1 })}`;
  worksheet['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 21 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 15 }, { wch: 21 }, { wch: 24 }, { wch: 13 },
  ];
  worksheet['!rows'] = [{ hpt: 28 }, ...Array.from({ length: lastRow - 1 }, () => ({ hpt: 23 }))];
  worksheet['!autofilter'] = { ref: `A1:M${Math.max(dataCount + 1, 2)}` };
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  worksheet['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
  worksheet['!printOptions'] = { gridLines: true, horizontalCentered: true };
}

export function ClientExcelBuilder({ sales, account }: { sales: SalesPerson[]; account: string }) {
  const toast = useToast();
  const storeKey = `${STORAGE_VERSION}-${account.toLowerCase()}`;
  const consultantKey = `${STORAGE_VERSION}-consultants-${account.toLowerCase()}`;
  const [rows, setRows] = useState<ClientRow[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storeKey) ?? '[]');
      return Array.isArray(parsed) ? parsed as ClientRow[] : [];
    } catch {
      return [];
    }
  });
  const [extraConsultants, setExtraConsultants] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(consultantKey) ?? '[]');
      return Array.isArray(parsed) ? parsed as string[] : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [showNewConsultant, setShowNewConsultant] = useState(false);
  const [newConsultant, setNewConsultant] = useState('');
  // Latest WALK IN registration (name + mobile + registration time) published by
  // the reception form.
  const [prefill, setPrefill] = useState<WalkInPrefill | null>(() => readWalkInPrefill(account));
  const [autoFilled, setAutoFilled] = useState(false);

  // Convert an ISO registration time to the HH:MM value used by <input type="time">.
  const timeFromISO = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const applyPrefill = (incoming: WalkInPrefill) => {
    setDraft((previous) => ({
      ...previous,
      clientName: incoming.name,
      mobile: incoming.mobile,
      // Arrival time = the exact registration time of the WALK IN client.
      arrivalTime: timeFromISO(incoming.createdAt) || previous.arrivalTime,
    }));
    setAutoFilled(true);
  };

  // Live auto-fill when a WALK IN client is registered + pick up codes saved
  // earlier (reloads / other tabs).
  useEffect(() => {
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ account: string; name: string; mobile: string; createdAt?: string }>).detail;
      if (!detail || detail.account.toLowerCase() !== account.toLowerCase()) return;
      const incoming: WalkInPrefill = {
        name: detail.name,
        mobile: detail.mobile,
        createdAt: detail.createdAt ?? new Date().toISOString(),
        at: Date.now(),
        id: '',
      };
      setPrefill(incoming);
      applyPrefill(incoming);
      toast('success', 'تم ملء الاسم والموبايل ووقت الوصول من تسجيل WALK IN');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === walkinPrefillKey(account)) setPrefill(readWalkInPrefill(account));
    };
    window.addEventListener(WALKIN_PREFILL_EVENT, onPrefill as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WALKIN_PREFILL_EVENT, onPrefill as EventListener);
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const prefillDiffers =
    !!prefill &&
    (draft.clientName.trim() !== prefill.name || draft.mobile.trim() !== prefill.mobile);

  const consultants = useMemo(() => {
    const appSales = sales.filter((person) => !person.isManager).map((person) => person.name);
    return [...new Set([...appSales, ...extraConsultants])];
  }, [sales, extraConsultants]);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(rows)); } catch { /* ignore storage quota */ }
  }, [storeKey, rows]);
  useEffect(() => {
    try { localStorage.setItem(consultantKey, JSON.stringify(extraConsultants)); } catch { /* ignore */ }
  }, [consultantKey, extraConsultants]);

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const addConsultant = () => {
    const name = newConsultant.trim();
    if (!name) return;
    setExtraConsultants((previous) => previous.includes(name) ? previous : [...previous, name]);
    updateDraft('consultant', name);
    setNewConsultant('');
    setShowNewConsultant(false);
  };

  const addRow = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.clientName.trim() || !draft.mobile.trim() || !draft.consultant || !draft.arrivalTime || !draft.leavingTime) {
      toast('warning', 'أكمل اسم العميل والموبايل والاستشاري ووقت الوصول والمغادرة');
      return;
    }
    setRows((previous) => [...previous, { ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, clientName: draft.clientName.trim(), mobile: draft.mobile.trim() }]);
    // The walk-in prefill is consumed once its data is added to the file.
    if (prefill && draft.clientName.trim() === prefill.name && draft.mobile.trim() === prefill.mobile) {
      clearWalkInPrefill(account);
      setPrefill(null);
    }
    setAutoFilled(false);
    setDraft((previous) => ({ ...initialDraft(), consultant: previous.consultant, branch: previous.branch, frontDeskAdmin: previous.frontDeskAdmin }));
    toast('success', 'تمت إضافة العميل إلى ملف الإكسيل');
  };

  const exportWorkbook = () => {
    if (!rows.length) {
      toast('warning', 'أضف عميلاً واحداً على الأقل قبل التصدير');
      return;
    }
    const aoa = [
      headers,
      ...rows.map((row) => [
        row.clientName,
        row.mobile,
        'Porsaid',
        'WALKIN',
        row.consultant,
        'NONE',
        toExcelTime(row.arrivalTime),
        toExcelTime(row.leavingTime),
        row.sap.trim(),
        Number(row.clientNumber),
        row.frontDeskAdmin,
        'Only Presentation',
        row.branch,
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    styleSheet(worksheet, rows.length);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Walk-In');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Porsaid-Walk-In-${date}.xlsx`, { compression: true });
    toast('success', 'تم تنزيل ملف Excel بالتنسيق المطلوب');
  };

  return (
    <section className="surface anim-fade-up overflow-hidden">
      <div className="brand-bar h-1 w-full" />
      <div className="p-4 sm:p-5">
        <SectionTitle
          title="تقرير عملاء Porsaid"
          subtitle="أضف بيانات العملاء ثم نزّل ملف Excel بالتنسيق المعتمد"
          icon={<FileSpreadsheet className="size-4.5" strokeWidth={2.1} />}
          action={
            <button onClick={exportWorkbook} disabled={!rows.length} className="btn btn-primary px-3 py-2.5 text-[12px]">
              <Download className="size-4" />
              Excel ({rows.length})
            </button>
          }
        />

        <form onSubmit={addRow} className="space-y-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-3.5">
          {prefill && prefillDiffers && (
            <button
              type="button"
              onClick={() => {
                applyPrefill(prefill);
                toast('success', 'تم ملء الاسم والموبايل ووقت الوصول من تسجيل WALK IN');
              }}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-right transition hover:border-emerald-300"
            >
              <span className="text-[12px] font-bold text-emerald-700">
                عميل WALK IN مسجّل: {prefill.name} — اضغط للملء التلقائي
              </span>
              <span className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-extrabold text-white">
                ملء
              </span>
            </button>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Client Name *</label>
              <input
                value={draft.clientName}
                onChange={(e) => {
                  updateDraft('clientName', e.target.value);
                  setAutoFilled(false);
                }}
                placeholder="اسم العميل"
                className="field"
              />
            </div>
            <div>
              <label className="field-label">Mobile *</label>
              <input
                dir="ltr"
                inputMode="tel"
                value={draft.mobile}
                onChange={(e) => {
                  updateDraft('mobile', e.target.value);
                  setAutoFilled(false);
                }}
                placeholder="01xxxxxxxxx"
                className="field text-left"
              />
            </div>
          </div>
          {autoFilled && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              تم الملء تلقائياً من تسجيل WALK IN (الاسم + الموبايل + وقت الوصول) — يمكنك تعديله يدوياً قبل الإضافة.
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="field-label mb-0">Property consultant *</label>
              <button type="button" onClick={() => setShowNewConsultant((value) => !value)} className="inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-600">
                <UserRoundPlus className="size-3.5" />
                إضافة اسم آخر
              </button>
            </div>
            <select value={draft.consultant} onChange={(e) => updateDraft('consultant', e.target.value)} className="field">
              <option value="">اختر الاستشاري</option>
              {consultants.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {showNewConsultant && (
              <div className="mt-2 flex gap-2">
                <input value={newConsultant} onChange={(e) => setNewConsultant(e.target.value)} placeholder="اسم الاستشاري الجديد" className="field" />
                <button type="button" onClick={addConsultant} className="btn btn-secondary shrink-0 px-3"><Plus className="size-4" />إضافة</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Arrival time *</label>
              <input type="time" value={draft.arrivalTime} onChange={(e) => updateDraft('arrivalTime', e.target.value)} className="field" />
            </div>
            <div>
              <label className="field-label">Leaving time *</label>
              <input type="time" value={draft.leavingTime} onChange={(e) => updateDraft('leavingTime', e.target.value)} className="field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="field-label">client number</label>
              <select value={draft.clientNumber} onChange={(e) => updateDraft('clientNumber', e.target.value as '1' | '2')} className="field">
                <option value="1">1</option><option value="2">2</option>
              </select>
            </div>
            <div>
              <label className="field-label">front desk admin</label>
              <select value={draft.frontDeskAdmin} onChange={(e) => updateDraft('frontDeskAdmin', e.target.value)} className="field">
                {ADMINS.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Branch</label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-ink-100 p-1">
                {(['SITE', 'RESTA'] as const).map((branch) => (
                  <button key={branch} type="button" onClick={() => updateDraft('branch', branch)} className={`rounded-lg py-2 text-xs font-black transition ${draft.branch === branch ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-white'}`}>
                    {branch}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-[11px] font-bold text-ink-400">إدخال SAP (اختياري — يترك فارغاً افتراضياً)</summary>
            <input value={draft.sap} onChange={(e) => updateDraft('sap', e.target.value)} placeholder="SAP" className="field mt-2" />
          </details>

          <button type="submit" className="btn btn-secondary w-full py-3">
            <Plus className="size-4" />
            إضافة العميل إلى الملف
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-extrabold text-ink-700">العملاء المضافون ({rows.length})</p>
          {rows.length > 0 && (
            <button onClick={() => { setRows([]); toast('info', 'تم مسح قائمة العملاء'); }} className="text-[11px] font-bold text-ink-400 hover:text-brand-600">
              مسح القائمة
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-ink-200 px-4 py-7 text-center">
            <FileSpreadsheet className="mx-auto size-7 text-ink-300" />
            <p className="mt-2 text-[12px] font-bold text-ink-500">لم تتم إضافة عملاء بعد</p>
            <p className="mt-0.5 text-[11px] text-ink-400">البيانات المدخلة ستظهر في معاينة الملف هنا</p>
          </div>
        ) : (
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                <span className="tnum grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-[11px] font-black text-brand-600">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-extrabold text-ink-900">{row.clientName}</p>
                  <p className="truncate text-[10px] font-medium text-ink-400">{row.consultant} · {row.arrivalTime}–{row.leavingTime} · {row.branch}</p>
                </div>
                <button type="button" onClick={() => setRows((previous) => previous.filter((item) => item.id !== row.id))} aria-label="حذف العميل" className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-brand-50 hover:text-brand-600">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <button onClick={exportWorkbook} className="btn btn-primary mt-3 w-full py-3">
            <Download className="size-4" />
            إنشاء وتنزيل ملف Excel
          </button>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {['Project: Porsaid', 'Source: WALKIN', 'Email: NONE', 'Reason: Only Presentation'].map((item) => (
            <span key={item} className="badge badge-gray">{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}