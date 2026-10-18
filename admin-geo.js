/* ══════════════════════════════════════════════
   محرر «على الخريطة» لمشاريع الشركاء (لوحة الإدارة)
   • تثبيت صورة المخطط على الخريطة (3 زوايا قابلة للسحب)
   • رسم بلوك (4 نقاط) وتقسيمه تلقائياً لقطع
   • رسم قطعة منفردة، استيراد GeoJSON / KML
   يعتمد على window._pjState() من محرر المشاريع و SharkPlotMap
   ══════════════════════════════════════════════ */
(function(){
  var PM=window.SharkPlotMap;
  var map=null, base=null, baseK='sat', plots=null, labels=null, overlay=null, handles=[], tmp=null;
  var mode=null, pts=[], selId=null;

  function S(){ return window._pjState(); }
  function $(id){ return document.getElementById(id); }
  function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function r7(v){ return +(+v).toFixed(7); }
  function toast(m){ if(window.showToast) showToast(m); }
  function units(){ return S().units; }
  function unitById(id){ return units().find(function(u){return u.id===id;}); }
  function cornersObj(){ var c=S().media.corners; return c&&c.length===6?{tl:[c[0],c[1]],tr:[c[2],c[3]],bl:[c[4],c[5]]}:null; }
  function setCorners(o){ S().media.corners=[r7(o.tl[0]),r7(o.tl[1]),r7(o.tr[0]),r7(o.tr[1]),r7(o.bl[0]),r7(o.bl[1])]; }
  function fakeProject(){ return {units:units(),planCorners:S().media.corners}; }
  function natNext(){ var mx=0; units().forEach(function(u){ var v=parseInt(u.no,10); if(v>mx) mx=v; }); return mx+1; }

  /* مساحة مضلع بالمتر المربع */
  function areaM2(ll){
    if(ll.length<3) return 0;
    var lat0=ll[0][0]*Math.PI/180, kx=111320*Math.cos(lat0), ky=110540, a=0;
    for(var i=0;i<ll.length;i++){ var p=ll[i], q=ll[(i+1)%ll.length]; a+=(p[1]*kx)*(q[0]*ky)-(q[1]*kx)*(p[0]*ky); }
    return Math.abs(a/2);
  }
  function flat(ll){ var g=[]; ll.forEach(function(p){ g.push(r7(p[0]),r7(p[1])); }); return g; }

  window.pjGeoReset=function(){ mode=null; pts=[]; selId=null; if(map){ map.remove(); map=null; } plots=labels=overlay=tmp=null; handles=[]; };

  window.pjGeoOpen=function(){
    if(!window.L||!PM){ $('pj-geo-map').innerHTML='<div style="padding:30px;text-align:center;color:#ef4444">تعذّر تحميل مكتبة الخرائط</div>'; return; }
    if(!map){
      map=L.map('pj-geo-map',{maxZoom:21,zoomSnap:.25,attributionControl:false});
      base=PM.baseLayers(); base[baseK].addTo(map);
      var b=PM.bounds(fakeProject()), lat=parseFloat($('pj-lat').value), lng=parseFloat($('pj-lng').value);
      if(b) map.fitBounds(b,{padding:[30,30]});
      else if(isFinite(lat)&&isFinite(lng)) map.setView([lat,lng],17);
      else map.setView([24.7136,46.6753],11);
      map.on('click',onMapClick);
      map.on('zoomend moveend',drawLabels);
      draw();
    } else setTimeout(function(){ map.invalidateSize(); },60);
    renderTools();
  };
  window.pjGeoBase=function(){ map.removeLayer(base[baseK]); baseK=baseK==='sat'?'light':'sat'; base[baseK].addTo(map); $('pjg-base').textContent=baseK==='sat'?'خريطة عادية':'قمر صناعي'; };

  /* ── رسم القطع ── */
  function draw(){
    if(!map) return;
    if(plots) map.removeLayer(plots);
    plots=L.featureGroup().addTo(map);
    var fp=fakeProject();
    units().forEach(function(u){
      var s=PM.unitShape(fp,u); if(!s) return;
      var k=PM.COLORS[PM.status(u)], sel=u.id===selId, lyr;
      if(s.type==='poly') lyr=L.polygon(s.latlngs,{color:sel?'#2563eb':k.line,weight:sel?3:1,fillColor:k.fill,fillOpacity:.75,interactive:!mode});
      else lyr=L.circleMarker(s.latlng,{radius:sel?9:7,color:sel?'#2563eb':'#fff',weight:2,fillColor:k.fill,fillOpacity:1,interactive:!mode});
      lyr.on('click',function(e){ L.DomEvent.stopPropagation(e); select(u.id); });
      plots.addLayer(lyr);
    });
    drawOverlay(); drawLabels();
  }
  function drawLabels(){
    if(!map) return;
    if(labels) map.removeLayer(labels);
    labels=L.layerGroup().addTo(map);
    if(map.getZoom()<18) return;
    var fp=fakeProject(), b=map.getBounds();
    units().forEach(function(u){
      var s=PM.unitShape(fp,u); if(!s) return;
      var c=s.type==='poly'?PM.centroid(s.latlngs):s.latlng; if(!b.contains(c)) return;
      labels.addLayer(L.marker(c,{interactive:false,icon:L.divIcon({className:'pjg-lbl',iconSize:null,html:'<span>'+h(u.no)+'</span>'})}));
    });
  }
  function drawOverlay(){
    var c=cornersObj(), plan=S().media.plan;
    if(overlay&&(!c||!plan)){ map.removeLayer(overlay); overlay=null; }
    if(c&&plan){
      if(!overlay){ overlay=PM.RotatedImage(plan,c,{opacity:+($('pjg-op')?$('pjg-op').value:.6)}).addTo(map); }
      else overlay.setCorners(c);
    }
  }

  function select(id){ selId=id||null; draw(); renderTools(); }

  /* ── تثبيت صورة المخطط ── */
  window.pjGeoAlign=function(){
    var m=S().media;
    if(!m.plan){ alert('ارفع صورة المخطط أولاً من تبويب «المخطط التفاعلي»'); return; }
    if(mode==='align'){ endAlign(); return; }
    cancelDraw();
    if(!cornersObj()){
      var c=map.getCenter(), bb=map.getBounds(), w=(bb.getEast()-bb.getWest())*.6;
      var asp=(m.planH||1)/(m.planW||1), hh=w*asp*Math.cos(c.lat*Math.PI/180);
      setCorners({tl:[c.lat+hh/2,c.lng-w/2],tr:[c.lat+hh/2,c.lng+w/2],bl:[c.lat-hh/2,c.lng-w/2]});
    }
    mode='align'; drawOverlay(); showHandles(); renderTools();
  };
  function hIcon(lbl,color){ return L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],html:'<div style="width:26px;height:26px;border-radius:50%;background:'+color+';border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);color:#fff;font:800 10px Cairo,sans-serif;display:flex;align-items:center;justify-content:center;cursor:move">'+lbl+'</div>'}); }
  function showHandles(){
    hideHandles();
    var c=cornersObj(); if(!c) return;
    var keys=[['tl','١','#ef4444'],['tr','٢','#2563eb'],['bl','٣','#16a34a']];
    keys.forEach(function(k){
      var m=L.marker(c[k[0]],{draggable:true,icon:hIcon(k[1],k[2]),zIndexOffset:2000}).addTo(map);
      m.on('drag',function(){ var o=cornersObj(); var ll=m.getLatLng(); o[k[0]]=[ll.lat,ll.lng]; setCorners(o); drawOverlay(); moveCenter(); });
      m.on('dragend',function(){ draw(); });
      handles.push(m);
    });
    var cm=L.marker(centerOf(c),{draggable:true,icon:hIcon('✥','#1a1a22'),zIndexOffset:2001}).addTo(map);
    var last=null;
    cm.on('dragstart',function(){ last=cm.getLatLng(); });
    cm.on('drag',function(){
      var ll=cm.getLatLng(), dl=ll.lat-last.lat, dg=ll.lng-last.lng; last=ll;
      var o=cornersObj(); ['tl','tr','bl'].forEach(function(k){ o[k]=[o[k][0]+dl,o[k][1]+dg]; }); setCorners(o); drawOverlay();
      handles.slice(0,3).forEach(function(hm,i){ hm.setLatLng(o[['tl','tr','bl'][i]]); });
    });
    cm.on('dragend',function(){ draw(); });
    handles.push(cm);
  }
  function centerOf(c){ return [(c.tr[0]+c.bl[0])/2,(c.tr[1]+c.bl[1])/2]; }
  function moveCenter(){ if(handles[3]) handles[3].setLatLng(centerOf(cornersObj())); }
  function hideHandles(){ handles.forEach(function(m){ map.removeLayer(m); }); handles=[]; }
  function endAlign(){ mode=null; hideHandles(); draw(); renderTools(); toast('تم تثبيت المخطط — اضغط «حفظ المشروع» للحفظ'); }
  window.pjGeoOpacity=function(v){ if(overlay) overlay.setOpacity(+v); };
  window.pjGeoUnalign=function(){ if(!confirm('إزالة تثبيت المخطط من الخريطة؟')) return; S().media.corners=null; if(mode==='align'){ mode=null; hideHandles(); } draw(); renderTools(); };

  /* ── وضع الرسم ── */
  window.pjGeoMode=function(m){
    if(mode==='align') { mode=null; hideHandles(); }
    if(mode===m){ cancelDraw(); return; }
    if(m==='plot'&&!selId){
      var no=prompt('رقم القطعة الجديدة:',String(natNext())); if(!no) return;
      var ex=units().find(function(u){return String(u.no)===String(no).trim();});
      if(ex) selId=ex.id;
      else { var u={id:S().uuid('U-'),no:String(no).trim(),block:'',area:'',price:'',street:'',facing:'',type:'',beds:'',status:'available'}; units().push(u); selId=u.id; S().renderUnitsEditor(); }
    }
    mode=m; pts=[]; clearTmp(); draw(); renderTools();
  };
  function cancelDraw(){ mode=null; pts=[]; clearTmp(); draw(); renderTools(); }
  window.pjGeoCancel=cancelDraw;
  function clearTmp(){ if(tmp){ map.removeLayer(tmp); tmp=null; } }
  function drawTmp(){
    clearTmp(); tmp=L.layerGroup().addTo(map);
    if(pts.length>1) L.polyline(pts.concat(mode==='block'&&pts.length===4?[pts[0]]:[]),{color:'#2563eb',weight:2,dashArray:'5 5',interactive:false}).addTo(tmp);
    if(pts.length>2&&mode==='plot') L.polygon(pts,{color:'#2563eb',weight:1,fillOpacity:.15,interactive:false}).addTo(tmp);
    pts.forEach(function(p,i){ L.circleMarker(p,{radius:6,color:'#fff',weight:2,fillColor:i===0?'#ef4444':'#2563eb',fillOpacity:1,interactive:false}).addTo(tmp); });
  }
  function onMapClick(e){
    if(mode==='block'){
      if(pts.length>=4) return;
      pts.push([e.latlng.lat,e.latlng.lng]); drawTmp(); renderTools();
    } else if(mode==='plot'){
      if(pts.length>=3){ var p0=map.latLngToContainerPoint(pts[0]); if(p0.distanceTo(e.containerPoint)<14){ window.pjGeoFinishPlot(); return; } }
      pts.push([e.latlng.lat,e.latlng.lng]); drawTmp(); renderTools();
    } else if(mode!=='align'){ select(null); }
  }
  window.pjGeoUndo=function(){ pts.pop(); drawTmp(); renderTools(); };
  window.pjGeoFinishPlot=function(){
    if(pts.length<3){ alert('حدد 3 نقاط على الأقل'); return; }
    var u=unitById(selId); if(!u) return;
    u.g=flat(pts); delete u.x; delete u.y;
    if(!u.area) u.area=String(Math.round(areaM2(pts)));
    S().renderUnitsEditor(); toast('تم رسم القطعة '+u.no);
    mode=null; pts=[]; clearTmp(); draw(); renderTools();
  };

  /* ── تقسيم البلوك ── */
  function bil(q,u,v){
    return [(1-u)*(1-v)*q[0][0]+u*(1-v)*q[1][0]+u*v*q[2][0]+(1-u)*v*q[3][0],
            (1-u)*(1-v)*q[0][1]+u*(1-v)*q[1][1]+u*v*q[2][1]+(1-u)*v*q[3][1]];
  }
  window.pjGeoMakeBlock=function(){
    if(pts.length!==4){ alert('حدد زوايا البلوك الأربع'); return; }
    var R=Math.max(1,parseInt($('pjg-rows').value,10)||1), C=Math.max(1,parseInt($('pjg-cols').value,10)||1);
    var start=parseInt($('pjg-start').value,10); if(!isFinite(start)) start=natNext();
    var blk=$('pjg-block').value.trim(), snake=$('pjg-snake').checked;
    var def={area:$('pjg-area').value.trim(),price:$('pjg-price').value.trim(),street:$('pjg-street').value.trim(),type:$('pjg-type').value.trim()};
    if(R*C>400&&!confirm('سيتم إنشاء '+(R*C)+' قطعة، متابعة؟')) return;
    var made=0, linked=0, no=start;
    for(var r=0;r<R;r++){
      for(var cc=0;cc<C;cc++){
        var c=(snake&&r%2===1)?(C-1-cc):cc;
        var cell=[bil(pts,c/C,r/R),bil(pts,(c+1)/C,r/R),bil(pts,(c+1)/C,(r+1)/R),bil(pts,c/C,(r+1)/R)];
        var sNo=String(no++);
        var u=units().find(function(x){ return String(x.no)===sNo&&String(x.block||'')===blk; });
        if(u) linked++;
        else { u={id:S().uuid('U-'),no:sNo,block:blk,area:def.area,price:def.price,street:def.street,facing:'',type:def.type,beds:'',status:'available'}; units().push(u); made++; }
        u.g=flat(cell); delete u.x; delete u.y;
        if(!u.area) u.area=String(Math.round(areaM2(cell)));
      }
    }
    S().renderUnitsEditor();
    $('pjg-start').value=no;
    toast('تم: '+made+' قطعة جديدة'+(linked?' و'+linked+' قطعة موجودة رُبطت بالرسم':''));
    mode=null; pts=[]; clearTmp(); draw(); renderTools();
  };

  /* ── استيراد GeoJSON / KML ── */
  var NO_KEYS=['no','num','number','plot','plot_no','plotno','parcel','parcel_no','parcelno','lot','رقم','رقم_القطعة','رقم القطعة','name','id'];
  var AREA_KEYS=['area','shape_area','المساحة','مساحة'];
  var BLK_KEYS=['block','blk','بلوك','البلوك'];
  function pick(props,keys){
    var low={}; Object.keys(props||{}).forEach(function(k){ low[String(k).toLowerCase()]=props[k]; });
    for(var i=0;i<keys.length;i++){ var v=low[keys[i].toLowerCase()]; if(v!=null&&String(v).trim()!=='') return String(v).trim(); }
    return '';
  }
  function ringLatLng(ring){ var a=ring.map(function(p){ return [+p[1],+p[0]]; }); if(a.length>1&&a[0][0]===a[a.length-1][0]&&a[0][1]===a[a.length-1][1]) a.pop(); return a; }
  window.pjGeoImport=function(inp){
    var f=inp.files[0]; if(!f) return;
    var rd=new FileReader();
    rd.onload=function(){
      var feats=[];
      try{
        var txt=rd.result;
        if(/\.kml$/i.test(f.name)||/<kml/i.test(txt)){
          var xml=new DOMParser().parseFromString(txt,'text/xml');
          [].slice.call(xml.getElementsByTagName('Placemark')).forEach(function(pm){
            var co=pm.getElementsByTagName('coordinates')[0]; if(!co) return;
            var ring=co.textContent.trim().split(/\s+/).map(function(t){ return t.split(',').map(Number); });
            var nm=pm.getElementsByTagName('name')[0], props={name:nm?nm.textContent:''};
            [].slice.call(pm.getElementsByTagName('Data')).forEach(function(d){ var v=d.getElementsByTagName('value')[0]; props[d.getAttribute('name')]=v?v.textContent:''; });
            [].slice.call(pm.getElementsByTagName('SimpleData')).forEach(function(d){ props[d.getAttribute('name')]=d.textContent; });
            if(ring.length>=3) feats.push({props:props,ll:ringLatLng(ring)});
          });
        } else {
          var gj=JSON.parse(txt), list=gj.type==='FeatureCollection'?gj.features:(gj.type==='Feature'?[gj]:[]);
          list.forEach(function(ft){
            var g=ft.geometry; if(!g) return;
            var ring=g.type==='Polygon'?g.coordinates[0]:(g.type==='MultiPolygon'?g.coordinates[0][0]:null);
            if(ring&&ring.length>=3) feats.push({props:ft.properties||{},ll:ringLatLng(ring)});
          });
        }
      }catch(e){ alert('تعذّر قراءة الملف: '+e.message); return; }
      if(!feats.length){ alert('لم يتم العثور على مضلعات في الملف'); return; }
      var big=feats.some(function(x){ return Math.abs(x.ll[0][0])>90; });
      if(big){ alert('إحداثيات الملف ليست بنظام WGS84 (خطوط الطول والعرض) — صدّر الملف بنظام EPSG:4326'); return; }
      var made=0, linked=0, next=natNext();
      feats.forEach(function(ft){
        var no=pick(ft.props,NO_KEYS)||String(next++), blk=pick(ft.props,BLK_KEYS), ar=pick(ft.props,AREA_KEYS);
        var u=units().find(function(x){ return String(x.no)===no&&(!blk||String(x.block||'')===blk); });
        if(u) linked++;
        else { u={id:S().uuid('U-'),no:no,block:blk,area:'',price:'',street:'',facing:'',type:'',beds:'',status:'available'}; units().push(u); made++; }
        u.g=flat(ft.ll); delete u.x; delete u.y;
        if(!u.area) u.area=ar?String(Math.round(parseFloat(ar))||ar):String(Math.round(areaM2(ft.ll)));
      });
      S().renderUnitsEditor(); draw();
      var b=PM.bounds(fakeProject()); if(b) map.fitBounds(b,{padding:[30,30]});
      toast('تم الاستيراد: '+made+' قطعة جديدة، '+linked+' قطعة موجودة');
      inp.value=''; renderTools();
    };
    rd.readAsText(f);
  };

  /* ── القطعة المحددة ── */
  window.pjGeoSet=function(k,v){ var u=unitById(selId); if(!u) return; u[k]=v; S().renderUnitsEditor(); if(k==='status') { draw(); renderTools(); } };
  window.pjGeoClear=function(){ var u=unitById(selId); if(!u) return; delete u.g; delete u.x; delete u.y; S().renderUnitsEditor(); draw(); renderTools(); };
  window.pjGeoPick=function(id){ select(id); var fp=fakeProject(), u=unitById(id), s=u&&PM.unitShape(fp,u); if(s) map.panTo(s.type==='poly'?PM.centroid(s.latlngs):s.latlng); };
  window.pjGeoFit=function(){ var b=PM.bounds(fakeProject()); if(b) map.fitBounds(b,{padding:[30,30]}); };

  function renderTools(){
    var box=$('pj-geo-tools'); if(!box) return;
    var m=S().media, c=cornersObj(), placed=units().filter(function(u){ return !!PM.unitShape(fakeProject(),u); }).length;
    var html='';
    // status line
    html+='<div class="pjg-sum">على الخريطة: <b>'+placed+'</b> من '+units().length+' قطعة'+(c?' · المخطط مثبت ✓':'')+'</div>';
    if(mode==='align'){
      html+='<div class="pjg-box pjg-on"><b>تثبيت المخطط:</b> اسحب النقاط ١ (أعلى يسار الصورة) و٢ (أعلى يمين) و٣ (أسفل يسار) لتطابق الشوارع في صورة القمر الصناعي، واسحب ✥ لتحريك المخطط كاملاً.'
        +'<div style="display:flex;gap:8px;align-items:center;margin-top:8px"><span>الشفافية</span><input type="range" id="pjg-op" min=".1" max="1" step=".05" value="'+(overlay?overlay.options.opacity:.6)+'" oninput="pjGeoOpacity(this.value)" style="flex:1"><button class="btn-primary" onclick="pjGeoAlign()">تم</button></div></div>';
    } else if(mode==='block'){
      html+='<div class="pjg-box pjg-on"><b>رسم بلوك:</b> اضغط على زوايا البلوك الأربع بالترتيب: <b>١</b> زاوية أول قطعة ← <b>٢</b> نهاية الصف الأول ← <b>٣</b> ← <b>٤</b>. ('+pts.length+'/4)';
      if(pts.length===4){
        html+='<div class="pjg-grid">'
          +'<label>عدد الصفوف<input id="pjg-rows" type="number" min="1" value="2"></label>'
          +'<label>قطع في كل صف<input id="pjg-cols" type="number" min="1" value="10"></label>'
          +'<label>يبدأ الترقيم من<input id="pjg-start" type="number" value="'+natNext()+'"></label>'
          +'<label>البلوك<input id="pjg-block" type="text"></label>'
          +'<label>المساحة م² (فارغ = تلقائي)<input id="pjg-area" type="text"></label>'
          +'<label>السعر<input id="pjg-price" type="text"></label>'
          +'<label>عرض الشارع<input id="pjg-street" type="text"></label>'
          +'<label>الاستخدام<input id="pjg-type" type="text" placeholder="سكني"></label>'
          +'</div><label style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:12px"><input id="pjg-snake" type="checkbox"> ترقيم متعرج (الصف الثاني يبدأ من الجهة المعاكسة)</label>'
          +'<div style="display:flex;gap:8px;margin-top:8px"><button class="btn-primary" onclick="pjGeoMakeBlock()">إنشاء القطع</button><button class="pj-mini" onclick="pjGeoCancel()">إلغاء</button></div>';
      } else html+='<div style="margin-top:6px"><button class="pj-mini" onclick="pjGeoUndo()" '+(pts.length?'':'disabled')+'>تراجع</button> <button class="pj-mini" onclick="pjGeoCancel()">إلغاء</button></div>';
      html+='</div>';
    } else if(mode==='plot'){
      var u=unitById(selId);
      html+='<div class="pjg-box pjg-on"><b>رسم القطعة '+h(u?u.no:'')+':</b> اضغط على زوايا القطعة واحدة تلو الأخرى، ثم اضغط على النقطة الأولى أو «إنهاء». ('+pts.length+' نقاط)'
        +'<div style="margin-top:6px;display:flex;gap:6px"><button class="btn-primary" onclick="pjGeoFinishPlot()" '+(pts.length>=3?'':'disabled')+'>إنهاء</button><button class="pj-mini" onclick="pjGeoUndo()">تراجع</button><button class="pj-mini" onclick="pjGeoCancel()">إلغاء</button></div></div>';
    }
    // toolbar
    html+='<div class="pj-bar" style="margin:8px 0">'
      +'<button class="pj-btn2" onclick="pjGeoMode(\'block\')">▦ رسم بلوك وتقسيمه</button>'
      +'<button class="pj-btn2" onclick="pjGeoMode(\'plot\')">✎ رسم قطعة</button>'
      +'<button class="pj-btn2" onclick="pjGeoAlign()">🗺️ '+(c?'تعديل تثبيت المخطط':'تثبيت صورة المخطط')+'</button>'
      +(c?'<button class="pj-mini" style="color:#ef4444" onclick="pjGeoUnalign()">إزالة التثبيت</button>':'')
      +'<label class="pj-btn2" style="display:inline-block">⇪ استيراد GeoJSON / KML<input type="file" accept=".geojson,.json,.kml" style="display:none" onchange="pjGeoImport(this)"></label>'
      +'<span style="flex:1"></span><button class="pj-mini" onclick="pjGeoFit()">عرض الكل</button><button class="pj-mini" id="pjg-base" onclick="pjGeoBase()">'+(baseK==='sat'?'خريطة عادية':'قمر صناعي')+'</button></div>';
    // selected unit
    var su=unitById(selId);
    html+='<div class="pjg-box"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:12px">القطعة المحددة:</b>'
      +'<select onchange="pjGeoPick(this.value)" style="padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px;min-width:140px"><option value="">— اضغط على قطعة في الخريطة —</option>'
      +units().map(function(x){ return '<option value="'+x.id+'"'+(x.id===selId?' selected':'')+'>'+h(x.no)+(x.block?' / '+h(x.block):'')+(PM.unitShape(fakeProject(),x)?' ✓':'')+'</option>'; }).join('')+'</select>';
    if(su){
      html+=['available','reserved','sold'].map(function(st){ var k=PM.COLORS[st]; return '<button class="pj-mini" onclick="pjGeoSet(\'status\',\''+st+'\')" style="'+(PM.status(su)===st?'background:'+k.fill+';color:#fff;border-color:'+k.fill:'')+'">'+k.label+'</button>'; }).join('')
        +'<label style="font-size:11px">السعر <input value="'+h(su.price)+'" oninput="pjGeoSet(\'price\',this.value)" style="width:90px;padding:5px;border:1px solid var(--border);border-radius:6px"></label>'
        +'<label style="font-size:11px">المساحة <input value="'+h(su.area)+'" oninput="pjGeoSet(\'area\',this.value)" style="width:70px;padding:5px;border:1px solid var(--border);border-radius:6px"></label>'
        +'<button class="pj-mini" onclick="pjGeoMode(\'plot\')">إعادة الرسم</button>'
        +(PM.unitShape(fakeProject(),su)?'<button class="pj-mini" style="color:#ef4444" onclick="pjGeoClear()">حذف الرسم</button>':'');
    }
    html+='</div></div>';
    box.innerHTML=html;
  }
})();
