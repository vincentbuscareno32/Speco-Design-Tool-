// ── CANVAS INTERACTION ────────────────────────────────────────────────────
// Module-level FOV drag flag
let fovDragWasActive=false;

function setupCanvas(cvs,tipEl,sk){
  function xy(e){const r=cvs.getBoundingClientRect();return{x:(e.clientX-r.left)*(CS[sk].w/r.width),y:(e.clientY-r.top)*(CS[sk].h/r.height)};}
  function hit(x,y){return placements.findIndex(pl=>Math.hypot(pl.x-x,pl.y-y)<=16);}

  let fovDragging=null;
  let mouseDownPos=null; // track where mousedown landed

  cvs.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    hideTip(tipEl); // always clear tip on any canvas touch
    const{x,y}=xy(e);

    // Check FOV handle
    const fh=getFovHandleHit(x,y);
    if(fh){
      fovDragging=fh;
      cvs.style.cursor='grabbing';
      e.preventDefault();
      return;
    }

    // Check existing placement drag
    const h=hit(x,y);
    if(h>=0){
      dragIdx=h;dragOX=x-placements[h].x;dragOY=y-placements[h].y;
      dragMoved=false;hideTip(tipEl);cvs.style.cursor='grabbing';
      e.preventDefault();
      return;
    }

    // Record mousedown position for potential placement on mouseup
    mouseDownPos={x,y};
    e.preventDefault();
  });

  cvs.addEventListener('mousemove',e=>{
    const{x,y}=xy(e);
    if(fovDragging){
      const pl=placements[fovDragging.idx];
      if(pl){
        if(fovDragging.type==='rotate'){
          pl.angle=Math.atan2(y-pl.y,x-pl.x);
        } else {
          const dist=Math.hypot(x-pl.x,y-pl.y);
          const specs=getEffectiveSpecs(pl);
          const dori=specs&&specs.dori?specs.dori:{};
          const detFt=(dori.detection||specs&&specs.irFt||100);
          const basePixels=detFt*2.5;
          pl.fovRangeMult=Math.max(0.1,Math.min(dist/basePixels,1.0));
        }
        redraw();
      }
      // Cancel any pending placement since we're doing a FOV drag
      mouseDownPos=null;
      return;
    }
    if(dragIdx>=0){
      placements[dragIdx].x=x-dragOX;placements[dragIdx].y=y-dragOY;
      dragMoved=true;redraw();
      mouseDownPos=null; // cancel placement — user is dragging
      return;
    }
    const fh=getFovHandleHit(x,y);
    cvs.style.cursor=fh?'grab':hit(x,y)>=0?'grab':(selProd?'crosshair':'default');
  });

  cvs.addEventListener('mouseup',e=>{
    // FOV drag ended — clear state, NO placement
    if(fovDragging){
      fovDragging=null;
      mouseDownPos=null;
      cvs.style.cursor='default';
      redraw();
      return;
    }

    // Item drag ended
    if(dragIdx>=0){
      if(!dragMoved)showTip(placements[dragIdx],dragIdx,e.clientX,e.clientY,tipEl,cvs);
      dragIdx=-1;dragMoved=false;
      mouseDownPos=null;
      redraw();
      return;
    }

    // Simple click on empty canvas — place product only if mouseDownPos still set
    // (it gets cleared on any drag/FOV operation in mousemove)
    if(mouseDownPos&&selProd){
      placements.push({product:selProd,x:mouseDownPos.x,y:mouseDownPos.y,angle:0,fovRangeMult:1.0});
      redraw();updateBOM();
      const tot=placements.length+mapMarkers.length;
      document.getElementById('statusCount').textContent=`${tot} item${tot!==1?'s':''} placed`;
    }
    mouseDownPos=null;
  });

  // No click listener — everything handled in mousedown/mouseup above

  cvs.addEventListener('contextmenu',e=>{
    e.preventDefault();const{x,y}=xy(e);const h=hit(x,y);
    if(h>=0){placements.splice(h,1);redraw();updateBOM();hideTip(tipEl);}
  });
}
function showTip(pl,idx,cx,cy,tipEl,cvs){
  tipEl.innerHTML=`<div class="tsku">${pl.product.sku}</div><div class="tdesc">${pl.product.description}</div><div class="tprice">MAP: $${pl.product.map.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><span class="tdel" onclick="removePlacement(${idx})">\u2715 Remove this placement</span>`;
  tipEl.style.display='block';tipEl.style.pointerEvents='none';
  const wr=cvs.closest('.cvs-wrap').getBoundingClientRect();
  let lx=cx-wr.left+14,ly=cy-wr.top-10;
  if(lx+265>wr.width)lx=cx-wr.left-270;
  tipEl.style.left=lx+'px';tipEl.style.top=ly+'px';
  clearTimeout(tipTimer);tipTimer=setTimeout(()=>hideTip(tipEl),6000);
}
function hideTip(el){if(el){el.style.display='none';el.style.pointerEvents='none';}}
function hideAllTips(){hideTip(document.getElementById('tipBlank'));hideTip(document.getElementById('tipEmap'));}
function removePlacement(i){placements.splice(i,1);redraw();updateBOM();hideAllTips();}

setupCanvas(document.getElementById('blankCanvas'),document.getElementById('tipBlank'),'blank');
setupCanvas(document.getElementById('emapCanvas'),document.getElementById('tipEmap'),'emap');
// Set up lens preview click listeners
setTimeout(()=>{
  setupLensPreviewHover(document.getElementById('blankCanvas'),'blank');
  setupLensPreviewHover(document.getElementById('emapCanvas'),'emap');
},300);

// ── CONTROLS ──────────────────────────────────────────────────────────────
function toggleFov(btn){showFov=!showFov;btn.classList.toggle('on',showFov);redraw();drawMapFov();}

// ── PLACEMENT RECOVERY — call this whenever placement seems stuck ─────────
function resetPlacementState(){
  dragIdx=-1;dragMoved=false;
  mDragIdx=-1;mDragMoved=false;
  mapFovDragIdx=-1;mapFovDragType=null;
  mapPlacePending=null;
  if(typeof _activeDragWrap!=='undefined'&&_activeDragWrap){
    _activeDragWrap._dragging=false;_activeDragWrap._dragMoved=false;_activeDragWrap=null;
  }
  document.body.style.pointerEvents='';
  document.body.style.userSelect='';
  const overlay=document.getElementById('mapOverlay');
  if(overlay){if(mapLocked)overlay.classList.add('locked');else overlay.classList.remove('locked');}
  hideAllTips();hideAllMapTips();
  redraw();
  if(typeof drawMapFov==='function')drawMapFov();
}
function clearAll(){
  if((placements.length||mapMarkers.length)&&!confirm('Clear all placements?'))return;
  placements=[];mapMarkers.forEach(m=>{if(m.el)m.el.remove();});mapMarkers=[];
  redraw();drawMapFov();updateBOM();document.getElementById('statusCount').textContent='';
}

