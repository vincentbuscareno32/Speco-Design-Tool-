// ── GOOGLE MAPS ───────────────────────────────────────────────────────────
function initMapsAC(){
  if(mapsACInit||!window.google||!window.google.maps||!window.google.maps.places)return;
  const input=document.getElementById('mapsAddress');
  const ac=new google.maps.places.Autocomplete(input,{types:['geocode','establishment']});
  ac.addListener('place_changed',()=>{
    const place=ac.getPlace();
    if(place.geometry&&place.geometry.location){
      showMap();
      if(!googleMapObj)buildMap(place.geometry.location);
      else{googleMapObj.setCenter(place.geometry.location);googleMapObj.setZoom(19);}
    }
  });
  mapsACInit=true;
}
setInterval(()=>{if(activeTab==='maps')initMapsAC();},500);

function showMap(){
  document.getElementById('mapsPrompt').style.display='none';
  document.getElementById('googleMap').style.display='block';
}
function loadMap(){
  const addr=document.getElementById('mapsAddress').value.trim();
  if(!addr){document.getElementById('mapsAddress').focus();return;}
  if(!window.google||!window.google.maps){
    let n=0;const t=setInterval(()=>{n++;if(window.google&&window.google.maps){clearInterval(t);loadMap();}else if(n>50){clearInterval(t);alert('Google Maps failed to load.');}},100);return;
  }
  showMap();
  const geocoder=new google.maps.Geocoder();
  geocoder.geocode({address:addr},function(results,status){
    if(status==='OK'){if(!googleMapObj)buildMap(results[0].geometry.location);else{googleMapObj.setCenter(results[0].geometry.location);googleMapObj.setZoom(19);}}
    else alert('Could not find: '+addr);
  });
  initMapsAC();
}
function buildMap(center){
  googleMapObj=new google.maps.Map(document.getElementById('googleMap'),{
    zoom:19,center:center||{lat:40.7128,lng:-74.006},
    mapTypeId:'satellite',tilt:0,mapTypeControl:true,streetViewControl:false,fullscreenControl:true,gestureHandling:'greedy',
  });
  googleMapObj.addListener('tilesloaded',()=>{
    document.getElementById('mapLockBtn').style.display='flex';
    document.getElementById('lockHint').style.display='inline';
    googleMapObj.addListener('bounds_changed',()=>{renderMapMarkers();drawMapFov();});
    googleMapObj.addListener('zoom_changed',()=>{renderMapMarkers();drawMapFov();});
  });
}

// ── GOOGLE MAPS FOV CANVAS ────────────────────────────────────────────────
function getMapFovCanvas(){
  const mapDiv=document.getElementById('googleMap');
  if(!mapDiv||!mapDiv.offsetWidth)return null;
  let c=document.getElementById('mapFovCanvas');
  if(!c){
    c=document.createElement('canvas');
    c.id='mapFovCanvas';
    c.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:6;';
    mapDiv.appendChild(c);
  }
  c.width=mapDiv.offsetWidth;
  c.height=mapDiv.offsetHeight;
  return c;
}

