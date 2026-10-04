import { useState } from 'react';
import { Check, Crown, Network, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { HeadGroup, ManagerTeam, SalesPerson } from '../lib/walkin';
import { SectionTitle, useToast } from './ui';
import { cn } from '../utils/cn';

interface AddProps {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  onAddHead: (name: string, ar?: string) => void;
  onAddManager: (name: string, headId: string, ar?: string) => void;
  onAddSales: (name: string, managerId: string, headId: string) => void;
}

interface Props {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  onRenameHead: (id: string, name: string, ar?: string) => void;
  onRenameManager: (id: string, name: string, ar?: string) => void;
  onRenameSales: (id: string, name: string) => void;
  onDeleteHead: (id: string) => void;
  onDeleteManager: (id: string) => void;
  onDeleteSales: (id: string) => void;
}

type Kind = 'sales' | 'manager' | 'head';

/** The member currently being renamed, right where their name is displayed. */
interface Draft {
  kind: Kind;
  id: string;
  name: string;
  ar: string;
}

/** Compact rename form — edits the name in place instead of deleting + re-adding. */
function NameEditor({
  label,
  name,
  ar,
  withAr,
  onName,
  onAr,
  onSave,
  onCancel,
}: {
  label: string;
  name: string;
  ar: string;
  withAr?: boolean;
  onName: (value: string) => void;
  onAr?: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Inline styles: the design-system classes win over Tailwind utilities, so the
  // compact size is set here instead of with utility classes.
  const compactField = { padding: '0.45rem 0.65rem', fontSize: '13px' } as const;
  const compactBtn = { padding: '0.5rem 0.75rem', fontSize: '12px' } as const;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="w-full space-y-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5"
    >
      <p className="text-[11px] font-extrabold text-brand-700">{label}</p>
      <div className={cn('grid gap-2', withAr && 'sm:grid-cols-2')}>
        <input
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="الاسم بالإنجليزي"
          className="field"
          style={compactField}
        />
        {withAr && (
          <input
            value={ar}
            onChange={(e) => onAr?.(e.target.value)}
            placeholder="الاسم بالعربي (اختياري)"
            className="field"
            style={compactField}
          />
        )}
      </div>
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={!name.trim()}
          className="btn btn-primary flex-1"
          style={compactBtn}
        >
          <Check className="size-3.5" />
          حفظ التعديل
        </button>
        <button type="button" onClick={onCancel} className="btn btn-neutral" style={compactBtn}>
          <X className="size-3.5" />
          إلغاء
        </button>
      </div>
    </form>
  );
}

/**
 * «إضافة عضو جديد» — the first card of the «الهيكل» tab.
 *
 * Adding a Head / manager / sales publishes the roster to the shared row, so
 * the new member appears in BOTH branches (SITE & RESTA). Attendance stays per
 * branch: the new person starts as «لم يحضر» in each one.
 */
export function AddMemberPanel({ heads, managers, onAddHead, onAddManager, onAddSales }: AddProps) {
  const toast = useToast();
  const [mode, setMode] = useState<Kind>('sales');

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

  const tabs: { id: Kind; label: string; icon: typeof UserPlus }[] = [
    { id: 'sales', label: 'سيلز', icon: UserPlus },
    { id: 'manager', label: 'مدير', icon: Users },
    { id: 'head', label: 'Head', icon: Crown },
  ];

  return (
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

  );
}

export function ManageOrgPanel({
  heads,
  managers,
  sales,
  onRenameHead,
  onRenameManager,
  onRenameSales,
  onDeleteHead,
  onDeleteManager,
  onDeleteSales,
}: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  const startEdit = (kind: Kind, id: string, name: string, ar = '') => {
    setDraft({ kind, id, name, ar });
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    if (draft.kind === 'head') {
      onRenameHead(draft.id, name, draft.ar.trim());
      toast('success', `تم تعديل اسم الـ Head إلى ${name}`);
    } else if (draft.kind === 'manager') {
      onRenameManager(draft.id, name, draft.ar.trim());
      toast('success', `تم تعديل اسم المدير إلى ${name}`);
    } else {
      onRenameSales(draft.id, name);
      toast('success', `تم تعديل اسم السيلز إلى ${name}`);
    }
    setDraft(null);
  };

  return (
    <section className="surface anim-fade-up p-4">
      <SectionTitle
        title="الهيكل الحالي"
        subtitle={`${heads.length} Heads · ${managers.length} تيمات · ${sales.length} أفراد`}
        icon={<Network className="size-4.5" strokeWidth={2.1} />}
      />

      <p className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-emerald-700">
        <Pencil className="mt-0.5 size-3.5 shrink-0" />
        <span>
          للتعديل على أي اسم اضغط أيقونة القلم بجانبه. التعديل بيحصل على نفس الشخص — الحضور والعدّاد وترتيب
          الدور والسجل كلهم بيفضلوا زي ما هم، مش حذف وإضافة من جديد. والاسم الجديد بيظهر في الفرعين SITE
          و RESTA.
        </span>
      </p>

      <div className="space-y-3">
        {heads.map((h) => {
          const hMgrs = managers.filter((m) => m.headId === h.id);
          return (
            <div key={h.id} className="overflow-hidden rounded-xl border border-ink-100">
              {draft && draft.kind === 'head' && draft.id === h.id ? (
                <div className="bg-ink-50/80 p-2.5">
                  <NameEditor
                    label="تعديل اسم الـ Head"
                    name={draft.name}
                    ar={draft.ar}
                    withAr
                    onName={(v) => setDraft({ ...draft, name: v })}
                    onAr={(v) => setDraft({ ...draft, ar: v })}
                    onSave={saveDraft}
                    onCancel={() => setDraft(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 bg-ink-50/80 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crown className="size-4 shrink-0 text-brand-600" strokeWidth={2.2} />
                    <span className="truncate text-[13px] font-extrabold text-ink-900">{h.name}</span>
                    {h.ar && h.ar !== h.name && (
                      <span className="truncate text-[11px] font-bold text-ink-400">{h.ar}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => startEdit('head', h.id, h.name, h.ar)}
                      aria-label={`تعديل اسم ${h.name}`}
                      title="تعديل الاسم"
                      className="grid size-7 place-items-center rounded-lg text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {heads.length > 2 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`حذف Head "${h.name}"؟ سيتم حذف مديريه وسيلز تيماته.`)) {
                            onDeleteHead(h.id);
                            toast('info', `تم حذف ${h.name}`);
                          }
                        }}
                        aria-label={`حذف ${h.name}`}
                        title="حذف"
                        className="grid size-7 place-items-center rounded-lg text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2 p-2.5">
                {hMgrs.map((m) => {
                  const mSales = sales.filter((s) => s.managerId === m.id && !s.isManager);
                  const editingManager = draft && draft.kind === 'manager' && draft.id === m.id;
                  return (
                    <div key={m.id} className="rounded-lg bg-ink-50/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        {editingManager && draft ? (
                          <NameEditor
                            label="تعديل اسم المدير والتيم"
                            name={draft.name}
                            ar={draft.ar}
                            withAr
                            onName={(v) => setDraft({ ...draft, name: v })}
                            onAr={(v) => setDraft({ ...draft, ar: v })}
                            onSave={saveDraft}
                            onCancel={() => setDraft(null)}
                          />
                        ) : (
                          <>
                            <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-extrabold text-ink-700">
                              <Users className="size-3.5 shrink-0 text-ink-400" />
                              <span className="truncate">تيم {m.name}</span>
                              {m.ar && m.ar !== m.name && (
                                <span className="truncate text-[11px] font-bold text-ink-400">{m.ar}</span>
                              )}
                            </span>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                onClick={() => startEdit('manager', m.id, m.name, m.ar)}
                                aria-label={`تعديل اسم تيم ${m.name}`}
                                title="تعديل الاسم"
                                className="grid size-6 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                              >
                                <Pencil className="size-3" />
                              </button>
                              {managers.length > 1 && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`حذف تيم "${m.name}" وسيلز التيم؟`)) {
                                      onDeleteManager(m.id);
                                      toast('info', `تم حذف تيم ${m.name}`);
                                    }
                                  }}
                                  aria-label={`حذف تيم ${m.name}`}
                                  title="حذف"
                                  className="grid size-6 shrink-0 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {mSales.map((s) => {
                          const editingSales = draft && draft.kind === 'sales' && draft.id === s.id;
                          if (editingSales && draft) {
                            return (
                              <div key={s.id} className="basis-full">
                                <NameEditor
                                  label={`تعديل اسم السيلز (تيم ${m.name})`}
                                  name={draft.name}
                                  ar=""
                                  onName={(v) => setDraft({ ...draft, name: v })}
                                  onSave={saveDraft}
                                  onCancel={() => setDraft(null)}
                                />
                              </div>
                            );
                          }
                          return (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-0.5 rounded-lg border border-ink-200 bg-white py-0.5 pe-0.5 ps-2 text-[11px] font-bold text-ink-700"
                            >
                              <span className="max-w-[10rem] truncate">{s.name}</span>
                              <button
                                onClick={() => startEdit('sales', s.id, s.name)}
                                aria-label={`تعديل اسم ${s.name}`}
                                title="تعديل الاسم"
                                className="grid size-5 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`حذف السيلز "${s.name}"؟`)) {
                                    onDeleteSales(s.id);
                                    toast('info', `تم حذف ${s.name}`);
                                  }
                                }}
                                aria-label={`حذف ${s.name}`}
                                title="حذف"
                                className="grid size-5 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          );
                        })}
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
  );
}
