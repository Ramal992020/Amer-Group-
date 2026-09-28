import { useState } from 'react';
import { Crown, Users, UserPlus, Trash2, Network, Plus } from 'lucide-react';
import type { HeadGroup, ManagerTeam, SalesPerson } from '../lib/walkin';
import { SectionTitle, useToast } from './ui';
import { cn } from '../utils/cn';

interface Props {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  onAddHead: (name: string, ar?: string) => void;
  onAddManager: (name: string, headId: string, ar?: string) => void;
  onAddSales: (name: string, managerId: string, headId: string) => void;
  onDeleteHead: (id: string) => void;
  onDeleteManager: (id: string) => void;
  onDeleteSales: (id: string) => void;
}

type Mode = 'sales' | 'manager' | 'head';

export function ManageOrgPanel({
  heads,
  managers,
  sales,
  onAddHead,
  onAddManager,
  onAddSales,
  onDeleteHead,
  onDeleteManager,
  onDeleteSales,
}: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('sales');

  const [headName, setHeadName] = useState('');
  const [headAr, setHeadAr] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [mgrHeadId, setMgrHeadId] = useState(heads[0]?.id || '');
  const [mgrAr, setMgrAr] = useState('');
  const [salesName, setSalesName] = useState('');
  const [salesMgrId, setSalesMgrId] = useState(managers[0]?.id || '');

  const handleAddHead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!headName.trim()) return;
    onAddHead(headName.trim(), headAr.trim());
    toast('success', `تمت إضافة Head: ${headName.trim()}`);
    setHeadName('');
    setHeadAr('');
  };

  const handleAddManager = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgrName.trim() || !mgrHeadId) return;
    onAddManager(mgrName.trim(), mgrHeadId, mgrAr.trim());
    toast('success', `تمت إضافة المدير: ${mgrName.trim()}`);
    setMgrName('');
    setMgrAr('');
  };

  const handleAddSales = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName.trim() || !salesMgrId) return;
    const mgr = managers.find((m) => m.id === salesMgrId);
    if (!mgr) return;
    onAddSales(salesName.trim(), mgr.id, mgr.headId);
    toast('success', `تمت إضافة السيلز: ${salesName.trim()}`);
    setSalesName('');
  };

  const tabs: { id: Mode; label: string; icon: typeof UserPlus }[] = [
    { id: 'sales', label: 'سيلز', icon: UserPlus },
    { id: 'manager', label: 'مدير', icon: Users },
    { id: 'head', label: 'Head', icon: Crown },
  ];

  return (
    <div className="space-y-4">
      {/* add form */}
      <section className="surface anim-fade-up overflow-hidden">
        <div className="border-b border-ink-100 p-4">
          <SectionTitle
            title="إضافة عضو جديد"
            subtitle="اختر النوع ثم أكمل البيانات"
            icon={<Plus className="size-4.5" strokeWidth={2.4} />}
          />
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-ink-100 p-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-extrabold transition',
                  mode === t.id
                    ? 'bg-brand-600 text-white shadow-[0_4px_10px_-3px_rgba(227,6,19,0.45)]'
                    : 'text-ink-500 hover:bg-white hover:text-ink-900',
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {mode === 'sales' && (
            <form onSubmit={handleAddSales} className="space-y-3">
              <div>
                <label className="field-label">اسم السيلز</label>
                <input
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                  placeholder="مثال: Ahmed Ali"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">يتبع تيم المدير</label>
                <select value={salesMgrId} onChange={(e) => setSalesMgrId(e.target.value)} className="field">
                  {managers.map((m) => {
                    const h = heads.find((x) => x.id === m.headId);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name} {h ? `(${h.name})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <button type="submit" disabled={!salesName.trim()} className="btn btn-primary w-full">
                <UserPlus className="size-4" />
                إضافة السيلز
              </button>
            </form>
          )}

          {mode === 'manager' && (
            <form onSubmit={handleAddManager} className="space-y-3">
              <div>
                <label className="field-label">اسم المدير</label>
                <input
                  value={mgrName}
                  onChange={(e) => setMgrName(e.target.value)}
                  placeholder="مثال: Hossam"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">الاسم بالعربي (اختياري)</label>
                <input value={mgrAr} onChange={(e) => setMgrAr(e.target.value)} placeholder="مثال: حسام" className="field" />
              </div>
              <div>
                <label className="field-label">يتبع Head Manager</label>
                <select value={mgrHeadId} onChange={(e) => setMgrHeadId(e.target.value)} className="field">
                  {heads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-[11px] font-medium leading-relaxed text-ink-400">
                سيُضاف المدير كشخص حضور فقط (يمكنه الجلوس كبديل) مع فتح تيم جديد باسمه.
              </p>
              <button type="submit" disabled={!mgrName.trim()} className="btn btn-primary w-full">
                <Users className="size-4" />
                إضافة المدير
              </button>
            </form>
          )}

          {mode === 'head' && (
            <form onSubmit={handleAddHead} className="space-y-3">
              <div>
                <label className="field-label">اسم الـ Head</label>
                <input
                  value={headName}
                  onChange={(e) => setHeadName(e.target.value)}
                  placeholder="مثال: Mohamed Tarek"
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">الاسم بالعربي (اختياري)</label>
                <input
                  value={headAr}
                  onChange={(e) => setHeadAr(e.target.value)}
                  placeholder="مثال: محمد طارق"
                  className="field"
                />
              </div>
              <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-[11px] font-medium leading-relaxed text-ink-400">
                التناوب Head × Head سيتوسّع تلقائياً ليشمل الهيد الجديد بالترتيب.
              </p>
              <button type="submit" disabled={!headName.trim()} className="btn btn-primary w-full">
                <Crown className="size-4" />
                إضافة Head Manager
              </button>
            </form>
          )}
        </div>
      </section>

      {/* structure */}
      <section className="surface anim-fade-up p-4" style={{ animationDelay: '0.08s' }}>
        <SectionTitle
          title="الهيكل الحالي"
          subtitle={`${heads.length} Heads · ${managers.length} تيمات · ${sales.length} أفراد`}
          icon={<Network className="size-4.5" strokeWidth={2.1} />}
        />

        <div className="space-y-3">
          {heads.map((h) => {
            const hMgrs = managers.filter((m) => m.headId === h.id);
            return (
              <div key={h.id} className="overflow-hidden rounded-xl border border-ink-100">
                <div className="flex items-center justify-between gap-2 bg-ink-50/80 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crown className="size-4 shrink-0 text-brand-600" strokeWidth={2.2} />
                    <span className="truncate text-[13px] font-extrabold text-ink-900">{h.name}</span>
                  </div>
                  {heads.length > 2 && (
                    <button
                      onClick={() => {
                        if (window.confirm(`حذف Head "${h.name}"؟ سيتم حذف مديريه وسيلز تيماته.`)) {
                          onDeleteHead(h.id);
                          toast('info', `تم حذف ${h.name}`);
                        }
                      }}
                      aria-label={`حذف ${h.name}`}
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 p-2.5">
                  {hMgrs.map((m) => {
                    const mSales = sales.filter((s) => s.managerId === m.id && !s.isManager);
                    return (
                      <div key={m.id} className="rounded-lg bg-ink-50/60 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-extrabold text-ink-700">
                            <Users className="size-3.5 shrink-0 text-ink-400" />
                            <span className="truncate">تيم {m.name}</span>
                          </span>
                          {managers.length > 1 && (
                            <button
                              onClick={() => {
                                if (window.confirm(`حذف تيم "${m.name}" وسيلز التيم؟`)) {
                                  onDeleteManager(m.id);
                                  toast('info', `تم حذف تيم ${m.name}`);
                                }
                              }}
                              aria-label={`حذف تيم ${m.name}`}
                              className="grid size-6 shrink-0 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {mSales.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-bold text-ink-700"
                            >
                              {s.name}
                              <button
                                onClick={() => {
                                  if (window.confirm(`حذف السيلز "${s.name}"؟`)) {
                                    onDeleteSales(s.id);
                                    toast('info', `تم حذف ${s.name}`);
                                  }
                                }}
                                aria-label={`حذف ${s.name}`}
                                className="text-ink-300 transition hover:text-brand-600"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {mSales.length === 0 && (
                            <span className="text-[11px] font-medium text-ink-300">لا يوجد سيلز بعد</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
