import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, CaretDown } from '@phosphor-icons/react';
import { AmerLogo } from '../components/AmerLogo';
import { CONTENT } from './content';

/* ── Scroll reveal wrapper — IntersectionObserver, fires once (B7) ── */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.classList.add('is-visible');
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0.08 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Floating navigation — compact pill, blurred translucent surface (B7) ── */
const NAV_LINKS = [
  { href: '#projects', label: 'المشاريع' },
  { href: '#how', label: 'خطوات الحجز' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
] as const;

export function FloatingNav() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <nav className="nav-pill flex w-full max-w-[1080px] items-center justify-between gap-4 py-2 pe-2 ps-4" aria-label="التنقل الرئيسي">
          <a href="#top" className="flex shrink-0 items-center gap-2" aria-label="Amer Group Holding — الرئيسية">
            <AmerLogo variant="light" className="h-7" />
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="nav-link body-5 rounded-full px-3 py-2 text-white hover:bg-elevated hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <a href="#lead" className="btn btn-primary button-sm hidden md:inline-flex">
            احجز معاينة
          </a>

          <button
            type="button"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-overlay text-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-panel"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden className={`menu-toggle-line absolute ${open ? 'rotate-45' : '-translate-y-1.5'}`}>
              <span className="block h-0.5 w-5 rounded-full bg-current" />
            </span>
            <span aria-hidden className={`menu-toggle-line absolute ${open ? 'opacity-0' : 'opacity-100'}`}>
              <span className="block h-0.5 w-5 rounded-full bg-current" />
            </span>
            <span aria-hidden className={`menu-toggle-line absolute ${open ? '-rotate-45' : 'translate-y-1.5'}`}>
              <span className="block h-0.5 w-5 rounded-full bg-current" />
            </span>
          </button>
        </nav>
      </header>

      {/* Full height mobile panel — links arrive in reading order (B7) */}
      <div
        id="mobile-panel"
        className={`nav-panel fixed inset-0 z-30 flex flex-col justify-center gap-2 px-8 pt-20 transition-opacity duration-500 ${
          open ? 'menu-open opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          className="btn btn-ghost button-sm absolute top-5 end-4"
          aria-label="إغلاق القائمة"
        >
          <X size={20} weight="bold" aria-hidden />
          إغلاق
        </button>

        {[{ href: '#top', label: 'الرئيسية' }, ...NAV_LINKS, { href: '#lead', label: 'احجز معاينة' }].map(
          (link, index) => (
            <a
              key={link.href}
              href={link.href}
              onClick={close}
              tabIndex={open ? 0 : -1}
              className="menu-item heading-5 border-b border-overlay py-4 text-white"
              style={{ transitionDelay: `${Math.min(index * 60, 240)}ms` }}
            >
              {link.label}
            </a>
          ),
        )}

        <p className="menu-item caption-2 mt-6" style={{ transitionDelay: '300ms' }}>
          {CONTENT.brand} · {CONTENT.tagline}
        </p>
      </div>
    </>
  );
}

/* ── Tagline reveal — words wake one at a time on scroll (B11) ── */
export function TaglineReveal({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  const [litCount, setLitCount] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setLitCount(words.length);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            io.disconnect();
            let count = 0;
            const timer = window.setInterval(() => {
              count += 1;
              setLitCount(count);
              if (count >= words.length) window.clearInterval(timer);
            }, 90);
          }
        }
      },
      { rootMargin: '0px 0px -25% 0px', threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={sectionRef} className={className}>
      <p className="heading-2 max-w-[680px]">
        {words.map((word, index) => (
          <span key={index} className={`tagline-word ${index < litCount ? 'is-on' : ''}`}>
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ── FAQ accordion — opacity/transform only, aria-expanded (B9) ── */
export function FaqItem({ question, answer, defaultOpen = false }: { question: string; answer: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="border-b border-overlay">
      <h3>
        <button
          type="button"
          id={`faq-button-${id}`}
          aria-expanded={open}
          aria-controls={`faq-panel-${id}`}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 py-4 text-start transition-colors duration-300 hover:text-brand"
        >
          <span className="title-2 text-white">{question}</span>
          <CaretDown
            size={20}
            weight="bold"
            aria-hidden
            className={`shrink-0 text-text-muted transition-transform duration-500 ${open ? 'rotate-180' : 'rotate-0'}`}
            style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}
          />
        </button>
      </h3>
      <div
        id={`faq-panel-${id}`}
        role="region"
        aria-labelledby={`faq-button-${id}`}
        hidden={!open}
        className="pb-4"
      >
        <p className="body-3 max-w-[680px] text-text-muted">{answer}</p>
      </div>
    </div>
  );
}
