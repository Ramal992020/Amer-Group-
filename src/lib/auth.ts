// ─── المصادقة الحقيقية عبر Supabase (Google Sign-In) ───
//
//  • لا يوجد أي Mock / Guest / Auto Login — لا يمكن الوصول للتطبيق إلا
//    بجلسة صحيحة تحقّقنا منها من سيرفر Supabase.
//  • التدفق: signInWithOAuth(provider: google) ← شاشة اختيار حساب Google
//    (prompt=select_account) ← OAuth Flow كامل (PKCE) ← عودة للتطبيق ←
//    تبادل الكود ← تحقق من الجلسة (getSession + getUser) ← دخول.

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getOAuthRedirectTo, supabase } from './supabase';

// ═══════════════ الأنواع ═══════════════

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** true فقط بعد تحقق فعلي من الـ JWT ضد سيرفر Supabase. */
  verified: boolean;
}

export interface GoogleProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** مساحات العمل (الفروع) — تُختار بعد نجاح تسجيل الدخول فقط. */
export type Workspace = 'SITE' | 'RESTA';
export const WORKSPACES: Workspace[] = ['SITE', 'RESTA'];

const wsKey = (userId: string) => `amer-walkin-ws-${userId}`;

/** آخر مساحة عمل اختارها هذا المستخدم (تفضيل فقط — ليس تسجيل دخول). */
export const getSavedWorkspace = (userId: string): Workspace | null => {
  try {
    const raw = localStorage.getItem(wsKey(userId));
    return raw === 'SITE' || raw === 'RESTA' ? raw : null;
  } catch {
    return null;
  }
};

export const saveWorkspace = (userId: string, ws: Workspace): void => {
  try {
    localStorage.setItem(wsKey(userId), ws);
  } catch {
    /* ignore */
  }
};

// ═══════════════ خطاف الجلسة ═══════════════

/**
 * حالة المصادعة الوحيدة المصدر لها Supabase:
 *  1) getSession() — استرجاع الجلسة المحفوظة من Supabase Storage.
 *  2) getUser()   — تحقق فعلي من الـ JWT ضد سيرفر Supabase (وليس محلياً).
 *  3) onAuthStateChange() — التقاط عودة الـ OAuth، انتهاء الجلسة، وتجديد التوكن.
 */
export function useSupabaseAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, verified: false });

  useEffect(() => {
    let mounted = true;

    // 1) أي جلسة محفوظة؟ (لا يوجد → شاشة الدخول مباشرة)
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const session = data.session;
        if (!session?.user) {
          setState({ status: 'signed-out', user: null, verified: false });
          return;
        }
        // جلسة محفوظة — نعرض التطبيق ونتحقق من السيرفر في نفس الوقت.
        setState({ status: 'signed-in', user: session.user, verified: false });

        // 2) تحقق فعلي من الجلسة ضد Supabase (يرفض التوكن المبطّل/المنتهي).
        supabase.auth.getUser().then(({ data: ud, error }) => {
          if (!mounted) return;
          if (!error && ud?.user) {
            setState({ status: 'signed-in', user: ud.user, verified: true });
            return;
          }
          const code = (error as { status?: number } | null)?.status;
          if (code === 400 || code === 401 || code === 403) {
            // توكن غير صالح → إبطال الجلسة وإرجاع المستخدم لشاشة الدخول.
            void supabase.auth.signOut();
            setState({ status: 'signed-out', user: null, verified: false });
          }
          // أخطاء الشبكة: نبقي الجلسة المحفوظة الصالحة — سيعاد التحقق تلقائياً.
        });
      })
      .catch(() => {
        if (mounted) setState({ status: 'signed-out', user: null, verified: false });
      });

    // 3) أحداث الجلسة القادمة من Supabase (رجوع Google، خروج، تجديد).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setState({ status: 'signed-out', user: null, verified: false });
        return;
      }
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        setState({ status: 'signed-in', user: session.user, verified: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

// ═══════════════ تسجيل الدخول / الخروج ═══════════════

/**
 * بدء Google Sign-In:
 *  يفتح نافذة/شاشة اختيار حساب Google (prompt=select_account) وينفّذ
 *  OAuth Flow كامل عبر Supabase (PKCE) ثم يعود إلى رابط التطبيق الحالي.
 *  يرجع نص الخطأ (مترجم للعربية) أو null عند بدء التحويل بنجاح.
 */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectTo(),
        queryParams: {
          /** يجبر Google على إظهار شاشة اختيار الحساب في كل مرة. */
          prompt: 'select_account',
        },
      },
    });
    if (error) return describeAuthError(error);
    return null; // المتصفح سيُحوَّل الآن إلى Google
  } catch (err) {
    return describeAuthError(err);
  }
}

/** إنهاء الجلسة على Supabase — يمنع أي وصول لاحقة بدون تسجيل دخول جديد. */
export async function signOutFromSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    /* الجلسة ستنتهي محلياً على أي حال */
  }
}

// ═══════════════ بيانات المستخدم ═══════════════

export function getGoogleProfile(user: User | null): GoogleProfile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (typeof user.email === 'string' && user.email) ||
    'مستخدم Google';
  const email = user.email ?? (typeof meta.email === 'string' ? meta.email : '');
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return { name, email, avatarUrl };
}

/** ترجمة أخطاء Supabase إلى رسائل عربية قابلة للتنفيذ. */
export function describeAuthError(err: unknown): string {
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? '');
  const lower = msg.toLowerCase();

  if (
    lower.includes('provider is not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('provider is disabled') ||
    lower.includes('provider not enabled')
  ) {
    return 'مزوّد Google غير مفعّل في مشروع Supabase بعد. فعّله من: لوحة Supabase ← Authentication ← Sign In / Providers ← Google، وأضف Client ID و Client Secret من Google Cloud Console (الخطوات كاملة في docs/GOOGLE_AUTH_SETUP.md).';
  }
  if (lower.includes('redirect') || lower.includes('not redirect')) {
    return 'رابط التطبيق غير مسموح في Supabase. أضف رابط هذه الصفحة إلى: Authentication ← URL Configuration ← Redirect URLs.';
  }
  if (lower.includes('signups not allowed')) {
    return 'تسجيل الدخول موقوف في إعدادات مشروع Supabase (Signups disabled). اسمح به من Authentication ← Sign In / Up.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('load failed')
  ) {
    return 'تعذّر الوصول إلى سيرفر Supabase — تحقّق من اتصال الإنترنت (أو من أن نطاق supabase.co غير محجوب) ثم أعد المحاولة.';
  }
  if (lower.includes('api key') || lower.includes('invalid')) {
    return 'مفتاح Supabase العام غير صحيح — راجع القيم في src/lib/supabase.ts أو متغيرات البيئة.';
  }
  return msg ? `تعذّر بدء تسجيل الدخول: ${msg}` : 'تعذّر بدء تسجيل الدخول عبر Google — حاول مرة أخرى.';
}