// ── BOM ───────────────────────────────────────────────────────────────────
function updateBOM(){
  const counts={};
  placements.forEach(pl=>{if(!counts[pl.product.sku])counts[pl.product.sku]={product:pl.product,qty:0};counts[pl.product.sku].qty++;});
  mapMarkers.forEach(m=>{if(!counts[m.product.sku])counts[m.product.sku]={product:m.product,qty:0};counts[m.product.sku].qty++;});
  const items=Object.values(counts);
  const badge=document.getElementById('bomBadge');
  badge.textContent=items.length;badge.style.display=items.length?'inline':'none';
  const total=items.reduce((s,it)=>s+it.product.map*it.qty,0);
  document.getElementById('bomSum').innerHTML=items.length?`MAP total: <strong>$${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>`:'';
  const body=document.getElementById('bomBody');
  if(!items.length){body.innerHTML='<div class="bom-empty">No products placed yet</div>';return;}
  body.innerHTML=`<table><thead><tr><th>#</th><th>SKU</th><th>Description</th><th>Category</th><th style="text-align:center">Qty</th><th style="text-align:right">MAP Unit</th><th style="text-align:right">MAP Total</th><th></th></tr></thead><tbody>${items.map((it,i)=>`<tr><td style="color:#8A94AA;font-size:10px">${i+1}</td><td class="tsku-cell">${it.product.sku}</td><td style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4A5568">${it.product.description}</td><td><span class="cbadge" style="background:${cc(it.product.category)}18;color:${cc(it.product.category)}">${it.product.category}</span></td><td style="text-align:center"><span class="qn">${it.qty}</span></td><td class="pcell">$${it.product.map.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}<span class="map-lbl">MAP</span></td><td class="pcell">$${(it.product.map*it.qty).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td class="xbtn" onclick="removeSku('${it.product.sku}')">&#x2715;</td></tr>`).join('')}</tbody></table>`;
}
function adjQty(sku,d){
  if(d>0){const s=placements.find(p=>p.product.sku===sku);if(s)placements.push({...s,x:s.x+(Math.random()-.5)*40,y:s.y+(Math.random()-.5)*40});}
  else{const i=placements.reduce((b,p,j)=>p.product.sku===sku?j:b,-1);if(i>=0)placements.splice(i,1);}
  redraw();updateBOM();
}
function removeSku(sku){
  placements=placements.filter(p=>p.product.sku!==sku);
  mapMarkers.filter(m=>m.product.sku===sku).forEach(m=>{if(m.el)m.el.remove();});
  mapMarkers=mapMarkers.filter(m=>m.product.sku!==sku);
  redraw();drawMapFov();updateBOM();
}

// ── EXPORT ────────────────────────────────────────────────────────────────
function exportReport(){
  const counts={};
  placements.forEach(pl=>{if(!counts[pl.product.sku])counts[pl.product.sku]={product:pl.product,qty:0};counts[pl.product.sku].qty++;});
  mapMarkers.forEach(m=>{if(!counts[m.product.sku])counts[m.product.sku]={product:m.product,qty:0};counts[m.product.sku].qty++;});
  const items=Object.values(counts);
  if(!items.length){alert('No products placed yet.');return;}
  // Tip if on maps tab and locked
  if(activeTab==='maps'&&mapLocked){
    if(!confirm('Tip: For the best PDF export, unlock the map and zoom out so the full site is visible before exporting.\n\nClick OK to export now anyway, or Cancel to adjust the view first.')){return;}
  }
  const prog=document.createElement('div');
  prog.style.cssText='position:fixed;inset:0;background:rgba(0,48,135,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:#fff;font-family:"Inter",sans-serif;gap:14px';
  prog.innerHTML='<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px">GENERATING PDF</div><div id="progMsg" style="font-size:13px;opacity:0.75">Preparing...</div><div style="width:260px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px"><div id="progBar" style="height:4px;background:#00AEEF;border-radius:2px;width:5%;transition:width 0.3s"></div></div>';
  document.body.appendChild(prog);
  const setP=(pct,msg)=>{document.getElementById('progBar').style.width=pct+'%';document.getElementById('progMsg').textContent=msg;};
  function loadScript(src,cb){const s=document.createElement('script');s.src=src;s.onload=cb;s.onerror=()=>{alert('Failed to load PDF library.');prog.remove();};document.head.appendChild(s);}
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>{
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>{
      setTimeout(()=>buildPDF(items,prog,setP).catch(err=>{
        console.error('PDF error:',err);
        prog.remove();
        resetPlacementState();
        alert('PDF export failed: '+err.message);
      }),100);
    });
  });
}

function hexToRgb(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return{r:isNaN(r)?0:r,g:isNaN(g)?0:g,b:isNaN(b)?0:b};}

