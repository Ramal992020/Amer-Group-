import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Download, HardDrive, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import type { PersistedWalkin } from '../lib/walkin';
import {
  downloadBackup,
  readAutomaticBackups,
  readBackupFile,
  type AutomaticBackup,
} from '../lib/backups';
import { SectionTitle, useToast } from './ui';

interface Props {
  account: string;
  state: PersistedWalkin;
  onRestore: (state: PersistedWalkin) => void;
}

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleString('ar-EG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return value;
  }
};

export function BackupPanel({ account, state, onRestore }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [backups, setBackups] = useState<AutomaticBackup[]>([]);
  const [restoring, setRestoring] = useState(false);

  const refresh = () => setBackups(readAutomaticBackups(account));

  useEffect(() => {
    refresh();
  }, [account, state.updatedAt, state.history.length, state.customSales?.length]);

  const restoreSnapshot = (snapshot: AutomaticBackup) => {
    if (!window.confirm(`استعادة النسخة المحفوظة بتاريخ ${formatDate(snapshot.createdAt)}؟ سيتم استبدال بيانات اليوم الحالية.`)) return;
    onRestore(snapshot.state);
    toast('success', 'تمت استعادة النسخة الاحتياطية');
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setRestoring(true);
    try {
      const data = await readBackupFile(file, account);
      if (!window.confirm('استعادة هذا الملف؟ سيتم استبدال بيانات الحساب الحالية بالنسخة الموجودة في الملف.')) return;
      onRestore(data);
      toast('success', 'تم استيراد النسخة الاحتياطية بنجاح');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'تعذّر قراءة ملف النسخة الاحتياطية');
    } finally {
      setRestoring(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="surface anim-fade-up overflow-hidden">
      <div className="border-b border-ink-100 p-4">
        <SectionTitle
          title="النسخ الاحتياطي والاستعادة"
          subtitle="نزّل نسخة من بيانات الحساب أو ارجع لنسخة سابقة عند الحاجة"
          icon={<HardDrive className="size-4.5" strokeWidth={2.1} />}
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              downloadBackup(account, state);
              toast('success', 'تم تنزيل النسخة الاحتياطية');
            }}
            className="btn btn-primary min-h-11"
          >
            <Download className="size-4" />
            تنزيل نسخة الآن
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={restoring}
            className="btn btn-secondary min-h-11"
          >
            <Upload className="size-4" />
            استعادة من ملف
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => void importFile(event.currentTarget.files?.[0])}
        />

        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-emerald-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          النسخة تخص حساب {account} وتشمل الحضور والسجل والترتيب والهيكل. لا تحتوي على كلمة المرور أو مفتاح Supabase.
        </div>

        <div className="border-t border-ink-100 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-ink-700">
              <Clock className="size-3.5 text-ink-400" />
              نقاط استعادة تلقائية
            </p>
            <button type="button" onClick={refresh} className="text-[11px] font-bold text-brand-600 hover:text-brand-700">
              تحديث القائمة
            </button>
          </div>

          {backups.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-3 text-[11px] font-medium text-ink-400">
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              ستظهر هنا النسخ السابقة تلقائياً مع تغيّر البيانات. نزّل نسخة خارجية للاحتفاظ بها بأمان.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {backups.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-ink-800">{formatDate(item.createdAt)}</p>
                    <p className="tnum mt-0.5 text-[10px] font-medium text-ink-400">
                      {item.state.history.length} إسناد · {item.state.customSales?.length ?? Object.keys(item.state.salesState).length} عضو
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreSnapshot(item)}
                    className="btn btn-neutral shrink-0 px-2.5 py-2 text-[11px]"
                  >
                    <RotateCcw className="size-3.5" />
                    استعادة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}