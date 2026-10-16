/* ══════════════════════════════════════════════
   SharkProjects — مشاريع شركائنا (المشاريع العقارية)
   • المشروع في Firestore: مجموعة projects (البيانات + القطع/الوحدات + صورة الغلاف)
   • المخطط وصور المعرض: مجموعة project_media (كل صورة مستند مستقل حتى لا يتجاوز حد المستند 1MB)
   ══════════════════════════════════════════════ */
(function(){
  var FB_CFG={apiKey:"AIzaSyCJ59kjkb7mZ7pcsLImkT4L2-fdHFDTVko",authDomain:"sharek-re.firebaseapp.com",projectId:"sharek-re",storageBucket:"sharek-re.firebasestorage.app",messagingSenderId:"1000796915275",appId:"1:1000796915275:web:bb556f80db9d2f7f99efce"};
  var CACHE_KEY='shark_projects';

  var KINDS={
    lands:      {label:'مخطط أراضي',        unit:'قطعة', units:'قطع'},
    residential:{label:'مشروع سكني جاهز',   unit:'وحدة', units:'وحدات'},
    villas:     {label:'مشروع فلل',          unit:'فيلا', units:'فلل'},
    apartments: {label:'مشروع شقق',          unit:'شقة',  units:'شقق'},
    commercial: {label:'مشروع تجاري',        unit:'وحدة', units:'وحدات'},
    warehouses: {label:'مستودعات',           unit:'مستودع', units:'مستودعات'}
  };
  var STATUS={
    available:{label:'متاح',  color:'#16a34a', bg:'rgba(22,163,74,.12)'},
    reserved: {label:'محجوز', color:'#d97706', bg:'rgba(217,119,6,.14)'},
    sold:     {label:'مباع',  color:'#dc2626', bg:'rgba(220,38,38,.12)'}
  };

  function kind(p){ return KINDS[p&&p.kind]||KINDS.lands; }
  function num(v){ var n=Number(String(v==null?'':v).replace(/,/g,'')); return isFinite(n)?n:0; }

  function stats(p){
    var units=(p&&p.units)||[];
    var s={total:units.length,available:0,reserved:0,sold:0,minArea:0,maxArea:0,minPrice:0,maxPrice:0};
    units.forEach(function(u){
      var st=STATUS[u.status]?u.status:'available';
      s[st]++;
      var a=num(u.area), pr=num(u.price);
      if(a){ s.minArea=s.minArea?Math.min(s.minArea,a):a; s.maxArea=Math.max(s.maxArea,a); }
      if(pr&&st==='available'){ s.minPrice=s.minPrice?Math.min(s.minPrice,pr):pr; s.maxPrice=Math.max(s.maxPrice,pr); }
    });
    if(!s.minPrice && num(p&&p.priceFrom)) s.minPrice=num(p.priceFrom);
    return s;
  }

  function fmtPrice(n){
    var v=num(n); if(!v) return '';
    if(v>=1000000) return (v/1000000).toLocaleString('ar',{maximumFractionDigits:2})+' مليون ريال';
    return v.toLocaleString('ar-SA')+' ريال';
  }
  function fmtNum(n){ var v=num(n); return v?v.toLocaleString('ar-SA'):'—'; }

  var _db=null;
  function db(){
    if(_db) return _db;
    if(!window.firebase||!firebase.firestore) return null;
    if(!firebase.apps.length) firebase.initializeApp(FB_CFG);
    _db=firebase.firestore();
    return _db;
  }
  function cached(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')||[]; }catch(e){ return []; } }
  function cache(list){ try{ localStorage.setItem(CACHE_KEY,JSON.stringify(list)); }catch(e){} }

  /* المشاريع المنشورة فقط (للموقع) */
  function loadPublished(){
    var d=db();
    if(!d) return Promise.resolve(cached().filter(function(p){return p.published;}));
    return d.collection('projects').get().then(function(snap){
      var list=snap.docs.map(function(x){ var o=x.data(); o.id=o.id||x.id; return o; })
        .filter(function(p){return p.published;})
        .sort(function(a,b){return (b._ts||0)-(a._ts||0);});
      cache(list);
      return list;
    }).catch(function(e){
      console.warn('projects load',e);
      return cached().filter(function(p){return p.published;});
    });
  }
  function loadOne(id){
    var d=db();
    var fromCache=function(){ return cached().find(function(p){return p.id===id;})||null; };
    if(!d) return Promise.resolve(fromCache());
    return d.collection('projects').doc(id).get().then(function(doc){
      if(!doc.exists) return fromCache();
      var o=doc.data(); o.id=o.id||doc.id; return o;
    }).catch(function(){ return fromCache(); });
  }
  /* المخطط والمعرض: {plan:dataUrl|null, gallery:[dataUrl]} */
  function loadMedia(id){
    var d=db();
    if(!d) return Promise.resolve({plan:null,gallery:[]});
    return d.collection('project_media').where('projectId','==',id).get().then(function(snap){
      var out={plan:null,gallery:[]};
      snap.docs.map(function(x){return x.data();})
        .sort(function(a,b){return (a.i||0)-(b.i||0);})
        .forEach(function(m){ if(m.kind==='plan') out.plan=m.data; else if(m.kind==='gallery') out.gallery.push(m.data); });
      return out;
    }).catch(function(e){ console.warn('project media',e); return {plan:null,gallery:[]}; });
  }

  window.SharkProjects={KINDS:KINDS,STATUS:STATUS,kind:kind,stats:stats,fmtPrice:fmtPrice,fmtNum:fmtNum,num:num,
    db:db,loadPublished:loadPublished,loadOne:loadOne,loadMedia:loadMedia};
})();
