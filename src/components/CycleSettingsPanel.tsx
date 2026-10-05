// ─── Amer Group · «طريقة ترتيب الأدوار» — in-app rotation settings ───
//
// Replaces the hard-coded team cycle: the manager picks the mode (the built-in
// fixed order, or a custom order) and arranges the teams right here in the
// «الترتيب» tab, so a newly joined manager/sales/head never requires a code
// change. The choice is part of the SHARED org chart, so SITE and RESTA always
// rotate with the same order.

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Info, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import type { HeadGroup, ManagerTeam, TeamCycleSettings } from '../lib/walkin';
import { teamOrderFrom } from '../lib/walkin';
import { SectionTitle } from './ui';
import { cn } from '../utils/cn';

interface CycleSettingsPanelProps {
  managers: ManagerTeam[];
  heads: HeadGroup[];
  /** The saved settings (shared by SITE & RESTA). */
  settings: TeamCycleSettings;
  /** Persist the new settings and publish them to the other branch. */
  onChange: (next: TeamCycleSettings) => void;
}

export function CycleSettingsPanel({ managers, heads, settings, onChange }: CycleSettingsPanelProps) {
  const isCustom = settings.mode === 'custom';
  const headName = (headId: string): string =>
    heads.find((h) => h.id === headId)?.name ?? headId;

  // الدورة الفعّالة الآن — نفس القائمة التي يشتغل بها محرّك التناوب.
  const effective = teamOrderFrom(managers, undefined, settings);
  const inCycleIds = new Set(effective.map((t) => t.id));
  // الوضع المخصص: الترتيب المحفوظ مطابقاً بالهيكل الحالي (بالتيمات المحذوفة تُتجاهل).
  const customTeams = settings.order
    .map((id) => managers.find((m) => m.id === id))
    .filter((m): m is ManagerTeam => Boolean(m));
  // تيمات خارج الدورة: أي مدير موجود في الهيكل ولسه مش داخل التناوب.
  const outside = managers.filter((m) => !inCycleIds.has(m.id));

  const knownOrder = (): string[] =>
    settings.order.filter((id) => managers.some((m) => m.id === id));

  /** تبديل التيم مكانه في الترتيب المحفوظ (الوضع المخصص). */
  const move = (index: number, dir: -1 | 1): void => {
    const to = index + dir;
    const ids = knownOrder();
    if (to < 0 || to >= ids.length) return;
    const [item] = ids.splice(index, 1);
    ids.splice(to, 0, item);
    onChange({ mode: 'custom', order: ids });
  };

  /** إضافة تيم للدورة: في التلقائي تتحوّل الدورة لوضع مخصص بنفس الترتيب الحالي + التيم الجديد. */
  const addToCycle = (id: string): void => {
    if (isCustom) {
      onChange({ mode: 'custom', order: [...knownOrder(), id] });
      return;
    }
    onChange({ mode: 'custom', order: [...effective.map((t) => t.id), id] });
  };

  const removeFromCycle = (id: string): void => {
    onChange({ mode: 'custom', order: knownOrder().filter((x) => x !== id) });
  };

  const setMode = (mode: TeamCycleSettings['mode']): void => {
    if (mode === settings.mode) return;
    // أول تحويل للتخصيص يبدأ بنفس الترتيب الفعّال — مفيش أي قفزة مفاجئة.
    onChange(
      mode === 'custom'
        ? { mode: 'custom', order: effective.map((t) => t.id) }
        : { mode: 'auto', order: settings.order },
    );
  };

  const modeCard = (
    mode: TeamCycleSettings['mode'],
    title: string,
    description: string,
  ): ReactNode => {
    const active = settings.mode === mode;
    return (
      <button
        type="button"
        onClick={() => setMode(mode)}
        aria-pressed={active}
        className={cn(
          'rounded-xl border-2 p-3 text-right transition',
          active
            ? 'border-brand-600 bg-brand-50/70 shadow-[0_4px_12px_-6px_rgba(227,6,19,0.35)]'
            : 'border-ink-100 bg-white hover:border-ink-200',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={cn('text-[13.5px] font-extrabold', active ? 'text-brand-700' : 'text-ink-900')}>
            {title}
          </span>
          <span
            className={cn(
              'grid size-5 shrink-0 place-items-center rounded-full border-2 transition',
              active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-transparent',
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        </span>
        <span className={cn('mt-1 block text-[11px] font-semibold leading-relaxed', active ? 'text-brand-700/80' : 'text-ink-400')}>
          {description}
        </span>
      </button>
    );
  };

  const teamRow = (team: ManagerTeam, index: number, total: number, editable: boolean) => (
    <div
      key={team.id}
      className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2"
    >
      <span className="tnum grid size-7 shrink-0 place-items-center rounded-lg bg-ink-100 text-[12px] font-black text-ink-500">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-extrabold text-ink-900">{team.name}</p>
        <p className="truncate text-[10.5px] font-semibold text-ink-400">{headName(team.headId)}</p>
      </div>
      {editable ? (
        <>
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`تقديم تيم ${team.name}`}
              title="تقديم في الترتيب"
              className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-25"
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index >= total - 1}
              aria-label={`تأخير تيم ${team.name}`}
              title="تأخير في الترتيب"
              className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-25"
            >
              <ArrowDown className="size-4" strokeWidth={2.4} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeFromCycle(team.id)}
            disabled={total <= 1}
            title={total <= 1 ? 'لا يمكن إزالة آخر تيم — ارجع للدورة التلقائية بدلاً من ذلك' : 'إخراج من الدورة'}
            aria-label={`إخراج تيم ${team.name} من الدورة`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-300"
          >
            <X className="size-4" strokeWidth={2.4} />
          </button>
        </>
      ) : (
        <span className="shrink-0 rounded-lg bg-ink-50 px-2 py-1 text-[10px] font-bold text-ink-400">ثابت</span>
      )}
    </div>
  );

  return (
    <div>
      <SectionTitle
        title="طريقة ترتيب الأدوار"
        subtitle="حدّد التيمات الداخلة في التناوب وترتيبها — من داخل التطبيق بدل تعديل الكود"
        icon={<Settings2 className="size-4.5" strokeWidth={2.1} />}
        action={
          isCustom ? (
            <button
              onClick={() => setMode('auto')}
              className="btn btn-ghost px-2.5 py-1.5 text-[12px] text-ink-400"
              title="إلغاء التخصيص والعودة للترتيب المدمج"
            >
              <RotateCcw className="size-3.5" />
              ترتيب تلقائي
            </button>
          ) : undefined
        }
      />

      {/* اختيار طريقة الترتيب */}
      <div className="grid gap-2 sm:grid-cols-2">
        {modeCard(
          'auto',
          'الدورة التلقائية',
          'نفس الترتيب الثابت المدمج في التطبيق — التيمات الجديدة لا تدخل الدورة تلقائياً.',
        )}
        {modeCard(
          'custom',
          'دورة مخصّصة',
          'ترتيب من اختيارك: أضف أي تيم للدورة ورتّبه بالأسهم — التيمات الجديدة تظهر تحت لتضيفها.',
        )}
      </div>

      {/* قائمة الدورة */}
      <div className="mt-3 space-y-1.5">
        <p className="text-[11px] font-extrabold text-ink-400">
          الدورة الحالية ({effective.length} تيم)
          {isCustom ? ' — رتّبها بالأسهم أو أخرج أي تيم' : ' — ثابتة حسب الترتيب المدمج'}
        </p>
        {isCustom
          ? customTeams.map((team, i) => teamRow(team, i, customTeams.length, true))
          : effective.map((team, i) => teamRow(team, i, effective.length, false))}
        {isCustom && customTeams.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] font-bold leading-relaxed text-amber-700">
            لا يوجد تيمات في الدورة — أضف تيمات من «تيمات خارج الدورة» تحت، أو ارجع للدورة التلقائية.
          </div>
        )}
      </div>

      {/* تيمات خارج الدورة */}
      {outside.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-3">
          <p className="text-[11px] font-extrabold text-ink-500">تيمات خارج الدورة</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-ink-400">
            أي مدير جديد يُضاف من تبويب «الهيكل» يظهر هنا — اضغط عليه ليدخل التناوب.
            {isCustom ? '' : ' الإضافة هتحوّل الدورة لوضع مخصّص بنفس الترتيب الحالي.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {outside.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addToCycle(m.id)}
                title={`إضافة تيم ${m.name} للدورة`}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
              >
                <Plus className="size-3.5" strokeWidth={2.6} />
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* معاينة الدورة الفعّالة */}
      {effective.length > 0 && (
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2.5">
          <p dir="ltr" className="text-center text-[12px] font-bold leading-relaxed text-ink-600">
            {effective.map((t) => t.name).join(' → ')} → …
          </p>
        </div>
      )}

      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-ink-400">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        الإعداد مشترك بين الفرعين SITE وRESTA — أي تغيير هنا يصل لباقي الأجهزة تلقائياً. والسيلز يُختار
        يدوياً من التيم عند دوره كما هو.
      </p>
    </div>
  );
}