function drawMapFov(){
  if(!googleMapObj||!googleMapObj.getBounds())return;
  const c=getMapFovCanvas();if(!c)return;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  if(!showFov)return;
  const lat=googleMapObj.getCenter().lat();
  const zoom=googleMapObj.getZoom();
  const mpp=metersPerPixel(lat,zoom);
  mapMarkers.forEach((m,i)=>{
    if(m.product.category!=='Cameras')return;
    const pos=getMapPixel(m.lat,m.lng);
    if(!pos)return;
    const mult=m.fovRangeMult||1.0;
    const angle=m.fovAngle||0;
    const col=cc(m.product.category);
    // Use effective specs (handles motorized zoom)
    const eSpecs=getEffectiveSpecs({product:m.product,angle,fovRangeMult:mult,zoomPos:m.zoomPos||0});
    if(!eSpecs)return;
    const halfA=eSpecs.fovDeg/2*Math.PI/180;
    const doriM=eSpecs.dori||{};
    // Draw DORI zones (real-world scale in meters)
    for(const zone of['detection','observation','recognition','identification']){
      const ft=(doriM[zone]||0)*mult;
      if(!ft)continue;
      const rP=Math.min(ftToM(ft)/mpp,600);
      ctx.save();
      ctx.beginPath();ctx.moveTo(pos.x,pos.y);ctx.arc(pos.x,pos.y,rP,angle-halfA,angle+halfA);ctx.closePath();
      ctx.fillStyle=DORI_COLORS[zone];ctx.fill();
      ctx.strokeStyle=DORI_STROKES[zone];ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
      ctx.save();ctx.font='bold 10px sans-serif';ctx.fillStyle=DORI_STROKES[zone];
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(Math.round(ft)+'ft',pos.x+Math.cos(angle)*rP*0.72,pos.y+Math.sin(angle)*rP*0.72);
      ctx.restore();
    }
    const detFtM=(doriM.detection||eSpecs.irFt||100)*mult;
    const rangeP=Math.min(ftToM(detFtM)/mpp,600);
    const hx=pos.x+Math.cos(angle)*rangeP;
    const hy=pos.y+Math.sin(angle)*rangeP;
    // Outer label
    ctx.save();
    ctx.font='bold 11px sans-serif';ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(eSpecs.fovDeg+'\u00b0 \u00b7 '+Math.round(detFtM)+'ft',pos.x+Math.cos(angle)*rangeP*0.5,pos.y+Math.sin(angle)*rangeP*0.5-12);
    ctx.restore();
    // Rotation handle
    ctx.save();
    ctx.beginPath();ctx.arc(hx,hy,9,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
    ctx.font='bold 13px sans-serif';ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('\u27f3',hx,hy+1);
    ctx.restore();
    // Person range handle
    const ppx=pos.x+Math.cos(angle)*(rangeP+30);
    const ppy=pos.y+Math.sin(angle)*(rangeP+30);
    ctx.save();
    ctx.setLineDash([3,3]);ctx.strokeStyle=col+'77';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(hx+Math.cos(angle)*9,hy+Math.sin(angle)*9);ctx.lineTo(ppx-Math.cos(angle)*8,ppy-Math.sin(angle)*8);ctx.stroke();
    ctx.setLineDash([]);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.fillStyle='#fff';
    ctx.save();ctx.translate(ppx,ppy);ctx.rotate(angle+Math.PI/2);
    ctx.beginPath();ctx.arc(0,-6,6,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,10);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-6,4);ctx.lineTo(6,4);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(-5,18);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(5,18);ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Store both handle positions
    m._fovHandle={x:hx,y:hy};
    m._fovPersonHandle={x:ppx,y:ppy};
  });
}

// ── MAP LOCK & PLACE ──────────────────────────────────────────────────────
function toggleMapLock(){
  mapLocked=!mapLocked;
  const btn=document.getElementById('mapLockBtn');
  const overlay=document.getElementById('mapOverlay');
  const hint=document.getElementById('lockHint');
  if(mapLocked){
    btn.classList.add('locked');document.getElementById('lockLabel').textContent='Unlock Map';
    overlay.classList.add('locked');hint.textContent='LOCKED \u2014 select product + click to place';
    googleMapObj.setOptions({draggable:false,scrollwheel:false,disableDoubleClickZoom:true});
  } else {
    btn.classList.remove('locked');document.getElementById('lockLabel').textContent='Lock & Place';
    overlay.classList.remove('locked');hint.textContent='Pan & zoom freely';
    googleMapObj.setOptions({draggable:true,scrollwheel:true,disableDoubleClickZoom:false});
    hideAllMapTips();
  }
}

function getMapPixel(lat,lng){
  if(!googleMapObj||!googleMapObj.getBounds())return null;
  const b=googleMapObj.getBounds();const ne=b.getNorthEast(),sw=b.getSouthWest();
  const r=document.getElementById('googleMap').getBoundingClientRect();
  if(!r.width||!r.height)return null;
  return{x:(lng-sw.lng())/(ne.lng()-sw.lng())*r.width,y:(ne.lat()-lat)/(ne.lat()-sw.lat())*r.height};
}
function pixelToLatLng(clientX,clientY){
  if(!googleMapObj||!googleMapObj.getBounds())return null;
  const b=googleMapObj.getBounds();const ne=b.getNorthEast(),sw=b.getSouthWest();
  const r=document.getElementById('googleMap').getBoundingClientRect();
  if(!r.width||!r.height)return null;
  return{lat:ne.lat()-((clientY-r.top)/r.height)*(ne.lat()-sw.lat()),lng:sw.lng()+((clientX-r.left)/r.width)*(ne.lng()-sw.lng())};
}

