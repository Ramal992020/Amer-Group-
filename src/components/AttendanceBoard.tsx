import { useMemo, useState } from 'react';
import { Crown, Users, UserRound, Check, Copy, CheckCheck, PhoneCall, Search, MapPin, Download, Loader2, Clock3, Clock, Edit3 } from 'lucide-react';
import type { HeadGroup, ManagerTeam, SalesPerson, SalesState } from '../lib/walkin';
import { formatTime, hydrate, loadPersisted, otherWorkspace } from '../lib/walkin';
import { getSyncConfig, pullRemote } from '../lib/sync';
import { Modal, EmptyState, useToast } from './ui';
import { cn } from '../utils/cn';
import {
  attendanceRowsFor,
  exportAttendanceWorkbook,
  mergeAttendanceRows,
} from '../lib/attendanceExcel';
import type { AttendanceWorkbookRow } from '../lib/attendanceExcel';

type Branch = 'SITE' | 'RESTA';

interface Props {
  account: string;
  salesState: Record<string, SalesState>;
  onToggle: (id: string, branch?: Branch, at?: string) => void | Promise<void>;
  onFree: (id: string, branch?: Branch, at?: string) => void | Promise<void>;
  onUpdateTime?: (id: string, branch?: Branch, timeISO?: string) => void | Promise<void>;
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
}

// ─── time helpers ───
const nowTimeStr = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const timeStrToISO = (timeStr: string): string => {
  const [hStr, mStr] = timeStr.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  const d = new Date();
  if (Number.isFinite(h)) d.setHours(h);
  if (Number.isFinite(m)) d.setMinutes(m);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d.toISOString();
};

const isoToTimeStr = (iso?: string | null): string => {
  if (!iso) return nowTimeStr();
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return nowTimeStr();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return nowTimeStr();
  }
};

const parseHM = (timeStr: string): { h: number; m: number } => {
  const [hs, ms] = timeStr.split(':');
  const h = Math.min(23, Math.max(0, Number.parseInt(hs || '0', 10) || 0));
  const m = Math.min(59, Math.max(0, Number.parseInt(ms || '0', 10) || 0));
  return { h, m };
};

