import { useState } from 'react';
import { Ban, Check, Crown, Network, Pencil, Plus, RotateCcw, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import type { HeadGroup, ManagerTeam, SalesPerson } from '../lib/walkin';
import { isHeadDisabled, isPersonDisabled, isTeamDisabled } from '../lib/walkin';
import { isDefaultHiddenFromAttendance } from '../lib/attendanceVisibility';
import { SectionTitle, useToast } from './ui';
import { cn } from '../utils/cn';

interface AddProps {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  onAddHead: (name: string, ar?: string) => void;
  onAddManager: (name: string, headId: string, ar?: string, phone?: string) => void;
  onAddSales: (name: string, managerId: string, headId: string, phone?: string) => void;
}

interface Props {
  heads: HeadGroup[];
  managers: ManagerTeam[];
  sales: SalesPerson[];
  onRenameHead: (id: string, name: string, ar?: string) => void;
  onRenameManager: (id: string, name: string, ar?: string) => void;
  onRenameSales: (id: string, name: string) => void;
  onUpdateSalesDetails: (id: string, phone: string, shiftTime: string) => void;
  onUpdateManagerDetails: (id: string, phone: string) => void;
  onToggleHeadDisabled: (id: string, disabled: boolean) => void;
  onToggleManagerDisabled: (id: string, disabled: boolean) => void;
  onToggleSalesDisabled: (id: string, disabled: boolean) => void;
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
  phone: string;
  shiftTime: string;
}

/** Compact rename form — edits the name in place instead of deleting + re-adding. */
function NameEditor({
  label,
  name,
  ar,
  withAr,
  withDetails,
  withPhone,
  phone,
  shiftTime,
  onName,
  onAr,
  onPhone,
  onShiftTime,
  onSave,
  onCancel,
}: {
  label: string;
  name: string;
  ar: string;
  withAr?: boolean;
  withDetails?: boolean;
  /** Just the mobile field (used for a manager's own number). */
  withPhone?: boolean;
  phone?: string;
  shiftTime?: string;
  onName: (value: string) => void;
  onAr?: (value: string) => void;
  onPhone?: (value: string) => void;
  onShiftTime?: (value: string) => void;
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
      {withPhone && !withDetails && (
        <input
          dir="ltr"
          type="tel"
          value={phone ?? ''}
          onChange={(e) => onPhone?.(e.target.value)}
          placeholder="رقم موبايل المدير (اختياري)"
          aria-label="رقم موبايل المدير"
          className="field"
          style={compactField}
        />
      )}
      {withDetails && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            dir="ltr"
            type="tel"
            value={phone ?? ''}
            onChange={(e) => onPhone?.(e.target.value)}
            placeholder="رقم الموبايل"
            aria-label="رقم الموبايل"
            className="field"
            style={compactField}
          />
          <label className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-2.5">
            <span className="shrink-0 text-[11px] font-bold text-ink-400">ميعاد الشيفت</span>
            <input
              dir="ltr"
              type="time"
              value={shiftTime || '10:00'}
              onChange={(e) => onShiftTime?.(e.target.value)}
              aria-label="ميعاد الشيفت"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
            />
          </label>
        </div>
      )}
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
export function AddMemberPanel({ heads, managers, sales, onAddHead, onAddManager, onAddSales }: AddProps) {
  const toast = useToast();
  const [mode, setMode] = useState<Kind>('sales');

  const [headName, setHeadName] = useState('');
  const [headAr, setHeadAr] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [mgrHeadId, setMgrHeadId] = useState(heads.find((h) => !h.disabled)?.id || heads[0]?.id || '');
  const [mgrAr, setMgrAr] = useState('');
  const [salesName, setSalesName] = useState('');
  const [salesPhone, setSalesPhone] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [salesMgrId, setSalesMgrId] = useState(
    managers.find((m) => !isTeamDisabled(m, sales, heads))?.id || managers[0]?.id || '',
  );


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
    onAddManager(mgrName.trim(), mgrHeadId, mgrAr.trim(), managerPhone.trim());
    toast('success', `تمت إضافة المدير: ${mgrName.trim()}`);
    setMgrName('');
    setMgrAr('');
    setManagerPhone('');
  };

  const handleAddSales = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName.trim() || !salesMgrId) return;
    const mgr = managers.find((m) => m.id === salesMgrId);
    if (!mgr) return;
    onAddSales(salesName.trim(), mgr.id, mgr.headId, salesPhone.trim());
    toast('success', `تمت إضافة السيلز: ${salesName.trim()}`);
    setSalesName('');
    setSalesPhone('');
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
          subtitle="أدخل رقم الموبايل؛ الشيفت الافتراضي 10:00 ويمكن تعديله من بيانات العضو"
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
              <label className="field-label">رقم الموبايل (اختياري)</label>
              <input dir="ltr" type="tel" value={salesPhone} onChange={(e) => setSalesPhone(e.target.value)} placeholder="01xxxxxxxxx" className="field" />
            </div>
            <div>
              <label className="field-label">يتبع تيم المدير</label>
              <select value={salesMgrId} onChange={(e) => setSalesMgrId(e.target.value)} className="field">
                {managers.map((m) => {
                  const h = heads.find((x) => x.id === m.headId);
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name} {h ? `(${h.name})` : ''}{isTeamDisabled(m, sales, heads) ? ' — معطّل' : ''}
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
              <label className="field-label">رقم الموبايل (اختياري)</label>
              <input dir="ltr" type="tel" value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="01xxxxxxxxx" className="field" />
            </div>
            <div>
              <label className="field-label">يتبع Head Manager</label>
              <select value={mgrHeadId} onChange={(e) => setMgrHeadId(e.target.value)} className="field">
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}{h.disabled ? ' — معطّل' : ''}
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
  onUpdateSalesDetails,
  onUpdateManagerDetails,
  onToggleHeadDisabled,
  onToggleManagerDisabled,
  onToggleSalesDisabled,
  onDeleteHead,
  onDeleteManager,
  onDeleteSales,
}: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'disabled'>('all');

  const isHiddenByDefault = (person: SalesPerson): boolean =>
    !isPersonDisabled(person, managers, heads) &&
    person.disabled === undefined &&
    isDefaultHiddenFromAttendance(person);

  const disabledSalesCount = sales.filter((s) => isPersonDisabled(s, managers, heads)).length;
  const hiddenSalesCount = sales.filter((s) => isHiddenByDefault(s)).length;
  const activeSalesCount = sales.length - disabledSalesCount;
  const inactiveFilterCount = disabledSalesCount + hiddenSalesCount;

  const startEdit = (kind: Kind, id: string, name: string, ar = '', phone = '', shiftTime = '10:00') => {
    setDraft({ kind, id, name, ar, phone, shiftTime });
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
      onUpdateManagerDetails(draft.id, draft.phone.trim());
      toast('success', `تم تعديل بيانات المدير ${name}`);
    } else {
      onRenameSales(draft.id, name);
      onUpdateSalesDetails(draft.id, draft.phone.trim(), draft.shiftTime || '10:00');
      toast('success', `تم تعديل بيانات ${name}`);
    }
    setDraft(null);
  };

  const subtitle =
    disabledSalesCount > 0
      ? `${heads.length} Heads · ${managers.length} تيمات · ${activeSalesCount} نشط · ${disabledSalesCount} معطّل`
      : `${heads.length} Heads · ${managers.length} تيمات · ${sales.length} أفراد`;

  return (
    <section className="surface anim-fade-up p-4">
      <SectionTitle
        title="الهيكل الحالي"
        subtitle={subtitle}
        icon={<Network className="size-4.5" strokeWidth={2.1} />}
      />

      <p className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-emerald-700">
        <Pencil className="mt-0.5 size-3.5 shrink-0" />
        <span>
          للتعديل اضغط أيقونة القلم بجانب الاسم، ولإخفاء أي شخص مؤقتاً من الحضور والأدوار والتطبيق بالكامل بدون حذف
          بياناته اضغط «تعطيل» — وعند الضغط على «تفعيل» يظهر اسمه في الحضور ويمتلك كل الصلاحيات، والتحديث يظهر في الفرعين
          SITE و RESTA.
        </span>
      </p>

      {/* فلتر سريع لعرض الكل أو النشطين أو المعطّلين */}
      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-xl bg-ink-100 p-1">
        {[
          { id: 'all' as const, label: `الكل (${sales.length})` },
          { id: 'active' as const, label: `النشطون (${activeSalesCount})` },
          { id: 'disabled' as const, label: `المعطّلون (${inactiveFilterCount})` },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilterMode(item.id)}
            aria-pressed={filterMode === item.id}
            className={cn(
              'rounded-lg py-1.5 text-[11.5px] font-extrabold transition',
              filterMode === item.id
                ? 'bg-brand-600 text-white shadow-[0_3px_8px_-2px_rgba(227,6,19,0.45)]'
                : 'text-ink-500 hover:bg-white hover:text-ink-900',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {heads.map((h) => {
          const headDisabled = isHeadDisabled(h);
          const hMgrs = managers.filter((m) => m.headId === h.id);
          const matchesFilter = (s: SalesPerson) => {
            const off = isPersonDisabled(s, managers, heads) || isHiddenByDefault(s);
            if (filterMode === 'disabled') return off;
            if (filterMode === 'active') return !isPersonDisabled(s, managers, heads);
            return true;
          };
          const headHasMatchingContent =
            filterMode === 'all' ||
            (filterMode === 'disabled' &&
              (headDisabled ||
                hMgrs.some(
                  (m) =>
                    isTeamDisabled(m, sales, heads) ||
                    sales.some((s) => s.managerId === m.id && matchesFilter(s)),
                ))) ||
            (filterMode === 'active' &&
              !headDisabled &&
              hMgrs.some(
                (m) =>
                  !isTeamDisabled(m, sales, heads) ||
                  sales.some((s) => s.managerId === m.id && matchesFilter(s)),
              ));

          if (!headHasMatchingContent) return null;

          return (
            <div
              key={h.id}
              className={cn(
                'overflow-hidden rounded-xl border transition',
                headDisabled ? 'border-dashed border-ink-300 bg-ink-50/40' : 'border-ink-100',
              )}
            >
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
                    <Crown
                      className={cn('size-4 shrink-0', headDisabled ? 'text-ink-400' : 'text-brand-600')}
                      strokeWidth={2.2}
                    />
                    <span
                      className={cn(
                        'truncate text-[13px] font-extrabold',
                        headDisabled ? 'text-ink-400 line-through' : 'text-ink-900',
                      )}
                    >
                      {h.name}
                    </span>
                    {h.ar && h.ar !== h.name && (
                      <span className="truncate text-[11px] font-bold text-ink-400">{h.ar}</span>
                    )}
                    {headDisabled && (
                      <span className="shrink-0 rounded bg-ink-200 px-1.5 py-0.5 text-[9.5px] font-extrabold text-ink-600">
                        معطّل
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {headDisabled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleHeadDisabled(h.id, false);
                          toast('success', `تم تفعيل ${h.name} وتيماته واستعاد كامل الصلاحيات`);
                        }}
                        aria-label={`تفعيل ${h.name}`}
                        title="تفعيل الـ Head وتيماته"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10.5px] font-extrabold text-white transition hover:bg-emerald-700"
                      >
                        <UserCheck className="size-3" />
                        تفعيل
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleHeadDisabled(h.id, true);
                          toast('info', `تم تعطيل ${h.name} وتيماته بالكامل`);
                        }}
                        aria-label={`تعطيل ${h.name}`}
                        title="تعطيل الـ Head وتيماته مؤقتاً"
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[10.5px] font-extrabold text-ink-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                      >
                        <Ban className="size-3" />
                        تعطيل
                      </button>
                    )}
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
                  const teamDisabled = isTeamDisabled(m, sales, heads);
                  // The manager has his own attendance row (`isManager`) — it is
                  // edited and toggled just like any sales row, phone number included.
                  const mManager = sales.filter((s) => s.isManager && s.managerId === m.id);
                  const mSales = sales.filter((s) => s.managerId === m.id && !s.isManager);
                  const mTeamAll = [...mManager, ...mSales];
                  const mTeam = filterMode === 'all' ? mTeamAll : mTeamAll.filter(matchesFilter);
                  if (filterMode === 'disabled' && !teamDisabled && mTeam.length === 0) return null;
                  if (filterMode === 'active' && teamDisabled && mTeam.length === 0) return null;

                  const editingManager = draft && draft.kind === 'manager' && draft.id === m.id;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'rounded-lg p-2.5 transition',
                        teamDisabled
                          ? 'border border-dashed border-ink-300 bg-ink-100/60'
                          : 'bg-ink-50/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {editingManager && draft ? (
                          <NameEditor
                            label="تعديل اسم المدير وتيم، ورقمه"
                            name={draft.name}
                            ar={draft.ar}
                            withAr
                            withPhone
                            phone={draft.phone}
                            onName={(v) => setDraft({ ...draft, name: v })}
                            onAr={(v) => setDraft({ ...draft, ar: v })}
                            onPhone={(v) => setDraft({ ...draft, phone: v })}
                            onSave={saveDraft}
                            onCancel={() => setDraft(null)}
                          />
                        ) : (
                          <>
                            <span
                              className={cn(
                                'flex min-w-0 items-center gap-1.5 text-[12px] font-extrabold',
                                teamDisabled ? 'text-ink-400' : 'text-ink-700',
                              )}
                            >
                              <Users className="size-3.5 shrink-0 text-ink-400" />
                              <span className={cn('truncate', teamDisabled && 'line-through')}>
                                تيم {m.name}
                              </span>
                              {m.ar && m.ar !== m.name && (
                                <span className="truncate text-[11px] font-bold text-ink-400">{m.ar}</span>
                              )}
                              {m.phone && (
                                <span dir="ltr" className="tnum shrink-0 text-[10.5px] font-bold text-ink-400">
                                  {m.phone}
                                </span>
                              )}
                              {teamDisabled && (
                                <span className="shrink-0 rounded bg-ink-200 px-1.5 py-0.5 text-[9.5px] font-extrabold text-ink-600">
                                  معطّل
                                </span>
                              )}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {teamDisabled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleManagerDisabled(m.id, false);
                                    toast('success', `تم تفعيل تيم ${m.name} واستعاد كامل الصلاحيات`);
                                  }}
                                  aria-label={`تفعيل تيم ${m.name}`}
                                  title="تفعيل التيم بالكامل"
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white transition hover:bg-emerald-700"
                                >
                                  <UserCheck className="size-2.5" />
                                  تفعيل التيم
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleManagerDisabled(m.id, true);
                                    toast('info', `تم تعطيل تيم ${m.name} بالكامل`);
                                  }}
                                  aria-label={`تعطيل تيم ${m.name}`}
                                  title="تعطيل التيم بالكامل مؤقتاً"
                                  className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-ink-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                                >
                                  <Ban className="size-2.5" />
                                  تعطيل التيم
                                </button>
                              )}
                              <button
                                onClick={() => startEdit('manager', m.id, m.name, m.ar, m.phone ?? '')}
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
                        {mTeam.map((s) => {
                          const editingSales = draft && draft.kind === 'sales' && draft.id === s.id;
                          const personDisabled = isPersonDisabled(s, managers, heads);
                          const hiddenByDefault = isHiddenByDefault(s);
                          if (editingSales && draft) {
                            return (
                              <div key={s.id} className="basis-full">
                                <NameEditor
                                  label={`تعديل بيانات ${s.isManager ? 'المدير' : 'السيلز'} (تيم ${m.name})`}
                                  name={draft.name}
                                  ar=""
                                  withDetails
                                  phone={draft.phone}
                                  shiftTime={draft.shiftTime}
                                  onName={(v) => setDraft({ ...draft, name: v })}
                                  onPhone={(v) => setDraft({ ...draft, phone: v })}
                                  onShiftTime={(v) => setDraft({ ...draft, shiftTime: v })}
                                  onSave={saveDraft}
                                  onCancel={() => setDraft(null)}
                                />
                              </div>
                            );
                          }
                          return (
                            <span
                              key={s.id}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-lg border py-0.5 pe-1 ps-2 text-[11px] font-bold transition',
                                personDisabled
                                  ? 'border-dashed border-ink-300 bg-ink-100/80 text-ink-400'
                                  : hiddenByDefault
                                    ? 'border-amber-200 bg-amber-50/60 text-ink-700'
                                    : 'border-ink-200 bg-white text-ink-700',
                              )}
                            >
                              <span
                                className={cn(
                                  'max-w-[10rem] truncate',
                                  personDisabled && 'line-through decoration-ink-400',
                                )}
                              >
                                {s.name}
                              </span>
                              {s.isManager && (
                                <span
                                  className={cn(
                                    'shrink-0 rounded px-1 text-[9px] font-extrabold',
                                    personDisabled
                                      ? 'bg-ink-200 text-ink-500'
                                      : 'bg-brand-50 text-brand-600',
                                  )}
                                >
                                  مدير
                                </span>
                              )}
                              {personDisabled && (
                                <span className="shrink-0 rounded bg-ink-200 px-1 text-[9px] font-extrabold text-ink-600">
                                  معطّل
                                </span>
                              )}
                              {hiddenByDefault && (
                                <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-extrabold text-amber-800">
                                  مخفي من الحضور
                                </span>
                              )}

                              {personDisabled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleSalesDisabled(s.id, false);
                                    toast(
                                      'success',
                                      `تم تفعيل ${s.name} — ظهر اسمه في الحضور ويمتلك كل الصلاحيات`,
                                    );
                                  }}
                                  aria-label={`تفعيل ${s.name}`}
                                  title="تفعيل الشخص — سيظهر اسمه في الحضور ويمتلك كل الصلاحيات"
                                  className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white transition hover:bg-emerald-700"
                                >
                                  <RotateCcw className="size-2.5" />
                                  تفعيل
                                </button>
                              ) : (
                                <>
                                  {hiddenByDefault && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onToggleSalesDisabled(s.id, false);
                                        toast(
                                          'success',
                                          `تم تفعيل ${s.name} — ظهر اسمه في الحضور ويمتلك كل الصلاحيات`,
                                        );
                                      }}
                                      aria-label={`تفعيل ${s.name}`}
                                      title="إظهار الاسم في الحضور وتفعيل كل الصلاحيات"
                                      className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white transition hover:bg-emerald-700"
                                    >
                                      <UserCheck className="size-2.5" />
                                      تفعيل
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onToggleSalesDisabled(s.id, true);
                                      toast(
                                        'info',
                                        `تم تعطيل ${s.name} — أُخفي من الحضور والأدوار والتطبيق بالكامل`,
                                      );
                                    }}
                                    aria-label={`تعطيل ${s.name}`}
                                    title="تعطيل الشخص مؤقتاً — سيختفي من التطبيق بالكامل مع حفظ بياناته"
                                    className="inline-flex items-center gap-0.5 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-extrabold text-ink-500 transition hover:bg-amber-100 hover:text-amber-800"
                                  >
                                    <Ban className="size-2.5" />
                                    تعطيل
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() =>
                                  startEdit('sales', s.id, s.name, '', s.phone ?? m.phone ?? '', s.shiftTime || '10:00')
                                }
                                aria-label={`تعديل بيانات ${s.name}`}
                                title={s.isManager ? 'تعديل الاسم والرقم والشيفت' : 'تعديل الاسم والرقم'}
                                className="grid size-5 place-items-center rounded-md text-ink-300 transition hover:bg-brand-50 hover:text-brand-600"
                              >
                                <Pencil className="size-3" />
                              </button>
                              {!s.isManager && (
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
                              )}
                            </span>
                          );
                        })}
                        {mSales.length === 0 && filterMode === 'all' && (
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
