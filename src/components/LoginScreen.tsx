import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ShieldCheck,
  Building2,
  Loader2,
  Info,
  Mail,
  Lock,
  KeyRound,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { AmerLogo } from './AmerLogo';
import {
  signInWithGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  sendEmailOtp,
  verifyEmailOtp,
} from '../lib/auth';
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

type EmailMode = 'password' | 'otp';

/**
 * إظهار زر «Sign in with Google».
 * false الآن لأن شاشة الموافقة في Google Cloud لسه بترفض (403 access_denied).
 * بعد حل المشكلة (Test users أو In production) غيّرها إلى true وسيظهر الزر فوراً
 * بدون أي تعديل آخر — كل كود Google جاهز ومتصل فعلياً بـ Supabase.
 */
const GOOGLE_ENABLED = false;

export function LoginScreen() {
  // ── Google ──
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // ── البريد الإلكتروني ──
  const [emailMode, setEmailMode] = useState<EmailMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  // لو رجع المستخدم من نافذة Google بدون إتمام نزيل حالة الانتظار.
  useEffect(() => {
    if (googleBusy) {
      const t = setTimeout(() => setGoogleBusy(false), 15000);
      return () => clearTimeout(t);
    }
  }, [googleBusy]);

  // عدّاد إعادة إرسال الرمز.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setGoogleBusy(true);
    const err = await signInWithGoogle();
    if (err) {
      setError(err);
      setGoogleBusy(false);
    }
    // عند النجاح: المتصفح يُحوَّل لشاشة اختيار حساب Google ثم يعود للتطبيق.
  };

  const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!validEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً.');
    if (password.trim().length < 6) return setError('كلمة المرور يجب ألا تقل عن 6 أحرف.');
    setEmailBusy(true);
    const res = isSignup
      ? await signUpWithEmailPassword(email, password)
      : await signInWithEmailPassword(email, password);
    setEmailBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'تعذّر تسجيل الدخول.');
      return;
    }
    if (res.needsConfirmation) {
      setInfo(
        'تم إنشاء الحساب ✓ — افتح بريدك واضغط رابط التأكيد المرسل من Supabase، ثم سجّل الدخول من هنا. (أو عطّل «Confirm email» من إعدادات Supabase للدخول الفوري).',
      );
      setIsSignup(false);
    }
    // عند النجاح يتولى onAuthStateChange فتح التطبيق تلقائياً.
  };

  const handleSendOtp = async () => {
    setError('');
    setInfo('');
    if (!validEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً.');
    setEmailBusy(true);
    const err = await sendEmailOtp(email);
    setEmailBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setOtpSent(true);
    setResendIn(60);
    setInfo(`أرسلنا رمز دخول من 6 أرقام إلى ${email.trim()} — تحقق من البريد (ومجلد Spam).`);
    setTimeout(() => otpRef.current?.focus(), 50);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (otp.trim().length < 6) return setError('أدخل رمز التحقق المكوّن من 6 أرقام.');
    setEmailBusy(true);
    const err = await verifyEmailOtp(email, otp);
    setEmailBusy(false);
    if (err) setError(err);
    // عند النجاح تُفتح الجلسة تلقائياً عبر onAuthStateChange.
  };

  const needsSetup = error.includes('غير مفعّل') || error.includes('Redirect');

  const emailInputCls =
    'field ps-10 text-left dir-ltr placeholder:text-ink-300'; /* ltr للبريد */

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
                {GOOGLE_ENABLED
                  ? 'عبر Google أو البريد الإلكتروني — بحساب موثّق من Supabase'
                  : 'بحساب بريد إلكتروني موثّق من Supabase'}
              </p>
            </div>

            {/* Google Sign-In */}
            {GOOGLE_ENABLED && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleBusy || emailBusy}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white py-3.5 text-[14.5px] font-extrabold text-ink-800 shadow-sm transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {googleBusy ? (
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

                {/* divider */}
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-ink-100" />
                  <span className="text-[11px] font-bold text-ink-300">أو الدخول بالبريد الإلكتروني</span>
                  <span className="h-px flex-1 bg-ink-100" />
                </div>
              </>
            )}

            {/* tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1">
              {(
                [
                  { id: 'password', label: 'بريد + كلمة مرور', Icon: Lock },
                  { id: 'otp', label: 'رمز بدون كلمة مرور', Icon: KeyRound },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEmailMode(t.id);
                    setError('');
                    setInfo('');
                    setOtpSent(false);
                    setOtp('');
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-extrabold transition ${
                    emailMode === t.id
                      ? 'bg-white text-brand-600 shadow-sm ring-1 ring-ink-100'
                      : 'text-ink-400 hover:text-ink-600'
                  }`}
                >
                  <t.Icon className="size-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── بريد + كلمة مرور ── */}
            {emailMode === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="name@amer-group.com"
                    autoComplete="email"
                    className={emailInputCls}
                  />
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    className={emailInputCls}
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailBusy || googleBusy}
                  className="btn btn-primary w-full py-3 text-[14px]"
                >
                  {emailBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      جارٍ التحقق من Supabase…
                    </>
                  ) : isSignup ? (
                    <>
                      <UserPlus className="size-4" />
                      إنشاء حساب جديد
                    </>
                  ) : (
                    'دخول'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignup((v) => !v);
                    setError('');
                    setInfo('');
                  }}
                  className="w-full text-center text-[11.5px] font-extrabold text-brand-600 transition hover:text-brand-700"
                >
                  {isSignup ? 'لدي حساب بالفعل ← تسجيل الدخول' : 'ليس لدي حساب ← إنشاء حساب جديد'}
                </button>
              </form>
            )}

            {/* ── رمز بريدي بدون كلمة مرور ── */}
            {emailMode === 'otp' && !otpSent && (
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="name@amer-group.com"
                    autoComplete="email"
                    className={emailInputCls}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={emailBusy || googleBusy}
                  className="btn btn-primary w-full py-3 text-[14px]"
                >
                  {emailBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      جارٍ إرسال الرمز…
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-4" />
                      إرسال رمز الدخول إلى بريدي
                    </>
                  )}
                </button>
              </div>
            )}

            {emailMode === 'otp' && otpSent && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <p dir="ltr" className="text-center text-[11.5px] font-bold text-ink-500">
                  {email.trim()}
                </p>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <input
                    ref={otpRef}
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    placeholder="——————"
                    className="field ps-10 text-center text-[18px] font-black tracking-[0.5em]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="btn btn-primary w-full py-3 text-[14px]"
                >
                  {emailBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      جارٍ التحقق…
                    </>
                  ) : (
                    'تأكيد الرمز ودخول'
                  )}
                </button>
                <div className="flex items-center justify-between text-[11.5px] font-extrabold">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setError('');
                      setInfo('');
                    }}
                    className="text-ink-400 transition hover:text-ink-600"
                  >
                    تغيير البريد
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || emailBusy}
                    onClick={handleSendOtp}
                    className="text-brand-600 transition hover:text-brand-700 disabled:cursor-not-allowed disabled:text-ink-300"
                  >
                    {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : 'إعادة إرسال الرمز'}
                  </button>
                </div>
              </form>
            )}

            {/* alerts */}
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

            {info && (
              <div
                role="status"
                className="anim-slide-in flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12px] font-bold leading-relaxed text-emerald-700"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{info}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-ink-400">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              لا يمكن الدخول بدون جلسة موثّقة من Supabase — لا يوجد دخول تجريبي أو زائر
            </div>

            <p className="text-center text-[11px] font-semibold leading-relaxed text-ink-300">
              بعد تسجيل الدخول ستختار مساحة عمل الفرع (SITE / RESTA)،
              <br />
              وأي شخص يدخل بنفس مساحة العمل من أي جهاز يرى نفس التعديلات لحظياً.
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