// ─── Analog clock face ───
function AnalogClock({ timeStr }: { timeStr: string }) {
  const { h, m } = parseHM(timeStr);
  const hourAngle = (h % 12) * 30 + m * 0.5; // 360/12 =30
  const minuteAngle = m * 6; // 360/60=6

  return (
    <div className="relative mx-auto size-[180px] shrink-0 rounded-full border-[3px] border-ink-900 bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]">
      {/* ticks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const ang = i * 30;
        const isHour = i % 3 === 0;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-[84px] w-px origin-bottom bg-ink-200"
            style={{ transform: `translate(-50%, -100%) rotate(${ang}deg)` }}
          >
            <span className={cn('absolute left-1/2 top-0 block -translate-x-1/2 rounded-full bg-ink-900', isHour ? 'h-2.5 w-1' : 'h-1.5 w-px bg-ink-300')} />
          </span>
        );
      })}
      {/* hour hand */}
      <span
        className="absolute left-1/2 top-1/2 h-[52px] w-[5px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-ink-900 transition-transform duration-300"
        style={{ transform: `translate(-50%, -100%) rotate(${hourAngle}deg)` }}
      />
      {/* minute hand */}
      <span
        className="absolute left-1/2 top-1/2 h-[72px] w-[3px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-brand-600 transition-transform duration-300"
        style={{ transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)` }}
      />
      {/* center dot */}
      <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-900 ring-2 ring-white" />
      {/* digital inside */}
      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-ink-900 px-2 py-0.5 text-[11px] font-black text-white tnum">
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
      </span>
    </div>
  );
}

export function AttendanceBoard({ account, salesState, onToggle, onFree, onUpdateTime, heads, managers, sales }: Props) {
  const toast = useToast();
  const [copyTarget, setCopyTarget] = useState<SalesPerson | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const currentBranch: Branch = account.trim().toUpperCase() === 'RESTA' ? 'RESTA' : 'SITE';
  const [attendanceBranch, setAttendanceBranch] = useState<Branch>(currentBranch);
  const [savingId, setSavingId] = useState<string | null>(null);

  // ─── time modals ───
  const [preparingPerson, setPreparingPerson] = useState<SalesPerson | null>(null);
  const [prepareTimeStr, setPrepareTimeStr] = useState<string>(() => nowTimeStr());

  const [editingPerson, setEditingPerson] = useState<SalesPerson | null>(null);
  const [editTimeStr, setEditTimeStr] = useState<string>(nowTimeStr());

  const openPrepare = (person: SalesPerson) => {
    setPrepareTimeStr(nowTimeStr()); // الافتراضي وقت التحضير الآن
    setPreparingPerson(person);
  };

  const openEditTime = (person: SalesPerson) => {
    const st = salesState[person.id];
    setEditingPerson(person);
    setEditTimeStr(isoToTimeStr(st?.checkInTime));
  };

  const exportCombined = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    try {
      const roster = { sales, managers, heads };
      const mine = attendanceRowsFor(roster, salesState);
      let theirs: AttendanceWorkbookRow[] = [];
      const other = otherWorkspace(account);
      if (other) {
        const local = loadPersisted(other);
        let otherState = local.salesState;
        try {
          const remote = await pullRemote(other, undefined, getSyncConfig(account));
          if (remote && remote.updatedAt >= (local.updatedAt ?? 0)) {
            otherState = hydrate(remote.payload as never).salesState;
          }
        } catch {
          /* offline */
        }
        theirs = attendanceRowsFor(roster, otherState);
      }
      const rows = mergeAttendanceRows(mine, theirs);
      exportAttendanceWorkbook(rows);
      toast('success', `تم تجهيز ملف الحضور المجمع للفرعين (${rows.length} أفراد)`);
    } finally {
      setExporting(false);
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (s: SalesPerson) => !q || s.name.toLowerCase().includes(q);

  const copyStatement = async (person: SalesPerson, branch: Branch) => {
    const st = salesState[person.id];
    const time = st?.checkInTime ? formatTime(st.checkInTime) : formatTime(new Date().toISOString());
    const text = `NAME : ${person.name}\nBRANCH : ${branch}\nTIME : ${time}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopyTarget(null);
    setCopiedId(person.id);
    toast('success', `تم نسخ بيان ${person.name}`);
    setTimeout(() => setCopiedId((cur) => (cur === person.id ? null : cur)), 1800);
  };

  const runAttendanceAction = async (
    person: SalesPerson,
    action: (id: string, branch: Branch, at?: string) => void | Promise<void>,
    withTime = false,
    timeISO?: string,
  ): Promise<void> => {
    if (savingId) return;
    setSavingId(person.id);
    try {
      if (withTime && timeISO) await action(person.id, attendanceBranch, timeISO);
      else await action(person.id, attendanceBranch);
    } finally {
      setSavingId(null);
    }
  };

  const confirmPrepare = async (): Promise<void> => {
    if (!preparingPerson || savingId) return;
    const iso = timeStrToISO(prepareTimeStr);
    setSavingId(preparingPerson.id);
    try {
      await onToggle(preparingPerson.id, attendanceBranch, iso);
      toast('success', `تم تحضير ${preparingPerson.name} بوقت ${formatTime(iso)} في فرع ${attendanceBranch}`);
      setPreparingPerson(null);
    } finally {
      setSavingId(null);
    }
  };

  const runUpdateTime = async (): Promise<void> => {
    if (!editingPerson || savingId) return;
    const iso = timeStrToISO(editTimeStr);
    setSavingId(editingPerson.id);
    try {
      if (onUpdateTime) await onUpdateTime(editingPerson.id, currentBranch, iso);
      toast('success', `تم تحديث وقت حضور ${editingPerson.name} إلى ${formatTime(iso)}`);
      setEditingPerson(null);
    } finally {
      setSavingId(null);
    }
  };

  const totalVisible = sales.filter(matches).length;

  return (
    <div className="space-y-4">
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-ink-900">تسجيل الحضور في فرع</p>
          <p className="mt-1 text-xs font-medium text-ink-400">
            اضغط على أي شخص ليظهر لك شكل الساعة وتختار وقت حضوره — الافتراضي هو وقت التحضير الآن.
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-extrabold text-brand-600">
            <MapPin className="size-3.5" />
            الفرع المختار: {attendanceBranch}
            {attendanceBranch !== currentBranch && ' · سيُسجل في الفرع الآخر'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['SITE', 'RESTA'] as const).map((branch) => (
            <button
              key={branch}
              type="button"
              disabled={savingId !== null}
              onClick={() => setAttendanceBranch(branch)}
              aria-pressed={attendanceBranch === branch}
              className={cn(
                'rounded-xl border px-5 py-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60',
                attendanceBranch === branch ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300',
              )}
            >
              {branch}
            </button>
          ))}
        </div>
      </div>

      {/* search */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم السيلز…" aria-label="ابحث باسم السيلز" className="field pr-10" />
        </div>
        <button type="button" onClick={() => void exportCombined()} disabled={exporting} className="btn btn-primary shrink-0">
          <Download className="size-4" />
          {exporting ? 'جارٍ تجهيز الملف…' : 'تحميل Excel الحضور'}
        </button>
      </div>

      {totalVisible === 0 && (
        <div className="surface">
          <EmptyState icon={<Search className="size-6" />} title="لا توجد نتائج" description={`لا يوجد اسم يطابق "${query}"`} />
        </div>
      )}

      {heads.map((head, hi) => {
        const headManagers = managers.filter((m) => m.headId === head.id);
        const headSales = sales.filter((s) => s.headId === head.id);
        const visible = headSales.filter(matches);
        if (visible.length === 0) return null;
        const present = headSales.filter((s) => salesState[s.id]?.status !== 'absent').length;
        return (
          <section key={head.id} className="surface anim-fade-up overflow-hidden" style={{ animationDelay: `${hi * 0.06}s` }}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-[0_4px_10px_-3px_rgba(227,6,19,0.5)]">
                  <Crown className="size-4.5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-extrabold leading-tight text-ink-900">{head.name}</p>
                  <p className="text-[11px] font-semibold text-ink-400">Head Manager</p>
                </div>
              </div>
              <span className="badge badge-gray tnum shrink-0">{present}/{headSales.length} حاضر</span>
            </div>

            <div className="space-y-4 p-3.5">
              {headManagers.map((mgr) => {
                const members = sales.filter((s) => s.managerId === mgr.id).filter(matches);
                if (members.length === 0) return null;
                return (
                  <div key={mgr.id}>
                    <div className="mb-2 flex items-center gap-1.5 px-1">
                      <Users className="size-3.5 text-ink-300" strokeWidth={2.2} />
                      <span className="text-[12px] font-extrabold text-ink-500">تيم {mgr.name}</span>
                      <span className="h-px flex-1 bg-ink-100" />
                    </div>
                    <div className="space-y-2">
                      {members.map((person) => {
                        const st = salesState[person.id];
                        const isPresent = st?.status !== 'absent';
                        const busy = st?.status === 'busy';
                        const justCopied = copiedId === person.id;
                        const saving = savingId === person.id;
                        const selectedOtherBranch = attendanceBranch !== currentBranch;

                        const subtitle = selectedOtherBranch
                          ? busy
                            ? `مشغول الآن في ${currentBranch} — لا يمكن نقله قبل إنهاء المقابلة`
                            : isPresent
                              ? `حاضر في ${currentBranch} — اضغط لنقله إلى ${attendanceBranch} مع اختيار الوقت`
                              : `اضغط لتسجيله في فرع ${attendanceBranch} مع اختيار الوقت`
                          : busy
                            ? 'مشغول الآن مع عميل'
                            : isPresent
                              ? person.isManager
                                ? `حضر ${st?.checkInTime ? formatTime(st.checkInTime) : ''} — يقدر يقعد مع العميل لو حد من تيمه مش موجود`
                                : `حضر ${st?.checkInTime ? formatTime(st.checkInTime) : ''}`
                              : 'لم يحضر — اضغط لاختيار وقت الحضور';

                        const handleClick = () => {
                          if (saving) return;
                          if (selectedOtherBranch) {
                            // نقل لفرع آخر → يفتح الساعة أيضا
                            openPrepare(person);
                          } else if (busy) {
                            void runAttendanceAction(person, onFree, false);
                          } else if (isPresent) {
                            // حاضر → انصراف مباشر، التعديل من زر الساعة
                            void runAttendanceAction(person, onToggle, false);
                          } else {
                            // لم يحضر → افتح شكل الساعة
                            openPrepare(person);
                          }
                        };

                        return (
                          <div
                            key={person.id}
                            className={cn(
                              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                              busy ? 'border-amber-200 bg-amber-50/70' : isPresent ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-100 bg-white hover:border-ink-200',
                            )}
                          >
                            <button
                              type="button"
                              disabled={saving}
                              onClick={handleClick}
                              aria-label={isPresent ? `تسجيل انصراف ${person.name}` : `تحضير ${person.name} مع اختيار الوقت`}
                              className={cn(
                                'grid size-10 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:cursor-wait disabled:opacity-60',
                                busy ? 'bg-amber-500 text-white' : isPresent ? 'bg-emerald-500 text-white' : 'border border-ink-200 bg-ink-50 text-ink-300 hover:border-brand-300 hover:text-brand-500',
                              )}
                            >
                              {saving ? <Loader2 className="size-[18px] animate-spin" strokeWidth={2.4} /> : busy ? <PhoneCall className="size-[18px]" strokeWidth={2.4} /> : isPresent ? <Check className="size-5" strokeWidth={3} /> : <Clock3 className="size-[18px]" strokeWidth={2} />}
                            </button>

                            <button type="button" disabled={saving} onClick={handleClick} className="min-w-0 flex-1 text-right disabled:cursor-wait">
                              <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold text-ink-900">
                                <span className="truncate">{person.name}</span>
                                {person.isManager && <span className="badge badge-red shrink-0">مدير</span>}
                              </p>
                              <p className={cn('tnum mt-0.5 truncate text-[12px] font-semibold', busy ? 'text-amber-700' : isPresent ? 'text-emerald-700' : 'text-ink-400')}>{subtitle}</p>
                            </button>

                            {isPresent && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => openEditTime(person)}
                                title="تعديل وقت الحضور"
                                aria-label={`تعديل وقت حضور ${person.name}`}
                                className="grid size-9 shrink-0 place-items-center rounded-xl border border-ink-200 bg-white text-ink-400 transition hover:border-brand-300 hover:text-brand-600 disabled:cursor-wait disabled:opacity-60"
                              >
                                <Edit3 className="size-4" strokeWidth={2.2} />
                              </button>
                            )}

                            {isPresent && (
                              <button
                                type="button"
                                onClick={() => setCopyTarget(person)}
                                title={`نسخ بيان حضور فرع ${currentBranch}`}
                                aria-label={`نسخ بيان ${person.name}`}
                                className={cn(
                                  'grid size-9 shrink-0 place-items-center rounded-xl border transition active:scale-95',
                                  justCopied ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-200 bg-white text-ink-400 hover:border-brand-300 hover:text-brand-600',
                                )}
                              >
                                {justCopied ? <CheckCheck className="size-4.5" strokeWidth={2.6} /> : <Copy className="size-4" strokeWidth={2.2} />}
                              </button>
                            )}

                            {busy && !selectedOtherBranch && (
                              <button type="button" disabled={saving} onClick={() => void runAttendanceAction(person, onFree, false)} className="btn btn-neutral shrink-0 px-2.5 py-2 text-[11px] disabled:cursor-wait">إنهاء</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Modal open={!!copyTarget} onClose={() => setCopyTarget(null)} title={copyTarget?.name} subtitle={`بيان حضور مسجل في فرع ${currentBranch}`}>
        <div className="p-5">
          <button type="button" onClick={() => copyTarget && copyStatement(copyTarget, currentBranch)} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-ink-100 bg-white py-5 transition hover:border-brand-600 hover:bg-brand-50 active:scale-[0.98]">
            <MapPin className="size-6 text-brand-600" strokeWidth={2.2} />
            <span className="font-display text-[16px] font-black text-ink-900">نسخ بيان فرع {currentBranch}</span>
          </button>
        </div>
      </Modal>

      {/* ─── Prepare modal with analog clock ─── */}
      <Modal
        open={!!preparingPerson}
        onClose={() => setPreparingPerson(null)}
        title={preparingPerson ? `تحضير ${preparingPerson.name}` : 'تحضير'}
        subtitle={`اختر وقت الحضور — الافتراضي وقت التحضير الآن • فرع ${attendanceBranch}`}
      >
        <div className="space-y-5 p-5">
          <div className="flex flex-col items-center gap-4">
            <AnalogClock timeStr={prepareTimeStr} />
            <div className="flex flex-col items-center gap-1">
              <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-ink-500">
                <Clock className="size-4" /> شكل الساعة — الوقت المختار
              </p>
              <p className="tnum text-[28px] font-black leading-none text-ink-900">{prepareTimeStr}</p>
              <p className="text-[11px] font-bold text-ink-400">{preparingPerson ? formatTime(timeStrToISO(prepareTimeStr)) : ''} • فرع {attendanceBranch}</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[12px] font-extrabold text-ink-700">اضبط وقت الحضور</label>
            <input type="time" value={prepareTimeStr} onChange={(e) => setPrepareTimeStr(e.target.value || nowTimeStr())} className="field w-full text-center text-[18px] font-black tracking-widest" />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setPrepareTimeStr(nowTimeStr())} className="btn btn-neutral py-2.5 text-[12px]"><Clock className="size-4" /> الآن</button>
              <button type="button" onClick={() => { const { h, m } = parseHM(prepareTimeStr); const d = new Date(); d.setHours(h); d.setMinutes(m - 5); setPrepareTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }} className="btn btn-neutral py-2.5 text-[12px]">-5 د</button>
              <button type="button" onClick={() => { const { h, m } = parseHM(prepareTimeStr); const d = new Date(); d.setHours(h); d.setMinutes(m + 5); setPrepareTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }} className="btn btn-neutral py-2.5 text-[12px]">+5 د</button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setPreparingPerson(null)} className="btn btn-neutral flex-1">إلغاء</button>
            <button type="button" onClick={() => void confirmPrepare()} disabled={!!savingId} className="btn btn-primary flex-1 disabled:opacity-60">
              {savingId ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} تأكيد التحضير بوقت {prepareTimeStr}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit attendance time modal */}
      <Modal open={!!editingPerson} onClose={() => setEditingPerson(null)} title={editingPerson ? `تعديل وقت حضور ${editingPerson.name}` : 'تعديل وقت الحضور'} subtitle="يمكنك التحكم في وقت حضور أي شخص">
        <div className="space-y-5 p-5">
          <div className="flex flex-col items-center gap-3">
            <AnalogClock timeStr={editTimeStr} />
            <div className="rounded-xl border border-ink-100 bg-ink-50/70 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-500"><Clock3 className="size-4" /> الوقت الحالي المسجل: {editingPerson ? formatTime(salesState[editingPerson.id]?.checkInTime ?? '') : ''}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-extrabold text-ink-700">اختر وقت الحضور الجديد</label>
            <input type="time" value={editTimeStr} onChange={(e) => setEditTimeStr(e.target.value || nowTimeStr())} className="field text-center text-[18px] font-black tracking-widest" />
            <button type="button" onClick={() => setEditTimeStr(nowTimeStr())} className="btn btn-neutral w-full"><Clock className="size-4" /> الوقت الحالي الآن</button>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setEditingPerson(null)} className="btn btn-neutral flex-1">إلغاء</button>
            <button type="button" onClick={() => void runUpdateTime()} disabled={!!savingId} className="btn btn-primary flex-1 disabled:opacity-60">
              {savingId ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} حفظ الوقت
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
