import { useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2, Pencil, X } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { createDailyWalkinWorkbook, dailyWalkinFilename, localDay, readDailyWalkins, saveDailyWalkins, type DailyWalkinRow } from '../lib/dailyWalkin';
import { SectionTitle } from './ui';

const timeNow = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export function DailySheet({ account }: { account: string }) {
  const [rows, setRows] = useState(() => readDailyWalkins(account));
  const [day, setDay] = useState(() => localDay(new Date()));
  const [form, setForm] = useState(() => ({ name: '', mobile: '', date: localDay(new Date()), time: timeNow(), director: '' }));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const save = (next: DailyWalkinRow[]) => {
    try { saveDailyWalkins(account, next); setRows(next); return true; }
    catch { setError('تعذر حفظ الشيت على الجهاز.'); return false; }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const date = new Date(`${form.date}T${form.time}:00`);
    if (!form.name.trim() || !form.mobile.trim() || !form.date || !form.time || Number.isNaN(date.getTime())) {
      setError('أكمل اسم العميل ورقمه والتاريخ والوقت.'); return;
    }
    const row = { id: editing ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: form.name.trim(), mobile: form.mobile.trim(), createdAt: date.toISOString(), director: form.director.trim() };
    if (!save(editing ? rows.map(item => item.id === editing ? row : item) : [...rows, row])) return;
    setDay(form.date);
    setForm({ name: '', mobile: '', date: form.date, time: timeNow(), director: '' });
    setNotice(editing ? 'تم تعديل العميل.' : 'تمت إضافة العميل إلى الشيت.');
    setEditing(null); setError('');
  };
  const selected = rows.filter(row => {
    const date = new Date(row.createdAt);
    return !Number.isNaN(date.getTime()) && localDay(date) === day;
  });
  const edit = (row: DailyWalkinRow) => {
    const date = new Date(row.createdAt);
    setForm({ name: row.name, mobile: row.mobile, date: localDay(date), time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`, director: row.director });
    setEditing(row.id); setNotice(''); setError('');
  };
  return (
    <section className="surface anim-fade-up p-4 sm:p-5">
      <SectionTitle title="الشيت اليومي" subtitle="إضافة عملاء Walk in وتنزيل شيت لكل يوم" icon={<FileSpreadsheet className="size-5" />} />
      <p className="mb-4 text-xs text-ink-500">عملاء Walk in المسجلون من الاستقبال يظهرون هنا تلقائياً. البيانات محفوظة على هذا الجهاز لكل فرع.</p>
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
        <p className="text-sm font-extrabold">{editing ? 'تعديل بيانات العميل' : 'إضافة عميل للشيت'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">اسم العميل *<input className="field mt-1" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field-label">رقم العميل *<input className="field mt-1 text-left" dir="ltr" inputMode="tel" required value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} /></label>
          <label className="field-label">التاريخ *<input className="field mt-1" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label className="field-label">الوقت *<input className="field mt-1" type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label>
          <label className="field-label sm:col-span-2">اسم الـ Director<input className="field mt-1" placeholder="اكتب اسم الـ Director" value={form.director} onChange={e => setForm({ ...form, director: e.target.value })} /></label>
        </div>
        {error && <p role="alert" className="text-xs font-bold text-brand-600">{error}</p>}
        {notice && <p role="status" className="text-xs font-bold text-emerald-700">{notice}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary"><Plus className="size-4" />{editing ? 'حفظ التعديل' : 'إضافة العميل'}</button>
          {editing && <button type="button" className="btn btn-neutral" onClick={() => { setEditing(null); setForm({ name: '', mobile: '', date: day, time: timeNow(), director: '' }); setError(''); }}><X className="size-4" />إلغاء</button>}
        </div>
      </form>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="field-label flex-1">تاريخ الشيت<input aria-label="تاريخ الشيت" className="field mt-1" type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
        <button type="button" className="btn btn-secondary" disabled={!day} onClick={() => XLSX.writeFile(createDailyWalkinWorkbook(day, rows), dailyWalkinFilename(day))}><Download className="size-4" />تنزيل Excel</button>
      </div>
      <p className="mt-3 text-xs text-ink-500">يمكن تنزيل شيت فارغ للأيام التي لم يدخل فيها عملاء.</p>
      <div className="mt-3 space-y-2">
        {selected.length === 0 ? <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-xs text-ink-400">لا يوجد عملاء في هذا التاريخ</p> : selected.map(row => (
          <div key={row.id} className="flex items-center gap-2 rounded-xl border border-ink-100 p-3">
            <div className="min-w-0 flex-1"><p className="font-bold text-sm">{row.name}</p><p dir="ltr" className="text-left text-xs text-ink-500">{row.mobile} · {new Date(row.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p><p className="text-xs text-ink-500">Director: {row.director || 'لم يحدد'}</p></div>
            <button type="button" onClick={() => edit(row)} aria-label={`تعديل ${row.name}`} className="btn btn-neutral p-2"><Pencil className="size-4" /></button>
            <button type="button" onClick={() => { if (window.confirm('حذف العميل من الشيت؟')) { if (save(rows.filter(item => item.id !== row.id)) && editing === row.id) setEditing(null); } }} aria-label={`حذف ${row.name}`} className="btn btn-neutral p-2"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
