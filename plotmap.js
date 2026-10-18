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
    function vis(){
      var want=map.getZoom()>=(opts.minZoom||0);
      if(want&&!shown){ if(overlay) overlay.addTo(map); group.addTo(map); labels.addTo(map); shown=true; }
      else if(!want&&shown){ if(overlay) map.removeLayer(overlay); map.removeLayer(group); map.removeLayer(labels); shown=false; }
      updLabels();
    }
    map.on('zoomend moveend',vis); vis();

    return {
      group:group, byId:byId, overlay:overlay, count:Object.keys(byId).length,
      bounds:function(){ return bounds(p); },
      center:function(id){ return centers[id]; },
      setFilter:function(fn){ _dim=fn; Object.keys(byId).forEach(restyle); },
      select:function(id){ var old=_sel; _sel=id||null; if(old) restyle(old); if(_sel) restyle(_sel); },
      remove:function(){ map.off('zoomend moveend',vis); if(overlay) map.removeLayer(overlay); map.removeLayer(group); map.removeLayer(labels); }
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

  window.SharkPlotMap={COLORS:COL,status:st,corners:corners,imgToLatLng:imgToLatLng,unitShape:unitShape,centroid:centroid,
    hasGeo:hasGeo,bounds:bounds,RotatedImage:RotatedImage,render:render,baseLayers:baseLayers};
})();
