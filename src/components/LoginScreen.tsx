import { useState } from 'react';
import { Lock, User, ArrowLeft, AlertCircle, ShieldCheck, Building2 } from 'lucide-react';
import { AmerLogo } from './AmerLogo';

export const ACCOUNTS: Record<string, string> = {
  SITE: '123',
  RESTA: '123',
};

interface Props {
  onLogin: (account: string) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = username.trim().toUpperCase();
    const expected = ACCOUNTS[user];
    if (!expected || expected !== password.trim()) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
      return;
    }
    setError('');
    setBusy(true);
    setTimeout(() => onLogin(user), 260);
  };

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
        <form
          onSubmit={submit}
          className="anim-fade-up surface overflow-hidden p-0"
          style={{ animationDelay: '0.08s' }}
        >
          <div className="brand-bar h-1 w-full" />
          <div className="space-y-4 p-6">
            <div>
              <label htmlFor="u" className="field-label">
                اسم المستخدم
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="u"
                  dir="ltr"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder="SITE / RESTA"
                  autoCapitalize="characters"
                  autoComplete="username"
                  className="field pr-10 text-left tracking-wide"
                />
              </div>
            </div>

            <div>
              <label htmlFor="p" className="field-label">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="p"
                  dir="ltr"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••"
                  autoComplete="current-password"
                  className="field pr-10 text-left tracking-widest"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="anim-slide-in flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-[12px] font-bold text-brand-700"
              >
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5 text-[15px]">
              {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
              {!busy && <ArrowLeft className="size-4.5" />}
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-ink-400">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              كل من يسجّل بنفس الحساب يرى التعديلات لحظياً
            </div>

            <p className="pt-1 text-center text-[12px] font-bold text-brand-600">
              بيانات الدخول: SITE / RESTA · كلمة المرور 123
            </p>
          </div>
        </form>

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