async function buildPDF(items,prog,setP){
  const{jsPDF}=window.jspdf;
  const SPECO_LOGO='data:image/png;base64,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';
  const proj=document.getElementById('projName').value||'Speco Security Project';
  const client=document.getElementById('clientName').value||'';
  const date=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const total=items.reduce((s,it)=>s+it.product.map*it.qty,0);
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const PW=210,PH=297,M=14;
  const API_KEY='AIzaSyCRsLrWARo43X_wHP_wTFP7LrEw7i9ZQng';

  // ── DESIGN TOKENS (matching app UI adapted for print) ────────────────────
  // Navy/dark header = #0b1628, blue accent = #1d7aff, cyan = #22d3a0
  // Print body bg = #f8f9fc, card bg = #fff, border = #dde3ed
  // Text primary = #0f1923, text2 = #4a5568, text3 = #8899aa
  const C={
    navyDark:[11,22,40],        // header fill
    navy:[0,48,135],            // headings, SKUs
    blue:[29,122,255],          // accent, links
    blueDim:[235,242,255],      // light accent bg
    cyan:[34,211,160],          // total, highlights
    cyanDim:[230,252,245],
    white:[255,255,255],
    bodyBg:[248,249,252],
    cardBg:[255,255,255],
    border:[221,227,237],
    borderDark:[180,195,220],
    text1:[15,25,35],
    text2:[74,85,104],
    text3:[136,153,170],
    rowAlt:[245,248,253],
    red:[239,68,68],
    headerAccent:[29,122,255],
  };

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function setFill(c){pdf.setFillColor(...c);}
  function setDraw(c){pdf.setDrawColor(...c);}
  function setTxt(c){pdf.setTextColor(...c);}
  function rect(x,y,w,h){pdf.rect(x,y,w,h,'F');}
  function recS(x,y,w,h){pdf.rect(x,y,w,h,'S');}
  function recFS(x,y,w,h){pdf.rect(x,y,w,h,'FD');}

  function captureCanvas(cvs){try{return cvs.toDataURL('image/jpeg',0.95);}catch(e){return null;}}
  async function fetchImgAsDataUrl(url){
    try{const r=await fetch(url);if(!r.ok)return null;const b=await r.blob();
      return new Promise(res=>{const fr=new FileReader();fr.onloadend=()=>res(fr.result);fr.onerror=()=>res(null);fr.readAsDataURL(b);});}
    catch(e){return null;}
  }
  function staticMapUrl(lat,lng,zoom,w,h){
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=satellite&key=${API_KEY}`;
  }

  // ── ICON CACHE ────────────────────────────────────────────────────────────
  const iconImgCache={};
  function buildIconImgAsync(cat,size){
    return new Promise(res=>{
      const key=cat+'_'+size;
      if(iconImgCache[key]){res(iconImgCache[key]);return;}
      const col=cc(cat);const rgb=hexToRgb(col);
      const c=document.createElement('canvas');c.width=size;c.height=size;
      const ctx2=c.getContext('2d');
      ctx2.beginPath();ctx2.arc(size/2,size/2,size/2-1,0,Math.PI*2);
      ctx2.fillStyle=`rgb(${rgb.r},${rgb.g},${rgb.b})`;ctx2.fill();
      ctx2.strokeStyle='rgba(255,255,255,0.9)';ctx2.lineWidth=Math.max(1,size/20);ctx2.stroke();
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${catIcon(cat)}</svg>`;
      const svgImg=new Image();
      svgImg.onload=()=>{
        const p=size*0.18;ctx2.drawImage(svgImg,p,p,size-p*2,size-p*2);
        const finalImg=new Image();
        finalImg.onload=()=>{iconImgCache[key]=finalImg;res(finalImg);};
        finalImg.onerror=()=>{iconImgCache[key]=finalImg;res(finalImg);};
        finalImg.src=c.toDataURL('image/png');
      };
      svgImg.onerror=()=>{
        const finalImg=new Image();
        finalImg.onload=()=>{iconImgCache[key]=finalImg;res(finalImg);};
        finalImg.src=c.toDataURL('image/png');
      };
      svgImg.src='data:image/svg+xml;base64,'+btoa(svg);
    });
  }
  function buildIconImg(cat,size){return iconImgCache[cat+'_'+size]||null;}
  const iconDataUrlCache={};
  function buildIconDataUrl(cat,size){
    const key=cat+'_'+size;
    if(iconDataUrlCache[key])return iconDataUrlCache[key];
    const el=iconImgCache[key];if(!el)return null;
    const c=document.createElement('canvas');c.width=size;c.height=size;
    c.getContext('2d').drawImage(el,0,0,size,size);
    const url=c.toDataURL('image/png');
    iconDataUrlCache[key]=url;return url;
  }

  const allCats=[...new Set([...placements,...mapMarkers].map(p=>p.product?p.product.category:p.category))];
  await Promise.all(allCats.flatMap(cat=>[14,20,32,40].map(sz=>buildIconImgAsync(cat,sz))));

  // ── HEADER (full-width navy with blue left accent strip) ──────────────────
  function drawHeader(title,sub){
    // Slightly deeper blue header bar
    setFill([22,100,210]);rect(0,0,PW,32);
    // Logo — white transparent PNG placed directly on blue header
    pdf.addImage(SPECO_LOGO,'PNG',M,5,28,15);
    // Title — moved right to give logo breathing room
    setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(13);
    pdf.text(title,M+32,14);
    // Sub
    if(sub){setTxt([220,235,255]);pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.text(sub,M+32,20.5);}
    // Right: date + client
    setTxt([220,235,255]);pdf.setFont('helvetica','normal');pdf.setFontSize(7);
    pdf.text(date,PW-M,12,{align:'right'});
    if(client){setTxt([220,235,255]);pdf.setFontSize(7);pdf.text(client,PW-M,19,{align:'right'});}
    // MAP PRICING badge top-right — white pill with blue text
    setFill(C.white);pdf.roundedRect(PW-M-22,23,22,6,1.5,1.5,'F');
    setTxt(C.blue);pdf.setFont('helvetica','bold');pdf.setFontSize(6);
    pdf.text('MAP PRICING',PW-M-11,27,{align:'center'});
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  function drawFooter(pageNum){
    setFill([22,100,210]);rect(0,PH-10,PW,10);
    setTxt(C.white);pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
    pdf.text('Speco Technologies \u2022 specotech.com \u2022 1.800.645.5516',PW/2,PH-3.5,{align:'center'});
    setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(6.5);
    pdf.text('Page '+pageNum,PW-M,PH-3.5,{align:'right'});
    setTxt([220,235,255]);pdf.setFont('helvetica','normal');pdf.setFontSize(6);
    pdf.text('MAP pricing for distribution reference only',M,PH-3.5);
  }

  // ── SECTION HEADER (label + ruled line) ──────────────────────────────────
  function drawSectionHeader(label,x,y,wide){
    const w=wide||PW-M*2;
    setTxt(C.navy);pdf.setFont('helvetica','bold');pdf.setFontSize(8);
    pdf.text(label,x,y+4);
    const tw=pdf.getTextWidth(label);
    // Accent underline only under text
    setFill(C.blue);rect(x,y+5.5,tw,1.2);
    // Hairline across full width
    setDraw(C.border);pdf.setLineWidth(0.25);pdf.line(x+tw+3,y+6,x+w,y+6);
  }

  // ── CAPTURE ACTIVE CANVAS ────────────────────────────────────────────────
  async function captureActiveSite(){
    if(activeTab==='maps'&&googleMapObj&&googleMapObj.getBounds()){
      const ctr=googleMapObj.getCenter(),zm=googleMapObj.getZoom();
      const W=640,H=400;
      const imgData=await fetchImgAsDataUrl(staticMapUrl(ctr.lat(),ctr.lng(),zm,W,H));
      const off=document.createElement('canvas');off.width=W;off.height=H;
      const ctx=off.getContext('2d');
      if(imgData){
        await new Promise(res=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,W,H);res();};img.onerror=res;img.src=imgData;});
      } else {ctx.fillStyle='#1a2030';ctx.fillRect(0,0,W,H);}
      const TILE=256,scale=Math.pow(2,zm);
      const ctrWx=(ctr.lng()+180)/360*TILE*scale;
      const ctrWy=(0.5-Math.log((1+Math.sin(ctr.lat()*Math.PI/180))/(1-Math.sin(ctr.lat()*Math.PI/180)))/(4*Math.PI))*TILE*scale;
      function ll2px(lat,lng){
        const wx=(lng+180)/360*TILE*scale;
        const wy=(0.5-Math.log((1+Math.sin(lat*Math.PI/180))/(1-Math.sin(lat*Math.PI/180)))/(4*Math.PI))*TILE*scale;
        return{x:W/2+(wx-ctrWx),y:H/2+(wy-ctrWy)};
      }
      const mpp=156543.03392*Math.cos(ctr.lat()*Math.PI/180)/Math.pow(2,zm);
      if(showFov){
        mapMarkers.forEach(m=>{
          if(m.product.category!=='Cameras')return;
          const pos=ll2px(m.lat,m.lng);
          const mult=m.fovRangeMult||1.0;
          const angle=m.fovAngle||0;
          const col=cc(m.product.category);
          const eS=getEffectiveSpecs({product:m.product,angle,fovRangeMult:mult,zoomPos:m.zoomPos||0});
          if(!eS)return;
          const halfA=eS.fovDeg/2*Math.PI/180;
          const dZ=eS.dori||{};
          for(const zone of['detection','observation','recognition','identification']){
            const ft=(dZ[zone]||0)*mult;if(!ft)continue;
            const rP=Math.min(ftToM(ft)/mpp,500);
            ctx.save();ctx.beginPath();ctx.moveTo(pos.x,pos.y);ctx.arc(pos.x,pos.y,rP,angle-halfA,angle+halfA);ctx.closePath();
            ctx.fillStyle=DORI_COLORS[zone];ctx.fill();
            ctx.strokeStyle=DORI_STROKES[zone];ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
            ctx.save();ctx.font='bold 10px sans-serif';ctx.fillStyle=DORI_STROKES[zone];
            ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText(Math.round(ft)+'ft',pos.x+Math.cos(angle)*rP*0.72,pos.y+Math.sin(angle)*rP*0.72);ctx.restore();
          }
          const detFt=(dZ.detection||eS.irFt||100)*mult;
          const rangeP=Math.min(ftToM(detFt)/mpp,500);
          const hx=pos.x+Math.cos(angle)*rangeP,hy=pos.y+Math.sin(angle)*rangeP;
          ctx.save();ctx.font='bold 11px sans-serif';ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(eS.fovDeg+'\u00b0 \u00b7 '+Math.round(detFt)+'ft',pos.x+Math.cos(angle)*rangeP*0.5,pos.y+Math.sin(angle)*rangeP*0.5-12);ctx.restore();
          ctx.save();ctx.beginPath();ctx.arc(hx,hy,8,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
          ctx.fillStyle=col;ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u27f3',hx,hy+1);ctx.restore();
        });
      }
      mapMarkers.forEach((m,i)=>{
        const pos=ll2px(m.lat,m.lng);const col=cc(m.product.category);
        ctx.save();ctx.shadowColor='rgba(0,0,0,0.3)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
        ctx.beginPath();ctx.arc(pos.x,pos.y,15,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
        ctx.shadowColor='transparent';ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;ctx.stroke();ctx.restore();
        const iconEl=buildIconImg(m.product.category,32);
        if(iconEl)ctx.drawImage(iconEl,pos.x-11,pos.y-11,22,22);
        ctx.save();ctx.beginPath();ctx.arc(pos.x+11,pos.y-11,7,0,Math.PI*2);
        ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();
        ctx.fillStyle=col;ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,pos.x+11,pos.y-11);ctx.restore();
        ctx.save();ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
        const lbl=m.product.sku.length>8?m.product.sku.substring(0,7)+'\u2026':m.product.sku;
        const tw=ctx.measureText(lbl).width+4;
        ctx.fillStyle=col+'cc';ctx.fillRect(pos.x-tw/2,pos.y+18,tw,13);
        ctx.fillStyle='#fff';ctx.fillText(lbl,pos.x,pos.y+19);ctx.restore();
      });
      return{imgData:off.toDataURL('image/jpeg',0.95),w:W,h:H,type:'map',offCanvas:off};
    }
    const srcCvs=activeTab==='emap'?document.getElementById('emapCanvas'):document.getElementById('blankCanvas');
    const W=srcCvs.width,H=srcCvs.height;
    const off=document.createElement('canvas');off.width=W;off.height=H;
    const ctx=off.getContext('2d');
    ctx.fillStyle='#eef1f5';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(0,0,0,0.04)';ctx.lineWidth=1;
    for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    if(activeTab==='emap'&&emapImg){
      const op=parseInt(document.getElementById('emapOpacity').value)/100;
      const r=Math.min(W/emapImg.width,H/emapImg.height);
      ctx.save();ctx.globalAlpha=op;
      ctx.drawImage(emapImg,(W-emapImg.width*r)/2,(H-emapImg.height*r)/2,emapImg.width*r,emapImg.height*r);
      ctx.restore();
    }
    if(showFov){
      placements.forEach(pl=>{
        if(pl.product.category!=='Cameras')return;
        const eSpecs2=getEffectiveSpecs(pl);if(!eSpecs2)return;
        const halfA2=eSpecs2.fovDeg/2*Math.PI/180;
        const angle=pl.angle||0;const col=cc(pl.product.category);
        const mult2=pl.fovRangeMult||1.0;const dori2=eSpecs2.dori||{};const pxPerFt=2.5;
        for(const zone of['detection','observation','recognition','identification']){
          const ft=(dori2[zone]||0)*mult2;if(!ft)continue;
          const r=Math.min(ft*pxPerFt,500);
          ctx.save();ctx.beginPath();ctx.moveTo(pl.x,pl.y);ctx.arc(pl.x,pl.y,r,angle-halfA2,angle+halfA2);ctx.closePath();
          ctx.fillStyle=DORI_COLORS[zone];ctx.fill();ctx.strokeStyle=DORI_STROKES[zone];ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
          ctx.save();ctx.font='bold 9px sans-serif';ctx.fillStyle=DORI_STROKES[zone];ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(Math.round(ft)+'ft',pl.x+Math.cos(angle)*r*0.75,pl.y+Math.sin(angle)*r*0.75);ctx.restore();
        }
        const detFt2=(dori2.detection||eSpecs2.irFt||100)*mult2;
        const outerR=Math.min(detFt2*pxPerFt,500);
        const hx=pl.x+Math.cos(angle)*outerR,hy=pl.y+Math.sin(angle)*outerR;
        ctx.save();ctx.font='bold 11px sans-serif';ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(eSpecs2.fovDeg+'\u00b0 \u00b7 '+Math.round(detFt2)+'ft',pl.x+Math.cos(angle)*outerR*0.5,pl.y+Math.sin(angle)*outerR*0.5-10);ctx.restore();
        ctx.save();ctx.beginPath();ctx.arc(hx,hy,9,0,Math.PI*2);
        ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle=col;ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u27f3',hx,hy+1);ctx.restore();
      });
    }
    placements.forEach((pl,i)=>{
      const col=cc(pl.product.category);
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.22)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
      ctx.beginPath();ctx.arc(pl.x,pl.y,15,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      ctx.shadowColor='transparent';ctx.strokeStyle='rgba(255,255,255,0.88)';ctx.lineWidth=2;ctx.stroke();ctx.restore();
      const iconEl=buildIconImg(pl.product.category,32);
      if(iconEl)ctx.drawImage(iconEl,pl.x-11,pl.y-11,22,22);
      ctx.save();ctx.beginPath();ctx.arc(pl.x+11,pl.y-11,7,0,Math.PI*2);
      ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle=col;ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,pl.x+11,pl.y-11);ctx.restore();
      ctx.save();ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.fillText(pl.product.sku.length>8?pl.product.sku.substring(0,7)+'\u2026':pl.product.sku,pl.x,pl.y+18);ctx.restore();
    });
    return{imgData:off.toDataURL('image/jpeg',0.95),w:W,h:H,type:'canvas',offCanvas:off};
  }

  // ── DRAW PDF MARKER ────────────────────────────────────────────────────────
  function drawPdfMarker(px,py,num,cat,R){
    const iconUrl=buildIconImg(cat,40);
    const rgb=hexToRgb(cc(cat));
    pdf.addImage(iconUrl,'PNG',px-R,py-R,R*2,R*2);
    const br=R*0.52;
    setFill(C.white);pdf.circle(px+R*0.65,py-R*0.65,br,'F');
    setDraw([rgb.r,rgb.g,rgb.b]);pdf.setLineWidth(0.4);pdf.circle(px+R*0.65,py-R*0.65,br,'S');
    setTxt([rgb.r,rgb.g,rgb.b]);pdf.setFont('helvetica','bold');pdf.setFontSize(4.5);
    pdf.text(String(num),px+R*0.65,py-R*0.65+1.4,{align:'center'});
    const lbl=cat==='Cameras'?'CAM':cat.substring(0,3).toUpperCase();
    const slw=pdf.getTextWidth(lbl)+2;
    setFill([rgb.r,rgb.g,rgb.b]);pdf.roundedRect(px-slw/2,py+R+0.5,slw,3.2,0.6,0.6,'F');
    setTxt(C.white);pdf.setFontSize(4);pdf.text(lbl,px,py+R+3,{align:'center'});
  }

  // ── CAPTURE CALLOUT ────────────────────────────────────────────────────────
  async function captureCallout(pl,offCanvas){
    if(pl.type==='canvas'){
      const srcCvs=offCanvas||document.getElementById(activeTab==='emap'?'emapCanvas':'blankCanvas');
      const srcW=srcCvs.width,srcH=srcCvs.height;
      const specs=pl.product.category==='Cameras'?parseCameraSpecs(pl.product):null;
      const fovPx=specs?getFovRange(pl):0;
      const CROP=Math.max(80,Math.min(fovPx*1.15+30,300));
      const cropX=Math.max(0,Math.round(pl.x-CROP)),cropY=Math.max(0,Math.round(pl.y-CROP));
      const cropW=Math.min(Math.round(CROP*2),srcW-cropX),cropH=Math.min(Math.round(CROP*2),srcH-cropY);
      if(cropW<20||cropH<20)return null;
      const tmp=document.createElement('canvas');tmp.width=cropW;tmp.height=cropH;
      const tCtx=tmp.getContext('2d');
      tCtx.drawImage(srcCvs,cropX,cropY,cropW,cropH,0,0,cropW,cropH);
      const localX=Math.round(pl.x)-cropX,localY=Math.round(pl.y)-cropY;
      // Clean highlight ring (blue, not yellow)
      tCtx.strokeStyle='rgba(29,122,255,0.9)';tCtx.lineWidth=3;tCtx.setLineDash([6,4]);
      tCtx.beginPath();tCtx.arc(localX,localY,22,0,Math.PI*2);tCtx.stroke();tCtx.setLineDash([]);
      return tmp.toDataURL('image/jpeg',0.93);
    } else {
      if(offCanvas){
        const ctr=googleMapObj.getCenter(),zm=googleMapObj.getZoom();
        const TILE=256,scale=Math.pow(2,zm);
        const W=offCanvas.width,H=offCanvas.height;
        const ctrWx=(ctr.lng()+180)/360*TILE*scale;
        const ctrWy=(0.5-Math.log((1+Math.sin(ctr.lat()*Math.PI/180))/(1-Math.sin(ctr.lat()*Math.PI/180)))/(4*Math.PI))*TILE*scale;
        function ll2pxC(lat,lng){
          const wx=(lng+180)/360*TILE*scale;
          const wy=(0.5-Math.log((1+Math.sin(lat*Math.PI/180))/(1-Math.sin(lat*Math.PI/180)))/(4*Math.PI))*TILE*scale;
          return{x:W/2+(wx-ctrWx),y:H/2+(wy-ctrWy)};
        }
        const pos=ll2pxC(pl.lat,pl.lng);
        const mX=Math.round(pos.x),mY=Math.round(pos.y);
        const mpp=156543.03392*Math.cos(pl.lat*Math.PI/180)/Math.pow(2,zm);
        const cSpecs=getEffectiveSpecs({product:pl.product,angle:pl.fovAngle||0,fovRangeMult:pl.fovRangeMult||1,zoomPos:pl.zoomPos||0});
        const cDori=cSpecs&&cSpecs.dori?cSpecs.dori:{};
        const fovPx=cSpecs?ftToM((cDori.detection||cSpecs.irFt||100)*(pl.fovRangeMult||1))/mpp:0;
        const CROP=Math.max(80,Math.min(fovPx*1.2+40,220));
        const cropX=Math.max(0,mX-CROP),cropY=Math.max(0,mY-CROP);
        const cropX2=Math.min(offCanvas.width,mX+CROP),cropY2=Math.min(offCanvas.height,mY+CROP);
        const cropW=cropX2-cropX,cropH=cropY2-cropY;
        if(cropW>20&&cropH>20){
          const tmp=document.createElement('canvas');tmp.width=cropW;tmp.height=cropH;
          const tCtx=tmp.getContext('2d');
          tCtx.drawImage(offCanvas,cropX,cropY,cropW,cropH,0,0,cropW,cropH);
          const localX=mX-cropX,localY=mY-cropY;
          tCtx.strokeStyle='rgba(29,122,255,0.9)';tCtx.lineWidth=3;tCtx.setLineDash([6,4]);
          tCtx.beginPath();tCtx.arc(localX,localY,22,0,Math.PI*2);tCtx.stroke();tCtx.setLineDash([]);
          return tmp.toDataURL('image/jpeg',0.93);
        }
      }
      const zoomUrl=staticMapUrl(pl.lat,pl.lng,21,400,300);
      const rawImg=await fetchImgAsDataUrl(zoomUrl);
      if(!rawImg)return null;
      const tmp=document.createElement('canvas');tmp.width=400;tmp.height=300;
      const tCtx=tmp.getContext('2d');
      await new Promise(res=>{const img=new Image();img.onload=()=>{tCtx.drawImage(img,0,0);res();};img.onerror=res;img.src=rawImg;});
      const col=cc(pl.product.category);const rgb=hexToRgb(col);
      tCtx.strokeStyle='rgba(29,122,255,0.9)';tCtx.lineWidth=4;tCtx.setLineDash([8,5]);
      tCtx.beginPath();tCtx.arc(200,150,32,0,Math.PI*2);tCtx.stroke();tCtx.setLineDash([]);
      tCtx.beginPath();tCtx.arc(200,150,18,0,Math.PI*2);
      tCtx.fillStyle=`rgb(${rgb.r},${rgb.g},${rgb.b})`;tCtx.fill();
      tCtx.strokeStyle='rgba(255,255,255,0.9)';tCtx.lineWidth=2;tCtx.stroke();
      const iconUrl=buildIconImg(pl.product.category,36);
      const iconImg=new Image();iconImg.src=iconUrl;
      if(iconImg.complete)tCtx.drawImage(iconImg,187,137,26,26);
      tCtx.fillStyle='#fff';tCtx.font='bold 13px Arial';tCtx.textAlign='center';tCtx.textBaseline='middle';
      tCtx.fillText(String(pl.num),200,150);
      return tmp.toDataURL('image/jpeg',0.93);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — SITE OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  let pageNum=1;
  setP(8,'Capturing site...');
  drawHeader('FIELD DESIGNER REPORT','Security System Design \u2014 '+proj);
  let y=36;

  // ── META CARD (two-column: project info + stats) ─────────────────────────
  const cardH=22;
  setFill(C.bodyBg);rect(0,y,PW,cardH+2);
  setFill(C.white);pdf.roundedRect(M,y,PW-M*2,cardH,2,2,'F');
  setDraw(C.border);pdf.setLineWidth(0.3);pdf.roundedRect(M,y,PW-M*2,cardH,2,2,'S');
  // Blue left accent
  setFill(C.blue);pdf.roundedRect(M,y,3,cardH,1.5,1.5,'F');
  pdf.rect(M+1.5,y,1.5,cardH,'F');

  const metaLeftX=M+6;
  setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(6);
  pdf.text('PROJECT',metaLeftX,y+6);
  setTxt(C.text1);pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);
  pdf.text(proj,metaLeftX,y+13);
  if(client){
    setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(6);pdf.text('CLIENT',metaLeftX+55,y+6);
    setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.text(client,metaLeftX+55,y+13);
  }
  setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(6);pdf.text('DATE',metaLeftX+110,y+6);
  setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.text(date,metaLeftX+110,y+13);

  // Stats pills right side
  const stats=[
    {label:'SKUs',val:String(items.length)},
    {label:'Units',val:String(placements.length+mapMarkers.length)},
  ];
  let sx=PW-M-3;
  stats.reverse().forEach(s=>{
    const sw=pdf.getTextWidth(s.val)+14;sx-=sw+3;
    setFill(C.blueDim);pdf.roundedRect(sx,y+6,sw,10,2,2,'F');
    setTxt(C.blue);pdf.setFont('helvetica','bold');pdf.setFontSize(8);
    pdf.text(s.val,sx+sw/2,y+12.5,{align:'center'});
    setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(5.5);
    pdf.text(s.label,sx+sw/2,y+17.5,{align:'center'});
  });
  y+=cardH+6;

  // ── SITE OVERVIEW IMAGE ───────────────────────────────────────────────────
  drawSectionHeader('SITE OVERVIEW',M,y);y+=10;
  const IMG_W=PW-M*2,IMG_H=110;
  const site=await captureActiveSite();
  const offCanvasForCallouts=site.offCanvas||null;
  setP(20,'Building site overview...');

  // Image frame with subtle shadow effect
  setFill([230,235,245]);pdf.roundedRect(M+0.8,y+0.8,IMG_W,IMG_H,2,2,'F');
  setFill(C.white);pdf.roundedRect(M,y,IMG_W,IMG_H,2,2,'F');
  setDraw(C.border);pdf.setLineWidth(0.3);pdf.roundedRect(M,y,IMG_W,IMG_H,2,2,'S');
  if(site.imgData){
    // Clip image to rounded rect using a white overlay trick
    pdf.addImage(site.imgData,'JPEG',M,y,IMG_W,IMG_H);
    // Re-stroke border on top of image
    setDraw(C.borderDark);pdf.setLineWidth(0.4);pdf.roundedRect(M,y,IMG_W,IMG_H,2,2,'S');
  } else {
    setFill(C.bodyBg);pdf.roundedRect(M,y,IMG_W,IMG_H,2,2,'F');
    setTxt(C.text3);pdf.setFontSize(9);pdf.text('Site image unavailable',PW/2,y+IMG_H/2,{align:'center'});
  }
  y+=IMG_H+6;

  // ── DORI LEGEND (when on maps or blank canvas with cameras) ──────────────
  const hasCams=([...placements,...mapMarkers].some(p=>p.product&&p.product.category==='Cameras'));
  if(hasCams&&showFov){
    const doriItems=[
      {label:'Detection',color:[29,122,255]},
      {label:'Observation',color:[34,211,160]},
      {label:'Recognition',color:[251,146,60]},
      {label:'Identification',color:[239,68,68]},
    ];
    setFill(C.bodyBg);pdf.roundedRect(M,y,IMG_W,8,1.5,1.5,'F');
    setDraw(C.border);pdf.setLineWidth(0.25);pdf.roundedRect(M,y,IMG_W,8,1.5,1.5,'S');
    setTxt(C.text3);pdf.setFont('helvetica','bold');pdf.setFontSize(5.5);
    pdf.text('DORI ZONES',M+3,y+5);
    let lx=M+26;
    doriItems.forEach(d=>{
      setFill(d.color);pdf.circle(lx+1.5,y+4,1.8,'F');
      setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
      pdf.text(d.label,lx+5,y+5.3);
      lx+=pdf.getTextWidth(d.label)+11;
    });
    y+=11;
  }

  // ── PLACEMENT INDEX ────────────────────────────────────────────────────────
  const allPl=[...placements.map((pl,i)=>({...pl,num:i+1})),...mapMarkers.map((m,i)=>({product:m.product,num:placements.length+i+1,x:0,y:0}))];
  if(allPl.length){
    drawSectionHeader('PLACEMENT INDEX',M,y);y+=9;
    const ICOLS=3,IW=(PW-M*2)/ICOLS,IRCH=11;
    allPl.slice(0,27).forEach((pl,i)=>{
      const ix=M+(i%ICOLS)*IW,iy=y+Math.floor(i/ICOLS)*IRCH;
      // Alt row
      if(Math.floor(i/ICOLS)%2===0){setFill(C.rowAlt);rect(ix-1,iy,IW-1,IRCH);}
      // Icon
      const iconUrl=buildIconDataUrl(pl.product.category,20);
      if(iconUrl)pdf.addImage(iconUrl,'PNG',ix+1,iy+1.5,7,7);
      // Number badge
      const rgb2=hexToRgb(cc(pl.product.category));
      setFill(C.white);pdf.circle(ix+6.5,iy+2,2.2,'F');
      setDraw([rgb2.r,rgb2.g,rgb2.b]);pdf.setLineWidth(0.3);pdf.circle(ix+6.5,iy+2,2.2,'S');
      setTxt([rgb2.r,rgb2.g,rgb2.b]);pdf.setFont('helvetica','bold');pdf.setFontSize(4.5);
      pdf.text(String(pl.num),ix+6.5,iy+3,{align:'center'});
      // SKU (monospaced style via bold + tracking)
      setTxt(C.navy);pdf.setFont('helvetica','bold');pdf.setFontSize(7);
      pdf.text(pl.product.sku,ix+10,iy+5);
      // Desc
      setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(7);
      const d=pl.product.description.length>36?pl.product.description.substring(0,35)+'\u2026':pl.product.description;
      pdf.text(d,ix+10,iy+9.5);
      // Divider
      setDraw(C.border);pdf.setLineWidth(0.15);pdf.line(ix-1,iy+IRCH,ix+IW-2,iy+IRCH);
    });
    if(allPl.length>27){
      const rows=Math.ceil(Math.min(allPl.length,27)/ICOLS);
      setTxt(C.text3);pdf.setFontSize(6.5);pdf.setFont('helvetica','normal');
      pdf.text('+ '+(allPl.length-27)+' more \u2014 see Bill of Materials',M,y+rows*IRCH+4);
    }
  }
  drawFooter(pageNum);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2+ — PLACEMENT CALLOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  setP(40,'Building callouts...');
  const allCallouts=[
    ...placements.map((pl,i)=>({...pl,num:i+1,type:'canvas'})),
    ...mapMarkers.map((m,i)=>({product:m.product,num:placements.length+i+1,type:'map',lat:m.lat,lng:m.lng,x:0,y:0}))
  ];

  if(allCallouts.length>0){
    pdf.addPage();pageNum++;
    drawHeader('PLACEMENT DETAILS','Device callouts with FOV coverage \u2014 '+proj);
    y=36;
    drawSectionHeader('DEVICE PLACEMENT CALLOUTS',M,y);y+=12;

    const COLS=2,CW=(PW-M*2-5)/COLS,CH=73;
    const maxRows=Math.floor((PH-55-y)/(CH+5));

    for(let i=0;i<allCallouts.length;i++){
      const pl=allCallouts[i];
      const rowOnPage=Math.floor(i/COLS)%maxRows;
      if(i>0&&i%COLS===0&&rowOnPage===0){
        drawFooter(pageNum);pdf.addPage();pageNum++;
        drawHeader('PLACEMENT DETAILS (cont.)','');
        y=36;drawSectionHeader('DEVICE PLACEMENT CALLOUTS (continued)',M,y);y+=12;
      }
      const col2=i%COLS;const rowInPage=Math.floor(i/COLS)%maxRows;
      const cx=M+col2*(CW+5),cy=y+rowInPage*(CH+5);
      const rgb=hexToRgb(cc(pl.product.category));

      setP(40+Math.round((i/allCallouts.length)*30),'Callout '+(i+1)+' of '+allCallouts.length+'...');
      const calloutImg=await captureCallout(pl,offCanvasForCallouts);
      await new Promise(r=>setTimeout(r,0));

      // Card background + border
      setFill([230,235,245]);pdf.roundedRect(cx+0.6,cy+0.6,CW,CH,2,2,'F');
      setFill(C.white);pdf.roundedRect(cx,cy,CW,CH,2,2,'F');
      setDraw(C.border);pdf.setLineWidth(0.3);pdf.roundedRect(cx,cy,CW,CH,2,2,'S');

      // Header bar — category color
      setFill([rgb.r,rgb.g,rgb.b]);pdf.roundedRect(cx,cy,CW,8,2,2,'F');
      pdf.rect(cx,cy+4,CW,4,'F');

      // Icon in header
      const hIconUrl=buildIconDataUrl(pl.product.category,20);
      if(hIconUrl)pdf.addImage(hIconUrl,'PNG',cx+1.5,cy+0.8,6.2,6.2);
      // Number badge in header
      setFill(C.white);pdf.circle(cx+7,cy+1.5,2,'F');
      setDraw([rgb.r,rgb.g,rgb.b]);pdf.setLineWidth(0.3);pdf.circle(cx+7,cy+1.5,2,'S');
      setTxt([rgb.r,rgb.g,rgb.b]);pdf.setFontSize(4.5);pdf.setFont('helvetica','bold');
      pdf.text(String(pl.num),cx+7,cy+2.3,{align:'center'});
      // SKU — bold white
      setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(8);
      pdf.text(pl.product.sku,cx+11,cy+5.2);
      // Source tag right-aligned
      setTxt([255,255,255,0.7]);pdf.setFontSize(5.5);pdf.setFont('helvetica','normal');
      setTxt([210,225,255]);
      pdf.text(pl.type==='map'?'Google Maps \u00b7 Aerial':'Canvas View',cx+CW-2,cy+5.2,{align:'right'});

      // Callout image
      const iH=CH-21;
      if(calloutImg){
        pdf.addImage(calloutImg,'JPEG',cx+1,cy+9,CW-2,iH);
        setDraw(C.border);pdf.setLineWidth(0.2);pdf.rect(cx+1,cy+9,CW-2,iH);
      } else {
        setFill(C.bodyBg);pdf.rect(cx+1,cy+9,CW-2,iH,'F');
        setTxt(C.text3);pdf.setFontSize(7.5);pdf.text('Image unavailable',cx+CW/2,cy+9+iH/2,{align:'center'});
      }

      // Description + price footer
      const footY=cy+CH-10;
      setFill(C.bodyBg);pdf.rect(cx+1,footY,CW-2,10,'F');
      setDraw(C.border);pdf.setLineWidth(0.2);pdf.line(cx+1,footY,cx+CW-1,footY);
      setTxt(C.text1);pdf.setFont('helvetica','normal');pdf.setFontSize(5.5);
      const dsc=pl.product.description.length>50?pl.product.description.substring(0,49)+'\u2026':pl.product.description;
      pdf.text(dsc,cx+3,footY+5.5,{maxWidth:CW-30});
      // Price pill
      setFill(C.blue);pdf.roundedRect(cx+CW-23,footY+2,21,6,1.5,1.5,'F');
      setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(6.5);
      pdf.text('$'+pl.product.map.toFixed(2),cx+CW-12.5,footY+6.3,{align:'center'});
    }
    drawFooter(pageNum);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL PAGE — BILL OF MATERIALS
  // ═══════════════════════════════════════════════════════════════════════════
  setP(75,'Generating Bill of Materials...');
  pdf.addPage();pageNum++;
  drawHeader('BILL OF MATERIALS','Complete product list with MAP pricing \u2014 '+proj);
  y=36;

  // Summary card
  const cats=[...new Set(items.map(it=>it.product.category))];
  setFill(C.white);pdf.roundedRect(M,y,PW-M*2,12,2,2,'F');
  setDraw(C.border);pdf.setLineWidth(0.3);pdf.roundedRect(M,y,PW-M*2,12,2,2,'S');
  setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(7);
  pdf.text(items.length+' line items  \u00b7  '+(placements.length+mapMarkers.length)+' total units  \u00b7  '+cats.length+' categor'+(cats.length===1?'y':'ies'),M+6,y+7.5);
  y+=16;

  // Table header
  const cols2=[
    {l:'#',w:7},{l:'SKU',w:28},{l:'Description',w:70},{l:'Category',w:32},
    {l:'Qty',w:10,r:true},{l:'MAP Unit',w:22,r:true},{l:'MAP Total',w:25,r:true}
  ];
  const tableW=PW-M*2;
  // Header bar
  setFill([22,100,210]);rect(M,y,tableW,8);
  let tx=M+3;
  cols2.forEach(c=>{
    setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(6.5);
    pdf.text(c.l.toUpperCase(),c.r?tx+c.w-1:tx+1,y+5.2,{align:c.r?'right':'left'});
    tx+=c.w;
  });
  y+=8;

  // Table rows
  items.forEach((it,i)=>{
    if(y>PH-22){
      drawFooter(pageNum);pdf.addPage();pageNum++;
      drawHeader('BILL OF MATERIALS (cont.)','');y=36;
      setFill([22,100,210]);rect(M,y,tableW,8);
      tx=M+3;
      cols2.forEach(c=>{
        setTxt(C.white);pdf.setFont('helvetica','bold');pdf.setFontSize(6.5);
        pdf.text(c.l.toUpperCase(),c.r?tx+c.w-1:tx+1,y+5.2,{align:c.r?'right':'left'});
        tx+=c.w;
      });
      y+=8;
    }
    const rh=8;
    if(i%2===0){setFill(C.rowAlt);rect(M,y,tableW,rh);}
    // Left accent stripe using category color
    const rgb2=hexToRgb(cc(it.product.category));
    setFill([rgb2.r,rgb2.g,rgb2.b]);rect(M,y,2,rh);
    // Row divider
    setDraw(C.border);pdf.setLineWidth(0.15);pdf.line(M,y+rh,M+tableW,y+rh);

    tx=M+3;
    // # index
    setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
    pdf.text(String(i+1),tx+1,y+5.5);tx+=cols2[0].w;
    // Icon
    const rowIcon=buildIconDataUrl(it.product.category,14);
    if(rowIcon)pdf.addImage(rowIcon,'PNG',tx,y+0.8,5.2,5.2);
    // SKU — bold navy monospaced style
    setTxt(C.navy);pdf.setFont('helvetica','bold');pdf.setFontSize(7);
    pdf.text(it.product.sku,tx+6.5,y+5.5);tx+=cols2[1].w;
    // Description
    const desc2=it.product.description.length>54?it.product.description.substring(0,53)+'\u2026':it.product.description;
    setTxt(C.text1);pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
    pdf.text(desc2,tx+1,y+5.2);tx+=cols2[2].w;
    // Category — plain text, colored to match category
    const catLabel=it.product.category.length>16?it.product.category.substring(0,15)+'\u2026':it.product.category;
    setTxt([rgb2.r,rgb2.g,rgb2.b]);pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
    pdf.text(catLabel,tx+1,y+5.5);
    tx+=cols2[3].w;
    // Qty
    setTxt(C.text1);pdf.setFont('helvetica','bold');pdf.setFontSize(7);
    pdf.text(String(it.qty),tx+cols2[4].w-1,y+5.5,{align:'right'});tx+=cols2[4].w;
    // MAP unit
    setTxt(C.text2);pdf.setFont('helvetica','normal');pdf.setFontSize(7);
    pdf.text('$'+it.product.map.toFixed(2),tx+cols2[5].w-1,y+5.5,{align:'right'});tx+=cols2[5].w;
    // MAP total (bold)
    setTxt(C.text1);pdf.setFont('helvetica','bold');pdf.setFontSize(7);
    pdf.text('$'+(it.product.map*it.qty).toFixed(2),tx+cols2[6].w-1,y+5.5,{align:'right'});
    y+=rh;
  });

  // Total row — clean light design, no heavy bar
  const totalRowH=10;
  setDraw(C.borderDark);pdf.setLineWidth(0.5);pdf.line(M,y,M+tableW,y);
  setFill(C.blueDim);rect(M,y,tableW,totalRowH);
  setTxt(C.navy);pdf.setFont('helvetica','bold');pdf.setFontSize(8);
  pdf.text('PROJECT TOTAL (MAP)',M+4,y+6.5);
  setTxt(C.blue);pdf.setFont('helvetica','bold');pdf.setFontSize(9);
  pdf.text('$'+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),PW-M-2,y+7,{align:'right'});
  setTxt(C.text3);pdf.setFont('helvetica','normal');pdf.setFontSize(6);
  pdf.text('All prices are MAP \u2014 Minimum Advertised Price for distribution reference',M+4,y+totalRowH-1.5);

  drawFooter(pageNum);
  setP(97,'Saving PDF...');
  await new Promise(r=>setTimeout(r,100));
  pdf.save((proj.replace(/[^a-z0-9]+/gi,'-')||'Speco-Project')+'-BOM.pdf');
  prog.remove();
  resetPlacementState();
}

renderProducts();

<!-- LENS PREVIEW POPUP -->
<div class="lens-preview" id="lensPreview">
  <div class="lens-preview-header">
    <span class="lens-preview-badge" id="lpBadge">2.8mm · 4MP · 107°</span>
    <span class="lens-preview-sub">15ft mount height</span>
  </div>
  <img id="lpImg" style="width:100%;border-radius:4px;display:block;border:1px solid #1c2333" src="" style="width:100%;border-radius:5px;display:block;border:1px solid #1c2333" alt="Camera view comparison" />
  <button class="lens-preview-expand" onclick="openLensExpand(event)">&#x26F6; View Full Screen</button>
</div>

<!-- FULLSCREEN EXPAND -->
<div class="lens-expand-overlay" id="lensExpand" onclick="closeLensExpand(event)">
  <div class="lens-expand-title" id="leTitle">4MP · 2.8mm Lens · Quad Distance Comparison · Click outside to close</div>
  <img id="lpExpandImg" src="" style="max-width:96vw;max-height:94vh;width:auto;height:auto;border-radius:6px;display:block;pointer-events:none" alt="Camera view full screen" />
  <button class="lens-expand-close" onclick="closeLensExpand(null,true)">Close ✕</button>
</div>

