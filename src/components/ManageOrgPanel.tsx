import { useState } from 'react';
import { Ban, Check, ChevronDown, Crown, MoreHorizontal, Network, Pencil, Plus, Search, Trash2, UserCheck, UserPlus, UserRound, Users, X } from 'lucide-react';
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
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'disabled'>('active');
  const [query, setQuery] = useState('');

  const isHiddenByDefault = (person: SalesPerson): boolean =>
    !isPersonDisabled(person, managers, heads) &&
    person.disabled === undefined &&
    isDefaultHiddenFromAttendance(person);

  const disabledSalesCount = sales.filter((s) => isPersonDisabled(s, managers, heads)).length;
  const hiddenSalesCount = sales.filter((s) => isHiddenByDefault(s)).length;
  const activeSalesCount = sales.length - disabledSalesCount - hiddenSalesCount;
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

  const matchesPerson = (person: SalesPerson) => {
    const inactive = isPersonDisabled(person, managers, heads) || isHiddenByDefault(person);
    return filterMode === 'all' || (filterMode === 'disabled' ? inactive : !inactive);
  };
  const term = query.trim().toLocaleLowerCase();
  const matchesText = (...values: (string | undefined)[]) => !term || values.some(v => v?.toLocaleLowerCase().includes(term));
  const editor = (label: string, withAr = false, withDetails = false, withPhone = false) => draft && (
    <NameEditor label={label} name={draft.name} ar={draft.ar} withAr={withAr} withDetails={withDetails} withPhone={withPhone}
      phone={draft.phone} shiftTime={draft.shiftTime} onName={v => setDraft({ ...draft, name: v })}
      onAr={v => setDraft({ ...draft, ar: v })} onPhone={v => setDraft({ ...draft, phone: v })}
      onShiftTime={v => setDraft({ ...draft, shiftTime: v })} onSave={saveDraft} onCancel={() => setDraft(null)} />
  );
  const actionClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-bold text-ink-700 hover:bg-ink-100';

  return (
    <section className="surface anim-fade-up p-4 sm:p-5">
      <SectionTitle title="الهيكل الحالي" subtitle={subtitle} icon={<Network className="size-4.5" strokeWidth={2.1} />} />
      <p className="mb-4 text-xs leading-relaxed text-ink-500">افتح الفريق لعرض أعضائه، واستخدم قائمة الخيارات للتعديل أو التعطيل أو الحذف. التغييرات تظهر في SITE و RESTA.</p>
      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl bg-ink-100 p-1">
        {[
          { id: 'all' as const, label: `الكل (${sales.length})` },
          { id: 'active' as const, label: `النشطون (${activeSalesCount})` },
          { id: 'disabled' as const, label: `المعطّلون (${inactiveFilterCount})` },
        ].map(item => (
          <button key={item.id} type="button" onClick={() => setFilterMode(item.id)} aria-pressed={filterMode === item.id}
            className={cn('rounded-lg px-1 py-2 text-[11px] font-extrabold transition sm:text-xs', filterMode === item.id ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-white')}>
            {item.label}
          </button>
        ))}
      </div>
      <label className="relative mb-5 block">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="البحث في الهيكل" placeholder="البحث عن عضو أو فريق أو Head..." className="field pr-9" />
      </label>
      <div className="space-y-6">
        {heads.map(h => {
          const headDisabled = isHeadDisabled(h);
          const headMatches = matchesText(h.name, h.ar);
          const teams = managers.filter(m => m.headId === h.id).map(m => {
            const teamDisabled = isTeamDisabled(m, sales, heads);
            const teamMatches = headMatches && !!term || matchesText(m.name, m.ar);
            const allMembers = sales.filter(s => s.managerId === m.id).sort((a, b) => Number(!!b.isManager) - Number(!!a.isManager));
            const members = allMembers.filter(s => matchesPerson(s) && (teamMatches || matchesText(s.name, s.phone)));
            const includeTeam = filterMode === 'all' || (filterMode === 'disabled' ? teamDisabled : !teamDisabled);
            return { m, teamDisabled, members, visible: members.length > 0 || (includeTeam && teamMatches) };
          }).filter(item => item.visible);
          const showHead = teams.length > 0 || ((filterMode === 'all' || (filterMode === 'disabled' ? headDisabled : !headDisabled)) && headMatches);
          if (!showHead) return null;
          return (
            <div key={h.id} className="space-y-3">
              {draft?.kind === 'head' && draft.id === h.id ? editor('تعديل اسم الـ Head', true) : (
                <div className="flex items-center gap-2 border-b border-ink-100 pb-2">
                  <Crown className="size-4 text-ink-400" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{h.name} <span className="text-xs text-ink-400">Head</span></p>{h.ar && h.ar !== h.name && <p className="text-xs text-ink-400">{h.ar}</p>}</div>
                  {headDisabled && <span className="rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-bold text-ink-500">معطّل</span>}
                  <details className="relative shrink-0">
                    <summary aria-label={`خيارات ${h.name}`} className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><MoreHorizontal className="size-5" /></summary>
                    <div className="absolute left-0 z-20 w-44 rounded-xl border border-ink-100 bg-white p-1 shadow-lg">
                      <button type="button" className={actionClass} onClick={() => { onToggleHeadDisabled(h.id, !headDisabled); toast('info', headDisabled ? `تم تفعيل ${h.name} وتيماته` : `تم تعطيل ${h.name} وتيماته`); }}>{headDisabled ? <UserCheck className="size-4" /> : <Ban className="size-4" />}{headDisabled ? 'تفعيل الـ Head' : 'تعطيل الـ Head'}</button>
                      <button type="button" className={actionClass} onClick={() => startEdit('head', h.id, h.name, h.ar)}><Pencil className="size-4" />تعديل</button>
                      {heads.length > 2 && <button type="button" className={actionClass} onClick={() => { if (window.confirm(`حذف Head "${h.name}"؟ سيتم حذف مديريه وسيلز تيماته.`)) { onDeleteHead(h.id); toast('info', `تم حذف ${h.name}`); } }}><Trash2 className="size-4" />حذف</button>}
                    </div>
                  </details>
                </div>
              )}
              <div className="space-y-3">
                {teams.map(({ m, teamDisabled, members }) => (
                  <details key={`${m.id}-${term ? 'search' : 'normal'}`} open={term ? true : undefined} className="group rounded-2xl border border-ink-200 bg-white shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3.5 hover:bg-ink-50" aria-label={`فتح أو إغلاق تيم ${m.name}`}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-500"><Users className="size-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">تيم {m.name}</span><span className="block text-[11px] text-ink-400">{members.length} أعضاء ظاهرين{teamDisabled ? ' · معطّل' : ''}</span></span>
                      <ChevronDown className="size-4 shrink-0 text-ink-400 transition group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 border-t border-ink-100 p-3">
                      {draft?.kind === 'manager' && draft.id === m.id ? editor('تعديل بيانات الفريق والمدير', true, false, true) : (
                        <details className="relative">
                          <summary className="w-fit cursor-pointer list-none rounded-lg bg-ink-50 px-3 py-2 text-xs font-bold text-ink-600">خيارات الفريق ···</summary>
                          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-ink-100 bg-white p-1 shadow-lg">
                            {headDisabled && <p className="px-3 py-2 text-[11px] text-ink-500">فعّل الـ Head أولاً لتفعيل الفريق</p>}
                            <button type="button" disabled={headDisabled} className={cn(actionClass, headDisabled && 'opacity-50')} onClick={() => { onToggleManagerDisabled(m.id, !teamDisabled); toast('info', teamDisabled ? `تم تفعيل تيم ${m.name}` : `تم تعطيل تيم ${m.name}`); }}>{teamDisabled ? <UserCheck className="size-4" /> : <Ban className="size-4" />}{teamDisabled ? 'تفعيل الفريق' : 'تعطيل الفريق'}</button>
                            <button type="button" className={actionClass} onClick={() => startEdit('manager', m.id, m.name, m.ar, m.phone ?? '')}><Pencil className="size-4" />تعديل الفريق</button>
                            {managers.length > 1 && <button type="button" className={actionClass} onClick={() => { if (window.confirm(`حذف تيم "${m.name}" وسيلز التيم؟`)) { onDeleteManager(m.id); toast('info', `تم حذف تيم ${m.name}`); } }}><Trash2 className="size-4" />حذف الفريق</button>}
                          </div>
                        </details>
                      )}
                      {members.map(s => {
                        const disabled = isPersonDisabled(s, managers, heads);
                        const hidden = isHiddenByDefault(s);
                        if (draft?.kind === 'sales' && draft.id === s.id) return <div key={s.id}>{editor(`تعديل بيانات ${s.name}`, false, true)}</div>;
                        return (
                          <div key={s.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-400"><UserRound className="size-5" /></span>
                            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="break-words text-sm font-extrabold">{s.name}</span>{s.isManager && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">مدير</span>}</div><p dir="ltr" className="mt-1 text-right text-xs text-ink-400">{s.phone || (s.isManager ? m.phone : '') || 'لا يوجد رقم هاتف'}</p></div>
                            <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', disabled || hidden ? 'bg-ink-100 text-ink-500' : 'bg-emerald-50 text-emerald-700')}>{disabled ? 'معطّل' : hidden ? 'مخفي من الحضور' : 'نشط'}</span>
                            <details className="relative shrink-0">
                              <summary aria-label={`خيارات ${s.name}`} className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><MoreHorizontal className="size-5" /></summary>
                              <div className="absolute left-0 z-20 w-44 rounded-xl border border-ink-100 bg-white p-1 shadow-lg">
                                {(disabled || hidden) && (headDisabled || teamDisabled) && <p className="px-3 py-2 text-[11px] text-ink-500">فعّل {headDisabled ? 'الـ Head' : 'الفريق'} أولاً</p>}
                                {(disabled || hidden) && !headDisabled && !teamDisabled && <button type="button" className={actionClass} onClick={() => { onToggleSalesDisabled(s.id, false); toast('success', `تم تفعيل ${s.name}`); }}><UserCheck className="size-4" />تفعيل</button>}
                                {!disabled && <button type="button" className={actionClass} onClick={() => { onToggleSalesDisabled(s.id, true); toast('info', `تم تعطيل ${s.name}`); }}><Ban className="size-4" />تعطيل</button>}
                                <button type="button" className={actionClass} onClick={() => startEdit('sales', s.id, s.name, '', s.phone ?? (s.isManager ? m.phone : '') ?? '', s.shiftTime || '10:00')}><Pencil className="size-4" />تعديل</button>
                                {!s.isManager && <button type="button" className={actionClass} onClick={() => { if (window.confirm(`حذف السيلز "${s.name}"؟`)) { onDeleteSales(s.id); toast('info', `تم حذف ${s.name}`); } }}><Trash2 className="size-4" />حذف</button>}
                              </div>
                            </details>
                          </div>
                        );
                      })}
                      {members.length === 0 && <p className="py-2 text-center text-xs text-ink-400">لا يوجد أعضاء مطابقون للعرض الحالي</p>}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
