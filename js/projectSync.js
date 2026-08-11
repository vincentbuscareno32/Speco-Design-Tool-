// ── PROJECT SAVE / LOAD ──────────────────────────────────────────────────
// Fully additive and backward-compatible: everything in this file only
// activates when the page is opened with a ?project=<id> URL parameter, which
// is how the dashboard opens a project. With no param present (the tool used
// standalone, exactly as it always has), none of this code path runs at all.
let currentProjectId=null;
let projectSb=null;

function serializeProject(){
  return {
    version:1,
    activeTab,
    placements,
    mapMarkers,
    emapImgSrc: emapImg ? emapImg.src : null,
    mapsAddress: document.getElementById('mapsAddress') ? document.getElementById('mapsAddress').value : '',
    mapCenter: (activeTab==='maps'&&googleMapObj) ? {lat:googleMapObj.getCenter().lat(),lng:googleMapObj.getCenter().lng()} : null,
    mapZoom: (activeTab==='maps'&&googleMapObj) ? googleMapObj.getZoom() : null,
    mapLocked
  };
}

function deserializeProject(data){
  if(!data||!data.version)return; // brand-new project — nothing saved yet, leave the tool at its normal blank default
  placements = data.placements||[];
  mapMarkers = data.mapMarkers||[];
  mapLocked = !!data.mapLocked;
  if(data.mapsAddress && document.getElementById('mapsAddress')){
    document.getElementById('mapsAddress').value=data.mapsAddress;
  }

  const restoreRest=()=>{
    switchTab(data.activeTab||'blank');
    if(data.activeTab==='emap' && document.getElementById('emapCanvas')){
      setTimeout(()=>{resizeCanvas('emap');drawEmap();},50);
    } else if(data.activeTab==='maps' && data.mapCenter){
      showMap();
      if(!googleMapObj) buildMap(data.mapCenter);
      else googleMapObj.setCenter(data.mapCenter);
      if(data.mapZoom) setTimeout(()=>{if(googleMapObj)googleMapObj.setZoom(data.mapZoom);},300);
      setTimeout(()=>{renderMapMarkers();drawMapFov();},500);
    } else {
      redraw();
    }
    updateBOM();
  };

  if(data.emapImgSrc){
    const img=new Image();
    img.onload=()=>{emapImg=img;restoreRest();};
    img.src=data.emapImgSrc;
  } else {
    restoreRest();
  }
}

async function saveCurrentProject(){
  if(!currentProjectId||!projectSb)return;
  const btn=document.getElementById('projSaveBtn');
  const statusEl=document.getElementById('projSaveStatus');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  const name=document.getElementById('projName').value||'Untitled Project';
  const client=document.getElementById('clientName').value||null;
  const data=serializeProject();
  const {error}=await projectSb.from('projects')
    .update({name,client,data,updated_at:new Date().toISOString()})
    .eq('id',currentProjectId);
  if(btn){btn.disabled=false;btn.textContent='Save';}
  if(statusEl)statusEl.textContent = error ? 'Save failed' : 'Saved just now';
}

function showProjectBar(){
  const bar=document.getElementById('projectBar');
  if(bar)bar.style.display='flex';
}

async function initProjectMode(){
  const params=new URLSearchParams(window.location.search);
  const projectId=params.get('project');
  if(!projectId)return; // no project param — standalone tool, unchanged behavior

  if(typeof supabase==='undefined'){
    console.error('Supabase client library failed to load — project save/load unavailable.');
    return;
  }
  projectSb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

  const {data:{session}}=await projectSb.auth.getSession();
  if(!session){
    window.location.href='login.html';
    return;
  }

  const {data:row,error}=await projectSb.from('projects')
    .select('id,name,client,data').eq('id',projectId).single();
  if(error||!row){
    alert("This project could not be found, or you don't have access to it.");
    window.location.href='dashboard.html';
    return;
  }

  currentProjectId=row.id;
  document.getElementById('projName').value=row.name||'';
  document.getElementById('clientName').value=row.client||'';
  showProjectBar();
  deserializeProject(row.data);
}

initProjectMode();
