// ── TABS ──────────────────────────────────────────────────────────────────
function switchTab(tab){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('tab-'+tab).classList.add('on');
  document.getElementById('panel-'+tab).classList.add('on');
  if(tab!=='maps')setTimeout(()=>resizeCanvas(tab),10);
  if(tab==='maps')initMapsAC();
}

// ── CANVAS ────────────────────────────────────────────────────────────────
function resizeCanvas(tab){
  const cvs=tab==='emap'?document.getElementById('emapCanvas'):document.getElementById('blankCanvas');
  const wrap=tab==='emap'?document.getElementById('emapWrap'):document.getElementById('blankWrap');
  CS[tab].w=wrap.clientWidth;CS[tab].h=wrap.clientHeight;
  cvs.width=CS[tab].w;cvs.height=CS[tab].h;
  tab==='emap'?drawEmap():drawBlank();
}
window.addEventListener('resize',()=>{if(activeTab!=='maps')resizeCanvas(activeTab);});
setTimeout(()=>resizeCanvas('blank'),80);

function drawGrid(ctx,w,h){
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let x=0;x<w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
}

// ── FOV on Canvas ─────────────────────────────────────────────────────────
// Get pixel range for canvas drawing — uses Detection distance as max range
function getFovRange(pl){
  const specs=getEffectiveSpecs(pl);
  if(!specs)return 80;
  const detFt=(specs.dori&&specs.dori.detection)||specs.irFt||100;
  // Scale: 2.5px per foot, capped
  const base=detFt*2.5;
  return Math.max(20,Math.min(base*(pl.fovRangeMult||1.0),500));
}
// Returns current effective feet being shown
function getFovFeet(pl){
  const specs=getEffectiveSpecs(pl);
  if(!specs)return 100;
  const detFt=(specs.dori&&specs.dori.detection)||specs.irFt||100;
  return Math.round(detFt*(pl.fovRangeMult||1.0));
}

