import { useEffect, useState } from 'react';
import { CheckCircle2, Download, MessageCircle, Plus, Trash2, Undo2, UserPlus } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { formatTime } from '../lib/walkin';
import { SectionTitle } from './ui';

export interface FrontDeskClient {
  id: string;
  name: string;
  mobile: string;
  unit: string;
  reason: string;
  staff: string;
  createdAt: string;
  finishedAt: string | null;
}

export const RECEPTION_STAFF = ['Amira', 'Aya', 'Khaled', 'Kassem', 'Ramal'];

/** Shared bridge: when a WALK IN client is registered, their name + mobile are
 * published so the Porsaid report form can auto-fill CLIENT NAME & MOBILE. */
export const WALKIN_PREFILL_EVENT = 'amer:walkin-prefill';

export interface WalkInPrefill {
  name: string;
  mobile: string;
  /** Registration time as ISO (single source of truth for Arrival time). */
  createdAt?: string;
  at: number;
  id: string;
}

export const walkinPrefillKey = (account: string) => `amer-last-walkin-${account.toLowerCase()}`;

export const readWalkInPrefill = (account: string): WalkInPrefill | null => {
  try {
    const raw = localStorage.getItem(walkinPrefillKey(account));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalkInPrefill;
    if (!parsed?.name || !parsed?.mobile) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearWalkInPrefill = (account: string) => {
  try {
    localStorage.removeItem(walkinPrefillKey(account));
  } catch {
    /* ignore */
  }
};

const storageKey = (account: string) => `amer-front-desk-clients-${account.toLowerCase()}`;

const loadClients = (account: string): FrontDeskClient[] => {
  try {
    const raw = localStorage.getItem(storageKey(account));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Migrate older records saved before the finish feature existed.
    return parsed.map((c) => ({ ...c, finishedAt: c.finishedAt ?? null }));
  } catch {
    return [];
  }
};

const persistClients = (account: string, list: FrontDeskClient[]) => {
  try {
    localStorage.setItem(storageKey(account), JSON.stringify(list));
  } catch {
    /* storage full */
  }
};

/** Normalize a local mobile number to the international WhatsApp format (Egypt +20). */
const waNumber = (mobile: string) => {
  let d = mobile.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `20${d.slice(1)}`;
  if (!d.startsWith('20')) d = `20${d}`;
  return d;
};

/** The welcome message sent to the customer's WhatsApp with their queue number. */
export const waMessage = (queueNum: number) =>
  'أهلًا بحضرتك 👋\n\n' +
  'شكرًا لزيارتك (Amer Group)\n\n' +
  'تم تسجيل حضورك بنجاح، وحضرتك الآن في انتظار دورك.\n' +
  `رقم حضرتك هو : #${queueNum}\n\n` +
  'شكرًا لثقتك بنا، ونتمنى لك زيارة موفقة 🤝';

/** Different message for walk-in (no queue number) customers. */
export const WALK_IN_WA_MESSAGE =
  'أهلًا بحضرتك 👋\n\n' +
  'شكرًا لزيارتك [Amer Group] 🏢\n\n' +
  'تم تسجيل حضورك، وحضرتك حاليًا في انتظار دورك مع أحد مستشاري المبيعات لدينا.\n\n' +
  'نشكرك على انتظارك، ونسعد دائمًا بخدمتك 🤝';

const normalizeReason = (r: string): string => r.trim().toUpperCase();

/** The fixed reason options; selecting "سبب آخر" enables free text. */
export const REASON_OPTIONS = [
  { value: 'دفع اقساط', label: 'دفع اقساط' },
  { value: 'الاستفسار عن عقود', label: 'الاستفسار عن عقود' },
  { value: 'WALK IN', label: 'WALK IN' },
  { value: '__other__', label: 'سبب آخر' },
] as const;

/** A reason of WALK IN does not require a unit number and gets its own WhatsApp message. */
export const isWalkInReason = (reason: string): boolean =>
  normalizeReason(reason) === 'WALK IN';

const SHEET_HEADERS = [
  '#',
  'Client Name',
  'Mobile',
  'Date',
  'Arrival time',
  'Unit Number',
  'Reason for visit',
  'Front Desk Admin',
  'Branch',
];

/** Local date in YYYY-MM-DD shape, matching the reference sheet (e.g. 2026-09-27). */
const formatDateISO = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const styleClientSheet = (ws: XLSX.WorkSheet, headers: string[], bodyRows: number) => {
  const thin = { style: 'thin' as const, color: { rgb: 'FF000000' } };
  const box = { top: thin, bottom: thin, left: thin, right: thin };
  const range = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } };
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws[addr] ?? (ws[addr] = { t: 's' as const, v: '' })) as Record<string, unknown>;
      const header = r === 0;
      // Mobile / Unit Number stay as text so leading zeros are preserved.
      if (!header && (c === 2 || c === 5)) {
        cell.t = 's';
        cell.v = String(cell.v ?? '');
      }
      const styled = {
        border: box,
        font: header
          ? { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }
          : { name: 'Arial', sz: 11, bold: false, color: { rgb: 'FF000000' } },
        ...(header ? { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF0000' } } } : {}),
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      } as Record<string, unknown>;
      // Arrival time column renders in 12-hour format with AM/PM.
      if (!header && c === 4) (styled as { numFmt?: string }).numFmt = 'h:mm AM/PM';
      cell.s = styled;
    }
  }

  ws['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
  ];
  ws['!rows'] = [{ hpt: 30 }, ...Array.from({ length: bodyRows }, () => ({ hpt: 22 }))];
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ r: bodyRows, c: headers.length - 1 })}` };
};

const exportWorkbook = (list: FrontDeskClient[], branch: string) => {
  // Single sheet in registration order. Column # is a serial number by sheet
  // row (1..N) — independent of the live queue position.
  const body = list.map((c, i) => [
    i + 1,
    c.name,
    c.mobile,
    formatDateISO(c.createdAt),
    formatTime(c.createdAt),
    c.unit,
    c.reason,
    c.staff,
    branch,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADERS, ...body]);
  styleClientSheet(ws, SHEET_HEADERS, body.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  XLSX.writeFile(wb, `Amer-Group-FrontDesk-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="field-label">{label}</label>
    {children}
  </div>
);

