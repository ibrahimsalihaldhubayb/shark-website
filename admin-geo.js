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
    var k=PM.mPerDeg(ll[0][0]), kx=k.x, ky=k.y, a=0;
    for(var i=0;i<ll.length;i++){ var p=ll[i], q=ll[(i+1)%ll.length]; a+=(p[1]*kx)*(q[0]*ky)-(q[1]*kx)*(p[0]*ky); }
    return Math.abs(a/2);
  }
  function flat(ll){ var g=[]; ll.forEach(function(p){ g.push(+(+p[0]).toFixed(9),+(+p[1]).toFixed(9)); }); return g; }

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
  /* ── تحويل إحداثيات UTM (المخططات الهندسية) إلى خطوط الطول والعرض ── */
  var ELL={wgs:{a:6378137,f:1/298.257223563},intl:{a:6378388,f:1/297}};
  function utmToGeo(E,N,zone,el){
    var a=el.a,f=el.f,e2=f*(2-f),ep2=e2/(1-e2),k0=.9996,x=E-500000,y=N;
    var M=y/k0, mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
    var e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
    var p1=mu+(3*e1/2-27*Math.pow(e1,3)/32)*Math.sin(2*mu)+(21*e1*e1/16-55*Math.pow(e1,4)/32)*Math.sin(4*mu)+(151*Math.pow(e1,3)/96)*Math.sin(6*mu)+(1097*Math.pow(e1,4)/512)*Math.sin(8*mu);
    var s=Math.sin(p1),c=Math.cos(p1),t=Math.tan(p1),C1=ep2*c*c,T1=t*t,N1=a/Math.sqrt(1-e2*s*s),R1=a*(1-e2)/Math.pow(1-e2*s*s,1.5),D=x/(N1*k0);
    var lat=p1-(N1*t/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*Math.pow(D,4)/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*Math.pow(D,6)/720);
    var lng=(D-(1+2*T1+C1)*Math.pow(D,3)/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*Math.pow(D,5)/120)/c;
    return [lat*180/Math.PI,(zone-1)*6-180+3+lng*180/Math.PI];
  }
  function geoToEcef(lat,lng,el){ var a=el.a,e2=el.f*(2-el.f),la=lat*Math.PI/180,lo=lng*Math.PI/180,N=a/Math.sqrt(1-e2*Math.sin(la)*Math.sin(la));
    return [N*Math.cos(la)*Math.cos(lo),N*Math.cos(la)*Math.sin(lo),N*(1-e2)*Math.sin(la)]; }
  function ecefToGeo(X,Y,Z,el){ var a=el.a,e2=el.f*(2-el.f),p=Math.sqrt(X*X+Y*Y),lo=Math.atan2(Y,X),la=Math.atan2(Z,p*(1-e2));
    for(var i=0;i<6;i++){ var N=a/Math.sqrt(1-e2*Math.sin(la)*Math.sin(la)); la=Math.atan2(Z+e2*N*Math.sin(la),p); }
    return [la*180/Math.PI,lo*180/Math.PI]; }
  /* datum: wgs = WGS84 / KSA-GRF17 ، ain = عين العبد 1970 */
  function projToLatLng(x,y,zone,datum){
    if(datum==='ain'){ var g=utmToGeo(x,y,zone,ELL.intl), X=geoToEcef(g[0],g[1],ELL.intl); return ecefToGeo(X[0]-143,X[1]-236,X[2]+7,ELL.wgs); }
    return utmToGeo(x,y,zone,ELL.wgs);
  }

  /* ── قراءة ملف DXF (أوتوكاد): المضلعات المغلقة + أرقام القطع ── */
  function cleanTxt(t){ return String(t||'').replace(/\\[A-Za-z][^;\\]*;/g,'').replace(/\\P/g,' ').replace(/[{}]/g,'').replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);}).trim(); }
  function parseDXF(txt){
    var L=txt.split(/\r?\n/), ents=[], cur=null, sec='', i;
    for(i=0;i+1<L.length;i+=2){
      var code=parseInt(L[i],10), val=L[i+1];
      if(code===0){
        var v=val.trim();
        if(v==='SECTION'){ sec='?'; cur=null; continue; }
        if(v==='ENDSEC'){ sec=''; cur=null; continue; }
        if(sec==='ENTITIES'||sec==='BLOCKS'){ cur={type:v,c:[]}; if(sec==='ENTITIES') ents.push(cur); else cur=null; }
        continue;
      }
      if(code===2&&sec==='?'){ sec=val.trim(); continue; }
      if(cur) cur.c.push([code,val]);
    }
    var polys=[], texts=[], openPoly=null;
    function g(e,code){ for(var k=0;k<e.c.length;k++) if(e.c[k][0]===code) return e.c[k][1]; return null; }
    ents.forEach(function(e){
      var layer=(g(e,8)||'').trim();
      if(e.type==='LWPOLYLINE'){
        var pts=[], x=null;
        e.c.forEach(function(p){ if(p[0]===10) x=parseFloat(p[1]); else if(p[0]===20&&x!=null){ pts.push([x,parseFloat(p[1])]); x=null; } });
        var closed=(parseInt(g(e,70)||'0',10)&1)===1;
        polys.push({pts:pts,closed:closed,layer:layer});
      } else if(e.type==='POLYLINE'){
        openPoly={pts:[],closed:(parseInt(g(e,70)||'0',10)&1)===1,layer:layer}; polys.push(openPoly);
      } else if(e.type==='VERTEX'&&openPoly){
        var vx=parseFloat(g(e,10)), vy=parseFloat(g(e,20)); if(isFinite(vx)&&isFinite(vy)) openPoly.pts.push([vx,vy]);
      } else if(e.type==='SEQEND'){ openPoly=null; }
      else if(e.type==='TEXT'||e.type==='MTEXT'||e.type==='ATTRIB'){
        var t=e.c.filter(function(p){return p[0]===1||p[0]===3;}).map(function(p){return p[1];}).join('');
        var tx=parseFloat(g(e,10)), ty=parseFloat(g(e,20));
        // TEXT بمحاذاة: نقطة المحاذاة الثانية أدق
        var ax=parseFloat(g(e,11)), ay=parseFloat(g(e,21)); if(e.type!=='MTEXT'&&isFinite(ax)&&isFinite(ay)&&(ax||ay)){ tx=ax; ty=ay; }
        if(isFinite(tx)&&isFinite(ty)) texts.push({t:cleanTxt(t),x:tx,y:ty,layer:layer});
      }
    });
    polys=polys.filter(function(p){
      var n=p.pts.length; if(n<3) return false;
      var f=p.pts[0], l=p.pts[n-1];
      if(Math.abs(f[0]-l[0])<1e-6&&Math.abs(f[1]-l[1])<1e-6){ p.pts.pop(); p.closed=true; }
      return p.closed&&p.pts.length>=3;
    });
    return {polys:polys,texts:texts};
  }
  function areaPlanar(pts){ var a=0; for(var i=0;i<pts.length;i++){ var p=pts[i],q=pts[(i+1)%pts.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a/2); }
  function inPoly(x,y,pts){ var c=false; for(var i=0,j=pts.length-1;i<pts.length;j=i++){ var a=pts[i],b=pts[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
  /* ربط كل رقم بأصغر مضلع يحتويه = القطعة */
  function dxfPlots(d){
    var numRe=/^\d{1,5}[A-Za-zء-ي]?$/;
    d.polys.forEach(function(p){ p.area=areaPlanar(p.pts); p.no=null; p.nd=Infinity; var cx=0,cy=0; p.pts.forEach(function(q){cx+=q[0];cy+=q[1];}); p.c=[cx/p.pts.length,cy/p.pts.length]; });
    var cand=d.polys.filter(function(p){ return p.area>=40&&p.area<=60000; });
    d.texts.forEach(function(t){
      if(!numRe.test(t.t.replace(/\s+/g,''))) return;
      var best=null;
      cand.forEach(function(p){ if(inPoly(t.x,t.y,p.pts)&&(!best||p.area<best.area)) best=p; });
      if(!best) return;
      var dd=Math.hypot(t.x-best.c[0],t.y-best.c[1]);
      if(dd<best.nd){ best.no=t.t.replace(/\s+/g,''); best.nd=dd; }
    });
    // مضلع يحتوي مضلعات مرقّمة أخرى = بلوك وليس قطعة
    var plots=cand.filter(function(p){ return p.no; });
    return plots.filter(function(p){ return !plots.some(function(q){ return q!==p&&q.area<p.area&&inPoly(q.c[0],q.c[1],p.pts); }); });
  }

  /* ── الاستيراد: يجهّز الملف ثم يعرض لوحة الخيارات ── */
  var _pending=null;
  function guessZone(){ var lng=parseFloat($('pj-lng').value); if(!isFinite(lng)&&map) lng=map.getCenter().lng; return isFinite(lng)?Math.max(36,Math.min(40,Math.floor((lng+180)/6)+1)):38; }
  function isUTM(xy){ return xy[0]>100000&&xy[0]<900000&&xy[1]>1000000&&xy[1]<4000000; }
  function isLL(xy){ return Math.abs(xy[0])<=180&&Math.abs(xy[1])<=90; }
  window.pjGeoImport=function(inp){
    var f=inp.files[0]; if(!f) return;
    var rd=new FileReader();
    rd.onload=function(){
      var feats=[], txt=rd.result, src='';
      try{
        if(/\.dxf$/i.test(f.name)||/^\s*0\s*[\r\n]+\s*SECTION/.test(txt)){
          src='dxf';
          var d=parseDXF(txt), pl=dxfPlots(d);
          if(!d.polys.length){ alert('لم يتم العثور على خطوط مغلقة (Polyline) في الملف.\nتأكد أن حدود القطع مرسومة كـ Polyline مغلقة.'); inp.value=''; return; }
          if(!pl.length){ alert('تم العثور على '+d.polys.length+' شكل مغلق لكن لم يتم ربطها بأرقام القطع.\nتأكد أن رقم كل قطعة مكتوب كنص (Text) داخل حدودها.'); inp.value=''; return; }
          feats=pl.map(function(p){ return {xy:p.pts,props:{no:p.no,area:String(Math.round(p.area))},layer:p.layer}; });
        } else if(/\.kml$/i.test(f.name)||/<kml/i.test(txt)){
          src='kml';
          var xml=new DOMParser().parseFromString(txt,'text/xml');
          [].slice.call(xml.getElementsByTagName('Placemark')).forEach(function(pm){
            var co=pm.getElementsByTagName('coordinates')[0]; if(!co) return;
            var ring=co.textContent.trim().split(/\s+/).map(function(t){ return t.split(',').map(Number).slice(0,2); });
            var nm=pm.getElementsByTagName('name')[0], props={name:nm?nm.textContent:''};
            [].slice.call(pm.getElementsByTagName('Data')).forEach(function(dd){ var v=dd.getElementsByTagName('value')[0]; props[dd.getAttribute('name')]=v?v.textContent:''; });
            [].slice.call(pm.getElementsByTagName('SimpleData')).forEach(function(dd){ props[dd.getAttribute('name')]=dd.textContent; });
            if(ring.length>=3) feats.push({xy:ring,props:props,layer:''});
          });
        } else {
          src='geojson';
          var gj=JSON.parse(txt), list=gj.type==='FeatureCollection'?gj.features:(gj.type==='Feature'?[gj]:[]);
          list.forEach(function(ft){
            var gm=ft.geometry; if(!gm) return;
            var ring=gm.type==='Polygon'?gm.coordinates[0]:(gm.type==='MultiPolygon'?gm.coordinates[0][0]:null);
            if(ring&&ring.length>=3) feats.push({xy:ring.map(function(q){return [+q[0],+q[1]];}),props:ft.properties||{},layer:''});
          });
        }
      }catch(e){ alert('تعذّر قراءة الملف: '+e.message); inp.value=''; return; }
      inp.value='';
      if(!feats.length){ alert('لم يتم العثور على قطع في الملف'); return; }
      feats.forEach(function(ft){ var r=ft.xy; if(r.length>1&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1]) r.pop(); });
      var s0=feats[0].xy[0], kind=isLL(s0)?'ll':(isUTM(s0)?'utm':'local');
      if(kind==='local'){ alert('إحداثيات الملف محلية (غير مرتبطة بموقع حقيقي).\nاطلب من المطوّر ملف المخطط بإحداثيات UTM، أو استخدم «تثبيت صورة المخطط» ثم «رسم بلوك».'); return; }
      _pending={feats:feats,kind:kind,src:src,name:f.name};
      renderTools();
    };
    rd.readAsText(f);
  };
  window.pjGeoImportCancel=function(){ _pending=null; renderTools(); };
  window.pjGeoImportGo=function(){
    if(!_pending) return;
    var zone=parseInt(($('pjg-zone')||{}).value||guessZone(),10), datum=($('pjg-datum')||{}).value||'wgs', layer=($('pjg-layer')||{}).value||'';
    var feats=_pending.feats.filter(function(f){ return !layer||f.layer===layer; });
    var made=0, linked=0, next=natNext();
    feats.forEach(function(ft){
      var ll=ft.xy.map(function(q){ return _pending.kind==='utm'?projToLatLng(q[0],q[1],zone,datum):[q[1],q[0]]; });
      var no=pick(ft.props,NO_KEYS)||String(next++), blk=pick(ft.props,BLK_KEYS), ar=pick(ft.props,AREA_KEYS);
      var u=units().find(function(x){ return String(x.no)===no&&(!blk||String(x.block||'')===blk); });
      if(u) linked++;
      else { u={id:S().uuid('U-'),no:no,block:blk,area:'',price:'',street:'',facing:'',type:'',beds:'',status:'available'}; units().push(u); made++; }
      u.g=flat(ll); delete u.x; delete u.y;
      if(!u.area) u.area=ar?String(Math.round(parseFloat(ar))||ar):String(Math.round(areaM2(ll)));
    });
    _pending=null;
    S().renderUnitsEditor(); draw();
    var b=PM.bounds(fakeProject()); if(b) map.fitBounds(b,{padding:[30,30]});
    if(!$('pj-lat').value&&b){ var c=b.getCenter(); $('pj-lat').value=c.lat.toFixed(6); $('pj-lng').value=c.lng.toFixed(6); }
    renderTools();
    toast('تم الاستيراد: '+made+' قطعة جديدة، '+linked+' قطعة موجودة — قارن مع صورة القمر الصناعي');
  };
  function importPanel(){
    if(!_pending) return '';
    var p=_pending, layers={};
    p.feats.forEach(function(f){ if(f.layer) layers[f.layer]=(layers[f.layer]||0)+1; });
    var lk=Object.keys(layers);
    var h2='<div class="pjg-box pjg-on"><b>استيراد «'+h(p.name)+'»:</b> تم التعرف على <b>'+p.feats.length+'</b> قطعة'+(p.src==='dxf'?' (أشكال مغلقة بداخلها رقم)':'')+'.';
    if(lk.length>1) h2+='<div style="margin-top:6px">الطبقة (Layer): <select id="pjg-layer" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit"><option value="">كل الطبقات</option>'+lk.map(function(k){return '<option value="'+h(k)+'">'+h(k)+' ('+layers[k]+')</option>';}).join('')+'</select></div>';
    if(p.kind==='utm'){
      var z=guessZone();
      h2+='<div class="pjg-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">'
        +'<label>نطاق UTM<select id="pjg-zone" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-family:inherit">'+[36,37,38,39,40].map(function(n){return '<option value="'+n+'"'+(n===z?' selected':'')+'>'+n+' شمال'+(n===37?' (جدة، المدينة)':n===38?' (الرياض، القصيم)':n===39?' (الشرقية)':'')+'</option>';}).join('')+'</select></label>'
        +'<label>المرجع الجيوديسي<select id="pjg-datum" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-family:inherit"><option value="wgs">KSA-GRF17 / WGS84 (الحديث)</option><option value="ain">عين العبد 1970 (المخططات القديمة)</option></select></label></div>'
        +'<div style="font-size:11.5px;color:var(--sub);margin-top:4px">الملف بإحداثيات هندسية (UTM). إذا ظهرت القطع مزاحة عن الشوارع بحوالي 200 متر، احذفها وأعد الاستيراد بالمرجع الآخر.</div>';
    }
    h2+='<div style="display:flex;gap:8px;margin-top:8px"><button class="btn-primary" onclick="pjGeoImportGo()">استيراد القطع</button><button class="pj-mini" onclick="pjGeoImportCancel()">إلغاء</button></div></div>';
    return h2;
  }
  window.pjGeoClearAll=function(){
    if(!confirm('حذف رسم كل القطع من الخريطة؟ (تبقى القطع وبياناتها)')) return;
    units().forEach(function(u){ delete u.g; }); S().renderUnitsEditor(); draw(); renderTools();
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
    html+=importPanel();
    // toolbar
    html+='<div class="pj-bar" style="margin:8px 0">'
      +'<button class="pj-btn2" onclick="pjGeoMode(\'block\')">▦ رسم بلوك وتقسيمه</button>'
      +'<button class="pj-btn2" onclick="pjGeoMode(\'plot\')">✎ رسم قطعة</button>'
      +'<button class="pj-btn2" onclick="pjGeoAlign()">🗺️ '+(c?'تعديل تثبيت المخطط':'تثبيت صورة المخطط')+'</button>'
      +(c?'<button class="pj-mini" style="color:#ef4444" onclick="pjGeoUnalign()">إزالة التثبيت</button>':'')
      +'<label class="pj-btn2" style="display:inline-block;cursor:pointer">⇪ استيراد ملف المخطط (DXF / KML / GeoJSON)<input type="file" accept=".dxf,.geojson,.json,.kml" style="display:none" onchange="pjGeoImport(this)"></label>'
      +(placed?'<button class="pj-mini" style="color:#ef4444" onclick="pjGeoClearAll()">حذف كل الرسم</button>':'')
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
