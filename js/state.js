function ftToM(ft){return ft*0.3048;}
function metersPerPixel(lat,zoom){return 156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);}

// ── STATE ─────────────────────────────────────────────────────────────────
let activeCat='All',selProd=null,showFov=true,placements=[],recentSkus=[];
let activeTab='blank',emapImg=null;
let dragIdx=-1,dragOX=0,dragOY=0,dragMoved=false;
let tipTimer=null,googleMapObj=null,mapsACInit=false;
let mapLocked=false,mapMarkers=[],mDragIdx=-1,mDragSX=0,mDragSY=0,mDragMoved=false;
let mapFovDragIdx=-1;
const CS={blank:{w:0,h:0},emap:{w:0,h:0}};

// ── PRODUCTS ──────────────────────────────────────────────────────────────
function makePItem(p){
  const d=document.createElement('div');
  d.className='pitem'+(selProd&&selProd.sku===p.sku?' sel':'');
  d.innerHTML=`<div class="psku"><span class="cdot" style="background:${cc(p.category)}"></span>${p.sku}</div><div class="pdesc">${p.description}</div><div class="pprice">MAP $${p.map.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`;
  d.onclick=()=>pickProd(p);
  return d;
}
function renderProducts(){
  const q=document.getElementById('searchInput').value.trim().toUpperCase();
  console.log('renderProducts called, PRODUCTS length:', PRODUCTS.length, 'query:', q);
  const list=document.getElementById('prodList');
  list.innerHTML='';
  if(!q){
    const recents=recentSkus.map(s=>PRODUCTS.find(p=>p.sku===s)).filter(Boolean);
    if(recents.length){
      const hdr=document.createElement('div');hdr.className='rec-hdr';hdr.textContent='Recently used';list.appendChild(hdr);
      const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:4px;padding:4px 8px 8px';
      recents.forEach(p=>{
        const chip=document.createElement('div');
        chip.style.cssText=`display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:20px;background:${cc(p.category)}15;border:1px solid ${cc(p.category)}44;cursor:pointer;font-size:11px;font-weight:700;font-family:'Barlow Condensed',sans-serif;color:${cc(p.category)};white-space:nowrap`;
        chip.innerHTML=`<span style="width:6px;height:6px;border-radius:50%;background:${cc(p.category)};display:inline-block"></span>${p.sku}`;
        chip.onclick=()=>pickProd(p);
        row.appendChild(chip);
      });
      list.appendChild(row);
      const hdr2=document.createElement('div');hdr2.className='rec-hdr';hdr2.style.marginTop='4px';hdr2.textContent='Last used';list.appendChild(hdr2);
      recents.slice(0,4).forEach(p=>list.appendChild(makePItem(p)));
    } else {
      list.innerHTML='<div style="padding:20px 12px;text-align:center;color:#8A94AA;font-size:12px;line-height:1.7">Search by SKU above<br>to find products</div>';
    }
    return;
  }
  const exact=[],sw=[],contains=[];
  PRODUCTS.forEach(p=>{const s=p.sku.toUpperCase();const d=p.description.toUpperCase();if(s===q)exact.push(p);else if(s.startsWith(q))sw.push(p);else if(s.includes(q)||d.includes(q))contains.push(p);});
  console.log('contains[0..2]',contains.slice(0,3).map(p=>({sku:p.sku,description:p.description})));
  [exact,sw,contains].forEach(a=>a.sort((a,b)=>a.sku.localeCompare(b.sku)));
  const filtered=[...exact,...sw,...contains].slice(0,100);
  if(!filtered.length){list.innerHTML=`<div style="padding:16px;text-align:center;color:#8A94AA;font-size:12px">No SKUs match "${q}"</div>`;return;}
  const groups={};
  filtered.forEach(p=>{if(!groups[p.category])groups[p.category]=[];groups[p.category].push(p);});
  const totalEl=document.createElement('div');totalEl.style.cssText='padding:5px 10px 3px;font-size:10px;color:var(--gray-400)';totalEl.textContent=`${filtered.length} result${filtered.length!==1?'s':''} found`;list.appendChild(totalEl);
  Object.keys(groups).sort().forEach(cat=>{
    const hdr=document.createElement('div');
    hdr.style.cssText=`display:flex;align-items:center;gap:6px;padding:6px 10px 3px;font-size:10px;font-weight:700;color:${cc(cat)};font-family:'Barlow Condensed',sans-serif;letter-spacing:0.5px;text-transform:uppercase;border-top:1px solid var(--border);margin-top:2px`;
    hdr.innerHTML=`<span style="width:7px;height:7px;border-radius:50%;background:${cc(cat)};flex-shrink:0;display:inline-block"></span>${cat} <span style="font-weight:400;color:var(--gray-400);text-transform:none;letter-spacing:0">(${groups[cat].length})</span>`;
    list.appendChild(hdr);
    groups[cat].forEach(p=>list.appendChild(makePItem(p)));
  });
}
function pickProd(p){
  selProd=p;
  recentSkus=recentSkus.filter(s=>s!==p.sku);recentSkus.unshift(p.sku);if(recentSkus.length>8)recentSkus.length=8;
  renderProducts();
  document.getElementById('statusMode').textContent=`Placing: ${p.sku} — click canvas to drop`;
}

