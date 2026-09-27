import { useState } from 'react';
import { Crown, Users, UserRound, Check, Copy, CheckCheck, PhoneCall, Search, MapPin } from 'lucide-react';
import type { HeadGroup, ManagerTeam, SalesPerson, SalesState } from '../lib/walkin';
import { formatTime } from '../lib/walkin';
import { Modal, EmptyState, useToast } from './ui';
import { cn } from '../utils/cn';

type Branch = 'SITE' | 'RESTA';

interface Props {
  salesState: Record<string, SalesState>;
  onToggle: (id: string) => void;
  onFree: (id: string) => void;
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
}

export function AttendanceBoard({ salesState, onToggle, onFree, heads, managers, sales }: Props) {
  const toast = useToast();
  const [copyTarget, setCopyTarget] = useState<SalesPerson | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }

    setCopyTarget(null);
    setCopiedId(person.id);
    toast('success', `تم نسخ بيان ${person.name}`);
    setTimeout(() => setCopiedId((cur) => (cur === person.id ? null : cur)), 1800);
  };

  const totalVisible = sales.filter(matches).length;

  return (
    <div className="space-y-4">
      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث باسم السيلز…"
          aria-label="ابحث باسم السيلز"
          className="field pr-10"
        />
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
          <section
            key={head.id}
            className="surface anim-fade-up overflow-hidden"
            style={{ animationDelay: `${hi * 0.06}s` }}
          >
            {/* head bar */}
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-[0_4px_10px_-3px_rgba(227,6,19,0.5)]">
                  <Crown className="size-4.5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-extrabold leading-tight text-ink-900">
                    {head.name}
                  </p>
                  <p className="text-[11px] font-semibold text-ink-400">Head Manager</p>
                </div>
              </div>
              <span className="badge badge-gray tnum shrink-0">
                {present}/{headSales.length} حاضر
              </span>
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
                        const present = st?.status !== 'absent';
                        const busy = st?.status === 'busy';
                        const justCopied = copiedId === person.id;

                        const subtitle = person.isManager
                          ? 'مدير — حضور فقط، بدون دور'
                          : busy
                            ? 'مشغول الآن مع عميل'
                            : present
                              ? `حضر ${st?.checkInTime ? formatTime(st.checkInTime) : ''}`
                              : 'لم يحضر';

                        return (
                          <div
                            key={person.id}
                            className={cn(
                              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                              busy
                                ? 'border-amber-200 bg-amber-50/70'
                                : present
                                  ? 'border-emerald-200 bg-emerald-50/50'
                                  : 'border-ink-100 bg-white hover:border-ink-200',
                            )}
                          >
                            {/* toggle */}
                            <button
                              type="button"
                              onClick={() => (busy ? onFree(person.id) : onToggle(person.id))}
                              aria-label={present ? `تسجيل انصراف ${person.name}` : `تسجيل حضور ${person.name}`}
                              className={cn(
                                'grid size-10 shrink-0 place-items-center rounded-xl transition active:scale-95',
                                busy
                                  ? 'bg-amber-500 text-white'
                                  : present
                                    ? 'bg-emerald-500 text-white'
                                    : 'border border-ink-200 bg-ink-50 text-ink-300 hover:border-brand-300 hover:text-brand-500',
                              )}
                            >
                              {busy ? (
                                <PhoneCall className="size-[18px]" strokeWidth={2.4} />
                              ) : present ? (
                                <Check className="size-5" strokeWidth={3} />
                              ) : (
                                <UserRound className="size-[18px]" strokeWidth={2} />
                              )}
                            </button>

                            {/* name */}
                            <button
                              type="button"
                              onClick={() => (busy ? onFree(person.id) : onToggle(person.id))}
                              className="min-w-0 flex-1 text-right"
                            >
                              <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold text-ink-900">
                                <span className="truncate">{person.name}</span>
                                {person.isManager && <span className="badge badge-red shrink-0">مدير</span>}
                              </p>
                              <p
                                className={cn(
                                  'tnum mt-0.5 truncate text-[12px] font-semibold',
                                  busy ? 'text-amber-700' : present ? 'text-emerald-700' : 'text-ink-400',
                                )}
                              >
                                {subtitle}
                              </p>
                            </button>

                            {/* copy */}
                            {present && (
                              <button
                                type="button"
                                onClick={() => setCopyTarget(person)}
                                title="نسخ بيان الحضور"
                                aria-label={`نسخ بيان ${person.name}`}
                                className={cn(
                                  'grid size-9 shrink-0 place-items-center rounded-xl border transition active:scale-95',
                                  justCopied
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-ink-200 bg-white text-ink-400 hover:border-brand-300 hover:text-brand-600',
                                )}
                              >
                                {justCopied ? (
                                  <CheckCheck className="size-4.5" strokeWidth={2.6} />
                                ) : (
                                  <Copy className="size-4" strokeWidth={2.2} />
                                )}
                              </button>
                            )}

                            {busy && (
                              <button
                                onClick={() => onFree(person.id)}
                                className="btn btn-neutral shrink-0 px-2.5 py-2 text-[11px]"
                              >
                                إنهاء
                              </button>
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

      {/* branch chooser */}
      <Modal
        open={!!copyTarget}
        onClose={() => setCopyTarget(null)}
        title={copyTarget?.name}
        subtitle="اختر الفرع لنسخ بيان الحضور"
      >
        <div className="grid grid-cols-2 gap-3 p-5">
          {(['SITE', 'RESTA'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => copyTarget && copyStatement(copyTarget, b)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-ink-100 bg-white py-5 transition hover:border-brand-600 hover:bg-brand-50 active:scale-[0.98]"
            >
              <MapPin className="size-6 text-brand-600" strokeWidth={2.2} />
              <span className="font-display text-[16px] font-black text-ink-900">{b}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
