import { Palette, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from 'lucide-react';

export type VAlign = 'top' | 'middle' | 'bottom';

export interface ReportStyle {
  fontFamily: string;
  headerFont: number;
  tableFont: number;
  rowHeight: number;
  valign: VAlign;
}

export const DEFAULT_STYLE: ReportStyle = {
  fontFamily: 'Tahoma',
  headerFont: 19,
  tableFont: 30,
  rowHeight: 58,
  valign: 'middle',
};

const FONT_OPTIONS = [
  'Tahoma',
  'Arial',
  'Cairo',
  'Times New Roman',
  'Calibri',
  'Verdana',
  'Georgia',
  'Courier New',
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-emerald-300">{label}</span>
        <span className="tnum text-sm font-black text-emerald-300">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="style-slider"
        style={{ background: `linear-gradient(to left, #22d3ee ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
    </div>
  );
}

interface Props {
  style: ReportStyle;
  onChange: (next: ReportStyle) => void;
}

export function StylePanel({ style, onChange }: Props) {
  const set = <K extends keyof ReportStyle>(key: K, value: ReportStyle[K]) =>
    onChange({ ...style, [key]: value });

  const alignOptions: { key: VAlign; icon: typeof AlignStartVertical; label: string }[] = [
    { key: 'bottom', icon: AlignEndVertical, label: 'أسفل' },
    { key: 'middle', icon: AlignCenterVertical, label: 'وسط' },
    { key: 'top', icon: AlignStartVertical, label: 'أعلى' },
  ];

  return (
    <div className="rounded-3xl border border-cyan-400/15 bg-[#0b1524]/80 p-5 shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)] backdrop-blur-sm">
      <div className="mb-5 flex items-center justify-end gap-2">
        <h3 className="font-display text-lg font-black text-white">تنسيق الخطوط والنمط</h3>
        <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10">
          <Palette className="size-4 text-cyan-300" strokeWidth={2} />
        </div>
      </div>

      {/* Font family */}
      <div className="relative mb-6">
        <select
          value={style.fontFamily}
          onChange={(e) => set('fontFamily', e.target.value)}
          className="w-full appearance-none rounded-2xl border border-cyan-400/25 bg-[#0e1b2e] px-4 py-3 text-right text-base font-bold text-white outline-none transition focus:border-cyan-400/60"
          style={{ fontFamily: style.fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <div className="space-y-6">
        <Slider label="خط البيانات العلوية" value={style.headerFont} min={10} max={30} onChange={(v) => set('headerFont', v)} />
        <Slider label="حجم خط الجدول" value={style.tableFont} min={12} max={48} onChange={(v) => set('tableFont', v)} />
        <Slider label="ارتفاع صف الجدول" value={style.rowHeight} min={24} max={70} onChange={(v) => set('rowHeight', v)} />
      </div>

      {/* Vertical alignment */}
      <div className="mt-7">
        <p className="mb-3 text-center text-sm font-semibold text-zinc-500">المحاذاة الرأسية للنصوص</p>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-1.5">
          {alignOptions.map((opt) => {
            const active = style.valign === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => set('valign', opt.key)}
                title={opt.label}
                className={`flex flex-1 items-center justify-center rounded-xl py-3 transition ${
                  active
                    ? 'bg-cyan-400 text-[#07131f] shadow-[0_6px_18px_-6px_rgba(34,211,238,0.7)]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                <opt.icon className="size-5" strokeWidth={2.2} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
