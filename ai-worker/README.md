# ربط المساعد الذكي بموقع شارك (مجاناً)

المساعد الذكي (زر 🤖 في الصفحة الرئيسية) يتصل بنموذج ذكاء اصطناعي عبر وسيط صغير على Cloudflare.
الوسيط يحفظ المفتاح سراً، فلا يراه زوار الموقع.

## الخيار 1 (موصى به): Google Gemini — مجاني وممتاز بالعربي

1. **مفتاح Gemini المجاني:** ادخل https://aistudio.google.com/apikey بحساب Google ← **Create API key** ← انسخ المفتاح (يبدأ بـ `AIza...`). لا يحتاج بطاقة بنكية.
2. **Cloudflare (مجاني):** سجّل في https://dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Create Worker**، سمّه `shark-ai` ثم **Deploy**.
3. اضغط **Edit code**، احذف الكود الموجود والصق محتوى ملف `worker.js` كاملاً، ثم **Deploy**.
4. ارجع للـ Worker ← **Settings** ← **Variables and Secrets** ← **Add**:
   - النوع: **Secret**
   - الاسم: `GEMINI_API_KEY`
   - القيمة: مفتاح Gemini
   ثم **Deploy**.
5. انسخ رابط الـ Worker (مثل `https://shark-ai.xxxx.workers.dev`).
6. في لوحة الإدارة `admin.html` ← **الإعدادات** ← بطاقة **ربط المساعد الذكي بالموقع**، الصق الرابط واضغط **حفظ**.

انتهى — افتح الموقع واضغط 🤖 للتجربة.

## الخيار 2: بدون أي مفتاح — Cloudflare Workers AI (مجاني)

نفس الخطوات 2 و3 و5 و6، لكن بدل الخطوة 4:
الـ Worker ← **Settings** ← **Bindings** ← **Add** ← **Workers AI** ← اسم المتغير: `AI` ← **Deploy**.
(جودة العربي أقل من Gemini، والحد المجاني اليومي محدود.)

## الخيار 3: ChatGPT (مدفوع)

في الخطوة 4 استخدم الاسم `OPENAI_API_KEY` بمفتاح من https://platform.openai.com/api-keys.

## ملاحظات
- إذا وُجد أكثر من خيار، الأولوية: Gemini ثم ChatGPT ثم Workers AI.
- الحد المجاني لـ Gemini كافٍ لموقع عادي، ويمكن رؤية حدودك الحالية داخل AI Studio. في الخطة المجانية قد تستخدم Google المحادثات لتحسين خدماتها.
- الوسيط يقبل الطلبات من `sharekre.sa` فقط. لإضافة نطاق آخر عدّل `ALLOWED_ORIGINS` في `worker.js`.
- إذا ظهر خطأ أن النموذج غير موجود، غيّر `GEMINI_MODEL` في `worker.js` إلى اسم نموذج Flash الظاهر في AI Studio.
