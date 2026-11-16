/* ══════════════════════════════════════════════
   إدارة القطع والحجز لمشاريع الشركاء (لوحة الإدارة)
   • خريطة المخطط: اضغط على القطعة لتغيير حالتها (متاح / محجوز / مباع)
   • فرشاة الحالة: اختر حالة ثم اضغط على عدة قطع متتالية
   • تعديل جماعي بالأرقام (مثل: 15, 20-25)
   • طلبات الحجز والاهتمام من الموقع مع «تأكيد الحجز»
   الحفظ يحدّث حقل القطع فقط (units) ولا يمس باقي بيانات المشروع.
   ══════════════════════════════════════════════ */
(function(){
  var LEAFLET_JS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var LEAFLET_CSS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  var ST={available:{l:'متاح',c:'#4fa776'},reserved:{l:'محجوز',c:'#9a948c'},sold:{l:'مباع',c:'#c25b6e'}};
  var P=null, units=[], dirty=false, map=null, layer=null, sel=null, brush='', filter='all', q='', leads=[], tab='map', shown=60;

  function $(id){ return document.getElementById(id); }
  function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function st(u){ return ST[u.status]?u.status:'available'; }
  function toast(m){ if(window.showToast) showToast(m); }
  function db(){ return window._db||(window.firebase&&firebase.apps.length?firebase.firestore():null); }
  function load(src,css){ return new Promise(function(res,rej){ var e=document.createElement(css?'link':'script'); if(css){ e.rel='stylesheet'; e.href=src; } else e.src=src; e.onload=res; e.onerror=rej; document.head.appendChild(e); }); }
  var _libs=null;
  function libs(){
    if(!_libs) _libs=Promise.all([window.L?0:load(LEAFLET_CSS,true),window.L?0:load(LEAFLET_JS)])
      .then(function(){ return window.SharkPlotMap?0:load('plotmap.js'); });
    return _libs;
  }

  var css='.pm-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;align-items:center;justify-content:center;padding:12px}'
    +'.pm-ov.open{display:flex}.pm-box{background:#fff;border-radius:16px;width:min(1200px,100%);height:min(92vh,900px);display:flex;flex-direction:column;overflow:hidden;font-family:inherit}'
    +'.pm-hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #eee;flex-wrap:wrap}.pm-hd h3{margin:0;font-size:16px;font-weight:800}'
    +'.pm-cnt{display:flex;gap:6px;flex-wrap:wrap}.pm-cnt span{font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px;background:#f4f4f5}'
    +'.pm-tabs{display:flex;gap:4px;padding:0 16px;border-bottom:1px solid #eee}.pm-tabs button{border:none;background:none;padding:10px 12px;font:inherit;font-size:13px;font-weight:700;color:#777;cursor:pointer;border-bottom:2px solid transparent}.pm-tabs button.on{color:#b8922a;border-color:#b8922a}'
    +'.pm-body{flex:1;min-height:0;display:flex}.pm-main{flex:1;min-width:0;position:relative}.pm-side{width:300px;border-right:1px solid #eee;overflow:auto;padding:12px;background:#fafafa}'
    +'@media(max-width:760px){.pm-body{flex-direction:column}.pm-side{width:auto;max-height:42%;border-right:none;border-top:1px solid #eee}}'
    +'#pm-map{position:absolute;inset:0;direction:ltr}.pm-brush{position:absolute;top:10px;right:10px;z-index:500;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.15);padding:6px;display:flex;gap:4px;align-items:center;font-size:12px}'
    +'.pm-brush b{padding:0 6px}.pm-b{border:1px solid #ddd;background:#fff;border-radius:8px;padding:5px 9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.pm-b.on{color:#fff}'
    +'.pm-sec{background:#fff;border:1px solid #eee;border-radius:12px;padding:10px;margin-bottom:10px;font-size:13px}.pm-sec h4{margin:0 0 8px;font-size:13px}'
    +'.pm-sts{display:flex;gap:6px;margin:8px 0}.pm-sts button{flex:1}.pm-in{width:100%;padding:7px 9px;border:1px solid #ddd;border-radius:8px;font:inherit;font-size:13px;box-sizing:border-box}'
    +'.pm-list{position:absolute;inset:0;overflow:auto;padding:12px}.pm-tbl{width:100%;border-collapse:collapse;font-size:13px}.pm-tbl th{position:sticky;top:0;background:#f7f7f7;padding:8px;text-align:right;font-size:12px;color:#666}.pm-tbl td{padding:6px 8px;border-bottom:1px solid #f0f0f0}'
    +'.pm-tbl select,.pm-tbl input{padding:5px 7px;border:1px solid #ddd;border-radius:6px;font:inherit;font-size:12px}'
    +'.pm-save{background:#b8922a;color:#fff;border:none;border-radius:10px;padding:9px 18px;font:inherit;font-weight:800;cursor:pointer}.pm-save[disabled]{opacity:.45;cursor:default}'
    +'.pm-x{border:none;background:#f2f2f2;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}'
    +'.pm-dirty{font-size:12px;color:#d97706;font-weight:700}.plot-lbl span{display:block;transform:translate(-50%,-50%);font:800 10px Cairo,Tahoma,sans-serif;color:#fff;text-shadow:0 0 3px #000;white-space:nowrap}';
  var styleEl=document.createElement('style'); styleEl.textContent=css; document.head.appendChild(styleEl);

  function shell(){
    if($('pm-ov')) return;
    var d=document.createElement('div'); d.id='pm-ov'; d.className='pm-ov';
    d.innerHTML='<div class="pm-box"><div class="pm-hd"><h3 id="pm-title"></h3><div class="pm-cnt" id="pm-cnt"></div><span style="flex:1"></span>'
      +'<span class="pm-dirty" id="pm-dirty"></span><button class="pm-save" id="pm-save" onclick="pmSave()" disabled>حفظ التغييرات</button><button class="pm-x" onclick="pmClose()">×</button></div>'
      +'<div class="pm-tabs"><button data-t="map" onclick="pmTab(\'map\')">الخريطة</button><button data-t="list" onclick="pmTab(\'list\')">قائمة القطع</button><button data-t="leads" onclick="pmTab(\'leads\')">طلبات الحجز <span id="pm-lc"></span></button></div>'
      +'<div class="pm-body"><div class="pm-main" id="pm-main"></div><div class="pm-side" id="pm-side"></div></div></div>';
    document.body.appendChild(d);
  }
  function counts(){
    var c={available:0,reserved:0,sold:0}; units.forEach(function(u){c[st(u)]++;});
    $('pm-cnt').innerHTML='<span>الإجمالي '+units.length+'</span>'+Object.keys(ST).map(function(k){ return '<span style="color:'+ST[k].c+'">'+ST[k].l+' '+c[k]+'</span>'; }).join('');
  }
  function setDirty(v){ dirty=v; $('pm-save').disabled=!v; $('pm-dirty').textContent=v?'تغييرات غير محفوظة':''; }
  function byNo(no){ no=String(no).trim(); return units.find(function(u){ return String(u.no)===no; }); }
  function setStatus(u,s){ if(!u||st(u)===s) return; u.status=s; setDirty(true); }

  window.openPlotsManager=function(id){
    var d=db(); if(!d){ alert('لا يوجد اتصال بقاعدة البيانات'); return; }
    shell(); $('pm-ov').classList.add('open');
    $('pm-title').textContent='جاري التحميل...'; $('pm-main').innerHTML=''; $('pm-side').innerHTML=''; $('pm-cnt').innerHTML='';
    sel=null; brush=''; filter='all'; q=''; tab='map'; shown=60; setDirty(false);
    Promise.all([d.collection('projects').doc(id).get(), libs()]).then(function(r){
      var doc=r[0]; if(!doc.exists){ alert('المشروع غير موجود'); pmClose(); return; }
      P=doc.data(); P.id=P.id||doc.id; units=(P.units||[]).map(function(u){ return Object.assign({},u); });
      $('pm-title').textContent='القطع والحجز — '+(P.name||'');
      counts(); pmTab('map'); loadLeads();
    }).catch(function(e){ console.error(e); alert('تعذّر التحميل: '+(e&&e.message||e)); });
  };
  window.pmClose=function(){
    if(dirty&&!confirm('توجد تغييرات غير محفوظة، إغلاق بدون حفظ؟')) return;
    if(map){ map.remove(); map=null; layer=null; } $('pm-ov').classList.remove('open'); setDirty(false);
  };
  window.pmTab=function(t){
    tab=t; [].slice.call(document.querySelectorAll('#pm-ov .pm-tabs button')).forEach(function(b){ b.classList.toggle('on',b.dataset.t===t); });
    if(map){ map.remove(); map=null; layer=null; }
    if(t==='map') renderMap(); else if(t==='list') renderList(); else renderLeads();
    renderSide();
  };

  /* ── الخريطة ── */
  function renderMap(){
    var PM=window.SharkPlotMap;
    $('pm-main').innerHTML='<div id="pm-map"></div><div class="pm-brush"><b>فرشاة الحالة:</b>'
      +'<button class="pm-b'+(brush===''?' on':'')+'" style="'+(brush===''?'background:#1a1a22':'')+'" onclick="pmBrush(\'\')">إيقاف</button>'
      +Object.keys(ST).map(function(k){ return '<button class="pm-b'+(brush===k?' on':'')+'" style="'+(brush===k?'background:'+ST[k].c+';border-color:'+ST[k].c:'color:'+ST[k].c)+'" onclick="pmBrush(\''+k+'\')">'+ST[k].l+'</button>'; }).join('')+'</div>';
    if(!PM.hasGeo({units:units,boundary:P.boundary})){ $('pm-map').innerHTML='<div style="padding:40px;text-align:center;color:#888;direction:rtl">لا توجد قطع مرسومة على الخريطة لهذا المشروع — استخدم «قائمة القطع».</div>'; return; }
    map=L.map('pm-map',{maxZoom:21,zoomSnap:.25,attributionControl:false});
    PM.baseLayers().light.addTo(map);
    var proj={units:units,boundary:P.boundary,planCorners:P.planCorners};
    layer=PM.render(map,proj,{labelZoom:18,onClick:function(u){
      if(brush){ setStatus(u,brush); restyle(); counts(); }
      sel=u.id; layer.select(u.id); renderSide();
    }});
    var b=layer.bounds(); if(b) map.fitBounds(b,{padding:[20,20]});
    if(sel) layer.select(sel);
  }
  function restyle(){ if(layer) layer.setFilter(function(u){ return matches(u); }); }
  function matches(u){ return (filter==='all'||st(u)===filter)&&(!q||String(u.no).indexOf(q)===0); }
  window.pmBrush=function(b){ brush=b; var c=map&&map.getCenter(), z=map&&map.getZoom(); renderMapKeep(c,z); };
  function renderMapKeep(c,z){ if(map){ map.remove(); map=null; } renderMap(); if(map&&c) map.setView(c,z); }

  /* ── اللوحة الجانبية ── */
  function renderSide(){
    var u=sel&&units.find(function(x){return x.id===sel;});
    var html='';
    if(u){
      html+='<div class="pm-sec"><h4>القطعة '+h(u.no)+(u.block?' — بلوك '+h(u.block):'')+'</h4>'
        +'<div style="color:#666">المساحة: '+h(u.area||'—')+' م²</div>'
        +'<div class="pm-sts">'+Object.keys(ST).map(function(k){ var on=st(u)===k; return '<button class="pm-b" style="'+(on?'background:'+ST[k].c+';color:#fff;border-color:'+ST[k].c:'color:'+ST[k].c)+'" onclick="pmSet(\''+h(u.id)+'\',\''+k+'\')">'+ST[k].l+'</button>'; }).join('')+'</div>'
        +'<label style="font-size:12px;color:#666">السعر (ريال)</label><input class="pm-in" value="'+h(u.price)+'" oninput="pmField(\''+h(u.id)+'\',\'price\',this.value)">'
        +'<label style="font-size:12px;color:#666;margin-top:6px;display:block">ملاحظة الحجز (اسم العميل / التاريخ)</label><input class="pm-in" value="'+h(u.note)+'" oninput="pmField(\''+h(u.id)+'\',\'note\',this.value)">'
        +'</div>';
    } else if(tab==='map'){
      html+='<div class="pm-sec" style="color:#666;line-height:1.8">اضغط على أي قطعة في الخريطة لتغيير حالتها وسعرها.<br>لتغيير عدة قطع بسرعة: اختر حالة من «فرشاة الحالة» ثم اضغط على القطع.</div>';
    }
    html+='<div class="pm-sec"><h4>تعديل جماعي بالأرقام</h4><input class="pm-in" id="pm-bulk" placeholder="مثال: 15, 20-25, 101"><div class="pm-sts">'
      +Object.keys(ST).map(function(k){ return '<button class="pm-b" style="color:'+ST[k].c+'" onclick="pmBulk(\''+k+'\')">'+ST[k].l+'</button>'; }).join('')+'</div></div>';
    html+='<div class="pm-sec"><h4>عرض</h4><input class="pm-in" placeholder="ابحث برقم القطعة" value="'+h(q)+'" oninput="pmQ(this.value)"><div class="pm-sts">'
      +['all'].concat(Object.keys(ST)).map(function(k){ return '<button class="pm-b" style="'+(filter===k?'background:#1a1a22;color:#fff':'')+'" onclick="pmFilter(\''+k+'\')">'+(k==='all'?'الكل':ST[k].l)+'</button>'; }).join('')+'</div></div>';
    $('pm-side').innerHTML=html;
  }
  window.pmSet=function(id,s){ var u=units.find(function(x){return x.id===id;}); setStatus(u,s); counts(); restyle(); renderSide(); if(tab==='list') renderList(); };
  window.pmField=function(id,k,v){ var u=units.find(function(x){return x.id===id;}); if(!u) return; u[k]=v.trim(); setDirty(true); };
  window.pmQ=function(v){ q=v.trim().replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);}); shown=60; restyle(); if(tab==='list') renderList();
    var hit=q&&byNo(q); if(hit&&layer&&tab==='map'){ sel=hit.id; layer.select(hit.id); var c=layer.center(hit.id); if(c) map.setView(c,Math.max(map.getZoom(),18)); renderSide(); var i=document.querySelector('#pm-side input[placeholder^="ابحث"]'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } } };
  window.pmFilter=function(f){ filter=f; shown=60; restyle(); renderSide(); if(tab==='list') renderList(); };
  window.pmBulk=function(s){
    var txt=($('pm-bulk').value||'').replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);}), nos=[];
    txt.split(/[,،\s]+/).forEach(function(p){ var m=p.match(/^(\d+)-(\d+)$/); if(m){ for(var i=+m[1];i<=+m[2]&&nos.length<5000;i++) nos.push(String(i)); } else if(p) nos.push(p); });
    var n=0, miss=[]; nos.forEach(function(no){ var u=byNo(no); if(u){ if(st(u)!==s){ setStatus(u,s); n++; } } else miss.push(no); });
    counts(); restyle(); if(tab==='list') renderList();
    toast('تم تغيير '+n+' قطعة إلى «'+ST[s].l+'»'+(miss.length?' — غير موجودة: '+miss.slice(0,8).join(', '):''));
  };

  /* ── قائمة القطع ── */
  function renderList(){
    var list=units.filter(matches).sort(function(a,b){ return String(a.no).localeCompare(String(b.no),'ar',{numeric:true}); });
    $('pm-main').innerHTML='<div class="pm-list"><table class="pm-tbl"><thead><tr><th>رقم</th><th>البلوك</th><th>المساحة</th><th>السعر</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>'
      +list.slice(0,shown).map(function(u){
        return '<tr><td style="font-weight:800">'+h(u.no)+'</td><td>'+h(u.block)+'</td><td>'+h(u.area)+'</td>'
          +'<td><input value="'+h(u.price)+'" style="width:100px" oninput="pmField(\''+h(u.id)+'\',\'price\',this.value)"></td>'
          +'<td><select onchange="pmSet(\''+h(u.id)+'\',this.value)" style="color:'+ST[st(u)].c+';font-weight:700">'+Object.keys(ST).map(function(k){ return '<option value="'+k+'"'+(st(u)===k?' selected':'')+'>'+ST[k].l+'</option>'; }).join('')+'</select></td>'
          +'<td><input value="'+h(u.note)+'" style="width:160px" oninput="pmField(\''+h(u.id)+'\',\'note\',this.value)"></td></tr>';
      }).join('')+'</tbody></table>'
      +(list.length>shown?'<div style="text-align:center;margin:12px"><button class="pm-b" onclick="pmMore()">عرض المزيد ('+(list.length-shown)+')</button></div>':'')
      +(list.length?'':'<div style="text-align:center;color:#888;padding:30px">لا توجد قطع مطابقة</div>')+'</div>';
  }
  window.pmMore=function(){ shown+=200; renderList(); };

  /* ── طلبات الحجز من الموقع ── */
  function loadLeads(){
    leads=[];
    var d=db(); if(!d) return;
    d.collection('clients').where('projectId','==',P.id).get().then(function(snap){
      leads=snap.docs.map(function(x){ var o=x.data(); o.id=o.id||x.id; return o; }).sort(function(a,b){ return (b._ts||0)-(a._ts||0); });
      $('pm-lc').textContent=leads.length?'('+leads.length+')':'';
      if(tab==='leads') renderLeads();
    }).catch(function(e){ console.warn('leads',e); });
  }
  function renderLeads(){
    if(!leads.length){ $('pm-main').innerHTML='<div class="pm-list"><div style="text-align:center;color:#888;padding:40px">لا توجد طلبات حجز أو اهتمام من الموقع لهذا المشروع بعد.</div></div>'; return; }
    $('pm-main').innerHTML='<div class="pm-list"><table class="pm-tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>الجوال</th><th>القطعة</th><th>الحالة الآن</th><th></th></tr></thead><tbody>'
      +leads.map(function(c){
        var u=c.unitId?units.find(function(x){return x.id===c.unitId;}):(c.unitNo?byNo(c.unitNo):null);
        return '<tr><td style="font-size:11px;color:#888">'+h(c.date)+'</td>'
          +'<td>'+(c.bookingMode==='book'?'<b style="color:#b8922a">طلب حجز</b>':'اهتمام')+'</td>'
          +'<td style="font-weight:700">'+h(c.name)+'</td><td><a href="tel:'+h(c.phone)+'" style="direction:ltr;display:inline-block">'+h(c.phone)+'</a></td>'
          +'<td>'+h(c.unitNo||'—')+'</td>'
          +'<td>'+(u?'<span style="color:'+ST[st(u)].c+';font-weight:700">'+ST[st(u)].l+'</span>':'—')+'</td>'
          +'<td style="white-space:nowrap">'+(u&&st(u)==='available'?'<button class="pm-b" style="color:#9a948c" onclick="pmConfirm(\''+h(u.id)+'\',\''+h(c.name)+'\')">تأكيد الحجز</button> ':'')
          +'<a class="pm-b" style="text-decoration:none;color:#16a34a" target="_blank" href="https://wa.me/'+h(String(c.phone||'').replace(/^0/,'966'))+'">واتساب</a></td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  window.pmConfirm=function(id,name){
    var u=units.find(function(x){return x.id===id;}); if(!u) return;
    setStatus(u,'reserved'); if(!u.note) u.note='محجوز لـ '+name+' — '+new Date().toLocaleDateString('ar-SA');
    counts(); renderLeads(); toast('القطعة '+u.no+' صارت «محجوز» — اضغط «حفظ التغييرات»');
  };

  /* ── الحفظ: حقل القطع فقط ── */
  window.pmSave=function(){
    var d=db(); if(!d||!P) return;
    $('pm-save').disabled=true; toast('جاري الحفظ...');
    d.collection('projects').doc(P.id).update({units:units,_updated:Date.now()}).then(function(){
      setDirty(false); toast('تم حفظ القطع ✓');
      if(window.renderProjects) try{ renderProjects(); }catch(e){}
    }).catch(function(e){ console.error(e); $('pm-save').disabled=false; alert('تعذّر الحفظ: '+(e&&e.message||e)); });
  };
  window.addEventListener('beforeunload',function(e){ if(dirty){ e.preventDefault(); e.returnValue=''; } });
})();
