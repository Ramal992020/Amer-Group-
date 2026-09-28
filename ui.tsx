import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cn } from '../utils/cn';

/* ═══════════════ Animated counter ═══════════════ */

export const fmtNum = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));

export function Counter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = from.current;
    const end = value;
    from.current = value;
    if (start === end) {
      node.textContent = fmtNum(end);
      return;
    }
    const duration = 700;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmtNum(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span ref={ref} className={cn('tnum', className)}>
      0
    </span>
  );
}

/* ═══════════════ Stat card ═══════════════ */

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'red',
  progress,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: ReactNode;
  accent?: 'red' | 'green' | 'amber' | 'gray';
  progress?: number;
}) {
  const tones = {
    red: { chip: 'bg-brand-50 text-brand-600', bar: 'bg-brand-600' },
    green: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
    amber: { chip: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
    gray: { chip: 'bg-ink-100 text-ink-500', bar: 'bg-ink-400' },
  }[accent];

  return (
    <div className="surface surface-hover group relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold text-ink-500">{label}</p>
          <p className="mt-1.5 font-display text-[30px] font-black leading-none text-ink-900">
            <Counter value={value} />
          </p>
          {hint && <p className="mt-1.5 truncate text-[11px] font-medium text-ink-400">{hint}</p>}
        </div>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105', tones.chip)}>
          {icon}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className={cn('h-full rounded-full transition-all duration-700 ease-out', tones.bar)}
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════ Section heading ═══════════════ */

export function SectionTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
        )}
        <div>
          <h2 className="font-display text-[17px] font-extrabold leading-tight text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] font-medium text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ═══════════════ Empty state ═══════════════ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</span>
      <p className="mt-4 font-display text-[16px] font-extrabold text-ink-900">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ═══════════════ Skeletons ═══════════════ */

export function SkeletonCard() {
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-7 w-16" />
          <div className="skeleton h-2.5 w-24" />
        </div>
        <div className="skeleton size-10 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="surface flex items-center gap-3 p-3.5">
      <div className="skeleton size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 w-28" />
        <div className="skeleton h-2.5 w-20" />
      </div>
      <div className="skeleton size-9 rounded-xl" />
    </div>
  );
}

/* ═══════════════ Modal shell ═══════════════ */

export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'anim-sheet-up max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl',
          maxWidth,
        )}
      >
        <div className="brand-bar h-1 w-full rounded-t-3xl sm:rounded-t-2xl" />
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div className="min-w-0">
              {title && <h3 className="font-display text-[17px] font-extrabold text-ink-900">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-[12px] font-medium text-ink-400">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="size-4.5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ═══════════════ Toasts ═══════════════ */

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<(kind: ToastKind, message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, kind, message }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  const styles: Record<ToastKind, { cls: string; icon: ReactNode }> = {
    success: { cls: 'border-emerald-200 bg-white text-emerald-700', icon: <CheckCircle2 className="size-4.5" /> },
    error: { cls: 'border-brand-200 bg-white text-brand-700', icon: <XCircle className="size-4.5" /> },
    warning: { cls: 'border-amber-200 bg-white text-amber-700', icon: <AlertTriangle className="size-4.5" /> },
    info: { cls: 'border-ink-200 bg-white text-ink-700', icon: <Info className="size-4.5" /> },
  };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'anim-slide-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg',
              styles[t.kind].cls,
            )}
          >
            {styles[t.kind].icon}
            <span className="text-[13px] font-bold">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
