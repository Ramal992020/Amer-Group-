import { useRef } from 'react';
import { ImagePlus, RotateCcw, UploadCloud } from 'lucide-react';

export interface LogoConfig {
  src: string | null;
  width: number;
}

export const DEFAULT_LOGO: LogoConfig = {
  src: null,
  width: 160,
};

interface Props {
  logo: LogoConfig;
  onChange: (next: LogoConfig) => void;
}

export function LogoPanel({ logo, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({ ...logo, src: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const reset = () => onChange({ ...logo, src: null });

  const pct = ((logo.width - 60) / (320 - 60)) * 100;

  return (
    <div className="rounded-3xl border border-cyan-400/15 bg-[#0b1524]/80 p-5 shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)] backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        {logo.src && (
          <button
            type="button"
            onClick={reset}
            title="إزالة اللوجو"
            className="grid size-8 place-items-center rounded-lg border border-red-400/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
          >
            <RotateCcw className="size-4" strokeWidth={2} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-black text-white">اللوجو الثابت</h3>
          <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10">
            <ImagePlus className="size-4 text-cyan-300" strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* Preview / upload area */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className="group relative flex min-h-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-cyan-400/30 bg-white/[0.02] p-3 transition hover:border-cyan-400/60 hover:bg-white/[0.04]"
      >
        {logo.src ? (
          <img
            src={logo.src}
            alt="اللوجو المختار"
            className="max-h-[160px] object-contain"
            style={{ width: `${logo.width}px` }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 transition group-hover:scale-105">
              <UploadCloud className="size-5" strokeWidth={2} />
            </div>
            <p className="text-sm font-bold text-zinc-200">اختر لوجو من جهازك</p>
            <p className="text-[11px] text-zinc-500">PNG · JPG · SVG</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* Size slider */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="tnum text-sm font-black text-cyan-300">{logo.width}px</span>
          <span className="text-sm font-bold text-zinc-400">عرض اللوجو</span>
        </div>
        <input
          type="range"
          min={60}
          max={320}
          value={logo.width}
          onChange={(e) => onChange({ ...logo, width: Number(e.target.value) })}
          className="style-slider"
          style={{ background: `linear-gradient(to left, #22d3ee ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
        />
      </div>
    </div>
  );
}
