import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarCheck,
  WhatsappLogo,
  FileText,
  ShieldCheck,
  Clock,
  Headset,
  MapPin,
  Tag,
  Buildings,
  Key,
  Quotes,
  User,
  CheckCircle,
  PaperPlaneTilt,
  Check,
} from '@phosphor-icons/react';
import './styles.css';
import { AmerLogo } from '../components/AmerLogo';
import { CONTENT } from './content';
import { Reveal, FloatingNav, TaglineReveal, FaqItem } from './ui';
import heroImage from './assets/hero.jpg';
import project1Image from './assets/project-1.jpg';
import project2Image from './assets/project-2.jpg';

const PROJECT_IMAGES = { hero: heroImage, project1: project1Image, project2: project2Image } as const;

const containerClass = 'mx-auto w-full max-w-[1080px] px-4 sm:px-6';

function whatsappLink(message: string) {
  return `https://wa.me/${CONTENT.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/* ══════════════════════════════════════════════════════════
   Lead form — client-side validation, hands off to WhatsApp.
   No account needed, no fake "sent" state: the message is
   handed to WhatsApp where the visitor presses send.
   ══════════════════════════════════════════════════════════ */

const PHONE_RE = /^(\+20|0020|0)?1[0125][0-9]{8}$/;

type LeadFormProps = {
  selectedProject: string;
  onProjectChange: (value: string) => void;
};

function LeadForm({ selectedProject, onProjectChange }: LeadFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [unitType, setUnitType] = useState('شقة');
  const [bestTime, setBestTime] = useState('أي وقت');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const projectOptions = useMemo(
    () => [...CONTENT.projects.map((project) => project.name), 'لسة بقرر / عايز أتشوف الأول'],
    [],
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'اكتب الاسم بالكامل.';
    const normalizedPhone = phone.trim().replace(/[\s-]/g, '');
    if (!PHONE_RE.test(normalizedPhone)) {
      next.phone = 'اكتب رقم موبايل مصري صحيح (مثال: 01012345678).';
    }
    return next;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    const message = [
      'أهلاً Amer Group، أنا عايز أحجز معاينة.',
      `الاسم: ${name.trim()}`,
      `الموبايل: ${phone.trim()}`,
      `نوع الوحدة: ${unitType}`,
      `المشروع: ${selectedProject}`,
      `أفضل وقت: ${bestTime}`,
      notes.trim() ? `ملاحظات: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const existing = JSON.parse(localStorage.getItem('amer-landing-leads') ?? '[]') as unknown[];
      localStorage.setItem(
        'amer-landing-leads',
        JSON.stringify([...existing, { name: name.trim(), phone: phone.trim(), unitType, project: selectedProject, at: new Date().toISOString() }]),
      );
    } catch {
      /* التخزين المحلي غير متاح — واتساب هو القناة الأساسية على أي حال */
    }

    window.open(whatsappLink(message), '_blank', 'noopener,noreferrer');
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-overlay bg-elevated p-6 md:p-8" role="status">
        <CheckCircle size={40} weight="fill" className="text-brand" aria-hidden />
        <h3 className="title-1 text-white">جهزنا رسالتك على واتساب</h3>
        <p className="body-3 text-text-muted">
          فتحنا واتساب ببياناتك — دوس «إرسال» هناك عشان طلبك يوصلنا. لو المتحدث مافتحش،
          استخدم الزر ده.
        </p>
        <a
          className="btn btn-primary button-md"
          href={whatsappLink(`أهلاً Amer Group، أنا عايز أحجز معاينة.\nالاسم: ${name.trim()}\nالموبايل: ${phone.trim()}`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsappLogo size={20} weight="fill" aria-hidden />
          إرسال الرسالة على واتساب
        </a>
        <button
          type="button"
          className="btn btn-ghost button-sm"
          onClick={() => {
            setSubmitted(false);
            setName('');
            setPhone('');
            setNotes('');
            setErrors({});
          }}
        >
          تسجيل بيانات شخص تاني
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="lead-name" className="title-4 mb-2 block text-white">
            الاسم <span className="caption-5 text-text-faint">(مطلوب)</span>
          </label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'lead-name-error' : undefined}
            className="field body-3"
            placeholder="مثال: أحمد الشريف"
          />
          {errors.name && (
            <p id="lead-name-error" role="alert" className="field-error caption-2 mt-1">
              {errors.name}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="lead-phone" className="title-4 mb-2 block text-white">
            الموبايل <span className="caption-5 text-text-faint">(مطلوب)</span>
          </label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            required
            dir="ltr"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? 'lead-phone-error' : 'lead-phone-hint'}
            className="field body-3 text-left"
            placeholder="01012345678"
          />
          {errors.phone ? (
            <p id="lead-phone-error" role="alert" className="field-error caption-2 mt-1">
              {errors.phone}
            </p>
          ) : (
            <p id="lead-phone-hint" className="caption-5 mt-1">
              هنستخدم الرقم ده للتواصل بخصوص المعاينة فقط.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="lead-unit" className="title-4 mb-2 block text-white">
            نوع الوحدة
          </label>
          <select id="lead-unit" className="field body-3" value={unitType} onChange={(event) => setUnitType(event.target.value)}>
            <option>شقة</option>
            <option>فيلا</option>
            <option>محل</option>
            <option>مكتب إداري</option>
          </select>
        </div>

        <div>
          <label htmlFor="lead-time" className="title-4 mb-2 block text-white">
            أفضل وقت للمعاينة
          </label>
          <select id="lead-time" className="field body-3" value={bestTime} onChange={(event) => setBestTime(event.target.value)}>
            <option>أي وقت</option>
            <option>صباحاً</option>
            <option>مساءً</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="lead-project" className="title-4 mb-2 block text-white">
            المشروع المفضل
          </label>
          <select id="lead-project" className="field body-3" value={selectedProject} onChange={(event) => onProjectChange(event.target.value)}>
            {projectOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="lead-notes" className="title-4 mb-2 block text-white">
            ملاحظات <span className="caption-5 text-text-faint">(اختياري)</span>
          </label>
          <textarea
            id="lead-notes"
            name="notes"
            rows={3}
            maxLength={300}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="field body-3 resize-none"
            placeholder="مثال: المنطقة المفضلة، عدد الغرف، هل عندي وحدة للبيع؟"
          />
          <p className="caption-5 mt-1 text-end">{notes.length} / 300</p>
        </div>
      </div>

      <button type="submit" className="btn btn-primary button-lg w-full justify-center sm:w-auto sm:self-start">
        <PaperPlaneTilt size={20} weight="bold" aria-hidden />
        احجز معاينة مجانية
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════ */

function LandingPage() {
  const [selectedProject, setSelectedProject] = useState<string>(CONTENT.projects[0].name);
  const privacyRef = useRef<HTMLDialogElement>(null);
  const termsRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    document.title = 'Amer Group Holding | احجز معاينتك — مشاريع سكنية متكاملة';
  }, []);

  const openDialog = (dialog: HTMLDialogElement | null) => dialog?.showModal();
  const closeDialog = (dialog: HTMLDialogElement | null) => dialog?.close();
  const onDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  const preselectProject = (projectName: string) => {
    setSelectedProject(projectName);
    document.getElementById('lead')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const statsLine = CONTENT.stats.map((stat) => `${stat.value} ${stat.label}`).join(' · ');

  return (
    <div id="top" className="min-h-screen bg-base text-text">
      <a href="#main" className="skip-link button-sm">
        تخطي إلى المحتوى
      </a>

      <FloatingNav />

      <main id="main">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden pt-28 md:pt-32" aria-label="المقدمة">
          <div className={`${containerClass} grid items-center gap-12 pb-16 md:pb-24 lg:grid-cols-2 lg:gap-16`}>
            <div className="flex flex-col items-start gap-6">
              <p className="caption-3 inline-flex items-center gap-2 rounded-full border border-overlay px-3 py-2 text-text-muted">
                <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                {CONTENT.brand} · تطوير عقاري
              </p>

              <h1 className="heading-1 hero-heading max-w-[680px]">
                سكن يليق بيك،
                <br />
                من أول زيارة
              </h1>

              <p className="body-2 max-w-[680px] text-text-muted">
                وحدات بتشطيب كامل في كمبوندات متكاملة. احجز معاينة مجانية، شوف الوحدة بنفسك،
                واستلم عرضاً مكتوباً بكل التفاصيل قبل أي التزام.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <a href="#lead" className="btn btn-primary button-lg">
                  <CalendarCheck size={22} weight="bold" aria-hidden />
                  احجز معاينة مجانية
                </a>
                <a
                  href={whatsappLink('أهلاً Amer Group، عايز أحجز معاينة لوحدة.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost button-lg"
                >
                  <WhatsappLogo size={22} weight="fill" aria-hidden />
                  واتساب
                </a>
              </div>

              <p className="caption-2 text-text-faint">{statsLine}</p>
            </div>

            <figure className="overflow-hidden rounded-3xl border border-overlay">
              <img
                src={heroImage}
                alt="ممشى الدخول الرئيسي لأحد مشاريع Amer Group عند الغروب — عمارات حجرية وأشجار نخيل وإضاءة دافئة"
                className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
                width={1376}
                height={768}
                loading="eager"
                decoding="async"
              />
              <figcaption className="caption-2 border-t border-overlay bg-surface px-4 py-3 text-text-muted">
                من قلب مشاريعنا — المعاينة متاحة طوال الأسبوع بموعد مسبق.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── Benefits ── */}
        <section className="border-t border-overlay py-16 md:py-24" aria-label="لماذا Amer Group">
          <div className={containerClass}>
            <Reveal>
              <h2 className="heading-4 text-white">ليه Amer Group؟</h2>
              <p className="body-6 mt-2 max-w-[680px] text-text-muted">
                مش وعود عامة — دول الأشياء اللي هتحس بيها فعلياً من أول مكالمة لحد الاستلام.
              </p>
            </Reveal>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: CalendarCheck,
                  title: 'معاينة من غير التزام',
                  body: 'شوف الوحدة بنفسك، اسأل عن اللي عايزه، وقرر وانت مطمن. من غير ضغط ولا استعجال.',
                },
                {
                  icon: FileText,
                  title: 'عرض مكتوب قبل أي دفعة',
                  body: 'السعر والمواصفات وخطة السداد مكتوبين في ورقة معتمدة، تشوفها وتراجعها براحتك.',
                },
                {
                  icon: ShieldCheck,
                  title: 'عقد واضح البنود',
                  body: 'كل التفاصيل مكتوبة قبل التوقيع: المواصفات، المواعيد، والشروط. مفيش بنود مخفية.',
                },
                {
                  icon: Clock,
                  title: 'جدول تسليم صريح',
                  body: 'ميعاد الاستلام مكتوب في العقد، مع بنود التأخير وضوابطها موضحة من البداية.',
                },
                {
                  icon: Headset,
                  title: 'فريق يرد بعد الاستلام',
                  body: 'من مفتاح البيت لأي إجراء بعده، عندنا فريق خدمة عملاء بيرجعك لو محتاج أي حاجة.',
                },
                {
                  icon: Buildings,
                  title: 'كمبوندات متكاملة',
                  body: 'سكن وخدمات ومساحات خضراء في مكان واحد، بدل مشاوير كتيرة ومرور أكلك وقتك.',
                },
              ].map((benefit) => (
                <Reveal key={benefit.title}>
                  <div className="flex h-full flex-col gap-4 rounded-2xl border border-overlay bg-surface p-6">
                    <span
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-brand"
                      style={{ backgroundColor: 'rgba(227, 6, 19, 0.12)' }}
                    >
                      <benefit.icon size={24} weight="duotone" aria-hidden />
                    </span>
                    <h3 className="title-3 text-white">{benefit.title}</h3>
                    <p className="body-6 text-text-muted">{benefit.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Projects ── */}
        <section id="projects" className="scroll-mt-24 border-t border-overlay py-16 md:py-24" aria-label="المشاريع">
          <div className={containerClass}>
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="heading-4 text-white">مشاريع مختارة</h2>
                  <p className="body-6 mt-2 text-text-muted">
                    صور توضيحية — التفاصيل والأسعار المتاحة بتتتحدث بصفة دورية.
                  </p>
                </div>
                <a href="#lead" className="btn btn-ghost button-sm">
                  اطلب القائمة الكاملة
                </a>
              </div>
            </Reveal>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {CONTENT.projects.map((project) => (
                <Reveal key={project.id}>
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-overlay bg-surface">
                    <img
                      src={PROJECT_IMAGES[project.image]}
                      alt={project.alt}
                      className="aspect-[4/3] w-full border-b border-overlay object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="flex flex-1 flex-col gap-3 p-6">
                      <span className="caption-3 text-brand">{project.badge}</span>
                      <h3 className="title-2 text-white">{project.name}</h3>
                      <ul className="body-6 flex flex-col gap-2 text-text-muted">
                        <li className="flex items-center gap-2">
                          <MapPin size={18} aria-hidden className="shrink-0 text-text-faint" />
                          {project.location}
                        </li>
                        <li className="flex items-center gap-2">
                          <CalendarCheck size={18} aria-hidden className="shrink-0 text-text-faint" />
                          الاستلام: {project.delivery}
                        </li>
                        <li className="flex items-center gap-2">
                          <Tag size={18} aria-hidden className="shrink-0 text-text-faint" />
                          تبدأ من {project.priceFrom}
                        </li>
                      </ul>
                      <button
                        type="button"
                        onClick={() => preselectProject(project.name)}
                        className="btn btn-ghost button-sm mt-auto w-full justify-center"
                      >
                        اطلب تفاصيل المشروع
                      </button>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="scroll-mt-24 border-t border-overlay py-16 md:py-24" aria-label="خطوات الحجز">
          <div className={containerClass}>
            <Reveal>
              <h2 className="heading-4 text-white">من المعاينة للتسليم في ٣ خطوات</h2>
              <p className="body-6 mt-2 max-w-[680px] text-text-muted">
                من غير لف ولا دوران — خطوات واضحة، وكل خطوة ليها موعد ونتيجة.
              </p>
            </Reveal>

            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  step: '١',
                  icon: CalendarCheck,
                  title: 'احجز معاينة',
                  body: 'املأ الفورم في آخر الصفحة أو ابعت لنا واتساب، والفريق يحدد معاك الموعد المناسب.',
                },
                {
                  step: '٢',
                  icon: MapPin,
                  title: 'زور الوحدة',
                  body: 'معاينة على الطبيعة مع مستشار مبيعات: تشوف التشطيب والموقع وتسأل عن أي تفصيلة.',
                },
                {
                  step: '٣',
                  icon: Key,
                  title: 'استلم عرضك',
                  body: 'عرض مكتوب بكل التفاصيل: السعر، المواصفات، خطة السداد، وموعد التسليم.',
                },
              ].map((item) => (
                <Reveal key={item.step}>
                  <li className="flex h-full flex-col gap-4 rounded-2xl border border-overlay bg-surface p-6">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-12 w-12 items-center justify-center text-text-faint">
                        <item.icon size={28} weight="duotone" aria-hidden />
                      </span>
                      <span className="heading-4 select-none text-elevated" aria-hidden>
                        {item.step}
                      </span>
                    </div>
                    <h3 className="title-2 text-white">{item.title}</h3>
                    <p className="body-6 text-text-muted">{item.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Tagline reveal (mandatory, B11) ── */}
        <section className="border-t border-overlay bg-base-alt py-24 md:py-32" aria-label="الوعد">
          <div className={`${containerClass} flex flex-col items-center gap-8 text-center`}>
            <TaglineReveal
              text="من أول زيارة لحد مفتاح البيت، إحنا ماشيين معاك خطوة خطوة."
              className="flex justify-center"
            />
            <a href="#lead" className="btn btn-inverted button-lg">
              احجز معاينتك دلوقتي
            </a>
          </div>
        </section>

        {/* ── Testimonials (placeholders — replace with real quotes) ── */}
        <section className="border-t border-overlay py-16 md:py-24" aria-label="آراء العملاء">
          <div className={containerClass}>
            <Reveal>
              <h2 className="heading-4 text-white">مستلمين بيتكلموا</h2>
              <p className="body-6 mt-2 max-w-[680px] text-text-muted">
                تجارب عملاء حقيقيين — الأسماء والاقتباسات بتنزل مكان الأقواس قبل النشر.
              </p>
            </Reveal>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {CONTENT.testimonials.map((testimonial, index) => (
                <Reveal key={index}>
                  <figure className="flex h-full flex-col gap-4 rounded-2xl border border-overlay bg-surface p-6">
                    <Quotes size={28} weight="fill" className="text-brand" aria-hidden />
                    <blockquote className="body-5 flex-1 text-white">
                      «{testimonial.quote}»
                    </blockquote>
                    <figcaption className="flex items-center gap-3 border-t border-overlay pt-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-overlay bg-elevated text-text-muted">
                        <User size={20} aria-hidden />
                      </span>
                      <span>
                        <span className="title-4 block text-white">{testimonial.name}</span>
                        <span className="caption-2 block text-text-muted">{testimonial.context}</span>
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-24 border-t border-overlay py-16 md:py-24" aria-label="الأسئلة الشائعة">
          <div className={containerClass}>
            <div className="grid gap-8 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <h2 className="heading-4 text-white">أسئلة بتتسأل قبل المعاينة</h2>
                <p className="body-6 mt-2 max-w-[680px] text-text-muted">
                  لو سؤالك مش هنا، ابعتلنا واتساب وهيرد عليك الفريق بالأرقام المكتوبة.
                </p>
                <a
                  href={whatsappLink('أهلاً Amer Group، عندي سؤال قبل المعاينة.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost button-sm mt-6"
                >
                  <WhatsappLogo size={18} weight="fill" aria-hidden />
                  اسأل على واتساب
                </a>
              </div>
              <div className="lg:col-span-3">
                {CONTENT.faq.map((item, index) => (
                  <FaqItem key={index} question={item.q} answer={item.a} defaultOpen={index === 0} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA = lead form (id=lead) ── */}
        <section id="lead" className="scroll-mt-24 border-t border-overlay py-16 md:py-24" aria-label="احجز معاينة">
          <div className={`${containerClass} grid gap-10 lg:grid-cols-5 lg:gap-16`}>
            <div className="flex flex-col items-start gap-6 lg:col-span-2">
              <h2 className="heading-3 text-white">احجز معاينتك</h2>
              <p className="body-2 max-w-[680px] text-text-muted">
                سيب بياناتك والفريق هيحدد معاك موعد المعاينة. من غير أي التزام — القرار قرارك.
              </p>
              <ul className="flex flex-col gap-3">
                {[
                  'المعاينة مجانية وبدون أي التزام',
                  'عرض مكتوب بكل التفاصيل قبل أي دفعة',
                  'العقد واضح البنود ومراجعة براحتك',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <Check size={22} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden />
                    <span className="body-5 text-white">{point}</span>
                  </li>
                ))}
              </ul>
              <a
                href={whatsappLink('أهلاً Amer Group، عايز أحجز معاينة.')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost button-sm"
              >
                <WhatsappLogo size={18} weight="fill" aria-hidden />
                أو ابعتلنا واتساب مباشرة
              </a>
            </div>

            <div className="rounded-3xl border border-overlay bg-surface p-6 md:p-8 lg:col-span-3">
              <LeadForm selectedProject={selectedProject} onProjectChange={setSelectedProject} />
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-overlay bg-base-alt">
        <div className={`${containerClass} flex flex-col gap-8 py-12 md:flex-row md:items-end md:justify-between`}>
          <div className="flex flex-col gap-3">
            <AmerLogo variant="light" className="h-8" />
            <p className="caption-2 max-w-[320px] text-text-muted">
              {CONTENT.brand} · {CONTENT.tagline}
            </p>
            <p className="caption-5 text-text-faint">الصور المعروضة توضيحية للمشاريع.</p>
          </div>

          <div className="flex flex-col gap-4 md:items-end">
            <div className="flex items-center gap-6">
              <button type="button" className="body-5 text-white underline-offset-4 hover:underline" onClick={() => openDialog(privacyRef.current)}>
                سياسة الخصوصية
              </button>
              <button type="button" className="body-5 text-white underline-offset-4 hover:underline" onClick={() => openDialog(termsRef.current)}>
                الشروط والأحكام
              </button>
            </div>
            <p className="caption-5 text-text-faint">
              © {new Date().getFullYear()} {CONTENT.brand}. جميع الحقوق محفوظة.
            </p>
          </div>
        </div>
      </footer>

      {/* ── Legal dialogs (no dead links, B10) ── */}
      <dialog ref={privacyRef} className="legal" aria-label="سياسة الخصوصية" onClick={onDialogClick}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="title-1 text-white">سياسة الخصوصية</h2>
            <button type="button" className="btn btn-ghost button-xsm" onClick={() => closeDialog(privacyRef.current)} aria-label="إغلاق">
              إغلاق
            </button>
          </div>
          <div className="body-6 flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-text-muted">
            <p>بنجمع بياناتك (الاسم ورقم الموبايل وأي ملاحظات تكتبها) عشان ننظم معاك موعد المعاينة والرد على استفساراتك فقط.</p>
            <p>مش بنبيع بياناتك ولا بنشاركها مع أطراف تالتة لأغراض تسويقية من غير إذن منك.</p>
            <p>البيانات بتتخزن في سجل الحجز الداخلي للشركة، وليها حق المراجعة أو الحذف في أي وقت من خلال واتساب.</p>
            <p>باستخدامك للنموذج فأنت موافق على السياسة دي.</p>
            <p className="caption-5 text-text-faint">مسودة للمراجعة القانونية قبل النشر.</p>
          </div>
        </div>
      </dialog>

      <dialog ref={termsRef} className="legal" aria-label="الشروط والأحكام" onClick={onDialogClick}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="title-1 text-white">الشروط والأحكام</h2>
            <button type="button" className="btn btn-ghost button-xsm" onClick={() => closeDialog(termsRef.current)} aria-label="إغلاق">
              إغلاق
            </button>
          </div>
          <div className="body-6 flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-text-muted">
            <p>حجز المعاينة مجاني وغير ملزم بأي شكل، ومجرد طلب تواصل لا يُنشئ أي التزام تعاقدي على الطرفين.</p>
            <p>الأسعار والمساحات والتوفر المعروضة استرشادية وقابلة للتغيير حتى توقيع العقد النهائي.</p>
            <p>العقد المكتوب بينك وبين الشركة هو المرجع الوحيد للمواصفات والمواعيد والشروط، وأي عرض شفهي لا يُعتد به.</p>
            <p>شروط الإلغاء والاسترداد محددة في كل عقد قبل التوقيع، ويجب مراجعتها مع المستشار قبل أي دفعة.</p>
            <p className="caption-5 text-text-faint">مسودة للمراجعة القانونية قبل النشر.</p>
          </div>
        </div>
      </dialog>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  );
}
