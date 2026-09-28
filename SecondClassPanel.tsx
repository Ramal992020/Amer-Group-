import { Layers } from 'lucide-react';

interface Props {
  cartons: string;
  pieces: string;
  onCartonsChange: (v: string) => void;
  onPiecesChange: (v: string) => void;
}

export function SecondClassPanel({ cartons, pieces, onCartonsChange, onPiecesChange }: Props) {
  const hasValue = cartons.trim() || pieces.trim();

  return (
    <div className="rounded-3xl border border-cyan-400/15 bg-[#0b1524]/80 p-5 shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)] backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-end gap-2">
        <h3 className="font-display text-lg font-black text-white">2ND CLASS</h3>
        <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10">
          <Layers className="size-4 text-cyan-300" strokeWidth={2} />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">عدد الكراتين (CTN)</label>
          <input
            type="text"
            inputMode="numeric"
            value={cartons}
            onChange={(e) => onCartonsChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="اكتب عدد الكراتين..."
            className="w-full rounded-2xl border border-cyan-400/20 bg-[#121e34] px-4 py-3 text-center text-lg font-black text-cyan-100 outline-none transition focus:border-cyan-400/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">عدد القطع (PCS)</label>
          <input
            type="text"
            inputMode="numeric"
            value={pieces}
            onChange={(e) => onPiecesChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="اكتب عدد القطع..."
            className="w-full rounded-2xl border border-cyan-400/20 bg-[#121e34] px-4 py-3 text-center text-lg font-black text-cyan-100 outline-none transition focus:border-cyan-400/60"
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-500">
        {hasValue ? 'سيظهر سطر 2ND CLASS قبل TOTAL' : 'اتركه فارغاً لإخفاء السطر من الجدول'}
      </p>
    </div>
  );
}
