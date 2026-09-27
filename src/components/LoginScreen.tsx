import { useEffect, useState } from 'react';
import { AlertCircle, ShieldCheck, Building2, Loader2, Info } from 'lucide-react';
import { AmerLogo } from './AmerLogo';
import { signInWithGoogle } from '../lib/auth';
import { SUPABASE_PROJECT_REF, getOAuthRedirectTo, getSupabaseCallbackUrl } from '../lib/supabase';

/** شعار Google الرسمي (متعدد الألوان). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // لو رجع المستخدم من نافذة Google بدون إتمام (أو فشل التبادل) نزيل حالة الانتظار.
  useEffect(() => {
    if (busy) {
      const t = setTimeout(() => setBusy(false), 15000);
      return () => clearTimeout(t);
    }
  }, [busy]);

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    const err = await signInWithGoogle();
    if (err) {
      setError(err);
      setBusy(false);
    }
    // عند النجاح: المتصفح يُحوَّل لشاشة اختيار حساب Google ثم يعود للتطبيق.
  };

  const needsSetup = error.includes('غير مفعّل') || error.includes('Redirect');

  return (
    <div dir="rtl" className="fixed inset-0 z-[999] overflow-y-auto bg-ink-50 px-5 py-8">
      {/* decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-mesh" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full border-[28px] border-brand-600/[0.05]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 size-80 rounded-full border-[32px] border-brand-600/[0.04]"
      />
      <div aria-hidden className="dot-grid pointer-events-none absolute bottom-10 left-8 h-28 w-28 opacity-70" />

      <div className="relative mx-auto flex min-h-full w-full max-w-[400px] flex-col justify-center py-4">
        {/* brand */}
        <div className="anim-fade-up mb-6 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-white px-6 py-4 shadow-[0_10px_30px_-12px_rgba(20,23,31,0.18)] ring-1 ring-ink-100">
            <AmerLogo className="w-[170px]" variant="dark" />
          </div>
          <h1 className="mt-5 font-display text-[26px] font-black leading-tight text-ink-900">
            منظّم الـ Walk-In
          </h1>
          <p className="mt-1 text-[13px] font-medium text-ink-400">
            نظام إدارة توزيع العملاء · Amer Group
          </p>
        </div>

        {/* card */}
        <div className="anim-fade-up surface overflow-hidden p-0" style={{ animationDelay: '0.08s' }}>
          <div className="brand-bar h-1 w-full" />
          <div className="space-y-4 p-6">
            <div className="text-center">
              <h2 className="font-display text-[17px] font-black text-ink-900">تسجيل الدخول</h2>
              <p className="mt-1 text-[12px] font-semibold text-ink-400">
                الدخول يتم حصراً بحساب Google عبر Supabase Authentication
              </p>
            </div>

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white py-3.5 text-[14.5px] font-extrabold text-ink-800 shadow-sm transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? (
                <>
                  <Loader2 className="size-5 animate-spin text-brand-600" />
                  جارٍ فتح شاشة اختيار حساب Google…
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Sign in with Google
                </>
              )}
            </button>

            {error && (
              <div
                role="alert"
                className="anim-slide-in rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3"
              >
                <div className="flex items-start gap-2 text-[12px] font-bold leading-relaxed text-brand-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
                {needsSetup && (
                  <button
                    type="button"
                    onClick={() => setShowHelp((v) => !v)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-brand-600 ring-1 ring-brand-200 transition hover:bg-brand-50"
                  >
                    <Info className="size-3.5" />
                    {showHelp ? 'إخفاء خطوات التفعيل' : 'كيف أفعّل Google Sign-In؟'}
                  </button>
                )}
                {needsSetup && showHelp && (
                  <ol className="mt-2 list-decimal space-y-1.5 rounded-lg bg-white p-3 pr-6 text-[11px] font-semibold leading-relaxed text-ink-600">
                    <li>
                      من Google Cloud Console أنشئ OAuth Client (Web) واجعل Redirect URI:{' '}
                      <code dir="ltr" className="rounded bg-ink-50 px-1 font-bold">
                        {getSupabaseCallbackUrl()}
                      </code>
                    </li>
                    <li>
                      في لوحة Supabase (مشروع{' '}
                      <code dir="ltr" className="font-bold">
                        {SUPABASE_PROJECT_REF}
                      </code>
                      ) فعّل Google من Authentication ← Sign In / Providers والصق Client ID و Secret.
                    </li>
                    <li>
                      أضف رابط هذا التطبيق إلى Authentication ← URL Configuration ← Redirect URLs:{' '}
                      <code dir="ltr" className="rounded bg-ink-50 px-1 font-bold">
                        {getOAuthRedirectTo()}
                      </code>
                    </li>
                    <li>الشرح الكامل في ملف docs/GOOGLE_AUTH_SETUP.md داخل المشروع.</li>
                  </ol>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-ink-400">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              لا يمكن الدخول بدون جلسة موثّقة من Supabase — تم إلغاء أي دخول تجريبي أو زائر
            </div>

            <p className="text-center text-[11px] font-semibold leading-relaxed text-ink-300">
              بعد تسجيل الدخول ستختار مساحة عمل الفرع (SITE / RESTA)،
              <br />
              وكل من يسجّل بنفس مساحة العمل يرى التعديلات لحظياً.
            </p>
          </div>
        </div>

        <p
          className="anim-fade-up mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-ink-300"
          style={{ animationDelay: '0.16s' }}
        >
          <Building2 className="size-3.5" />
          Amer Group Holding · Real Estate Operations
        </p>
      </div>
    </div>
  );
}
