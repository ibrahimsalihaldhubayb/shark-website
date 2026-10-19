/* ══════════════════════════════════════════════
   SharkPlotMap — رسم قطع المشاريع على الخريطة الحقيقية (Leaflet)
   • القطعة لها مضلّع جغرافي u.g = [lat,lng,lat,lng,...]
   • أو نقطة على صورة المخطط (u.x,u.y %) + صورة مخطط مثبتة على الخريطة p.planCorners = [tlLat,tlLng,trLat,trLng,blLat,blLng]
   يحتاج Leaflet محمّل قبله.
   ══════════════════════════════════════════════ */
(function(){
  var COL={
    available:{fill:'#4fa776',line:'#2f7d52',label:'متاحة للبيع'},
    reserved: {fill:'#b3aea8',line:'#8c877f',label:'محجوزة'},
    sold:     {fill:'#c25b6e',line:'#983c4f',label:'مباعة'}
  };
  function st(u){ return COL[u&&u.status]?u.status:'available'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function corners(p){
    var c=p&&p.planCorners; if(!c||c.length!==6) return null;
    return {tl:[c[0],c[1]],tr:[c[2],c[3]],bl:[c[4],c[5]]};
  }
  /* نقطة على الصورة (0..1) ← إحداثيات */
  function imgToLatLng(c,x,y){
    return [c.tl[0]+x*(c.tr[0]-c.tl[0])+y*(c.bl[0]-c.tl[0]), c.tl[1]+x*(c.tr[1]-c.tl[1])+y*(c.bl[1]-c.tl[1])];
  }
  function unitShape(p,u){
    if(u.g&&u.g.length>=6){
      var a=[]; for(var i=0;i+1<u.g.length;i+=2) a.push([Number(u.g[i]),Number(u.g[i+1])]);
      return {type:'poly',latlngs:a};
    }
    var c=corners(p);
    if(c&&u.x!=null&&u.x!==''&&u.y!=null&&u.y!=='') return {type:'point',latlng:imgToLatLng(c,u.x/100,u.y/100)};
    return null;
  }
  function centroid(ll){ var a=0,b=0; ll.forEach(function(q){a+=q[0];b+=q[1];}); return [a/ll.length,b/ll.length]; }
  function hasGeo(p){ return !!(p&&(p.units||[]).some(function(u){return !!unitShape(p,u);})); }

  /* حدود المشروع على الخريطة */
  function bounds(p){
    var pts=[];
    (p.units||[]).forEach(function(u){ var s=unitShape(p,u); if(!s) return; if(s.type==='poly') pts=pts.concat(s.latlngs); else pts.push(s.latlng); });
    var c=corners(p); if(c){ pts.push(c.tl,c.tr,c.bl,[c.tr[0]+c.bl[0]-c.tl[0],c.tr[1]+c.bl[1]-c.tl[1]]); }
    return pts.length?L.latLngBounds(pts):null;
  }

  /* صورة مدوّرة/مائلة مثبتة بثلاث زوايا */
  var _Rot=null;
  function RotatedImage(url,c,opts){
    if(!_Rot){
      _Rot=L.Layer.extend({
        initialize:function(url,c,opts){ this._url=url; this._c=c; L.setOptions(this,opts||{}); },
        getPane:function(){ var m=this._map; return m.getPane('sharkPlan')||(function(){ var pn=m.createPane('sharkPlan'); pn.style.zIndex=350; pn.style.pointerEvents='none'; return pn; })(); },
        onAdd:function(map){
          var img=this._img=L.DomUtil.create('img','leaflet-image-layer leaflet-zoom-hide');
          img.style.cssText='position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;max-width:none;opacity:'+(this.options.opacity==null?1:this.options.opacity);
          img.onload=this._reset.bind(this); img.src=this._url;
          this.getPane().appendChild(img);
          map.on('zoomend viewreset',this._reset,this);
          this._reset();
        },
        onRemove:function(map){ L.DomUtil.remove(this._img); map.off('zoomend viewreset',this._reset,this); },
        setCorners:function(c){ this._c=c; this._reset(); return this; },
        setOpacity:function(o){ this.options.opacity=o; if(this._img) this._img.style.opacity=o; return this; },
        _reset:function(){
          var img=this._img, m=this._map; if(!img||!m) return;
          var w=img.naturalWidth, h=img.naturalHeight; if(!w||!h) return;
          img.style.width=w+'px'; img.style.height=h+'px';
          var tl=m.latLngToLayerPoint(this._c.tl), tr=m.latLngToLayerPoint(this._c.tr), bl=m.latLngToLayerPoint(this._c.bl);
          img.style.transform='matrix('+[(tr.x-tl.x)/w,(tr.y-tl.y)/w,(bl.x-tl.x)/h,(bl.y-tl.y)/h,tl.x,tl.y].join(',')+')';
        }
      });
    }
    return new _Rot(url,c,opts);
  }


  /* ── أطوال القطعة والكروكي ── */
  var DIRS=[{k:'n',ar:'شمال',arx:'شمالاً'},{k:'e',ar:'شرق',arx:'شرقاً'},{k:'s',ar:'جنوب',arx:'جنوباً'},{k:'w',ar:'غرب',arx:'غرباً'}];
  /* أمتار لكل درجة عند خط العرض (دقيقة على الإهليلج) */
  function mPerDeg(lat){ var r=lat*Math.PI/180; return {y:111132.954-559.822*Math.cos(2*r)+1.175*Math.cos(4*r), x:111412.84*Math.cos(r)-93.5*Math.cos(3*r)+.118*Math.cos(5*r)}; }
  function toXY(ll,lat0){ var k=mPerDeg(lat0); return ll.map(function(q){ return [q[1]*k.x,q[0]*k.y]; }); }
  function areaXY(xy){ var a=0; for(var i=0;i<xy.length;i++){ var p=xy[i],q=xy[(i+1)%xy.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a/2); }
  function segDist(p,a,b){ var dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0; t=Math.max(0,Math.min(1,t)); var x=a[0]+t*dx-p[0],y=a[1]+t*dy-p[1]; return Math.sqrt(x*x+y*y); }
  /**
   * أطوال أضلاع القطعة واتجاهاتها وحدودها (قطعة مجاورة أو شارع).
   * all = قائمة القطع لاكتشاف الجيران (اختياري)
   */
  function dims(p,u,all){
    var s=unitShape(p,u); if(!s||s.type!=='poly') return null;
    var ll=s.latlngs, lat0=ll[0][0], xy=toXY(ll,lat0), n=xy.length;
    var cx=0,cy=0; xy.forEach(function(q){cx+=q[0];cy+=q[1];}); cx/=n; cy/=n;
    var others=[];
    (all||[]).forEach(function(o){ if(o===u||o.id===u.id) return; var so=unitShape(p,o); if(so&&so.type==='poly') others.push({u:o,xy:toXY(so.latlngs,lat0)}); });
    var edges=[];
    for(var i=0;i<n;i++){
      var a=xy[i], b=xy[(i+1)%n], len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(len<.3) continue;
      var m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      var ang=Math.atan2(m[0]-cx,m[1]-cy)*180/Math.PI; if(ang<0) ang+=360;
      var dir=DIRS[Math.round(ang/90)%4];
      var nb=null;
      for(var j=0;j<others.length&&!nb;j++){ var oxy=others[j].xy; for(var k=0;k<oxy.length;k++){ if(segDist(m,oxy[k],oxy[(k+1)%oxy.length])<1.2){ nb=others[j].u; break; } } }
      var eang=Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI)%90;
      edges.push({len:len,dir:dir,neighbor:nb,a:a,b:b,ll:[ll[i],ll[(i+1)%n]],chamfer:!nb&&len<7&&eang>20&&eang<70});
    }
    var streets=edges.filter(function(e){return !e.neighbor&&!e.chamfer;}).length;
    return {edges:edges,area:areaXY(xy),xy:xy,c:[cx,cy],streets:streets};
  }
  function fmtLen(v){ return (Math.round(v*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function borderText(e,u,d){
    if(e.chamfer) return 'شطفة';
    if(e.neighbor) return 'قطعة '+e.neighbor.no;
    return 'شارع'+(u.street&&d&&d.streets===1?' عرض '+u.street+' م':'');
  }
  /* كروكي SVG للقطعة (الشمال للأعلى) */
  function croquisSVG(d,u,opt){
    opt=opt||{}; var W=opt.w||330, H=opt.h||260, padX=86, padY=52;
    var xs=d.xy.map(function(q){return q[0];}), ys=d.xy.map(function(q){return q[1];});
    var minx=Math.min.apply(null,xs), maxx=Math.max.apply(null,xs), miny=Math.min.apply(null,ys), maxy=Math.max.apply(null,ys);
    var sc=Math.min((W-2*padX)/Math.max(maxx-minx,1),(H-2*padY)/Math.max(maxy-miny,1));
    var ox=(W-(maxx-minx)*sc)/2, oy=(H-(maxy-miny)*sc)/2;
    function P(q){ return [ox+(q[0]-minx)*sc, H-(oy+(q[1]-miny)*sc)]; }
    var k=COL[st(u)], pts=d.xy.map(P), C=P(d.c);
    var svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:'+W+'px;display:block;margin:0 auto;font-family:Cairo,Tahoma,sans-serif" xmlns="http://www.w3.org/2000/svg">';
    svg+='<polygon points="'+pts.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ')+'" fill="'+k.fill+'" fill-opacity=".22" stroke="'+k.line+'" stroke-width="2"/>';
    d.edges.forEach(function(e){
      var a=P(e.a), b=P(e.b), mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      var vx=mx-C[0], vy=my-C[1], vl=Math.hypot(vx,vy)||1; vx/=vl; vy/=vl;
      // اتجاه عمودي على الضلع للخارج
      var ex=b[0]-a[0], ey=b[1]-a[1], el=Math.hypot(ex,ey)||1, nx=-ey/el, ny=ex/el; if(nx*vx+ny*vy<0){ nx=-nx; ny=-ny; }
      var big=e.len>=7||!e.chamfer, side=Math.abs(nx)>Math.abs(ny), t1x,t1y,t2x,t2y;
      if(side){ var off=big?34:22; t1x=t2x=mx+nx*off; t1y=my-3; t2y=my+11; }
      else { t1x=t2x=mx+nx*8; if(ny>0){ t1y=my+17; t2y=my+30; } else { t1y=my-7; t2y=my-21; } }
      svg+='<text x="'+t1x.toFixed(1)+'" y="'+t1y.toFixed(1)+'" text-anchor="middle" font-size="'+(big?12:10)+'" font-weight="800" fill="#1a1a22" direction="rtl">'+fmtLen(e.len)+' م</text>';
      if(big||!e.chamfer) svg+='<text x="'+t2x.toFixed(1)+'" y="'+t2y.toFixed(1)+'" text-anchor="middle" font-size="10" fill="'+(e.neighbor?'#7a7670':'#2563eb')+'" direction="rtl">'+esc(borderText(e,u,d))+'</text>';
    });
    svg+='<text x="'+C[0].toFixed(1)+'" y="'+(C[1]-2).toFixed(1)+'" text-anchor="middle" font-size="16" font-weight="900" fill="#1a1a22">'+esc(u.no)+'</text>';
    svg+='<text x="'+C[0].toFixed(1)+'" y="'+(C[1]+15).toFixed(1)+'" text-anchor="middle" font-size="11" fill="#57524b">'+fmtLen(d.area)+' م²</text>';
    svg+='<g transform="translate('+(W-22)+',24)"><path d="M0,-14 L6,6 L0,2 L-6,6 Z" fill="#1a1a22"/><text y="-17" text-anchor="middle" font-size="10" font-weight="800" fill="#1a1a22">N</text></g>';
    return svg+'</svg>';
  }
  /* جدول الحدود والأطوال */
  function dimsTable(d,u){
    var order={n:0,s:1,e:2,w:3};
    var rows=d.edges.slice().sort(function(x,y){ return order[x.dir.k]-order[y.dir.k]; });
    return '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
      +'<tr style="color:#7a7670;font-size:11px"><td style="padding:4px 6px">الحد</td><td style="padding:4px 6px">الطول (م)</td><td style="padding:4px 6px">يحده</td></tr>'
      +rows.map(function(e){ return '<tr style="border-top:1px solid rgba(128,128,128,.18)"><td style="padding:6px;font-weight:800">'+e.dir.arx+'</td><td style="padding:6px;font-weight:800">'+fmtLen(e.len)+'</td><td style="padding:6px">'+esc(borderText(e,u,d))+'</td></tr>'; }).join('')
      +'</table>';
  }

  /**
   * يرسم قطع مشروع على الخريطة.
   * opts: onClick(u,layer), planUrl, planOpacity, labelZoom, minZoom
   */
  function render(map,p,opts){
    opts=opts||{};
    var renderer=L.canvas({padding:.4,tolerance:3});
    var group=L.featureGroup(), byId={}, centers={}, labels=L.layerGroup(), overlay=null;
    var c=corners(p);
    if(opts.planUrl&&c){ overlay=RotatedImage(opts.planUrl,c,{opacity:opts.planOpacity==null?.55:opts.planOpacity}); }

    function styleOf(u,dim,sel){
      var k=COL[st(u)];
      return {color:sel?'#111':k.line,weight:sel?3:1,opacity:dim?.35:1,fillColor:k.fill,fillOpacity:dim?.15:.88};
    }
    (p.units||[]).forEach(function(u){
      var s=unitShape(p,u); if(!s) return;
      var lyr, k=COL[st(u)];
      if(s.type==='poly'){ lyr=L.polygon(s.latlngs,L.extend({renderer:renderer},styleOf(u))); centers[u.id]=centroid(s.latlngs); }
      else { lyr=L.circleMarker(s.latlng,{renderer:renderer,radius:8,color:'#fff',weight:1.5,fillColor:k.fill,fillOpacity:1}); centers[u.id]=s.latlng; }
      lyr._unit=u;
      lyr.on('click',function(e){ L.DomEvent.stopPropagation(e); if(opts.onClick) opts.onClick(u,lyr); });
      group.addLayer(lyr); byId[u.id]=lyr;
    });

    var _dim=null, _sel=null, shown=false;
    function restyle(id){
      var lyr=byId[id]; if(!lyr) return; var u=lyr._unit;
      var dim=_dim?!_dim(u):false, sel=_sel===id;
      if(lyr.setStyle&&lyr instanceof L.Polygon) lyr.setStyle(styleOf(u,dim,sel));
      else { var k=COL[st(u)]; lyr.setStyle({fillColor:k.fill,fillOpacity:dim?.25:1,color:sel?'#111':'#fff',weight:sel?3:1.5,opacity:dim?.4:1}); if(lyr.setRadius) lyr.setRadius(sel?10:8); }
    }
    function updLabels(){
      labels.clearLayers();
      if(!shown||map.getZoom()<(opts.labelZoom||18)) return;
      var b=map.getBounds().pad(.15), n=0;
      Object.keys(byId).forEach(function(id){
        var ll=centers[id]; if(!ll||!b.contains(ll)||n>600) return; n++;
        var u=byId[id]._unit;
        labels.addLayer(L.marker(ll,{interactive:false,keyboard:false,icon:L.divIcon({className:'plot-lbl',iconSize:null,html:'<span>'+esc(u.no)+'</span>'})}));
      });
    }
    var dimL=L.layerGroup();
    function updDims(){
      dimL.clearLayers();
      if(!_sel||!shown||map.getZoom()<(opts.dimZoom||17)) return;
      var u=byId[_sel]&&byId[_sel]._unit, d=u&&dims(p,u,null); if(!d) return;
      d.edges.forEach(function(e){
        var m=[(e.ll[0][0]+e.ll[1][0])/2,(e.ll[0][1]+e.ll[1][1])/2];
        dimL.addLayer(L.marker(m,{interactive:false,keyboard:false,icon:L.divIcon({className:'plot-dim',iconSize:null,html:'<span>'+fmtLen(e.len)+'م</span>'})}));
      });
    }
    if(!document.getElementById('shark-dim-css')){ var dcs=document.createElement('style'); dcs.id='shark-dim-css'; dcs.textContent='.plot-dim span{display:block;transform:translate(-50%,-50%);background:#1a1a22;color:#fff;font:800 10px Cairo,Tahoma,sans-serif;padding:1px 6px;border-radius:8px;white-space:nowrap;direction:rtl;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.3)}'; document.head.appendChild(dcs); }
    function vis(){
      var want=map.getZoom()>=(opts.minZoom||0);
      if(want&&!shown){ if(overlay) overlay.addTo(map); group.addTo(map); labels.addTo(map); dimL.addTo(map); shown=true; }
      else if(!want&&shown){ if(overlay) map.removeLayer(overlay); map.removeLayer(group); map.removeLayer(labels); map.removeLayer(dimL); shown=false; }
      updLabels(); updDims();
    }
    map.on('zoomend moveend',vis); vis();

    return {
      group:group, byId:byId, overlay:overlay, count:Object.keys(byId).length,
      bounds:function(){ return bounds(p); },
      center:function(id){ return centers[id]; },
      setFilter:function(fn){ _dim=fn; Object.keys(byId).forEach(restyle); },
      select:function(id){ var old=_sel; _sel=id||null; if(old) restyle(old); if(_sel) restyle(_sel); updDims(); },
      remove:function(){ map.off('zoomend moveend',vis); if(overlay) map.removeLayer(overlay); map.removeLayer(group); map.removeLayer(labels); map.removeLayer(dimL); }
    };
  }

  /* طبقات الخريطة الأساسية — مصادر لا تحتاج مفتاح API */
  function baseLayers(){
    if(!document.getElementById('shark-tiles-css')){
      var st=document.createElement('style'); st.id='shark-tiles-css';
      st.textContent='.tiles-soft{filter:saturate(.45) brightness(1.04) contrast(.94)}';
      document.head.appendChild(st);
    }
    return {
      light:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:19,className:'tiles-soft',attribution:'© OpenStreetMap'}),
      sat:L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:'© Esri'}),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19})
      ])
    };
  }

  window.SharkPlotMap={mPerDeg:mPerDeg,dims:dims,croquisSVG:croquisSVG,dimsTable:dimsTable,fmtLen:fmtLen,COLORS:COL,status:st,corners:corners,imgToLatLng:imgToLatLng,unitShape:unitShape,centroid:centroid,
    hasGeo:hasGeo,bounds:bounds,RotatedImage:RotatedImage,render:render,baseLayers:baseLayers};
})();
