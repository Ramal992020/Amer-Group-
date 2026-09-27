# دليل تشغيل تسجيل الدخول بحساب Google (Supabase Authentication)

التطبيق الآن متصل **فعلياً** بـ Supabase عبر الـ SDK الرسمي `@supabase/supabase-js`:

- ✅ لا يوجد أي Mock / Guest / Auto Login — تم حذف نموذج `SITE / RESTA · 123` نهائياً.
- ✅ لا يمكن رؤية أي جزء من التطبيق بدون **جلسة صحيحة يتم التحقق منها من سيرفر Supabase**
  (`getSession()` + `getUser()` + `onAuthStateChange`).
- ✅ زر **Sign in with Google** ينفّذ OAuth Flow كامل بنمط **PKCE**
  ويجبر Google على إظهار **شاشة اختيار الحساب** (`prompt=select_account`).

المشروع المستخدم حالياً (نفس مشروع المزامنة المدمج في التطبيق):

```
Project URL : https://iteqxdhppinemzuauobm.supabase.co
Project Ref : iteqxdhppinemzuauobm
```

> لو أردت مشروع Supabase جديداً بدلاً منه: أنشئ المشروع ثم مرّر القيم عند البناء
> بدون تعديل الكود:
> ```bash
> VITE_SUPABASE_URL="https://<REF>.supabase.co" \
> VITE_SUPABASE_PUBLISHABLE_KEY="<sb_publishable_... أو anon key>" \
> npm run build
> ```

---

## الخطوة 1 — إنشاء OAuth Client في Google Cloud Console

1. افتح [console.cloud.google.com](https://console.cloud.google.com/) وأنشئ مشروعاً (أو استخدم موجوداً).
2. **APIs & Services → OAuth consent screen**:
   - User Type: `External` ثم أضف مستخدمي الفريق في **Test users** (أو انشر التطبيق In production).
   - أضف النطاقات (`scopes`) الافتراضية: `email` و `profile` و `openid`.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: عنوان التطبيق، مثال:
     ```
     http://localhost:5173
     https://<نطاق-تطبيقك>
     ```
   - **Authorized redirect URIs**: رابط Callback الخاص بمشروع Supabase:
     ```
     https://iteqxdhppinemzuauobm.supabase.co/auth/v1/callback
     ```
4. اضغط **Create** واحتفظ بقيمتَي **Client ID** و **Client Secret**.

## الخطوة 2 — تفعيل Google داخل Supabase

1. افتح لوحة المشروع: `https://supabase.com/dashboard/project/iteqxdhppinemzuauobm`
2. من القائمة: **Authentication → Sign In / Providers**.
3. اختر **Google**، شغّل المفتاح (Enable)، والصق:
   - `Client ID` و `Client Secret` من الخطوة 1.
   - (اختياري) حدّد نطاقات مسموحة في **Authorized Client Types** إن أردت تقييد الحسابات.
4. اضغط **Save**.

## الخطوة 3 — إعداد عناوين الإرجاع في Supabase

من **Authentication → URL Configuration**:

- **Site URL**: رابط التطبيق الرئيسي (مثال `https://<نطاق-تطبيقك>` أو `http://localhost:5173`).
- **Redirect URLs**: أضف كل عنوان يُفتح منه التطبيق (مهم جداً):

  ```
  http://localhost:5173/
  https://<نطاق-تطبيقك>/
  ```

  يجب أن يطابق العنوان ما يظهر في شريط المتصفح عند فتح التطبيق
  (الأصل + المسار)، لأن التطبيق يعيد التوجيه إلى `window.location.origin + pathname`.

## الخطوة 4 — التجربة

1. `npm run dev` (أو افتح رابط التطبيق المنشور).
2. اضغط **Sign in with Google** → ستظهر **شاشة اختيار حساب Google**.
3. بعد الموافقة يعود المتصفح للتطبيق ويتم تبادل الكود (PKCE) تلقائياً.
4. عند النجاح: شاشة **اختيار مساحة العمل** (SITE / RESTA) — وهي مجرد اختيار فرع
   وليست تسجيل دخول؛ الهوية مثبتة مسبقاً من Google عبر Supabase.
5. عند إعادة فتح التطبيق لاحقاً: يتم التحقق من الجلسة من Supabase قبل عرض أي شيء،
   وإن انتهت الجلسة يعود المستخدم لشاشة الدخول.

---

## كيف يعمل التدفق داخل الكود؟

| الملف | الوظيفة |
| --- | --- |
| `src/lib/supabase.ts` | إنشاء عميل Supabase الرسمي (PKCE + persistSession + detectSessionInUrl) |
| `src/lib/auth.ts` | `signInWithGoogle()`، `signOutFromSupabase()`، خطاف `useSupabaseAuth()` للتحقق من الجلسة |
| `src/components/LoginScreen.tsx` | شاشة الدخول — زر Google فقط، بلا أي بيانات وهمية |
| `src/components/WorkspaceGate.tsx` | اختيار الفرع (SITE / RESTA) بعد نجاح المصادقة فقط |
| `src/App.tsx` | الحارس: تحقق ← دخول ← اختيار فرع ← التطبيق، وتسجيل الخروج عبر `supabase.auth.signOut()` |

تسلسل الدخول:

```
Sign in with Google
   └─► supabase.auth.signInWithOAuth({ provider: 'google', prompt: 'select_account' })
         └─► شاشة اختيار حساب Google (OAuth كامل، PKCE)
               └─► عودة إلى رابط التطبيق ?code=...
                     └─► supabase-js يبدّل الكود بجلسة
                           └─► getSession() + getUser()  (تحقق ضد سيرفر Supabase)
                                 └─► دخول التطبيق ← اختيار الفرع
```

## ملاحظات أمنية

- المفتاح المدمج **Publishable/Anon** ليس سرّاً — مصمَّم للعمل من المتصفح، والحماية الحقيقية عبر **RLS** في قاعدة البيانات.
- جدول المزامنة `walkin_state` يعمل حالياً بسياسة عامة (من SQL القديم داخل التطبيق). إن أردت ربطه بالهوية لاحقاً يمكن تقييده بـ `auth.uid()` لأن جلسة المستخدم أصبحت حقيقية الآن.
- لا يوجد في الكود أي مسار يمنح دخولاً بدون جلسة: لا حسابات مخزنة، لا `localStorage` للهوية، لا زر «دخول كزائر».

## استكشاف الأخطاء

| الرسالة في الشاشة | السبب | الحل |
| --- | --- | --- |
| «مزوّد Google غير مفعّل في مشروع Supabase» | لم يتم تفعيل Google في Providers | الخطوة 2 |
| «رابط التطبيق غير مسموح في Supabase» | الرابط غير موجود في Redirect URLs | الخطوة 3 |
| خطأ `redirect_uri_mismatch` من Google | رابط الـ Callback غير مطابق في Google Console | الخطوة 1.3 |
| «تعذّر الوصول إلى سيرفر Supabase» | انقطاع إنترنت أو حجب `supabase.co` | تحقق من الشبكة/الجدار الناري |
| يعود من Google بدون دخول | المستخدم رفض الموافقة أو انتهت صلاحية الطلب | أعد المحاولة |