function renderMapMarkers(){
  const overlay=document.getElementById('mapOverlay');
  if(!googleMapObj||!googleMapObj.getBounds())return;
  mapMarkers.forEach((m,i)=>{
    const pos=getMapPixel(m.lat,m.lng);if(!pos)return;
    if(!m.el){
      const wrap=document.createElement('div');wrap.className='map-marker';
      const iconSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${catIcon(m.product.category)}</svg>`;
      wrap.innerHTML=`<div class="map-marker-pin" style="background:${cc(m.product.category)};display:flex;align-items:center;justify-content:center">${iconSvg}</div><div class="map-marker-num" style="position:absolute;top:-5px;right:-5px;width:14px;height:14px;border-radius:50%;background:#fff;border:1.5px solid ${cc(m.product.category)};font-size:8px;font-weight:700;color:${cc(m.product.category)};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace">${i+1}</div><div class="map-marker-label">${m.product.sku.length>8?m.product.sku.substring(0,7)+'\u2026':m.product.sku}</div>`;
      wrap.style.position='absolute';
      const tip=document.createElement('div');tip.className='map-marker-tip';
      tip.innerHTML=`<strong style="font-size:13px;color:var(--blue-text)">${m.product.sku}</strong><br><span style="color:var(--text2);white-space:normal;line-height:1.4;display:block;max-width:220px">${m.product.description}</span><span style="color:var(--cyan);font-weight:600;display:block;margin-top:4px">MAP: $${m.product.map.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span style="color:var(--red);cursor:pointer;display:block;margin-top:5px;font-size:10px" onclick="removeMapMarker(${i})">\u2715 Remove</span>`;
      wrap.appendChild(tip);overlay.appendChild(wrap);m.el=wrap;m.tipEl=tip;

      // Marker mousedown — only handles LEFT button drag, stores markerIdx on element
      wrap.addEventListener('mousedown',e=>{
        if(e.button!==0)return;
        e.preventDefault();
        // Store which marker is being dragged directly on the event target
        // so we don't use a global index that can go stale
        wrap._dragStartX=e.clientX;
        wrap._dragStartY=e.clientY;
        wrap._dragging=true;
        wrap._dragMoved=false;
        wrap._markerIdx=i;
      });

      // Right-click removes — always reset all state after
      wrap.addEventListener('contextmenu',e=>{
        e.preventDefault();
        e.stopPropagation();
        // Reset ALL state before removing so nothing gets stuck
        mDragIdx=-1;mDragMoved=false;mapPlacePending=null;
        removeMapMarker(i);
      });

      // Double-click camera marker to show lens preview
      if(m.product.category==='Cameras'){
        wrap.addEventListener('dblclick',e=>{
          e.stopPropagation();
          e.preventDefault();
          showLensPreview(e.clientX,e.clientY,parseCameraSpecs(m.product));
        });
      }
    }
    const nb=m.el.querySelector('.map-marker-num');if(nb)nb.textContent=i+1;
    m.el.style.left=pos.x+'px';m.el.style.top=pos.y+'px';
  });
}
function removeMapMarker(i){
  if(mapMarkers[i]&&mapMarkers[i].el)mapMarkers[i].el.remove();
  mapMarkers.splice(i,1);
  mapMarkers.forEach(m=>{if(m.el){m.el.remove();m.el=null;m.tipEl=null;}});
  // Reset ALL drag state — fresh slate after any removal
  mDragIdx=-1;mDragMoved=false;mapPlacePending=null;
  renderMapMarkers();drawMapFov();updateBOM();
}
function hideAllMapTips(){mapMarkers.forEach(m=>{if(m.tipEl)m.tipEl.style.display='none';});}

// ── MAP OVERLAY EVENTS ────────────────────────────────────────────────────
const _overlay=document.getElementById('mapOverlay');
let mapFovDragType=null;
let mapPlacePending=null;
let _activeDragWrap=null; // tracks which marker wrap is being dragged

_overlay.addEventListener('mousedown',e=>{
  if(!mapLocked)return;
  const r=document.getElementById('googleMap').getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;

  // Check FOV handles
  if(showFov){
    for(let i=0;i<mapMarkers.length;i++){
      const m=mapMarkers[i];
      if(m._fovPersonHandle&&Math.hypot(mx-m._fovPersonHandle.x,my-m._fovPersonHandle.y)<14){
        mapFovDragIdx=i;mapFovDragType='range';
        mapPlacePending=null;e.preventDefault();return;
      }
      if(m._fovHandle&&Math.hypot(mx-m._fovHandle.x,my-m._fovHandle.y)<14){
        mapFovDragIdx=i;mapFovDragType='rotate';
        mapPlacePending=null;e.preventDefault();return;
      }
    }
  }

  // Check if click is on a marker element (walk up DOM)
  let el=e.target;
  let onMarker=false;
  while(el&&el!==_overlay){
    if(el._dragging!==undefined||el.classList&&el.classList.contains('map-marker')){
      onMarker=true;_activeDragWrap=el;break;
    }
    el=el.parentElement;
  }
  if(onMarker){
    mapPlacePending=null; // don't place when clicking a marker
    return;
  }

  // Empty map click — set pending placement
  if(e.button===0&&selProd&&googleMapObj){
    mapPlacePending={clientX:e.clientX,clientY:e.clientY};
  }
},true);

_overlay.addEventListener('mousemove',e=>{
  if(mapFovDragIdx>=0){
    mapPlacePending=null;
    const r=document.getElementById('googleMap').getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    const m=mapMarkers[mapFovDragIdx];
    const pos=m?getMapPixel(m.lat,m.lng):null;
    if(pos){
      if(mapFovDragType==='rotate'){
        m.fovAngle=Math.atan2(my-pos.y,mx-pos.x);
      } else {
        const dist=Math.hypot(mx-pos.x,my-pos.y);
        const specs3=parseCameraSpecs(m.product);
        const lat=googleMapObj.getCenter().lat();
        const zoom=googleMapObj.getZoom();
        const mpp=metersPerPixel(lat,zoom);
        const dori3=specs3&&specs3.dori?specs3.dori:(specs3&&specs3.wideDori?specs3.wideDori:{});
        const detFt3=dori3.detection||specs3&&specs3.irFt||100;
        const base=ftToM(detFt3)/mpp;
        m.fovRangeMult=Math.max(0.1,Math.min(dist/base,1.0));
      }
      drawMapFov();
    }
    return;
  }
  // Handle marker drag via wrap element
  if(_activeDragWrap&&_activeDragWrap._dragging){
    mapPlacePending=null;
    const dx=Math.abs(e.clientX-_activeDragWrap._dragStartX);
    const dy=Math.abs(e.clientY-_activeDragWrap._dragStartY);
    if(dx>3||dy>3){
      _activeDragWrap._dragMoved=true;
      const idx=_activeDragWrap._markerIdx;
      if(idx>=0&&idx<mapMarkers.length){
        const pos=pixelToLatLng(e.clientX,e.clientY);
        if(pos){mapMarkers[idx].lat=pos.lat;mapMarkers[idx].lng=pos.lng;renderMapMarkers();drawMapFov();}
      }
    }
  }
});

_overlay.addEventListener('mouseup',e=>{
  // Marker drag ended
  if(_activeDragWrap&&_activeDragWrap._dragging){
    const moved=_activeDragWrap._dragMoved;
    const idx=_activeDragWrap._markerIdx;
    if(!moved&&idx>=0&&idx<mapMarkers.length){
      const m=mapMarkers[idx];
      if(m&&m.tipEl){hideAllMapTips();m.tipEl.style.display='block';setTimeout(()=>{if(m.tipEl)m.tipEl.style.display='none';},5000);}
    }
    _activeDragWrap._dragging=false;
    _activeDragWrap._dragMoved=false;
    _activeDragWrap=null;
    mapPlacePending=null;
    return;
  }
  // FOV drag — handled by window mouseup
  if(mapFovDragIdx>=0){mapPlacePending=null;return;}
  // Place new marker
  if(mapPlacePending&&e.button===0&&selProd&&googleMapObj&&mapLocked){
    hideAllMapTips();
    const pos=pixelToLatLng(mapPlacePending.clientX,mapPlacePending.clientY);
    if(pos){
      mapMarkers.push({product:selProd,lat:pos.lat,lng:pos.lng,el:null,tipEl:null,fovAngle:0,fovRangeMult:1.0});
      renderMapMarkers();
      setTimeout(drawMapFov,100);
      updateBOM();
      const tot=placements.length+mapMarkers.length;
      document.getElementById('statusCount').textContent=`${tot} item${tot!==1?'s':''} placed`;
    }
  }
  mapPlacePending=null;
});

window.addEventListener('mouseup',e=>{
  mapPlacePending=null; // always clear on any mouseup anywhere
  _activeDragWrap=null; // always clear marker drag
  if(mapFovDragIdx>=0){mapFovDragIdx=-1;mapFovDragType=null;}
  if(dragIdx>=0){dragIdx=-1;redraw();}
});

