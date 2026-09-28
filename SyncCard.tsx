import { useState } from 'react';
import { Cloud, CloudOff, Database, KeyRound, Globe, RefreshCw, Copy, Check, ShieldCheck, Info } from 'lucide-react';
import type { SyncStatus } from '../lib/sync';
import { SQL_SETUP, getSyncConfig, normalizeUrl } from '../lib/sync';
import { SectionTitle, useToast } from './ui';
import { cn } from '../utils/cn';

interface Props {
  account: string;
  status: SyncStatus;
  /** Test credentials (pre-filled defaults or typed) then start syncing. */
  onConnect: (url: string, key: string) => Promise<void> | void;
  onRetry: () => void;
}

export function SyncCard({ account, status, onConnect, onRetry }: Props) {
  const toast = useToast();
  const initial = getSyncConfig(account);
  const [url, setUrl] = useState(() => normalizeUrl(initial.url));
  const [key, setKey] = useState(() => initial.key ?? '');
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SETUP);
    } catch {
      /* ignore */
    }
    setSqlCopied(true);
    toast('success', 'تم نسخ أمر SQL');
    setTimeout(() => setSqlCopied(false), 1800);
  };

  const meta = {
    synced: {
      badge: 'badge-green',
      icon: <Cloud className="size-3.5" />,
      text: 'متصل — أي جهاز بنفس الحساب يرى التعديلات فوراً',
    },
    connecting: {
      badge: 'badge-gray',
      icon: <RefreshCw className="size-3.5 animate-spin" />,
      text: 'جارٍ الاتصال بمشروع Supabase…',
    },
    error: {
      badge: 'badge-red',
      icon: <CloudOff className="size-3.5" />,
      text: 'تعذّر الوصول للمشروع — تحقق من الرابط أو شغّل ملف SQL',
    },
    offline: { badge: 'badge-amber', icon: <CloudOff className="size-3.5" />, text: 'بدون اتصال — يعمل محلياً' },
  }[status];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await onConnect(url, key);
    setBusy(false);
  };

  return (
    <section className="surface anim-fade-up p-4">
      <SectionTitle
        title="المزامنة بين الأجهزة"
        subtitle={meta.text}
        icon={<Cloud className="size-4.5" strokeWidth={2.1} />}
        action={
          <span className={cn('badge shrink-0', meta.badge)}>
            {meta.icon}
            {account}
          </span>
        }
      />

      <div className="mb-3 flex gap-2 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5">
        <Info className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
        <p className="text-[11.5px] font-medium leading-relaxed text-ink-500">
          بيانات مشروع Amer Group معبّأة مسبقاً — اضغط زر الاتصال مرة واحدة على كل جهاز، وسجّل الدخول بنفس الحساب (
          {account})، وستظهر التعديلات على الجميع تلقائياً.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="sb-url" className="field-label">
            Project URL
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <input
              id="sb-url"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              autoComplete="off"
              spellCheck={false}
              className="field pr-10 text-left text-[13px]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sb-key" className="field-label">
            Publishable Key
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <input
              id="sb-key"
              dir="ltr"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sb_publishable_…"
              autoComplete="off"
              spellCheck={false}
              className="field pr-10 text-left text-[13px]"
            />
          </div>
        </div>

        <button type="submit" disabled={busy || !url.trim() || !key.trim()} className="btn btn-primary w-full">
          {busy ? <RefreshCw className="size-4 animate-spin" /> : <Database className="size-4" />}
          اختبار وحفظ الاتصال
        </button>

        {status === 'synced' && (
          <button type="button" onClick={onRetry} className="btn btn-neutral w-full text-[12.5px]">
            <RefreshCw className="size-3.5" />
            إعادة المزامنة الآن
          </button>
        )}
      </form>

      {/* SQL bootstrap — visible when the table is missing */}
      <div className="mt-4 border-t border-ink-100 pt-3">
        <button
          type="button"
          onClick={() => setSqlOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between gap-2 text-[12.5px] font-bold transition',
            status === 'error' ? 'text-brand-600' : 'text-ink-500 hover:text-brand-600',
          )}
        >
          <span className="flex items-center gap-1.5">
            <Database className="size-4" />
            ملف SQL الكامل (المزامنة + حسابات المشروع) — شغّله في Supabase
          </span>
          <span className={cn('text-ink-300 transition', sqlOpen && 'rotate-180')}>▲</span>
        </button>

        {sqlOpen && (
          <div className="anim-fade-up mt-2">
            <p className="mb-2 text-[11.5px] leading-relaxed text-ink-400">
              في Supabase ← <strong>SQL Editor</strong> ← الصق الأمر التالي وشغّله مرة واحدة (الجزء الثاني هو
              حساباتك الموجودة في <span className="font-bold">amer_private.accounts</span>):
            </p>
            <div className="relative">
              <pre
                dir="ltr"
                className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 p-3 text-left text-[11px] leading-relaxed text-ink-700"
              >
                {SQL_SETUP}
              </pre>
              <button
                type="button"
                onClick={copySql}
                aria-label="نسخ SQL"
                className={cn(
                  'absolute left-2 top-2 grid size-8 place-items-center rounded-lg border transition active:scale-95',
                  sqlCopied
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-ink-200 bg-white text-ink-400 hover:text-brand-600',
                )}
              >
                {sqlCopied ? <Check className="size-4" strokeWidth={3} /> : <Copy className="size-4" />}
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="size-3.5" />
              بياناتك تبقى في مساحة مشروعك الخاصة على Supabase.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
