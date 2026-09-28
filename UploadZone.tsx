import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileSpreadsheet, FileUp, Sparkles, Table2, LoaderCircle, TriangleAlert, X, CheckCircle2, Trash2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface Props {
  onFiles: (files: File[]) => void;
  onDemo: () => void;
  processing: boolean;
  stageLabel: string;
  error: string | null;
}

export function UploadZone({ onFiles, onDemo, processing, stageLabel, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);

  const pick = () => inputRef.current?.click();

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (incoming.length === 0) return;
    setQueue((prev) => {
      const seen = new Set(prev.map((p) => `${p.name}__${p.size}__${p.lastModified}`));
      const unique = incoming.filter((f) => !seen.has(`${f.name}__${f.size}__${f.lastModified}`));
      return [...prev, ...unique];
    });
  };

  const removeFile = (index: number) => setQueue((prev) => prev.filter((_, i) => i !== index));
  const clearQueue = () => setQueue([]);

  const startProcessing = () => {
    if (queue.length === 0 || processing) return;
    onFiles(queue);
    setQueue([]);
  };

  const totalSize = queue.reduce((acc, f) => acc + f.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };


  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="group relative"
      >
        {/* ambient glow */}
        <div
          className={cn(
            'absolute -inset-1 rounded-[28px] bg-gradient-to-l from-emerald-500/25 via-teal-400/10 to-emerald-500/25 blur-2xl transition-opacity duration-500',
            dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
          )}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={processing ? undefined : pick}
          onKeyDown={(e) => e.key === 'Enter' && !processing && pick()}
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounter.current += 1;
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragCounter.current -= 1;
            if (dragCounter.current <= 0) {
              dragCounter.current = 0;
              setDragging(false);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            dragCounter.current = 0;
            setDragging(false);
            if (!processing) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'relative cursor-pointer overflow-hidden rounded-[28px] border-2 border-dashed bg-[#0A0D13]/80 px-6 py-12 text-center backdrop-blur-sm transition-all duration-300 sm:px-10 sm:py-14',
            dragging
              ? 'scale-[1.01] border-emerald-300/70 bg-emerald-400/[0.06]'
              : 'border-white/15 hover:border-emerald-300/40 hover:bg-white/[0.03]',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* corner ticks */}
          <div className="pointer-events-none absolute inset-4 rounded-2xl border border-white/[0.04]" />

          <div className="relative flex flex-col items-center">
            <motion.div
              animate={dragging ? { scale: 1.12, rotate: -4 } : { scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="grid size-16 place-items-center rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/20 to-teal-500/5 shadow-[0_0_40px_-8px_rgba(52,211,153,0.35)]"
            >
              <FileSpreadsheet className="size-7 text-emerald-300" strokeWidth={1.75} />
            </motion.div>

            <h3 className="font-display mt-5 text-xl font-extrabold text-white sm:text-2xl">
              {dragging ? 'أفلتهم الآن…' : 'أفلت ملفات الإكسيل هنا'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              أضف الملفات واحدًا تلو الآخر أو جميعها دفعة واحدة. لن يتم بدء الـ Recap إلا بعد
              <span className="mx-1 font-semibold text-emerald-300">الضغط على زر التأكيد</span>
              بعد التأكد من إضافة كل الملفات.
            </p>

            {/* expected columns */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                <Table2 className="size-3.5" />
                بنية كل شيت:
              </span>
              {['اسم الشيت = COUNTRY', 'CTNS', 'UNITS'].map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-zinc-300"
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-bold text-emerald-950 shadow-[0_8px_30px_-6px_rgba(52,211,153,0.55)] transition-transform duration-300 group-hover:scale-[1.03]">
                <FileUp className="size-4" />
                اختيار ملفات
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!processing) onDemo();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-300/40 hover:text-emerald-200"
              >
                <Sparkles className="size-4 text-emerald-300" />
                جرّب ببيانات تجريبية
              </button>
            </div>
          </div>

          {/* processing overlay */}
          <AnimatePresence>
            {processing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 grid place-items-center bg-[#0A0D13]/90 backdrop-blur-md"
              >
                <div className="flex flex-col items-center gap-4">
                  <LoaderCircle className="size-9 animate-spin text-emerald-300" strokeWidth={2.25} />
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={stageLabel}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm font-semibold text-zinc-300"
                    >
                      {stageLabel}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Selected files queue */}
      <AnimatePresence>
        {queue.length > 0 && !processing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-5 overflow-hidden rounded-2xl border border-emerald-300/20 bg-white/[0.03] backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-emerald-400/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-300" />
                <p className="text-sm font-bold text-emerald-100">
                  تم إضافة <span className="tnum">{queue.length}</span> ملف — الإجمالي{' '}
                  <span className="tnum">{formatSize(totalSize)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearQueue}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-red-400/30 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                  مسح الكل
                </button>
                <button
                  type="button"
                  onClick={pick}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                >
                  <FileUp className="size-3.5" />
                  إضافة ملف آخر
                </button>
              </div>
            </div>

            <ul className="max-h-60 divide-y divide-white/[0.06] overflow-y-auto">
              {queue.map((f, i) => (
                <motion.li
                  key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileSpreadsheet className="size-4 shrink-0 text-emerald-300" />
                    <span className="truncate text-zinc-200">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum shrink-0 text-[11px] text-zinc-500">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="grid size-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-red-400/40 hover:text-red-300"
                      aria-label={`حذف ${f.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </ul>

            <div className="border-t border-white/[0.06] bg-black/20 p-3">
              <button
                type="button"
                onClick={startProcessing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-emerald-950 shadow-[0_8px_24px_-6px_rgba(52,211,153,0.55)] transition hover:bg-emerald-300"
              >
                <CheckCircle2 className="size-4.5" />
                تم إدخال كل الملفات — ابدأ عمل الـ Recap
              </button>
              <p className="mt-2 text-center text-[11px] text-zinc-500">
                لن يتم تحليل الملفات ودمجها إلا بعد الضغط على هذا الزر
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200"
          >
            <TriangleAlert className="size-4 shrink-0 text-red-300" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
