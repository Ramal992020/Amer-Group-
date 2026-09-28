// ─── Supabase client حقيقي — Supabase Auth (Google OAuth) ───
//
//  • يستخدم نفس مشروع الفريق المتصل بالمزامنة (Project URL + Publishable Key).
//  • يمكن استبدال المشروع/المفاتيح بدون تعديل الكود عبر متغيرات البيئة عند
//    البناء:  VITE_SUPABASE_URL  و  VITE_SUPABASE_PUBLISHABLE_KEY
//  • لا يوجد أي Mock أو Client محاكي — هذا هو الـ SDK الرسمي @supabase/supabase-js.

import { createClient } from '@supabase/supabase-js';

type ViteEnv = Record<string, string | undefined>;
const env: ViteEnv = ((import.meta as unknown as { env?: ViteEnv }).env ?? {});

/** مشروع Amer Group على Supabase (نفس مشروع المزامنة). */
export const SUPABASE_URL =
  env.VITE_SUPABASE_URL?.trim() || 'https://iteqxdhppinemzuauobm.supabase.co';

/** المفتاح العام (Publishable / anon) — ليس سرّاً وهو مصمَّم للعمل من المتصفح. */
export const SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  'sb_publishable_HCM3MOMfL4HouwcTTs0pmA_Iq3npbSk';

/** معرّف المشروع — يُستخدم في روابط لوحة التحكم داخل رسائل التوجيه. */
export const SUPABASE_PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return '';
  }
})();

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('إعدادات Supabase مفقودة: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
}

/**
 * العميل الرسمي لـ Supabase.
 *  - persistSession:      حفظ الجلسة (التحقق يتم من Supabase في كل إقلاع).
 *  - autoRefreshToken:    تجديد التوكن تلقائياً.
 *  - detectSessionInUrl:  التقاط رجوع Google OAuth (?code=...) وإتمام الدخول.
 *  - flowType 'pkce':     OAuth Flow الكامل بأمان للـ SPA (بدون implicit tokens).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'amer-walkin-supabase-auth',
  },
});

/** الرابط الذي يعود إليه Google بعد الموافقة — يجب إضافته في Supabase Redirect URLs. */
export const getOAuthRedirectTo = (): string =>
  `${window.location.origin}${window.location.pathname}`;

/** رابط الـ Callback الذي يجب وضعه في Google Cloud Console. */
export const getSupabaseCallbackUrl = (): string =>
  `${SUPABASE_URL}/auth/v1/callback`;
