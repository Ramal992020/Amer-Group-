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

### ⚠️ خطوة 1.5 — الأهم (تفادي خطأ 403: access_denied)

بعد إنشاء الـ OAuth Client، Google تضع شاشة الموافقة في وضع **Testing** افتراضياً،
وفي هذا الوضع **لا يستطيع أحد الدخول إلا الحسابات المضافة يدوياً كـ Test users** —
أي حساب آخر سيصطدم بصفحة «403. خطأ: access_denied» فور اختياره [للمصدر](https://stackoverflow.com/questions/65184355/error-403-access-denied-from-google-authentication-web-api-despite-google-acc). عندك خياران:

- **الخيار أ — للفريق المحدود (الأسرع):**
  من **APIs & Services → OAuth consent screen** (الواجهة الجديدة: **Google Auth Platform → Audience**)
  انزل إلى **Test users** ← **+ Add Users** وأضِف بريد كل موظف سيستخدم النظام
  (حتى 100 مستخدم). سيتمكن هؤلاء فقط من تسجيل الدخول.
- **الخيار ب — للسماح لأي حساب Google:**
  من نفس الصفحة اضغط **Publish App** لتحويل الحالة إلى **In production**.
  التطبيق يطلب فقط النطاقات غير الحساسة (`email`, `profile`, `openid`) لذلك
  **لا يتطلب عملية تحقق (Verification) من Google** وسيعمل فوراً لأي حساب.

> ملاحظة: التغييرات قد تستغرق من 2 إلى 5 دقائق لتُطبَّق، وأعد المحاولة بحرص
> على أن تكون مسجلاً بالحساب المضاف نفسه.


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

## بديل فوري — الدخول بالبريد الإلكتروني (بدون Google)

لو استمر خطأ 403 من Google أو أردت دخولاً أبسط: التطبيق يدعم الآن **طريقتين إضافيتين حقيقيتين عبر Supabase Auth**، وكلاهما يعطي جلسة كاملة وبيانات مشتركة من أي جهاز:

### أ) بريد + كلمة مرور
1. لوحة Supabase ← **Authentication ← Sign In / Providers ← Email**: مفعّل تلقائياً.
2. لجعل الحسابات الجديدة تدخل فوراً بدون رسالة تأكيد: عطّل **Confirm email** من نفس الصفحة.
   (لو بقيت مفعّلة: سيطلب التطبيق فتح رابط التأكيد أولاً — والرسالة توضح ذلك).
3. من التطبيق: أدخل البريد وكلمة مرور (6+ أحرف) ← «إنشاء حساب جديد» لأول مرة ثم «دخول» بعدها.

### ب) رمز دخول للبريد بدون كلمة مرور (Email OTP)
1. من شاشة الدخول اختر تبويب **«رمز بدون كلمة مرور»** ← أدخل البريد ← «إرسال رمز الدخول».
2. يدخل المستخدم رمز الـ 6 أرقام الوارد في بريده — لا كلمة مرور نهائياً، والحساب يُنشأ تلقائياً.

### إعدادات مهمة للبريد
- **SMTP**: خدمة البريد المدمجة في Supabase محدودة جداً (رسائل قليلة في الساعة) وتناسب التجربة فقط. للاستخدام الفعلي للفريق: **Project Settings ← Authentication ← Emails ← SMTP Settings** (فعّل المفتاح الأخضر Enable Custom SMTP ثم Save) — بدون هذا سيظهر خطأ «تجاوزت حد إرسال الرسائل».

  القيم الجاهزة للحقلين الأكثر شيوعاً:

  | الحقل | Gmail (~500/يوم) | Brevo (300/يوم) |
  | --- | --- | --- |
  | Host | `smtp.gmail.com` | `smtp-relay.brevo.com` |
  | Port | `587` | `587` |
  | Username | بريد Gmail كاملاً | يظهر في صفحة SMTP & API |
  | Password | **App Password** (16 حرفاً من Google Account ← Security ← 2-Step Verification ← App passwords) | مفتاح SMTP key (يبدأ بـ `xsmtpsib-`) |
  | Sender email | نفس بريد Gmail | بريد مُعتمد في قسم Senders |

  ملاحظات: كلمة App Password ليست كلمة سر Gmail العادية · في Brevo يجب تأكيد الـ Sender برسالة تصديق · بعد الحفظ جرّب إرسال رمز من التطبيق، ولو فشل راجع Authentication ← Audit Logs.
- **Rate limits**: من Authentication ← Settings ← Rate Limits يمكنك رفع حد «Token Refresh» و«Emails» حسب حجم الفريق.
- **إدارة المستخدمين**: كل الحسابات تظهر في **Authentication ← Users** ويمكن للمسؤول حذف أو إنشاء أي حساب يدوياً (Add user ← إنشاء بريد + كلمة مرور جاهزة لموظف).

> **المزامنة بين الأجهزة لا تعتمد على طريقة الدخول**: البيانات مرتبطة بمساحة العمل
> (SITE / RESTA) داخل مشروع Supabase — أي مستخدم موثّق يختار نفس مساحة العمل
> من أي جهاز يرى نفس التعديلات لحظياً.

---

## كيف يعمل التدفق داخل الكود؟

| الملف | الوظيفة |
| --- | --- |
| `src/lib/supabase.ts` | إنشاء عميل Supabase الرسمي (PKCE + persistSession + detectSessionInUrl) |
| `src/lib/auth.ts` | `signInWithGoogle()`، الدخول بالبريد (كلمة مرور / OTP)، `signOutFromSupabase()`، خطاف `useSupabaseAuth()` للتحقق من الجلسة |
| `src/components/LoginScreen.tsx` | شاشة الدخول — Google + بريد (كلمة مرور أو رمز)، بلا أي بيانات وهمية |
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

أو بالبريد:
   signInWithPassword / signUp / signInWithOtp ← verifyOtp
         └─► جلسة مباشرة من Supabase (نفس التحقق ونفس الاختيار)
```

## ملاحظات أمنية

- المفتاح المدمج **Publishable/Anon** ليس سرّاً — مصمَّم للعمل من المتصفح، والحماية الحقيقية عبر **RLS** في قاعدة البيانات.
- جدول المزامنة `walkin_state` يعمل حالياً بسياسة عامة (من SQL القديم داخل التطبيق). إن أردت ربطه بالهوية لاحقاً يمكن تقييده بـ `auth.uid()` لأن جلسة المستخدم أصبحت حقيقية الآن.
- لا يوجد في الكود أي مسار يمنح دخولاً بدون جلسة: لا حسابات مخزنة، لا `localStorage` للهوية، لا زر «دخول كزائر».

## استكشاف الأخطاء

| الرسالة في الشاشة | السبب | الحل |
| --- | --- | --- |
| **صفحة Google «403. خطأ: access_denied»** بعد اختيار الحساب | شاشة الموافقة في وضع **Testing** والحساب غير مضاف كـ Test user | الخطوة 1.5: أضِف البريد في Test users أو انشر التطبيق In production |
| «مزوّد Google غير مفعّل في مشروع Supabase» | لم يتم تفعيل Google في Providers | الخطوة 2 |
| «رابط التطبيق غير مسموح في Supabase» | الرابط غير موجود في Redirect URLs | الخطوة 3 |
| خطأ `redirect_uri_mismatch` من Google | رابط الـ Callback غير مطابق في Google Console | الخطوة 1.3 |
| خطأ `invalid_client` من Google | Client ID أو Secret غير صحيحين في Supabase | راجع الخطوة 2 والصق القيمتين من جديد |
| «تعذّر الوصول إلى سيرفر Supabase» | انقطاع إنترنت أو حجب `supabase.co` | تحقق من الشبكة/الجدار الناري |
| يعود من Google بدون دخول | المستخدم رفض الموافقة أو انتهت صلاحية الطلب | أعد المحاولة |

### ما زال 403 (access_denied) رغم إضافة Test users / النشر؟ — قائمة تحقق متقدمة

1. **انتظر 5 دقائق ثم جرّب بنافذة تصفح خفية (Incognito)** — Google تخزّن قرار الرفض مؤقتاً في الجلسة، وأحياناً التغيير لا يُطبَّق فوراً.
2. **تأكد أن الحساب المستخدم للدخول هو نفس البريد المضاف حرفياً** في Test users (حتى اختلاف أحرف أو وجود حساب بجوارياً في المتصفح يسبب الرفض — أخرج من كل حسابات Google أولاً أو استخدم نافذة خفية).
3. **تأكد أنك تعدّل نفس المشروع**: رقم المشروع يظهر كبادئة في OAuth Client ID (الأرقام في بداية الـ Client ID = Project number). قارنه برقم المشروع المفتوح في Console — كثيرون يملكون أكثر من مشروع ويعدّلون غير الصحيح.
4. **تحقق من الحالة الفعلية لشاشة الموافقة**: في صفحة OAuth consent screen يجب أن ترى فعلياً **Publishing status = In production** أو أن البريد ظاهر ضمن قائمة Test users المحفوظة (اضغط Save بعد أي تعديل — التعديل بدون Save لا يُطبَّق).
5. لو كنت تعمل داخل مؤسسة **Google Workspace**: قد تمنع سياسة المؤسسة تطبيقات OAuth خارجية — راجع مع مسؤول الدومين إعداد «App access control».
6. جرّب **إنشاء OAuth Client جديد** في نفس المشروع (بعد نشر شاشة الموافقة) والصق الـ Client ID/Secret الجديدين في Supabase — هذا يحل حالات عميل قديم أُنشئ قبل إعداد شاشة الموافقة بشكل تام.
7. **الحل العملي السريع**: تجاوز Google مؤقتاً واستخدم الدخول بالبريد الإلكتروني من التطبيق (القسم أعلاه) — يعمل فوراً ولا علاقة له بشاشة موافقة Google.
