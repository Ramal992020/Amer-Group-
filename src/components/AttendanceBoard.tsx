import { useEffect, useState } from 'react';
import { Crown, Check, Copy, CheckCheck, PhoneCall, Search, MapPin, Download, Loader2, Clock3, Clock, Edit3, LayoutList, LayoutGrid } from 'lucide-react';
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
import { visibleAttendanceSales } from '../lib/attendanceVisibility';

type Branch = 'SITE' | 'RESTA';
const branchDisplayName = (branch: Branch): string => branch === 'SITE' ? 'الموقع' : 'ريستا';

// طريقة عرض الأسماء في تبويب الحضور: طولي (قائمة صفوف) أو عرضي (شبكة كروت)
type LayoutMode = 'vertical' | 'grid';

const LAYOUT_STORAGE_KEY = 'amer-attendance-layout-v1';

const loadLayoutMode = (): LayoutMode => {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'grid' ? 'grid' : 'vertical';
  } catch {
    return 'vertical';
  }
};

/**
 * Team identity colours.
 *
 * Each team (manager) gets a solid colour band + a matching border, so a block
 * of names can never be mistaken for the team above/below it. The colour is
 * picked from the team's position in the roster (not from the filtered list),
 * so it never changes while searching or when a team has nobody present.
 * Classes stay as full literals so Tailwind emits them.
 */
const TEAM_THEMES = [
  { band: 'bg-brand-600', border: 'border-brand-200' },
  { band: 'bg-sky-600', border: 'border-sky-200' },
  { band: 'bg-emerald-600', border: 'border-emerald-200' },
  { band: 'bg-violet-600', border: 'border-violet-200' },
  { band: 'bg-orange-500', border: 'border-orange-200' },
  { band: 'bg-teal-600', border: 'border-teal-200' },
  { band: 'bg-rose-600', border: 'border-rose-200' },
  { band: 'bg-indigo-600', border: 'border-indigo-200' },
] as const;

const teamThemeAt = (index: number) => TEAM_THEMES[((index % TEAM_THEMES.length) + TEAM_THEMES.length) % TEAM_THEMES.length];

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

