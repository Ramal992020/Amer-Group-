import { useState } from 'react';
import { CheckCircle2, Copy, Check, ArrowLeft, User, UserX, Users, Crown } from 'lucide-react';
import { formatTime } from '../lib/walkin';
import type { Assignment, ShiftedSalesInfo, VisitType } from '../lib/walkin';
import { Modal } from './ui';

interface Props {
  assignment: Assignment;
  /**
   * The LITERAL next team in the cycle — even when nobody from it attended.
   * No sales name is proposed (the sales is picked manually when the turn comes).
   */
  next: { managerName: string } | null;
  /**
   * On-turn members skipped AUTOMATICALLY because their status mark was busy or
   * absent — one «Shiffted ❌» line each (see `shiftedSalesFor`).
   */
  shifted?: ShiftedSalesInfo[];
  onClose: () => void;
}

/** «Walk in (الفرع)» — the branch the visit happened at. */
function visitHeadline(visit: VisitType): string {
  if (visit === 'site') return 'Walk in (Site)';
  if (visit === 'resta') return 'Walk in (Resta)';
  return 'Walk in';
}

/**
 * The statement that gets copied — ONE source for both the clipboard and the
 * tests. Order: the branch line, the AUTOMATIC «Shiffted ❌» lines (every
 * busy / لم يحضر member of the team on turn), the sales who served, Manager,
 * Head, then «Next» — the literal next team in the cycle.
 */
export function statementText(
  assignment: Assignment,
  next: { managerName: string } | null,
  shifted: ShiftedSalesInfo[] = [],
): string {
  const lines = [`${visitHeadline(assignment.visitType ?? 'walkin')} Done ✅`];
  shifted.forEach((s) => lines.push(`Sales : ${s.name} Shiffted ❌`));
  lines.push(`Sales : ${assignment.salesName} Done✅`);
  lines.push(`Manager : ${assignment.managerName}`);
  lines.push(`Head : ${assignment.headName}`);
  lines.push(`Next : ${next ? `تيم ${next.managerName}` : '—'}`);
  return lines.join('\n');
}

export function DoneReceipt({ assignment, next, shifted = [], onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const visit = assignment.visitType ?? 'walkin';
  const title = `${visitHeadline(visit)} Done ✅`;

  // البيان المطلوب: الفرع، ثم سطر «Sales : … Shiffted ❌» لكل سيلز مشغول / لم
  // يحضر من تيم الدور (تلقائي من علامة الحالة)، ثم السيلز اللي أخد العميل
  // (Done ✅)، المدير، الهيد، ثم «Next» — اللي عليه الدور في الدورة عامة حتى لو
  // لم يحضر.
  const text = statementText(assignment, next, shifted);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
      <span className="w-[96px] shrink-0 whitespace-nowrap text-[13px] font-bold text-ink-400">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] font-extrabold text-ink-900">{children}</span>
    </div>
  );

  return (
    <Modal open onClose={onClose} maxWidth="max-w-md">
      <div className="p-5" dir="ltr">
        {/* header */}
        <div className="flex items-center gap-3 text-left">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-7" strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[19px] font-black leading-tight text-ink-900">{title}</h2>
            <p className="tnum mt-0.5 text-[11px] font-semibold text-ink-400">
              Client #{assignment.n} • {formatTime(assignment.time)}
              {assignment.clientLabel ? ` • ${assignment.clientLabel}` : ''}
            </p>
          </div>
        </div>

        {/* shifted — on-turn members who were skipped (busy / absent) */}
        {shifted.length > 0 && (
          <div className="mt-4 space-y-2.5 rounded-2xl border border-red-100 bg-red-50/60 p-4 text-left">
            {shifted.map((s) => (
              <Row key={s.id} icon={<UserX className="size-4" />} label="Sales :">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{s.name}</span>
                  <span className="text-red-500">Shiffted ❌</span>
                </span>
              </Row>
            ))}
            <p dir="rtl" className="pl-[106px] text-[10.5px] font-semibold text-ink-400">
              كانوا على الدور واتخطوا تلقائياً (مشغول / لم يحضر)
            </p>
          </div>
        )}

        {/* current */}
        <div className="mt-3 space-y-2.5 rounded-2xl border border-ink-100 bg-ink-50/70 p-4 text-left">
          <Row icon={<User className="size-4" />} label="Sales :">
            <span className="flex flex-wrap items-center gap-1.5">
              <span>{assignment.salesName}</span>
              <span className="text-emerald-600">Done✅</span>
            </span>
          </Row>
          <Row icon={<Users className="size-4" />} label="Manager :">
            {assignment.managerName}
          </Row>
          <Row icon={<Crown className="size-4" />} label="Head :">
            {assignment.headName}
          </Row>
        </div>

        {/* next — the manager whose team is on turn, without a sales name */}
        <div className="mt-3 space-y-1 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-left">
          <Row icon={<ArrowLeft className="size-4" />} label="Next :">
            {next ? <span className="text-brand-700">تيم {next.managerName}</span> : <span className="text-ink-400">—</span>}
          </Row>
          <p dir="rtl" className="pl-[106px] text-[10.5px] font-semibold text-ink-400">
            اللي عليه الدور في الدورة عامة — حتى لو لم يحضر أحد منه، ويتم اختيار السيلز يدوياً عند الدور
          </p>
        </div>

        {/* actions */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={copy} className="btn btn-secondary">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'تم النسخ' : 'نسخ البيان'}
          </button>
          <button onClick={onClose} className="btn btn-primary">
            تمام
          </button>
        </div>
      </div>
    </Modal>
  );
}
