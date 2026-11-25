/* ─────────────────────────────────────────────────────────────
   AMER GROUP — Landing content (single source of truth)

   ⚠️  كل القيم الموسومة {{...}} عناصر نائبة (placeholders) لأن
   المهارة تمنع اختلاق حقائق عن شركة حقيقية (أسعار، أرقام، آراء).
   استبدلها بالقيم الحقيقية للشركة قبل النشر — غيّرها هنا فقط
   وكل الصفحة هتتحدث تلقائياً.
   ───────────────────────────────────────────────────────────── */

export const CONTENT = {
  brand: 'Amer Group Holding',
  tagline: 'Real Estate Operations',

  // TODO(placeholder): رقم واتساب الاستقبال بصيغة دولية بدون + أو 00
  whatsappNumber: '201000000000',
  whatsappDisplay: '{{whatsapp_display}}',

  // TODO(placeholder): أرقام الإثبات الاجتماعي تحت الـ CTA والفوتر
  stats: [
    { value: '{{years}}+', label: 'سنة في السوق' },
    { value: '{{projects}}', label: 'مشروع' },
    { value: '{{units}}', label: 'وحدة مُسلّمة' },
  ] as { value: string; label: string }[],

  // TODO(placeholder): المشاريع — الصور مولّدة AI، الأسماء والأرقام مؤقتة
  projects: [
    {
      id: 'project-1',
      image: 'project1' as const,
      badge: '{{project_1_status}}',
      name: '{{project_1_name}}',
      location: '{{project_1_location}}',
      delivery: '{{project_1_delivery}}',
      priceFrom: '{{project_1_price_from}}',
      alt: 'واجهة كمبوند {{project_1_name}} — عمارات حجرية دافئة وأشجار نخيل',
    },
    {
      id: 'project-2',
      image: 'project2' as const,
      badge: '{{project_2_status}}',
      name: '{{project_2_name}}',
      location: '{{project_2_location}}',
      delivery: '{{project_2_delivery}}',
      priceFrom: '{{project_2_price_from}}',
      alt: 'مساء في {{project_2_name}} — مدخل العمارة بإضاءة دافئة وتشجير أمام الواجهة',
    },
    {
      id: 'hero',
      image: 'hero' as const,
      badge: '{{project_3_status}}',
      name: '{{project_3_name}}',
      location: '{{project_3_location}}',
      delivery: '{{project_3_delivery}}',
      priceFrom: '{{project_3_price_from}}',
      alt: 'إطلالة عامة على {{project_3_name}} عند الغروب — ممشى بأشجار نخيل وبوابة رئيسية',
    },
  ],

  // TODO(placeholder): آراء عملاء حقيقية من دفترك — الأسماء والاقتباسات مؤقتة
  testimonials: [
    {
      quote: '{{testimonial_1_quote}}',
      name: '{{customer_1_name}}',
      context: '{{customer_1_context}}', // مثال: «اشترى شقة ٣ غرف في {{project_1_name}}»
    },
    {
      quote: '{{testimonial_2_quote}}',
      name: '{{customer_2_name}}',
      context: '{{customer_2_context}}',
    },
    {
      quote: '{{testimonial_3_quote}}',
      name: '{{customer_3_name}}',
      context: '{{customer_3_context}}',
    },
  ],

  faq: [
    {
      q: 'إزاي أحجز معاينة؟',
      a: 'املأ الفورم في آخر الصفحة أو ابعت لنا على واتساب. الفريق هيتواصل معاك لتحديد الموعد المناسب لزيارة الوحدة أو موقع المشروع.',
    },
    {
      q: 'إيه المستندات المطلوبة وقت الحجز؟',
      a: 'بطاقة رقم قومي سارية أو جواز سفر، وإثبات دخل لو مطلوب من المشروع. تفاصيل المستندات والدفعة المقدمة {{down_payment}} بتتاخد معاك في المعاينة قبل أي التزام.',
    },
    {
      q: 'هل في تسهيلات في السداد؟',
      a: 'كل المشاريع فيها خطط تقسيط. المدة والدفعة الأولى ونسبة الفائدة حسب الوحدة والمشروع — الفريق بيديك عرضاً مكتوباً بكل التفاصيل قبل التوقيع.',
    },
    {
      q: 'إمتى التسليم؟',
      a: 'كل مشروع له جدول تسليم معلن وبيبقى جزءاً من العقد. في المعاينة بنوريك وضع الوحدة لحد النهاردة، وأي تأخير وله ضوابطه المكتوبة في العقد.',
    },
    {
      q: 'إيه نوع التشطيب؟',
      a: 'التشطيب حسب كل مشروع وبيتوضح في المعاينة وفي العقد: البنود والمواصفات والأجهزة. مفيش حاجة شفوها في الصورة بس مكتوبة في الورق كمان.',
    },
    {
      q: 'أقدر ألغي الحجز أو أرجع الفلوس؟',
      a: 'شروط الإلغاء والاسترداد مكتوبة في العقد بشكل صريح قبل التوقيع {{refund_policy}}. اقرأها مع المستشار بتاعك واسأل عن أي بند قبل أي دفعة.',
    },
    {
      q: 'الوحدات المتاحة فين؟',
      a: 'التوفر بيتغير أسبوعياً حسب المبيعات. اكتب في خانة «الملاحظات» المنطقة أو النوع اللي عايزه، وهيعرضلك الفريق المتاح النهاردة بالظبط.',
    },
    {
      q: 'هل في وحدات تجارية (محلات أو مكاتب)؟',
      a: 'حسب كل مشروع. بعض المشاريع فيها محلات ومكاتب إدارية للبيع — اسأل في المعاينة أو اكتبها في الملاحظات وهنبعتلك المتاح.',
    },
  ],
} as const;

export type LandingContent = typeof CONTENT;
