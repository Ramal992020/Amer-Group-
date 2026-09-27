import { motion } from 'framer-motion';
import { Package, Boxes, MapPin, Merge } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

interface Props {
  pieces: number;
  cartons: number;
  countries: number;
  merged: number;
}

interface Stat {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  accent: string;
}

export function StatsBar({ pieces, cartons, countries, merged }: Props) {
  const stats: Stat[] = [
    { icon: Package, label: 'إجمالي القطع', value: pieces, hint: 'مجمّعة من كل الشيتات', accent: 'text-emerald-300 border-emerald-300/25 bg-emerald-400/10' },
    { icon: Boxes, label: 'إجمالي الكراتين', value: cartons, hint: 'بعد الدمج الكامل', accent: 'text-teal-300 border-teal-300/25 bg-teal-400/10' },
    { icon: MapPin, label: 'عدد الدول', value: countries, hint: 'أسماء فريدة بعد التوحيد', accent: 'text-sky-300 border-sky-300/25 bg-sky-400/10' },
    { icon: Merge, label: 'دول مُدمجة', value: merged, hint: 'تكرّرت في أكثر من شيت', accent: 'text-amber-300 border-amber-300/25 bg-amber-400/10' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className={`grid size-11 shrink-0 place-items-center rounded-xl border ${s.accent}`}>
              <s.icon className="size-5" strokeWidth={1.9} />
            </div>
            <div className="min-w-0 text-left">
              <AnimatedNumber value={s.value} className="tnum font-display block text-2xl font-black leading-none text-white sm:text-[28px]" />
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-zinc-200">{s.label}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{s.hint}</p>
        </motion.div>
      ))}
    </div>
  );
}