export function AttendanceBoard({ account, salesState, onToggle, onFree, onUpdateTime, heads, managers, sales }: Props) {
  const toast = useToast();
  const [copyTarget, setCopyTarget] = useState<SalesPerson | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const currentBranch: Branch = account.trim().toUpperCase() === 'RESTA' ? 'RESTA' : 'SITE';
  // «جدول الحضور» lists attendance only — a manager listed in
  // HIDDEN_FROM_ATTENDANCE keeps his team, his history and his data but never
  // gets a card here (the Excel file is filtered by the same helper).
  const attendanceSales = visibleAttendanceSales(sales);
  const [attendanceBranch, setAttendanceBranch] = useState<Branch>(currentBranch);
  const otherBranch: Branch = currentBranch === 'SITE' ? 'RESTA' : 'SITE';
  const [otherBranchSalesState, setOtherBranchSalesState] = useState<Record<string, SalesState>>({});
  const [otherBranchRefresh, setOtherBranchRefresh] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [optimisticCheckIn, setOptimisticCheckIn] = useState<{ id: string; timeISO: string } | null>(null);

  // Read the other branch's attendance so people registered there can be
  // clearly marked instead of appearing absent in this branch's list.
  useEffect(() => {
    if (attendanceBranch !== otherBranch) return;
    let active = true;
    const cached = loadPersisted(otherBranch);
    setOtherBranchSalesState(cached.salesState);
    void pullRemote(otherBranch, cached, getSyncConfig(account)).then((remote) => {
      if (!active || !remote || remote.updatedAt < (cached.updatedAt ?? 0)) return;
      const latest = hydrate({ ...(remote.payload as Record<string, unknown>), updatedAt: remote.updatedAt });
      setOtherBranchSalesState(latest.salesState);
    });
    return () => {
      active = false;
    };
  }, [account, attendanceBranch, otherBranch, otherBranchRefresh]);

  // ─── طريقة العرض: طولي / عرضي (محفوظة على الجهاز) ───
  const [layout, setLayout] = useState<LayoutMode>(loadLayoutMode);
  const changeLayout = (mode: LayoutMode) => {
    setLayout(mode);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      /* التخزين غير متاح — الاختيار يفضل للجلسة الحالية */
    }
  };

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
      const roster = { sales: attendanceSales, managers, heads };
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
    const person = preparingPerson;
    const iso = timeStrToISO(prepareTimeStr);
    setSavingId(person.id);

    // For the branch currently on screen, close the dialog and show the check-in
    // immediately while the guarded cross-device save continues in the background.
    if (attendanceBranch === currentBranch) {
      setOptimisticCheckIn({ id: person.id, timeISO: iso });
      setPreparingPerson(null);
      try {
        await onToggle(person.id, attendanceBranch, iso);
      } catch {
        toast('error', 'تعذر حفظ وقت الحضور');
      } finally {
        setOptimisticCheckIn((current) => current?.id === person.id ? null : current);
        setSavingId(null);
      }
      return;
    }

    try {
      await onToggle(person.id, attendanceBranch, iso);
      toast('success', `تم تحضير ${person.name} بوقت ${formatTime(iso)} في فرع ${attendanceBranch}`);
      setPreparingPerson(null);
    } finally {
      setSavingId(null);
      if (attendanceBranch !== currentBranch) setOtherBranchRefresh((value) => value + 1);
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

  const totalVisible = attendanceSales.filter(matches).length;

  // كارت فرد واحد — يتنفس شكله حسب طريقة العرض المختارة (طولي / عرضي)
  const renderPersonCard = (person: SalesPerson) => {
    const sourceState = salesState[person.id];
    const selectedOtherBranch = attendanceBranch !== currentBranch;
    const branchState = selectedOtherBranch ? otherBranchSalesState[person.id] : sourceState;
    const pendingCheckIn = !selectedOtherBranch && optimisticCheckIn?.id === person.id ? optimisticCheckIn : null;
    const st = pendingCheckIn
      ? { ...sourceState, status: 'available' as const, checkInTime: pendingCheckIn.timeISO }
      : branchState;
    const isPresent = st?.status === 'available' || st?.status === 'busy';
    const busy = st?.status === 'busy';
    const sourceIsBusy = sourceState?.status === 'busy';
    const sourceIsPresent = sourceState?.status === 'available';
    const justCopied = copiedId === person.id;
    const saving = savingId === person.id;

    const subtitle = pendingCheckIn
      ? 'جارٍ حفظ وقت الحضور…'
      : selectedOtherBranch
        ? sourceIsBusy
          ? `مشغول الآن في ${currentBranch} — لا يمكن نقله قبل إنهاء المقابلة`
          : busy
            ? `مشغول الآن في ${attendanceBranch}`
            : isPresent
              ? `مسجل حضور في فرع ${branchDisplayName(attendanceBranch)} — ${st?.checkInTime ? formatTime(st.checkInTime) : 'مسجل اليوم'}`
              : sourceIsPresent
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
        if (isPresent) return; // هو مسجل بالفعل في الفرع المختار.
        // نقل لفرع آخر → يفتح الساعة أيضا
        openPrepare(person);
      } else if (busy) {
        void runAttendanceAction(person, onFree, false);
      } else if (isPresent) {
        // حاضر → انصراف مباشر، التعديل من زر الساعة
        void runAttendanceAction(person, onToggle, false);
      } else {
        // لم يحضر → افتح اختيار وقت الحضور
        openPrepare(person);
      }
    };

    const cardTone = busy
      ? 'border-amber-200 bg-amber-50/70'
      : selectedOtherBranch && isPresent
        ? 'border-blue-200 bg-blue-50/70'
        : isPresent
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-ink-100 bg-white hover:border-ink-200';
    const subtitleTone = busy
      ? 'text-amber-700'
      : selectedOtherBranch && isPresent
        ? 'text-blue-700'
        : isPresent
          ? 'text-emerald-700'
          : 'text-ink-400';

    const statusActionLabel = selectedOtherBranch
      ? isPresent
        ? `مسجل حضور في فرع ${branchDisplayName(attendanceBranch)}`
        : `تحضير ${person.name} في فرع ${attendanceBranch} مع اختيار الوقت`
      : isPresent
        ? `تسجيل انصراف ${person.name}`
        : `تحضير ${person.name} مع اختيار الوقت`;

    const statusButton = (
      <button
        type="button"
        disabled={saving || (selectedOtherBranch && isPresent)}
        onClick={handleClick}
        aria-label={statusActionLabel}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:cursor-wait disabled:opacity-60',
          busy ? 'bg-amber-500 text-white' : isPresent ? 'bg-emerald-500 text-white' : 'border border-ink-200 bg-ink-50 text-ink-300 hover:border-brand-300 hover:text-brand-500',
        )}
      >
        {saving ? <Loader2 className="size-[18px] animate-spin" strokeWidth={2.4} /> : busy ? <PhoneCall className="size-[18px]" strokeWidth={2.4} /> : isPresent ? <Check className="size-5" strokeWidth={3} /> : <Clock3 className="size-[18px]" strokeWidth={2} />}
      </button>
    );

    const editButton = isPresent && !selectedOtherBranch && (
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
    );

    const copyButton = isPresent && !selectedOtherBranch && (
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
    );

    const endButton = busy && !selectedOtherBranch && (
      <button
        type="button"
        disabled={saving}
        onClick={() => void runAttendanceAction(person, onFree, false)}
        className={cn('btn btn-neutral shrink-0 px-2.5 py-2 text-[11px] disabled:cursor-wait', layout === 'grid' && 'flex-1')}
      >
        إنهاء
      </button>
    );

    // ─── عرض عرضي: كارت مدمج داخل شبكة أعمدة ───
    if (layout === 'grid') {
      return (
        <div key={person.id} className={cn('flex flex-col gap-2 rounded-xl border px-3 py-3 transition-colors', cardTone)}>
          <div className="flex items-center gap-2.5">
            {statusButton}
            <button type="button" disabled={saving || (selectedOtherBranch && isPresent)} onClick={handleClick} className="min-w-0 flex-1 text-right disabled:cursor-wait">
              <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-extrabold text-ink-900">
                <span className="min-w-0 whitespace-normal break-words">{person.name}</span>
                {person.isManager && <span className="badge badge-red shrink-0">مدير</span>}
                {selectedOtherBranch && isPresent && <span className="badge badge-blue shrink-0">فرع {branchDisplayName(attendanceBranch)}</span>}
              </p>
            </button>
          </div>

          <button type="button" disabled={saving || (selectedOtherBranch && isPresent)} onClick={handleClick} className="block text-right disabled:cursor-wait">
            <p className={cn('tnum line-clamp-2 min-h-[2rem] text-[11px] font-semibold leading-snug', subtitleTone)}>{subtitle}</p>
          </button>

          {isPresent && !selectedOtherBranch && (
            <div className="mt-auto flex items-center gap-1.5 border-t border-ink-100 pt-2">
              {editButton}
              {copyButton}
              {endButton}
            </div>
          )}
        </div>
      );
    }

    // ─── عرض طولي: صف كامل العرض (الشكل الأصلي) ───
    return (
      <div key={person.id} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors', cardTone)}>
        {statusButton}

        <button type="button" disabled={saving || (selectedOtherBranch && isPresent)} onClick={handleClick} className="min-w-0 flex-1 text-right disabled:cursor-wait">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold text-ink-900">
            <span className="truncate">{person.name}</span>
            {person.isManager && <span className="badge badge-red shrink-0">مدير</span>}
            {selectedOtherBranch && isPresent && <span className="badge badge-blue shrink-0">فرع {branchDisplayName(attendanceBranch)}</span>}
          </p>
          <p className={cn('tnum mt-0.5 truncate text-[12px] font-semibold', subtitleTone)}>{subtitle}</p>
        </button>

        {editButton}
        {copyButton}
        {endButton}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-1 text-[11px] font-extrabold text-brand-600">
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

      {/* search + view layout toggle */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم السيلز…" aria-label="ابحث باسم السيلز" className="field pr-10" />
        </div>

        {/* اختيار طريقة عرض الأسماء: طولي / عرضي */}
        <div className="grid shrink-0 grid-cols-2 gap-1 self-stretch rounded-xl border border-ink-200 bg-white p-1 sm:self-auto sm:inline-flex" role="group" aria-label="طريقة عرض الأسماء">
          <button
            type="button"
            onClick={() => changeLayout('vertical')}
            aria-pressed={layout === 'vertical'}
            title="عرض طولي: الأسماء تحت بعض في صفوف كاملة العرض"
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-extrabold transition',
              layout === 'vertical' ? 'bg-brand-600 text-white shadow-[0_3px_8px_-2px_rgba(227,6,19,0.5)]' : 'text-ink-500 hover:text-brand-600',
            )}
          >
            <LayoutList className="size-4" strokeWidth={2.3} />
            طولي
          </button>
          <button
            type="button"
            onClick={() => changeLayout('grid')}
            aria-pressed={layout === 'grid'}
            title="عرض عرضي: الأسماء جنب بعض في كروت وشبكة أعمدة"
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-extrabold transition',
              layout === 'grid' ? 'bg-brand-600 text-white shadow-[0_3px_8px_-2px_rgba(227,6,19,0.5)]' : 'text-ink-500 hover:text-brand-600',
            )}
          >
            <LayoutGrid className="size-4" strokeWidth={2.3} />
            عرضي
          </button>
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
        const headSales = attendanceSales.filter((s) => s.headId === head.id);
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
                  <p className="text-[11px] font-semibold text-ink-400">
                    Head Manager · {headManagers.length} تيمات
                  </p>
                </div>
              </div>
              <span className="badge badge-gray tnum shrink-0">{present}/{headSales.length} حاضر</span>
            </div>

            <div className="space-y-3.5 p-3 sm:p-3.5">
              {headManagers.map((mgr, mi) => {
                const allMembers = attendanceSales.filter((s) => s.managerId === mgr.id);
                const members = allMembers.filter(matches);
                if (members.length === 0) return null;

                // One identity per team: index in the whole roster (stable while
                // searching) with a fallback to the position inside this head.
                const rosterIndex = managers.findIndex((m) => m.id === mgr.id);
                const teamNumber = (rosterIndex >= 0 ? rosterIndex : mi) + 1;
                const theme = teamThemeAt(teamNumber - 1);
                const teamPresent = allMembers.filter((s) => salesState[s.id]?.status !== 'absent').length;

                return (
                  <div
                    key={mgr.id}
                    // The card itself is the separator between teams: coloured
                    // band + coloured border + a gap no name can cross.
                    className={cn('overflow-hidden rounded-xl border-2 bg-white shadow-[0_1px_2px_rgba(20,23,31,0.04)]', theme.border)}
                  >
                    <div className={cn('flex items-center gap-2.5 px-3 py-2.5 text-white', theme.band)}>
                      <span
                        className="tnum grid size-8 shrink-0 place-items-center rounded-lg bg-white/20 text-[12.5px] font-black"
                        aria-hidden="true"
                      >
                        {String(teamNumber).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-baseline gap-1.5 text-[14.5px] font-black leading-tight">
                          <span className="truncate">تيم {mgr.name}</span>
                          {mgr.ar && mgr.ar !== mgr.name && (
                            <span className="truncate text-[10.5px] font-bold text-white/75">{mgr.ar}</span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] font-semibold text-white/80">
                          {head.name}
                          {mgr.phone ? ` · ${mgr.phone}` : ''}
                        </p>
                      </div>
                      <span className="tnum shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold">
                        {teamPresent}/{allMembers.length} حاضر
                      </span>
                    </div>

                    <div className="bg-ink-50/40 p-2.5">
                      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4' : 'space-y-2'}>
                        {members.map((person) => renderPersonCard(person))}
                      </div>
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

      {/* ─── Prepare modal ─── */}
      <Modal
        open={!!preparingPerson}
        onClose={() => setPreparingPerson(null)}
        title={preparingPerson ? `تحضير ${preparingPerson.name}` : 'تحضير'}
        subtitle={`اختر وقت الحضور — الافتراضي وقت التحضير الآن • فرع ${attendanceBranch}`}
      >
        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <label htmlFor="prepare-time" className="block text-[12px] font-extrabold text-ink-700">اضبط وقت الحضور</label>
            <input
              id="prepare-time"
              type="time"
              value={prepareTimeStr}
              onChange={(e) => setPrepareTimeStr(e.target.value || nowTimeStr())}
              className="field w-full text-center text-[18px] font-black tracking-widest"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setPrepareTimeStr(nowTimeStr())} className="btn btn-neutral py-2.5 text-[12px]"><Clock className="size-4" /> الآن</button>
            <button type="button" onClick={() => { const { h, m } = parseHM(prepareTimeStr); const d = new Date(); d.setHours(h); d.setMinutes(m - 5); setPrepareTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }} className="btn btn-neutral py-2.5 text-[12px]">-5 د</button>
            <button type="button" onClick={() => { const { h, m } = parseHM(prepareTimeStr); const d = new Date(); d.setHours(h); d.setMinutes(m + 5); setPrepareTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }} className="btn btn-neutral py-2.5 text-[12px]">+5 د</button>
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
          <div className="rounded-xl border border-ink-100 bg-ink-50/70 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-500"><Clock3 className="size-4" /> الوقت الحالي المسجل: {editingPerson ? formatTime(salesState[editingPerson.id]?.checkInTime ?? '') : ''}</p>
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