export function ClientRegistration({ account }: { account: string }) {
  const [clients, setClients] = useState<FrontDeskClient[]>(() => loadClients(account));
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    unit: '',
    reasonChoice: '',
    reasonCustom: '',
    staff: RECEPTION_STAFF[0],
  });
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const [lastWasWalkIn, setLastWasWalkIn] = useState(false);

  const isWalkIn = form.reasonChoice === 'WALK IN';
  const finalReason =
    form.reasonChoice === '__other__' ? form.reasonCustom.trim() : form.reasonChoice;

  const active = clients.filter((c) => !c.finishedAt);
  const done = clients.filter((c) => !!c.finishedAt);

  useEffect(() => {
    if (justSaved === null) return;
    const t = setTimeout(() => setJustSaved(null), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Walk-in clients do not need a unit number.
    const unitRequired = !isWalkIn;
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('الاسم');
    if (!form.mobile.trim()) missing.push('رقم الموبايل');
    if (unitRequired && !form.unit.trim()) missing.push('رقم الوحدة');
    if (!finalReason) missing.push('سبب المجيء');
    if (missing.length > 0) {
      setError(`أكمل الحقول المطلوبة: ${missing.join('، ')}`);
      return;
    }
    // Queue number = position among active clients only.
    // If the previous client was finished, the queue is empty → new client is #1.
    // If not finished, the new client takes #2 (or the next position).
    const queueNum = active.length + 1;
    const client: FrontDeskClient = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      unit: isWalkIn ? '' : form.unit.trim(),
      reason: finalReason,
      staff: form.staff,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    const nextList = [...clients, client];
    persistClients(account, nextList);
    setClients(nextList);
    setJustSaved(queueNum);
    const walkIn = isWalkInReason(finalReason);
    setLastWasWalkIn(walkIn);
    if (walkIn) {
      // Publish name + mobile + registration time so the Porsaid report
      // auto-fills CLIENT NAME, MOBILE and Arrival time.
      try {
        localStorage.setItem(
          walkinPrefillKey(account),
          JSON.stringify({
            name: client.name,
            mobile: client.mobile,
            createdAt: client.createdAt,
            at: Date.now(),
            id: client.id,
          }),
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent(WALKIN_PREFILL_EVENT, {
          detail: { account, name: client.name, mobile: client.mobile, createdAt: client.createdAt },
        }),
      );
    }
    setForm({ name: '', mobile: '', unit: '', reasonChoice: '', reasonCustom: '', staff: RECEPTION_STAFF[0] });
    setError('');
  };

  const finishClient = (id: string) => {
    const nextList = clients.map((c) =>
      c.id === id ? { ...c, finishedAt: new Date().toISOString() } : c,
    );
    persistClients(account, nextList);
    setClients(nextList);
  };

  const restoreClient = (id: string) => {
    const nextList = clients.map((c) => (c.id === id ? { ...c, finishedAt: null } : c));
    persistClients(account, nextList);
    setClients(nextList);
  };

  const removeClient = (id: string) => {
    const nextList = clients.filter((c) => c.id !== id);
    persistClients(account, nextList);
    setClients(nextList);
  };

  const clearAll = () => {
    if (!window.confirm('مسح قائمة عملاء اليوم بالكامل؟')) return;
    persistClients(account, []);
    setClients([]);
    setJustSaved(null);
  };

  const waLink = (client: FrontDeskClient, queueNum: number) =>
    `https://wa.me/${waNumber(client.mobile)}?text=${encodeURIComponent(
      isWalkInReason(client.reason) ? WALK_IN_WA_MESSAGE : waMessage(queueNum),
    )}`;

  const exportExcel = () => exportWorkbook(clients, account.toUpperCase());

  return (
    <section className="surface anim-fade-up p-5" style={{ animationDelay: '0.08s' }}>
      <SectionTitle
        title="تسجيل عميل جديد"
        subtitle="دخول عميل جديد — مكتب الاستقبال"
        icon={<UserPlus className="size-4.5" strokeWidth={2.1} />}
        action={
          <button
            type="button"
            onClick={exportExcel}
            disabled={clients.length === 0}
            className="btn btn-neutral px-2.5 py-1.5 text-[11px]"
          >
            <Download className="size-3.5" />
            Excel
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="اسم العميل *">
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="الاسم الكامل للعميل"
            />
          </Field>
          <Field label="رقم الموبايل *">
            <input
              dir="ltr"
              inputMode="tel"
              className="field text-left"
              value={form.mobile}
              onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
              placeholder="01xxxxxxxxx"
            />
          </Field>
          <Field label={isWalkIn ? 'رقم الوحدة (اختياري)' : 'رقم الوحدة *'}>
            <input
              dir="ltr"
              className="field text-left"
              value={isWalkIn ? '' : form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder={isWalkIn ? 'غير مطلوب للعملاء الـ Walk in' : '101'}
              disabled={isWalkIn}
            />
          </Field>
          <Field label="سبب المجيء *">
            <select
              className="field"
              value={form.reasonChoice}
              onChange={(e) => setForm((f) => ({ ...f, reasonChoice: e.target.value }))}
            >
              <option value="" disabled>
                اختر سبب المجيء
              </option>
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {form.reasonChoice === '__other__' && (
            <Field label="اكتب السبب *">
              <input
                className="field"
                value={form.reasonCustom}
                onChange={(e) => setForm((f) => ({ ...f, reasonCustom: e.target.value }))}
                placeholder="اكتب سبب المجيء…"
              />
            </Field>
          )}
        </div>
        <Field label="موظف الاستقبال">
          <select
            className="field"
            value={form.staff}
            onChange={(e) => setForm((f) => ({ ...f, staff: e.target.value }))}
          >
            {RECEPTION_STAFF.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-700">
            {error}
          </p>
        )}
        {justSaved !== null && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700">
            تم تسجيل العميل بنجاح — رسالة الواتساب جاهزة.
            {lastWasWalkIn && ' وتم ملء الاسم والموبايل ووقت الوصول تلقائياً في تقرير Porsaid.'}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full py-3">
          <Plus className="size-4.5" />
          تسجيل العميل
        </button>
      </form>

      {clients.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold text-ink-700">
              طابور الانتظار ({active.length})
              {done.length > 0 && <span className="font-semibold text-ink-400"> · تم إنهاء {done.length}</span>}
            </p>
            <button type="button" onClick={clearAll} className="btn btn-neutral px-2.5 py-1.5 text-[11px]">
              <Trash2 className="size-3.5" />
              مسح القائمة
            </button>
          </div>

          {active.length > 0 ? (
            (() => {
              let ticketCounter = 0;
              const rows = active.map((c) => {
                const walkIn = isWalkInReason(c.reason);
                const ticket = walkIn ? null : ticketCounter + 1;
                if (!walkIn) ticketCounter += 1;
                return { c, walkIn, ticket };
              });
              const currentId = rows.find((r) => r.ticket === 1)?.c.id ?? null;
              return (
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {rows.map(({ c, walkIn, ticket }) => {
                    const isCurrent = c.id === currentId;
                    return (
                      <li
                        key={c.id}
                        className={
                          isCurrent
                            ? 'flex items-start justify-between gap-2 rounded-xl border-2 border-brand-200 bg-brand-50/50 p-3'
                            : 'flex items-start justify-between gap-2 rounded-xl border border-ink-100 bg-white p-3'
                        }
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {walkIn ? (
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-300 text-[8px] font-black text-white">
                              WALK IN
                            </span>
                          ) : (
                            <span
                              className={`tnum grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-black text-white ${
                                isCurrent ? 'bg-brand-600' : 'bg-ink-400'
                              }`}
                            >
                              #{ticket}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-extrabold text-ink-900">
                              {c.name}
                              {isCurrent && (
                                <span className="mr-1.5 rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  الدور الحالي
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[11px] text-ink-400" dir="ltr">
                              {c.mobile}
                              {!walkIn && c.unit ? ` · Unit ${c.unit}` : ''}
                            </p>
                            <p className="truncate text-[11px] text-ink-400">
                              {c.reason} · {c.staff} · {formatTime(c.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => finishClient(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-extrabold text-white transition hover:brightness-105"
                            title="إنهاء العميل"
                          >
                            <CheckCircle2 className="size-3.5" />
                            إنهاء
                          </button>
                          <div className="flex gap-1.5">
                            <a
                              href={waLink(c, ticket ?? active.length)}
                              target="_blank"
                              rel="noreferrer"
                              className="grid size-8 place-items-center rounded-lg bg-[#25D366] text-white transition hover:brightness-105"
                              title="إرسال رسالة واتساب"
                              aria-label="إرسال رسالة واتساب"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => removeClient(c.id)}
                              className="grid size-8 place-items-center rounded-lg text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                              aria-label="حذف العميل"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()
          ) : (
            <p className="mt-2 rounded-xl bg-ink-50 px-3 py-3 text-center text-[12px] font-semibold text-ink-400">
              لا يوجد عملاء في الانتظار — العميل الجديد سيأخذ الدور #1
            </p>
          )}

          {done.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[12px] font-extrabold text-ink-500">تم إنهاؤهم اليوم ({done.length})</p>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {done.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-ink-500 line-through decoration-ink-300">
                        {c.name}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        انتهى {c.finishedAt ? formatTime(c.finishedAt) : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => restoreClient(c.id)}
                        className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-emerald-600"
                        title="إرجاع للطابور"
                        aria-label="إرجاع للطابور"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeClient(c.id)}
                        className="grid size-7 place-items-center rounded-lg text-ink-300 transition hover:bg-white hover:text-brand-600"
                        aria-label="حذف نهائي"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
