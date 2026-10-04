import { useEffect, useState } from 'react';
import { UserCheck, Users, Crown, Clock, CircleAlert } from 'lucide-react';
import type { TeamTurn, VisitType } from '../lib/walkin';
import { cn } from '../utils/cn';

const VISIT_OPTIONS: { id: VisitType; label: string }[] = [
  { id: 'walkin', label: 'Walk in' },
  { id: 'site', label: 'Site' },
  { id: 'resta', label: 'Resta' },
];

/** A member of the team that is on turn — the sales is chosen from here, manually. */
export interface TeamMemberOption {
  id: string;
  name: string;
  status: 'absent' | 'available' | 'busy';
  walkCount: number;
  coverCount: number;
  checkInOrder: number | null;
  /** Yesterday's carried person, when their team's turn came back to them. */
  carried: boolean;
}

export interface UpcomingTeam {
  managerId: string;
  managerName: string;
  headName: string;
  available: number;
}

interface Props {
  team: TeamTurn | null;
  members: TeamMemberOption[];
  upcoming: UpcomingTeam[];
  clientLabel: string;
  setClientLabel: (v: string) => void;
  visitType: VisitType;
  setVisitType: (v: VisitType) => void;
  /** Confirms the MANUALLY chosen sales. */
  onConfirm: (salesId: string) => void;
  totalToday: number;
}

export function CurrentTurn({
  team,
  members,
  upcoming,
  clientLabel,
  setClientLabel,
  visitType,
  setVisitType,
  onConfirm,
  totalToday,
}: Props) {
  const [chosen, setChosen] = useState('');

  // Each client starts from a clean manual choice for the team on turn.
  useEffect(() => {
    setChosen('');
  }, [team?.managerId, totalToday]);

  if (!team) {
    return (
      <div className="px-6 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <CircleAlert className="size-7" strokeWidth={1.9} />
        </span>
        <h2 className="mt-4 font-display text-[17px] font-extrabold text-ink-900">لا يوجد تيم متاح حالياً</h2>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-ink-400">
          سجّل حضور السيلز من شاشة اليوم، وسيظهر دور التيم التالي تلقائياً حسب دورة الفرق.
        </p>
      </div>
    );
  }

  const available = members.filter((m) => m.status === 'available').length;

  return (
    <div className="p-5">
      {/* hero — the turn belongs to a team, never to a preselected sales */}
      <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-ink-50/70 p-5 text-center">
        <div aria-hidden className="dot-grid pointer-events-none absolute -left-4 -top-4 h-20 w-20 opacity-60" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">الدور على تيم</p>
        <p className="mt-1.5 font-display text-[32px] font-black leading-tight text-ink-900 sm:text-[38px]">
          {team.managerName}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="badge badge-red">
            <Crown className="size-3" />
            {team.headName}
          </span>
          <span className="badge badge-green">
            <Users className="size-3" />
            {available} متاح للاختيار
          </span>
          {team.isFallback && <span className="badge badge-amber">تخطي فرق غير متاحة</span>}
        </div>
        <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-ink-400">{team.reason}</p>
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

      {/* manual sales picker */}
      <div className="mt-5">
        <p className="field-label">اختر السيلز من تيم {team.managerName}</p>
        <p className="mb-2 text-[11px] font-medium text-ink-400">
          الاختيار يدوي بالكامل — الترتيب المقترح حسب عدد أدوار كل سيلز وأولوية الحضور.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {members.map((m) => {
            const selectable = m.status === 'available';
            return (
              <button
                key={m.id}
                type="button"
                disabled={!selectable}
                onClick={() => setChosen(m.id)}
                className={cn(
                  'rounded-xl border-2 bg-white px-3 py-2.5 text-right transition',
                  chosen === m.id
                    ? 'border-brand-600 bg-brand-50'
                    : selectable
                      ? 'border-ink-100 hover:border-brand-200'
                      : 'border-ink-100 opacity-55',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-extrabold text-ink-900">{m.name}</span>
                  {m.carried && <span className="badge badge-amber shrink-0">دور أمس</span>}
                </span>
                <span className="tnum mt-0.5 block text-[10px] font-semibold text-ink-400">
                  {m.status === 'busy'
                    ? 'مشغول الآن مع عميل'
                    : m.status === 'absent'
                      ? 'لم يحضر'
                      : `${m.walkCount} دور${m.checkInOrder ? ` • حضور #${m.checkInOrder}` : ''}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* actions */}
      <button
        onClick={() => chosen && onConfirm(chosen)}
        disabled={!chosen}
        className="btn btn-primary mt-4 w-full py-3.5 text-[15px]"
      >
        <UserCheck className="size-5" />
        {chosen ? 'تأكيد وبدء المقابلة' : 'اختر السيلز أولاً'}
      </button>

      {/* upcoming teams */}
      {upcoming.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold text-ink-500">
            <Clock className="size-3.5" />
            ترتيب الفرق بعده
          </p>
          <div className="grid grid-cols-2 gap-2">
            {upcoming.map((u, i) => (
              <div key={`${u.managerId}-${i}`} className="rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2.5">
                <p className="tnum text-[10px] font-black text-ink-300">#{totalToday + 2 + i}</p>
                <p className="truncate text-[13px] font-extrabold text-ink-900">تيم {u.managerName}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] font-semibold text-ink-400">
                  <span className="inline-block size-1.5 shrink-0 rounded-full bg-brand-500" />
                  {u.headName} · {u.available} متاح
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
