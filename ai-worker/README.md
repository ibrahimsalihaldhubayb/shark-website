# ربط ChatGPT بموقع شارك

المساعد الذكي (زر 🤖 في الصفحة الرئيسية) يتصل بـ ChatGPT عبر وسيط صغير على Cloudflare.
الوسيط يحفظ مفتاح OpenAI سراً، فلا يراه زوار الموقع.

## الخطوات (مرة واحدة، مجاناً)

1. **مفتاح OpenAI:** من https://platform.openai.com/api-keys أنشئ مفتاحاً (`sk-...`) واشحن رصيداً في Billing.
2. **Cloudflare:** سجّل في https://dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Create Worker**، سمّه `shark-ai` ثم **Deploy**.
3. اضغط **Edit code**، احذف الكود الموجود والصق محتوى ملف `worker.js` كاملاً، ثم **Deploy**.
4. ارجع للـ Worker ← **Settings** ← **Variables and Secrets** ← **Add**:
   - النوع: **Secret**
   - الاسم: `OPENAI_API_KEY`
   - القيمة: مفتاح OpenAI
   ثم **Deploy**.
5. انسخ رابط الـ Worker (مثل `https://shark-ai.xxxx.workers.dev`).
6. في لوحة الإدارة `admin.html` ← **الإعدادات** ← بطاقة **ربط ChatGPT بالموقع**، الصق الرابط واضغط **حفظ**.

انتهى — افتح الموقع واضغط 🤖 للتجربة.

## ملاحظات
- الوسيط يقبل الطلبات من `sharekre.sa` فقط. لإضافة نطاق آخر عدّل `ALLOWED_ORIGINS` في `worker.js`.
- لتغيير النموذج عدّل `MODEL` (الافتراضي `gpt-4o-mini`، رخيص وسريع).
- يُفضّل وضع حد شهري للإنفاق من إعدادات OpenAI ← Limits.
