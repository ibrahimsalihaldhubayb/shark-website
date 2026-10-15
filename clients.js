/* ══════════════════════════════════════════════
   SharkClients — حفظ موحّد للعملاء من كل صفحات الموقع
   • يحفظ في Firestore (مجموعة clients) لتظهر في لوحة الإدارة
   • يرسل لقوقل شيت مع اسم التبويب حسب نوع الإدخال
   • إذا انقطع الإنترنت يحتفظ بالسجل ويعيد إرساله لاحقاً
   ══════════════════════════════════════════════ */
(function(){
  var SHEETS_URL='https://script.google.com/macros/s/AKfycbyHVwZPpmNrCOrXjbzlrrkz1tYcA1v7MXvDfwlPFYKUMzV3ICTmpYsNP22HH6dsF7k/exec';
  var FB_CFG={apiKey:"AIzaSyCJ59kjkb7mZ7pcsLImkT4L2-fdHFDTVko",authDomain:"sharek-re.firebaseapp.com",projectId:"sharek-re",storageBucket:"sharek-re.firebasestorage.app",messagingSenderId:"1000796915275",appId:"1:1000796915275:web:bb556f80db9d2f7f99efce"};
  var FB_VER='9.23.0';
  var MASTER_SHEET='العملاء قاعدة البيانات';
  var REQUESTS_SHEET='الطلبات';
  var PENDING_KEY='shark_pending_clients';

  /* نوع الإدخال ← اسم التبويب في الشيت */
  var TYPES={
    'عميل اتصال':   {sheet:'عملاء الاتصال',  label:'📞 عميل اتصال'},
    'رغبة استثمار': {sheet:'رغبة استثمار',   label:'💰 رغبة استثمار'},
    'عرض عقار':     {sheet:'طلب تسويق',      label:'🏠 طلب تسويق'},
    'طلب شراء':     {sheet:'طلبات الشراء',   label:'🔑 طلب شراء'},
    'تسجيل اهتمام': {sheet:'تسجيل الاهتمام', label:'⭐ تسجيل اهتمام'}
  };
  /* مسميات قديمة تُوحَّد */
  var ALIASES={'اهتمام بعرض':'تسجيل اهتمام','اهتمام':'تسجيل اهتمام','طلب تسويق':'عرض عقار'};

  function normType(t){ t=(t||'').trim(); return ALIASES[t]||t; }
  function sheetFor(type){ var t=TYPES[normType(type)]; return t?t.sheet:MASTER_SHEET; }

  /* يحوّل الأرقام العربية ويوحّد صيغة الجوال السعودي إلى 05xxxxxxxx */
  function normPhone(p){
    p=String(p||'').replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);})
                   .replace(/[۰-۹]/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d);})
                   .replace(/[^\d+]/g,'');
    if(p.indexOf('+966')===0) p='0'+p.slice(4);
    else if(p.indexOf('00966')===0) p='0'+p.slice(5);
    else if(p.indexOf('966')===0 && p.length===12) p='0'+p.slice(3);
    else if(p.length===9 && p[0]==='5') p='0'+p;
    return p;
  }
  function isValidPhone(p){ p=normPhone(p); return /^05\d{8}$/.test(p) || /^\+?\d{8,15}$/.test(p); }

  function nowAr(){ return new Date().toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}); }
  function uid(){ return 'CL-'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase(); }

  /* ── Firebase (يُحمَّل عند الحاجة إذا لم تكن الصفحة حمّلته) ── */
  var _dbPromise=null;
  function loadScript(src){ return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  function getDb(){
    if(_dbPromise) return _dbPromise;
    _dbPromise=(async function(){
      if(!window.firebase || !firebase.initializeApp) await loadScript('https://www.gstatic.com/firebasejs/'+FB_VER+'/firebase-app-compat.js');
      if(!firebase.firestore) await loadScript('https://www.gstatic.com/firebasejs/'+FB_VER+'/firebase-firestore-compat.js');
      if(!firebase.apps.length) firebase.initializeApp(FB_CFG);
      return firebase.firestore();
    })();
    _dbPromise.catch(function(){ _dbPromise=null; });
    return _dbPromise;
  }
  function withTimeout(p,ms){ return Promise.race([p,new Promise(function(_,rej){ setTimeout(function(){rej(new Error('timeout'));},ms); })]); }

  /* ── Google Sheets ── */
  function sendSheet(payload){
    try{ fetch(SHEETS_URL,{method:'POST',mode:'no-cors',body:JSON.stringify(payload)}); }catch(e){}
  }

  /* ── قائمة الانتظار عند انقطاع الإنترنت ── */
  function getPending(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); }catch(e){ return []; } }
  function setPending(a){ try{ localStorage.setItem(PENDING_KEY,JSON.stringify(a)); }catch(e){} }
  function addPending(rec,what){ var a=getPending().filter(function(x){return x.rec.id!==rec.id;}); a.push({rec:rec,what:what}); setPending(a); }

  function buildRecord(input){
    var r={};
    for(var k in input) if(Object.prototype.hasOwnProperty.call(input,k) && input[k]!==undefined) r[k]=input[k];
    r.id=r.id||uid();
    r.type=normType(r.type)||'عميل اتصال';
    r.phone=normPhone(r.phone);
    r.name=(r.name||'').trim();
    r.interest=(r.interest||'').trim();
    r.note=(r.note||'').trim();
    r.employee=(r.employee||'').trim();
    r.source=r.source||'website';
    r.sheet=sheetFor(r.type);
    r.date=r.date||nowAr();
    r._ts=r._ts||Date.now();
    return r;
  }

  function sheetPayload(r){
    return {
      sheet:r.sheet, master:MASTER_SHEET,
      id:r.id, date:r.date, type:r.type, name:r.name, phone:r.phone,
      interest:r.interest||'', offer:r.offerName||r.offerTitle||r.offer||'',
      note:r.note||'', employee:r.employee||'', source:r.source||''
    };
  }

  async function writeFirestore(r){
    var db=await withTimeout(getDb(),10000);
    await withTimeout(db.collection('clients').doc(r.id).set(r),10000);
  }

  /**
   * حفظ عميل. يرجّع {rec, saved:true|false}
   * saved=false يعني أن السجل محفوظ في قائمة الانتظار وسيُرسل تلقائياً عند عودة الإنترنت.
   */
  async function save(input){
    var r=buildRecord(input);
    var offline=(typeof navigator!=='undefined' && navigator.onLine===false);
    if(offline){ addPending(r,'both'); return {rec:r,saved:false}; }
    sendSheet(sheetPayload(r));
    try{ await writeFirestore(r); return {rec:r,saved:true}; }
    catch(e){ console.warn('SharkClients firestore',e); addPending(r,'fs'); return {rec:r,saved:false}; }
  }

  /* طلب شراء مرتبط بالعميل (يظهر في قسم الطلبات بلوحة الإدارة) */
  async function createRequest(r){
    var req={ id:'REQ-'+Date.now(), clientName:r.name, employeeName:r.employee||'موظف', phone:r.phone,
      title:r.interest||'طلب شراء', budget:'', region:'', city:'', neighborhood:'', notes:r.note||'',
      documents:'', status:'active', clientId:r.id, _ts:Date.now() };
    sendSheet({sheet:REQUESTS_SHEET,type:'request',id:req.id,clientName:req.clientName,employeeName:req.employeeName,phone:req.phone,title:req.title,notes:req.notes,date:nowAr()});
    try{ var db=await withTimeout(getDb(),10000); await withTimeout(db.collection('requests').doc(req.id).set(req),10000); }catch(e){ console.warn('SharkClients request',e); }
    return req;
  }

  /* هل الرقم مسجل مسبقاً؟ يرجّع السجل أو null (لا يمنع الحفظ) */
  async function findByPhone(phone){
    try{
      var db=await withTimeout(getDb(),6000);
      var snap=await withTimeout(db.collection('clients').where('phone','==',normPhone(phone)).limit(1).get(),6000);
      return snap.empty?null:snap.docs[0].data();
    }catch(e){ return null; }
  }

  async function flushPending(){
    var a=getPending(); if(!a.length || navigator.onLine===false) return 0;
    var left=[], sent=0;
    for(var i=0;i<a.length;i++){
      var it=a[i];
      try{
        if(it.what==='both') sendSheet(sheetPayload(it.rec));
        await writeFirestore(it.rec); sent++;
      }catch(e){ left.push({rec:it.rec,what:'fs'}); }
    }
    setPending(left);
    return sent;
  }
  window.addEventListener('online',function(){ flushPending(); });
  setTimeout(flushPending,2500);

  window.SharkClients={
    TYPES:TYPES, MASTER_SHEET:MASTER_SHEET, REQUESTS_SHEET:REQUESTS_SHEET, SHEETS_URL:SHEETS_URL,
    save:save, createRequest:createRequest, findByPhone:findByPhone, flushPending:flushPending,
    pendingCount:function(){ return getPending().length; },
    normPhone:normPhone, isValidPhone:isValidPhone, normType:normType, sheetFor:sheetFor,
    sendSheet:sendSheet, sheetPayload:sheetPayload, getDb:getDb, nowAr:nowAr
  };
})();
