import { motion } from 'framer-motion';
import { TrendingUp, Layers, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import type { CountryRecap, SheetSummary } from '../lib/excel';
import { fmt } from './AnimatedNumber';

const cardCls = 'rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm';

function PanelHeader({ icon: Icon, title, sub }: { icon: typeof Layers; title: string; sub: string }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.05]">
        <Icon className="size-4.5 text-emerald-300" strokeWidth={1.9} />
      </div>
      <div>
        <h3 className="font-display text-base font-extrabold text-white">{title}</h3>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}

export function TopCountries({ countries }: { countries: CountryRecap[] }) {
  const top = [...countries].sort((a, b) => b.pieces - a.pieces).slice(0, 6);
  const max = top[0]?.pieces ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cardCls}
    >
      <PanelHeader icon={TrendingUp} title="الأعلى في عدد القطع" sub="أكبر الوجهات بعد الدمج" />
      <div className="space-y-3.5">
        {top.map((c, i) => (
          <div key={c.key} className="flex items-center gap-3">
            <span className={`tnum font-display w-5 shrink-0 text-center text-sm font-black ${i === 0 ? 'text-emerald-300' : 'text-zinc-600'}`}>
              {fmt(i + 1)}
            </span>
            <span className="w-20 shrink-0 truncate text-xs font-bold text-zinc-300">{c.country}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max((c.pieces / max) * 100, 4)}%` }}
                transition={{ duration: 1, delay: 0.35 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-l from-emerald-300 to-teal-500"
                style={{ opacity: 1 - i * 0.13 }}
              />
            </div>
            <span className="tnum w-14 shrink-0 text-left text-xs font-bold text-emerald-300">{fmt(c.pieces)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function SheetsBreakdown({ sheets }: { sheets: SheetSummary[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cardCls}
    >
      <PanelHeader icon={Layers} title="تفاصيل الشيتات" sub="مساهمة كل شيت قبل الدمج" />
      <div className="space-y-2.5">
        {sheets.map((s, i) =>
          s.skipped ? (
            <div key={s.name} className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-3.5 py-3">
              <TriangleAlert className="size-4 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-amber-200">{s.name}</p>
                <p className="text-[10px] text-amber-200/60">{s.reason}</p>
              </div>
            </div>
          ) : (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.4 + i * 0.07 }}
              className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-emerald-300/20"
            >
              <FileSpreadsheet className="size-4 shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-zinc-200">{s.name}</p>
                <p className="text-[10px] text-zinc-500">اسم الشيت هو البلد · إجمالي مستخرج</p>
              </div>
              <div className="shrink-0 text-left">
                <p className="tnum text-xs font-bold text-emerald-300">{fmt(s.pieces)}</p>
                <p className="tnum text-[10px] text-zinc-500">{fmt(s.cartons)} كرتون</p>
              </div>
            </motion.div>
          ),
        )}
      </div>
    </motion.div>
  );
}
