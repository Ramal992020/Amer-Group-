import { useMemo, useState } from 'react';
import { History, Undo2, Trophy, Shuffle, Search, Inbox, Clock } from 'lucide-react';
import type { Assignment } from '../lib/walkin';
import { formatTime } from '../lib/walkin';
import { SectionTitle, EmptyState } from './ui';
import { cn } from '../utils/cn';

interface Props {
  history: Assignment[];
  onUndoLast: () => void;
}

export function HistoryPanel({ history, onUndoLast }: Props) {
  const [query, setQuery] = useState('');

  const perSales = useMemo(
    () =>
      [
        ...history
          .reduce((map, a) => {
            const cur = map.get(a.salesId) ?? { name: a.salesName, turns: 0, covers: 0 };
            if (a.substituted) cur.covers += 1;
            else cur.turns += 1;
            map.set(a.salesId, cur);
            return map;
          }, new Map<string, { name: string; turns: number; covers: number }>())
          .entries(),
      ]
        .map(([id, v]) => ({ id, ...v, total: v.turns + v.covers }))
        .sort((a, b) => b.turns - a.turns || b.covers - a.covers),
    [history],
  );

  const max = perSales[0]?.turns ?? 1;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...history].reverse();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.salesName.toLowerCase().includes(q) ||
        a.managerName.toLowerCase().includes(q) ||
        a.headName.toLowerCase().includes(q) ||
        (a.clientLabel || '').toLowerCase().includes(q),
    );
  }, [history, query]);

  return (
    <div className="space-y-4">
      {/* log */}
      <section className="surface anim-fade-up overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <History className="size-4.5" strokeWidth={2.1} />
            </span>
            <div>
              <h2 className="font-display text-[15px] font-extrabold leading-tight text-ink-900">سجل اليوم</h2>
              <p className="tnum text-[11px] font-semibold text-ink-400">{history.length} عميل تم توزيعه</p>
            </div>
          </div>
          {history.length > 0 && (
            <button onClick={onUndoLast} className="btn btn-neutral px-3 py-2 text-[12px]">
              <Undo2 className="size-3.5" />
              تراجع
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="لم يتم توزيع أي عميل بعد"
            description="أول عملية إسناد ستظهر هنا مباشرة."
          />
        ) : (
          <>
            <div className="border-b border-ink-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث في السجل…"
                  aria-label="ابحث في السجل"
                  className="field pr-10 py-2.5 text-[13px]"
                />
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState icon={<Search className="size-6" />} title="لا توجد نتائج" description={`لا يوجد سجل يطابق "${query}"`} />
            ) : (
              <>
                {/* desktop table */}
                <div className="hidden max-h-[480px] overflow-y-auto sm:block">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 z-10 bg-ink-50">
                      <tr className="text-[11px] font-extrabold text-ink-500">
                        <th className="px-4 py-2.5 text-right">#</th>
                        <th className="px-4 py-2.5 text-right">الوقت</th>
                        <th className="px-4 py-2.5 text-right">السيلز</th>
                        <th className="px-4 py-2.5 text-right">التيم / الـ Head</th>
                        <th className="px-4 py-2.5 text-right">العميل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((a) => (
                        <tr key={a.id} className="border-t border-ink-100 transition-colors hover:bg-ink-50/70">
                          <td className="tnum px-4 py-3 font-bold text-ink-300">{a.n}</td>
                          <td className="tnum px-4 py-3 font-semibold text-ink-500" dir="ltr">
                            {formatTime(a.time)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-extrabold text-ink-900">{a.salesName}</span>
                            <span className="mr-1.5 inline-flex flex-wrap gap-1">
                              {a.visitType && a.visitType !== 'walkin' && (
                                <span className="badge badge-blue">{a.visitType === 'site' ? 'Site' : 'Resta'}</span>
                              )}
                              {a.substituted && (
                                <span className="badge badge-amber">
                                  <Shuffle className="size-2.5" />
                                  بديل{a.originalSalesName ? ` عن ${a.originalSalesName}` : ''}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[12px] font-semibold text-ink-500">
                            {a.managerName} · <span className="text-brand-600">{a.headName}</span>
                          </td>
                          <td className="max-w-[150px] truncate px-4 py-3 text-[12px] font-medium text-ink-400">
                            {a.clientLabel || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* mobile cards */}
                <div className="max-h-[480px] space-y-2 overflow-y-auto p-3 sm:hidden">
                  {shown.map((a) => (
                    <div key={a.id} className="rounded-xl border border-ink-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-extrabold text-ink-900">{a.salesName}</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-400">
                            {a.managerName} · <span className="text-brand-600">{a.headName}</span>
                          </p>
                        </div>
                        <span className="tnum flex shrink-0 items-center gap-1 text-[11px] font-bold text-ink-400" dir="ltr">
                          <Clock className="size-3" />
                          {formatTime(a.time)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="badge badge-gray tnum">#{a.n}</span>
                        {a.visitType && a.visitType !== 'walkin' && (
                          <span className="badge badge-blue">{a.visitType === 'site' ? 'Site' : 'Resta'}</span>
                        )}
                        {a.substituted && (
                          <span className="badge badge-amber">
                            <Shuffle className="size-2.5" />
                            بديل{a.originalSalesName ? ` عن ${a.originalSalesName}` : ''}
                          </span>
                        )}
                        {a.clientLabel && <span className="badge badge-gray truncate">{a.clientLabel}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* leaderboard */}
      <section className="surface anim-fade-up p-4" style={{ animationDelay: '0.08s' }}>
        <SectionTitle
          title="توزيع اليوم"
          subtitle="عدد العملاء لكل سيلز"
          icon={<Trophy className="size-4.5" strokeWidth={2.1} />}
        />
        {perSales.length === 0 ? (
          <p className="py-6 text-center text-[12px] font-medium text-ink-400">لا توجد بيانات بعد</p>
        ) : (
          <div className="space-y-2.5">
            {perSales.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'tnum grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-black',
                    i === 0 ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {i + 1}
                </span>
                <span className="w-24 shrink-0 truncate text-[12px] font-bold text-ink-700">{p.name}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700', i === 0 ? 'bg-brand-600' : 'bg-brand-300')}
                    style={{ width: `${Math.max((p.turns / max) * 100, 6)}%` }}
                  />
                </div>
                <span className="tnum shrink-0 text-left text-[12px] font-black text-ink-900">
                  {p.turns}
                  {p.covers > 0 && <span className="font-bold text-amber-600"> +{p.covers} تغطية</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
