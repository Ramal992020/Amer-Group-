import { useState } from 'react';
import {
  UserCheck,
  Shuffle,
  SkipForward,
  Users,
  CircleAlert,
  Undo2,
  Crown,
  Clock,
} from 'lucide-react';
import type { ComputedTurn, VisitType } from '../lib/walkin';
import { cn } from '../utils/cn';

const VISIT_OPTIONS: { id: VisitType; label: string }[] = [
  { id: 'walkin', label: 'Walk in' },
  { id: 'site', label: 'Site' },
  { id: 'resta', label: 'Resta' },
];

export interface SubstituteOption {
  id: string;
  name: string;
  walkCount: number;
  coverCount: number;
  checkInOrder: number | null;
  isManager?: boolean;
}

interface Props {
  next: ComputedTurn | null;
  upcoming: ComputedTurn[];
  clientLabel: string;
  setClientLabel: (v: string) => void;
  visitType: VisitType;
  setVisitType: (v: VisitType) => void;
  onConfirm: () => void;
  onSubstitute: (salesId: string) => void;
  onSkip: () => void;
  onResetSkips: () => void;
  skippedCount: number;
  substituteOptions: SubstituteOption[];
  totalToday: number;
  nextIsPresent?: boolean;
}

export function CurrentTurn({
  next,
  upcoming,
  clientLabel,
  setClientLabel,
  visitType,
  setVisitType,
  onConfirm,
  onSubstitute,
  onSkip,
  onResetSkips,
  skippedCount,
  substituteOptions,
  totalToday,
  nextIsPresent = true,
}: Props) {
  const [showSub, setShowSub] = useState(false);
  const [chosen, setChosen] = useState('');

  if (!next) {
    return (
      <div className="px-6 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <CircleAlert className="size-7" strokeWidth={1.9} />
        </span>
        <h2 className="mt-4 font-display text-[17px] font-extrabold text-ink-900">لا يوجد سيلز متاح حالياً</h2>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-ink-400">
          سجّل حضور السيلز من شاشة اليوم، وسيظهر الدور التالي تلقائياً بنظام Head × Head.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-ink-50/70 p-5 text-center">
        <div aria-hidden className="dot-grid pointer-events-none absolute -left-4 -top-4 h-20 w-20 opacity-60" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">المقترح للجلوس مع العميل</p>
        <p className="mt-1.5 font-display text-[34px] font-black leading-tight text-ink-900 sm:text-[40px]">
          {next.salesName}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="badge badge-gray">
            <Users className="size-3" />
            تيم {next.managerName}
          </span>
          <span className="badge badge-red">
            <Crown className="size-3" />
            {next.headName}
          </span>
          <span className={cn('badge', nextIsPresent ? 'badge-green' : 'badge-amber')}>
            {nextIsPresent ? 'حاضر' : 'لم يحضر بعد'}
          </span>
          {next.isFallback && <span className="badge badge-amber">تحويل تلقائي</span>}
        </div>
        <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-ink-400">{next.reason}</p>
        <span className="badge badge-blue tnum absolute left-3 top-3">عميل #{totalToday + 1}</span>
      </div>

      {/* visit type */}
      <div className="mt-5">
        <p className="field-label">نوع الزيارة</p>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-ink-100 p-1.5">
          {VISIT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVisitType(opt.id)}
              className={cn(
                'rounded-lg py-2.5 text-[13px] font-extrabold transition',
                visitType === opt.id
                  ? 'bg-brand-600 text-white shadow-[0_4px_10px_-3px_rgba(227,6,19,0.45)]'
                    : 'text-ink-500 hover:bg-white hover:text-ink-900',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* client */}
      <div className="mt-4">
        <label htmlFor="client" className="field-label">
          اسم / رقم العميل <span className="font-medium text-ink-300">(اختياري)</span>
        </label>
        <input
          id="client"
          value={clientLabel}
          onChange={(e) => setClientLabel(e.target.value)}
          placeholder="مثال: عميل استفسار التجمع…"
          className="field"
        />
      </div>

      {/* actions */}
      <div className="mt-5 space-y-2">
        <button onClick={onConfirm} disabled={!nextIsPresent} className="btn btn-primary w-full py-3.5 text-[15px]">
          <UserCheck className="size-5" />
          {nextIsPresent ? 'تأكيد وبدء المقابلة' : 'لم يحضر — اختر بديلاً أو تخطَّ'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowSub((v) => !v)}
            className={cn('btn', showSub ? 'btn-secondary' : 'btn-neutral')}
          >
            <Shuffle className="size-4" />
            بديل من التيم
          </button>
          <button onClick={onSkip} className="btn btn-neutral">
            <SkipForward className="size-4" />
            تخطي الاسم
          </button>
        </div>
      </div>

      {skippedCount > 0 && (
        <button
          onClick={onResetSkips}
          className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] font-bold text-ink-400 transition hover:text-brand-600"
        >
          <Undo2 className="size-3.5" />
          إظهار الأسماء المتخطاة ({skippedCount})
        </button>
      )}

      {/* substitute */}
      {showSub && (
        <div className="anim-fade-up mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-brand-700">
            <Users className="size-4" />
            اختر بديلاً من تيم {next.managerName}
          </p>
          <p className="mt-1 text-[11px] font-medium text-ink-500">
            جلوس البديل مع هذا العميل لا يستهلك دوره الأصلي في الترتيب.
          </p>
          {substituteOptions.length === 0 ? (
            <p className="mt-2 text-[12px] font-medium text-ink-400">لا يوجد بديل متاح آخر في نفس التيم حالياً.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {substituteOptions.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setChosen(o.id)}
                  className={cn(
                    'rounded-xl border-2 bg-white px-3 py-2.5 text-right transition',
                    chosen === o.id ? 'border-brand-600 bg-brand-50' : 'border-ink-100 hover:border-brand-200',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-extrabold text-ink-900">{o.name}</span>
                    {o.isManager && <span className="badge badge-red shrink-0">مدير</span>}
                  </span>
                    <span className="tnum mt-0.5 block text-[10px] font-semibold text-ink-400">
                      {o.isManager
                        ? 'يجلس بدلاً من صاحب الدور'
                        : `${o.walkCount} دور${o.coverCount > 0 ? ` + ${o.coverCount} تغطية` : ''}${o.checkInOrder ? ` • حضور #${o.checkInOrder}` : ''}`}
                    </span>
                </button>
              ))}
            </div>
          )}
          <button
            disabled={!chosen}
            onClick={() => {
              if (chosen) {
                onSubstitute(chosen);
                setChosen('');
                setShowSub(false);
              }
            }}
            className="btn btn-primary mt-3 w-full"
          >
            تأكيد البديل وبدء المقابلة
          </button>
        </div>
      )}

      {/* upcoming */}
      {upcoming.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold text-ink-500">
            <Clock className="size-3.5" />
            الترتيب المتوقع بعده
          </p>
          <div className="grid grid-cols-2 gap-2">
            {upcoming.map((u, i) => (
              <div key={`${u.salesId}-${i}`} className="rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2.5">
                <p className="tnum text-[10px] font-black text-ink-300">#{totalToday + 2 + i}</p>
                <p className="truncate text-[13px] font-extrabold text-ink-900">{u.salesName}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] font-semibold text-ink-400">
                  <span className="inline-block size-1.5 shrink-0 rounded-full bg-brand-500" />
                  {u.managerName}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
