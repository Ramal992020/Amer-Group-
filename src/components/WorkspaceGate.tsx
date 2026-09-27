import { useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, ChevronLeft, LogOut, Store } from 'lucide-react';
import type { GoogleProfile, Workspace } from '../lib/auth';
import { WORKSPACES } from '../lib/auth';

interface Props {
  profile: GoogleProfile;
  verified: boolean;
  onPick: (ws: Workspace) => void;
  onLogout: () => void;
  /** يظهر عند "تبديل الفرع" من داخل التطبيق — زر رجوع بدون تسجيل خروج. */
  onCancel?: () => void;
}

const WS_META: Record<Workspace, { title: string; sub: string; Icon: typeof Building2 }> = {
  SITE: { title: 'فرع SITE', sub: 'مساحة عمل مستقلة · مزامنة لحظية', Icon: Building2 },
  RESTA: { title: 'فرع RESTA', sub: 'مساحة عمل مستقلة · مزامنة لحظية', Icon: Store },
};

/**
 * اختيار مساحة العمل — يظهر فقط بعد تسجيل دخول Google ناجح وتحقّق الجلسة
 * من Supabase. هذه الشاشة ليست تسجيل دخول؛ الهوية مثبتة مسبقاً.
 */
export function WorkspaceGate({ profile, verified, onPick, onLogout, onCancel }: Props) {
  const [busy, setBusy] = useState<Workspace | null>(null);

  const pick = (ws: Workspace) => {
    setBusy(ws);
    // مهلة قصيرة لإظهار حالة الاختيار ثم الدخول.
    setTimeout(() => onPick(ws), 220);
  };

  const initials = profile.name.trim().slice(0, 1).toUpperCase() || 'G';

  return (
    <div dir="rtl" className="fixed inset-0 z-[999] overflow-y-auto bg-ink-50 px-5 py-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-mesh" />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 size-80 rounded-full border-[32px] border-brand-600/[0.04]"
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center py-4">
        {/* الهوية الموثّقة من Google عبر Supabase */}
        <div className="anim-fade-up surface p-0">
          <div className="brand-bar h-1 w-full" />
          <div className="flex items-center gap-3 p-5">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-12 shrink-0 rounded-xl object-cover ring-2 ring-white"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-lg font-black text-white">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-black text-ink-900">{profile.name}</p>
              <p dir="ltr" className="truncate text-right text-[11.5px] font-semibold text-ink-400">
                {profile.email}
              </p>
            </div>
            <span
              className="badge badge-green shrink-0"
              title={verified ? 'تم التحقق من الجلسة ضد سيرفر Supabase' : 'جلسة Supabase صالحة'}
            >
              <BadgeCheck className="size-3.5" />
              {verified ? 'موثّق' : 'جلسة صالحة'}
            </span>
          </div>
        </div>

        {/* اختيار مساحة العمل */}
        <div className="anim-fade-up surface mt-4 p-5" style={{ animationDelay: '0.08s' }}>
          <h2 className="font-display text-[17px] font-black text-ink-900">اختر مساحة العمل</h2>
          <p className="mt-1 text-[12px] font-semibold text-ink-400">
            تسجيل الدخول تم بنجاح عبر Google ✓ — كل فرع له بيانات ومزامنة مستقلة
          </p>

          <div className="mt-4 grid gap-3">
            {WORKSPACES.map((ws) => {
              const { title, sub, Icon } = WS_META[ws];
              return (
                <button
                  key={ws}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => pick(ws)}
                  className="group flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-right transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_12px_28px_-14px_rgba(227,6,19,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-black text-ink-900">{title}</span>
                    <span className="block text-[11px] font-semibold text-ink-400">{sub}</span>
                  </span>
                  {busy === ws ? (
                    <span className="text-[11px] font-extrabold text-brand-600">جارٍ الدخول…</span>
                  ) : (
                    <ChevronLeft className="size-5 shrink-0 text-ink-300 transition group-hover:text-brand-600" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-extrabold text-ink-400 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <LogOut className="size-3.5" />
              تسجيل الخروج من حساب Google
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-extrabold text-brand-600 transition hover:bg-brand-50"
              >
                <ArrowLeft className="size-3.5" />
                رجوع للتطبيق
              </button>
            )}
          </div>
        </div>

        <p
          className="anim-fade-up mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-ink-300"
          style={{ animationDelay: '0.16s' }}
        >
          <Building2 className="size-3.5" />
          Amer Group Holding · Real Estate Operations
        </p>
      </div>
    </div>
  );
}
