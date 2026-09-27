import { ClipboardList } from 'lucide-react';

interface Props {
  reqValue: string;
  onChange: (v: string) => void;
}

export function ExtraSettingsPanel({ reqValue, onChange }: Props) {
  return (
    <div className="rounded-3xl border border-cyan-400/15 bg-[#0b1524]/80 p-5 shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)] backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-end gap-2">
        <h3 className="font-display text-lg font-black text-white">إعدادات إضافية</h3>
        <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10">
          <ClipboardList className="size-4 text-cyan-300" strokeWidth={2} />
        </div>
      </div>

      <div className="relative">
        <input
          dir="ltr"
          type="text"
          inputMode="numeric"
          value={reqValue}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="الكمية المطلوبة (REQ)..."
          className="w-full rounded-2xl border border-cyan-400/20 bg-[#121e34] px-4 py-3.5 text-left text-sm font-bold text-cyan-100 placeholder:text-cyan-100/50 placeholder:text-right outline-none transition focus:border-cyan-400/50 focus:bg-[#16233f]"
        />
        {reqValue.trim() && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-300/60">
            {reqValue.replace(/[^0-9]/g, '')} PCS
          </span>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
        عند كتابة الكمية سيظهر الصف تلقائياً في التقرير بصيغة مثل: 20,000 PCS
      </p>
    </div>
  );
}
