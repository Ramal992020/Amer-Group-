import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileDown, LoaderCircle, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { RecapResult } from '../lib/excel';
import { DEFAULT_STYLE } from './StylePanel';
import type { ReportStyle } from './StylePanel';
import { DEFAULT_LOGO } from './LogoPanel';
import type { LogoConfig } from './LogoPanel';
import { fmt } from './AnimatedNumber';

interface Props {
  result: RecapResult;
  style?: ReportStyle;
  logo?: LogoConfig;
  reqValue: string;
  secondClassCartons: string;
  secondClassPieces: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const VALIGN_MAP: Record<ReportStyle['valign'], 'top' | 'middle' | 'bottom'> = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
};

export function RecapTable({
  result,
  style = DEFAULT_STYLE,
  logo = DEFAULT_LOGO,
  reqValue,
  secondClassCartons,
  secondClassPieces,
}: Props) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const reqDigits = reqValue.replace(/[^0-9]/g, '');
  const hasReq = reqDigits.length > 0;
  const hasSecondClass = secondClassCartons.trim().length > 0 || secondClassPieces.trim().length > 0;
  const secondClassCtn = Number(secondClassCartons.replace(/[^0-9.]/g, '')) || 0;
  const secondClassPcs = Number(secondClassPieces.replace(/[^0-9.]/g, '')) || 0;
  const totalPieces = result.totals.pieces + (hasSecondClass ? secondClassPcs : 0);
  const totalCartons = result.totals.cartons + (hasSecondClass ? secondClassCtn : 0);
  const reqDisplay = hasReq ? `${fmt(Number(reqDigits))} PCS` : '';

  const gridStyle = {
    fontFamily: style.fontFamily,
    '--table-font': `${style.tableFont}px`,
    '--row-height': `${style.rowHeight}px`,
    '--cell-valign': VALIGN_MAP[style.valign],
  } as React.CSSProperties;

  const metaStyle = {
    fontFamily: style.fontFamily,
    fontSize: `${style.headerFont}px`,
  } as React.CSSProperties;

  // Shrink the report just enough to fit exactly one A4 portrait page when printing.
  useEffect(() => {
    const A4_WIDTH_MM = 190; // printable width with 10mm margins
    const A4_HEIGHT_MM = 277; // printable height with 10mm margins
    const MM_TO_PX = 96 / 25.4;

    const applyScale = () => {
      const paper = paperRef.current;
      if (!paper) return;
      const previousScale = paper.style.getPropertyValue('--print-scale');
      paper.style.setProperty('--print-scale', '1');

      const targetWidthPx = A4_WIDTH_MM * MM_TO_PX;
      const targetHeightPx = A4_HEIGHT_MM * MM_TO_PX;
      const currentWidth = paper.scrollWidth;
      const currentHeight = paper.scrollHeight;
      if (!currentWidth || !currentHeight) {
        paper.style.setProperty('--print-scale', previousScale || '1');
        return;
      }

      const scale = Math.min(1, targetWidthPx / currentWidth, targetHeightPx / currentHeight);
      paper.style.setProperty('--print-scale', String(Number(scale.toFixed(4))));
    };

    window.addEventListener('beforeprint', applyScale);
    const media = window.matchMedia('print');
    const onMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) applyScale();
    };
    media.addEventListener?.('change', onMediaChange);

    return () => {
      window.removeEventListener('beforeprint', applyScale);
      media.removeEventListener?.('change', onMediaChange);
    };
  }, []);

  const exportPdf = async () => {
    if (!paperRef.current || exporting) return;
    setExporting(true);

    try {
      // Capturing the rendered report keeps Arabic names and the print layout identical in the PDF.
      await document.fonts?.ready;
      const canvas = await html2canvas(paperRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 12;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const printableHeight = pageHeight - margin * 2;
      const image = canvas.toDataURL('image/png');

      let heightRemaining = imageHeight;
      let y = margin;
      pdf.addImage(image, 'PNG', margin, y, imageWidth, imageHeight, undefined, 'FAST');
      heightRemaining -= printableHeight;

      // Add pages for large reports while maintaining the exact visual table layout.
      while (heightRemaining > 0) {
        pdf.addPage();
        y = margin - (imageHeight - heightRemaining);
        pdf.addImage(image, 'PNG', margin, y, imageWidth, imageHeight, undefined, 'FAST');
        heightRemaining -= printableHeight;
      }

      pdf.save(`recap-${today()}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="print-report overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5"
    >
      <div className="report-actions mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg border border-emerald-300/25 bg-emerald-400/10">
            <FileDown className="size-4.5 text-emerald-300" strokeWidth={1.9} />
          </div>
          <div>
            <h2 className="font-display text-base font-extrabold text-white">تقرير الـ Recap</h2>
            <p className="text-[11px] text-zinc-500">تنسيق جاهز للطباعة والمشاركة</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasReq ? (
            <span className="text-[11px] text-emerald-300/80 font-medium ml-2">
              ✅ سيظهر صف REQ في الجدول والطباعة
            </span>
          ) : (
            <span className="text-[11px] text-zinc-400 font-medium ml-2">
              💡 صف REQ مخفي حتى تكتب رقمه في الإعدادات الإضافية
            </span>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-xs font-bold text-zinc-100 transition hover:border-emerald-300/35 hover:text-emerald-200"
          >
            <Printer className="size-4" />
            طباعة مباشرة
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2.5 text-xs font-bold text-emerald-950 shadow-[0_8px_24px_-8px_rgba(52,211,153,0.55)] transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70"
          >
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? 'جارٍ تجهيز PDF' : 'تصدير PDF'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm bg-white p-1.5 sm:p-2">
        <div ref={paperRef} className="report-paper mx-auto w-full max-w-[690px] bg-white p-4 sm:p-6 text-black select-text">
          {/* Header metadata area matching picture exactly */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-6 border-b-2 border-black pb-4 text-left">
            <div className="report-meta space-y-1.5" style={{ minWidth: '300px', ...metaStyle }}>
              <div className="flex items-baseline">
                <span className="meta-label">SUPPLIER</span>
                <span className="meta-colon">:</span>
                <span contentEditable suppressContentEditableWarning className="meta-value">
                  {result.metadata.supplier}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="meta-label">MODEL NO</span>
                <span className="meta-colon">:</span>
                <span contentEditable suppressContentEditableWarning className="meta-value">
                  {result.metadata.modelNo}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="meta-label">WASH NAME</span>
                <span className="meta-colon">:</span>
                <span contentEditable suppressContentEditableWarning className="meta-value">
                  {result.metadata.washName}
                </span>
              </div>
            </div>

            {/* User-uploaded logo appears above the report table. */}
            {logo.src && (
              <div className="flex shrink-0 items-center justify-end pt-1">
                <img
                  src={logo.src}
                  alt="Company logo"
                  className="object-contain"
                  style={{ width: `${logo.width}px`, maxHeight: `${Math.max(logo.width * 0.9, 80)}px` }}
                />
              </div>
            )}
          </div>

          <table dir="ltr" className="report-grid w-full border-collapse bg-white text-black" style={gridStyle}>
            <thead>
              <tr>
                <th aria-label="Country" className="w-[34%]" />
                <th className="w-[33%]">PCS</th>
                <th className="w-[33%]">CTN</th>
              </tr>
            </thead>
            <tbody>
              {result.countries.map((country) => (
                <tr key={country.key}>
                  <td contentEditable suppressContentEditableWarning className="country-cell outline-none focus:bg-emerald-500/10 focus:text-emerald-950">{country.country}</td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950">{fmt(country.pieces)} PCS</td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950">{fmt(country.cartons)} CTN</td>
                </tr>
              ))}

              {hasSecondClass && (
                <tr className="second-class-row bg-amber-100/90 font-bold">
                  <td contentEditable suppressContentEditableWarning className="country-cell outline-none focus:bg-amber-200/70 focus:text-black">2ND CLASS</td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-amber-200/70 focus:text-black tnum text-center">
                    {fmt(secondClassPcs)} PCS
                  </td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-amber-200/70 focus:text-black tnum text-center">
                    {fmt(secondClassCtn)} CTN
                  </td>
                </tr>
              )}

              <tr className="total-row">
                <td contentEditable suppressContentEditableWarning className="country-cell outline-none focus:bg-emerald-500/10 focus:text-emerald-950">TOTAL</td>
                <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950">{fmt(totalPieces)} PCS</td>
                <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950">{fmt(totalCartons)} CTN</td>
              </tr>

              {hasReq && (
                <tr className="req-row">
                  <td contentEditable suppressContentEditableWarning className="country-cell outline-none focus:bg-emerald-500/10 focus:text-emerald-950">REQ</td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950">
                    {reqDisplay}
                  </td>
                  <td contentEditable suppressContentEditableWarning className="outline-none focus:bg-emerald-500/10 focus:text-emerald-950" aria-label="No cartons required" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.section>
  );
}