function drawFovCone(ctx,pl){
  const specs=getEffectiveSpecs(pl);
  if(!specs)return;
  const halfA=specs.fovDeg/2*Math.PI/180;
  const angle=pl.angle||0;
  const col=cc(pl.product.category);
  const mult=pl.fovRangeMult||1.0;
  const dori=specs.dori||{};
  const pxPerFt=2.5;

  // Draw DORI zones outermost to innermost
  for(const zone of['detection','observation','recognition','identification']){
    const ft=(dori[zone]||0)*mult;
    if(!ft)continue;
    const r=Math.min(ft*pxPerFt,500);
    ctx.save();
    ctx.beginPath();ctx.moveTo(pl.x,pl.y);
    ctx.arc(pl.x,pl.y,r,angle-halfA,angle+halfA);ctx.closePath();
    ctx.fillStyle=DORI_COLORS[zone];ctx.fill();
    ctx.strokeStyle=DORI_STROKES[zone];ctx.lineWidth=1.2;ctx.stroke();
    ctx.restore();
    // Ft label inside zone
    ctx.save();
    ctx.font='bold 9px sans-serif';ctx.fillStyle=DORI_STROKES[zone];
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(Math.round(ft)+'ft',
      pl.x+Math.cos(angle)*r*0.75,pl.y+Math.sin(angle)*r*0.75);
    ctx.restore();
  }

  // Outer label: FOV + detection range
  const detFt=(dori.detection||specs.irFt||100)*mult;
  const outerR=Math.min(detFt*pxPerFt,500);
  ctx.save();
  ctx.font='bold 10px sans-serif';ctx.fillStyle=col;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(specs.fovDeg+'\u00b0 \u00b7 '+Math.round(detFt)+'ft',
    pl.x+Math.cos(angle)*outerR*0.5,pl.y+Math.sin(angle)*outerR*0.5-12);
  ctx.restore();

  // Rotation handle \u27f3 at detection range tip
  const hx=pl.x+Math.cos(angle)*outerR;
  const hy=pl.y+Math.sin(angle)*outerR;
  ctx.save();
  ctx.beginPath();ctx.arc(hx,hy,9,0,Math.PI*2);
  ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
  ctx.font='bold 13px sans-serif';ctx.fillStyle=col;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u27f3',hx,hy+1);
  ctx.restore();

  // Person range handle beyond tip
  const ppx=pl.x+Math.cos(angle)*(outerR+28);
  const ppy=pl.y+Math.sin(angle)*(outerR+28);
  ctx.save();
  ctx.setLineDash([3,3]);ctx.strokeStyle=col+'77';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(hx+Math.cos(angle)*9,hy+Math.sin(angle)*9);
  ctx.lineTo(ppx-Math.cos(angle)*6,ppy-Math.sin(angle)*6);ctx.stroke();
  ctx.setLineDash([]);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.fillStyle='#fff';
  ctx.save();ctx.translate(ppx,ppy);ctx.rotate(angle+Math.PI/2);
  ctx.beginPath();ctx.arc(0,-6,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,10);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-6,4);ctx.lineTo(6,4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(-5,18);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(5,18);ctx.stroke();
  ctx.restore();ctx.restore();

  // Motorized zoom slider
  if(specs.isMotorized){
    const z=pl.zoomPos||0;
    const sx=pl.x-22,sy=pl.y+outerR+16,sw=44,sh=5;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(sx,sy,sw,sh);
    ctx.fillStyle=col;ctx.fillRect(sx,sy,sw*z,sh);
    ctx.strokeStyle=col;ctx.lineWidth=1;ctx.strokeRect(sx,sy,sw,sh);
    ctx.beginPath();ctx.arc(sx+sw*z,sy+sh/2,5,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();
    ctx.font='8px sans-serif';ctx.fillStyle=col;ctx.textAlign='center';
    ctx.fillText('W\u2194T',pl.x,sy+sh+10);
    ctx.restore();
  }
}

// Returns {idx, type:'rotate'|'range'} or null
function getFovHandleHit(x,y){
  if(!showFov)return null;
  for(let i=0;i<placements.length;i++){
    const pl=placements[i];
    if(pl.product.category!=='Cameras')continue;
    const specs=getEffectiveSpecs(pl);if(!specs)continue;
    const dori=specs.dori||{};
    const mult=pl.fovRangeMult||1.0;
    const detFt=(dori.detection||specs.irFt||100)*mult;
    const outerR=Math.min(detFt*2.5,500);
    const angle=pl.angle||0;
    const hx=pl.x+Math.cos(angle)*outerR;
    const hy=pl.y+Math.sin(angle)*outerR;
    const ppx=pl.x+Math.cos(angle)*(outerR+28);
    const ppy=pl.y+Math.sin(angle)*(outerR+28);
    if(Math.hypot(x-ppx,y-ppy)<14)return{idx:i,type:'range'};
    if(Math.hypot(x-hx,y-hy)<12)return{idx:i,type:'rotate'};
  }
  return null;
}

const CAT_ICONS={
  'Cameras':'<rect x="3" y="7" width="14" height="11" rx="1.5"/><circle cx="10" cy="12.5" r="3.5"/><circle cx="10" cy="12.5" r="1.5"/><rect x="17" y="10" width="4" height="5" rx="1"/><rect x="5" y="5" width="4" height="2" rx="0.5"/>',
  'Recorders':'<rect x="2" y="5" width="20" height="14" rx="1.5"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/><rect x="4" y="10.5" width="3" height="3" rx="0.5"/><rect x="9" y="10.5" width="3" height="3" rx="0.5"/><line x1="15" y1="11" x2="20" y2="11"/><line x1="15" y1="13" x2="20" y2="13"/>',
  'Audio':'<rect x="4" y="6" width="10" height="12" rx="1.5"/><circle cx="9" cy="12" r="2.5"/><circle cx="9" cy="12" r="1"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M16 9.5c1 .8 1 3.7 0 5" stroke-linecap="round"/><path d="M18.5 7.5c2 1.8 2 7.2 0 9" stroke-linecap="round"/>',
  'Access Control':'<rect x="4" y="11" width="16" height="11" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/><circle cx="12" cy="17" r="1.5"/><line x1="12" y1="18.5" x2="12" y2="20"/>',
  'Networking':'<rect x="2" y="8" width="20" height="8" rx="1.5"/><rect x="4" y="11" width="2.5" height="2" rx="0.3"/><rect x="8" y="11" width="2.5" height="2" rx="0.3"/><rect x="12" y="11" width="2.5" height="2" rx="0.3"/><rect x="16" y="11" width="2.5" height="2" rx="0.3"/><line x1="6" y1="8" x2="6" y2="6"/><line x1="10" y1="8" x2="10" y2="6"/><line x1="14" y1="8" x2="14" y2="6"/>',
  'Mounts & Housings':'<path d="M5 19V5h14" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h10" stroke-linecap="round"/><rect x="14" y="14" width="5" height="5" rx="0.5"/>',
  'Power':'<rect x="4" y="7" width="16" height="11" rx="2"/><line x1="9" y1="7" x2="9" y2="4"/><line x1="15" y1="7" x2="15" y2="4"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="11" x2="16" y2="11"/>',
  'Cabling & Connectors':'<rect x="2" y="10" width="4" height="4" rx="1"/><rect x="18" y="10" width="4" height="4" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="10" x2="9" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="15" y1="10" x2="15" y2="14"/>',
  'Displays':'<rect x="2" y="3" width="20" height="14" rx="1.5"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><rect x="5" y="6" width="14" height="8" rx="0.5"/>',
  'Optics & Illuminators':'<circle cx="12" cy="13" r="4"/><circle cx="12" cy="13" r="1.5"/><path d="M12 2v3M12 19v3M3 8l2 2M17 18l2 2M2 13h3M19 13h3M3 18l2-2M17 8l2-2" stroke-linecap="round"/>',
  'Software & Licenses':'<rect x="5" y="2" width="14" height="20" rx="1.5"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>',
  'Accessories':'<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>'
};
function catIcon(c){return CAT_ICONS[c]||CAT_ICONS['Accessories'];}
const iconCache={};
function getIconImg(cat,col,size,cb){
  const key=cat+size;
  if(iconCache[key]){cb(iconCache[key]);return;}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${catIcon(cat)}</svg>`;
  const img=new Image();
  img.onload=()=>{iconCache[key]=img;cb(img);};
  img.src='data:image/svg+xml;base64,'+btoa(svg);
}

function drawPlacements(ctx){
  // Draw FOV cones first (behind icons)
  if(showFov){
    placements.forEach(pl=>{
      if(pl.product.category==='Cameras')drawFovCone(ctx,pl);
    });
  }
  // Draw icons on top
  placements.forEach((pl,i)=>{
    const c=cc(pl.product.category);
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.22)';ctx.shadowBlur=6;ctx.shadowOffsetY=2;
    ctx.beginPath();ctx.arc(pl.x,pl.y,15,0,Math.PI*2);
    ctx.fillStyle=c;ctx.fill();
    ctx.shadowColor='transparent';
    ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
    getIconImg(pl.product.category,c,22,(img)=>{
      ctx.save();ctx.drawImage(img,pl.x-11,pl.y-11,22,22);ctx.restore();
      ctx.save();
      ctx.beginPath();ctx.arc(pl.x+11,pl.y-11,7,0,Math.PI*2);
      ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle=c;ctx.font='bold 8px "DM Mono",monospace';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i+1,pl.x+11,pl.y-11);
      ctx.restore();
    });
    ctx.save();
    ctx.font='bold 9px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle='rgba(0,0,0,0.5)';
    const lbl=pl.product.sku.length>8?pl.product.sku.substring(0,7)+'\u2026':pl.product.sku;
    ctx.fillText(lbl,pl.x,pl.y+18);
    ctx.restore();
  });
}

function drawBlank(){
  const cvs=document.getElementById('blankCanvas');
  const{w,h}=CS.blank;const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#0c1018';ctx.fillRect(0,0,w,h);
  drawGrid(ctx,w,h);drawPlacements(ctx);
  document.getElementById('blankHint').style.display=placements.length?'none':'block';
}
function drawEmap(){
  const cvs=document.getElementById('emapCanvas');
  const{w,h}=CS.emap;const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#0c1018';ctx.fillRect(0,0,w,h);
  drawGrid(ctx,w,h);
  if(emapImg){
    const op=parseInt(document.getElementById('emapOpacity').value)/100;
    document.getElementById('emapOpVal').textContent=Math.round(op*100)+'%';
    ctx.save();ctx.globalAlpha=op;
    const r=Math.min(w/emapImg.width,h/emapImg.height);
    ctx.drawImage(emapImg,(w-emapImg.width*r)/2,(h-emapImg.height*r)/2,emapImg.width*r,emapImg.height*r);
    ctx.restore();
  }
  drawPlacements(ctx);
  document.getElementById('emapHint').style.display=(placements.length||emapImg)?'none':'block';
}
function redraw(){activeTab==='emap'?drawEmap():drawBlank();}

function loadEmap(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{const img=new Image();img.onload=()=>{emapImg=img;document.getElementById('emapInfo').textContent=file.name+' ('+img.width+'x'+img.height+')';drawEmap();};img.src=ev.target.result;};
  reader.readAsDataURL(file);
}
function clearEmap(){emapImg=null;document.getElementById('emapFile').value='';document.getElementById('emapInfo').textContent='JPG, PNG, GIF or WebP';drawEmap();}

